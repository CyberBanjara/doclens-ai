import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Sparkles } from "lucide-react";
import { AnimatePresence, motion, useDragControls } from "framer-motion";
import { estimateTokens } from "@/lib/models";
import {
  getAllPages,
  getPageData,
  getDocBlob,
  updatePageData,
  type PageAiSummaryEntry,
  type PageDataRecord,
} from "@/lib/storage";
import { PageWorkstation } from "./PageWorkstation";
import { checkTextQuality } from "@/lib/pdf";
import { hasCompletedTtsVoiceSetup, useTts, type TtsSource } from "@/context/TtsContext";
import { TtsPlayer } from "./TtsPlayer";
import { HighlightableText } from "./HighlightableText";
import { VoiceOnboardingDialog } from "./VoiceOnboardingDialog";
import { useIsMobile } from "@/hooks/use-mobile";

interface Props {
  docId: string;
  pageCount: number;
  analyzing: boolean;
  status: string;
  aiSummary: Record<number, PageAiSummaryEntry>;
  onPageAiChange: (pageNumber: number, entry: PageAiSummaryEntry | null) => void;
  activePage: number;
  setActivePage: (p: number) => void;
  /** Mobile-only: controls the reader bottom sheet from the floating bottom
   * bar's "Read" button. Ignored on desktop. */
  mobileReaderOpen?: boolean;
  onMobileReaderOpenChange?: (open: boolean) => void;
}

/* ---------- Export helpers ---------- */

function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportAsMarkdown(docId: string) {
  const pages = await getAllPages(docId);
  const lines: string[] = [
    "# DocLens AI — Export",
    "",
    `> Exported at ${new Date().toISOString()}`,
    "",
  ];
  for (const page of pages) {
    lines.push(`## Page ${page.pageNumber}`, "");
    lines.push("### Extracted Text", "");
    lines.push(page.text || "*(no extractable text)*", "");
    if (page.pageAi?.status === "done" && page.pageAi.result) {
      lines.push("### AI Result", "");
      lines.push(page.pageAi.result, "");
    }
    lines.push("---", "");
  }
  downloadBlob(lines.join("\n"), "doclens-export.md", "text/markdown;charset=utf-8");
  toast.success("Exported as Markdown.");
}

export async function exportAsJson(docId: string) {
  const pages = await getAllPages(docId);
  const data = pages.map((page) => ({
    pageNumber: page.pageNumber,
    columns: page.columns,
    tokenEstimate: estimateTokens(page.text),
    extractedText: page.text,
    ai:
      page.pageAi?.status === "done" && page.pageAi.result
        ? {
            status: page.pageAi.status,
            result: page.pageAi.result,
            settingsHash: page.pageAi.settingsHash,
            updatedAt: page.pageAi.updatedAt,
          }
        : null,
  }));
  downloadBlob(
    JSON.stringify({ exportedAt: new Date().toISOString(), pages: data }, null, 2),
    "doclens-export.json",
    "application/json;charset=utf-8",
  );
  toast.success("Exported as JSON.");
}

/* ---------- Component ---------- */

type Tab = "ai" | "text";

export function RightPanel({
  docId,
  pageCount,
  analyzing,
  status,
  aiSummary,
  onPageAiChange,
  activePage,
  setActivePage,
  mobileReaderOpen = false,
  onMobileReaderOpenChange,
}: Props) {
  const isMobile = useIsMobile();
  const dragControls = useDragControls();
  const [tab, setTab] = useState<Tab>("ai");
  const [showExport, setShowExport] = useState(false);
  const [activePageData, setActivePageData] = useState<PageDataRecord | null>(null);

  const { isPlaying, activePageNumber, currentTextSource, continuousPlay, play, stop } = useTts();

  // Read the current tab from a ref inside effects that shouldn't re-fire on
  // every tab switch by themselves (only on the transitions they actually care
  // about), while still seeing the latest value.
  const tabRef = useRef(tab);
  tabRef.current = tab;

  const [voiceDialogOpen, setVoiceDialogOpen] = useState(false);
  const voiceReadyCallbackRef = useRef<(() => void) | null>(null);
  const requestVoiceOnboarding = (onReady: () => void) => {
    voiceReadyCallbackRef.current = onReady;
    setVoiceDialogOpen(true);
  };

  const doneCount = useMemo(
    () => Object.values(aiSummary).filter((e) => e.status === "done").length,
    [aiSummary],
  );

  // Load the active page data
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await getPageData(docId, activePage);
      if (cancelled) return;
      setActivePageData(p ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [docId, activePage, aiSummary]);

  // Handle continuous play page transition event
  useEffect(() => {
    const handleNextPage = (e: Event) => {
      const ev = e as CustomEvent<{ currentPage: number; source: TtsSource }>;
      if (ev.detail && ev.detail.currentPage === activePage && activePage < pageCount) {
        setActivePage(activePage + 1);
      }
    };
    window.addEventListener("doclens:tts-next-page", handleNextPage);
    return () => {
      window.removeEventListener("doclens:tts-next-page", handleNextPage);
    };
  }, [activePage, pageCount, setActivePage]);

  // Auto-play when advancing pages on the "Original Text" tab. Raw extracted
  // text needs no generation step (it's already in IDB from analysis), so
  // this simple "play as soon as data is loaded" logic is still correct here.
  // The "AI Assistant" tab's auto-play is handled by the
  // doclens:ensure-page-ready / doclens:page-ready flow below instead, since
  // that content needs to be generated first.
  //
  // `activePageData` is refetched on every aiSummary change, which fires
  // repeatedly while a page's AI text is streaming in — without the guard
  // below, each of those refetches would re-run this effect and
  // call play() again for the same page (activePageNumber only catches up to
  // activePage after React re-renders, which isn't guaranteed to happen
  // before the next streaming update lands), resynthesizing/replaying
  // sentence 0 and corrupting the pre-synthesis pipeline for the sentences
  // after it.
  const autoPlayedTransitionRef = useRef<string | null>(null);
  useEffect(() => {
    if (tab !== "text") return;
    const isPendingTransition =
      isPlaying && activePageNumber !== null && activePageNumber !== activePage;

    if (!isPendingTransition) {
      autoPlayedTransitionRef.current = null;
      return;
    }

    if (activePageData && activePageData.pageNumber === activePage) {
      const transitionKey = `${activePage}:${tab}`;
      if (autoPlayedTransitionRef.current === transitionKey) return;
      autoPlayedTransitionRef.current = transitionKey;

      const textToRead = activePageData?.text;
      if (textToRead) {
        play(textToRead, "original", activePage, 0);
      } else {
        stop();
      }
    }
  }, [activePage, activePageData, isPlaying, activePageNumber, tab, play, stop]);

  // ─── AI-tab seamless auto-read orchestration ───

  // 1. Whenever the AI tab needs a page ready — the page changed (click,
  //    Prev/Next, page-select), or the user flipped back to "AI Assistant"
  //    after a background translation may have finished while they were on
  //    "Original Text" — ask PageWorkstation to ensure it's generated.
  useEffect(() => {
    if (tab !== "ai") return;
    window.dispatchEvent(
      new CustomEvent("doclens:ensure-page-ready", { detail: { docId, pageNumber: activePage } }),
    );
  }, [docId, activePage, tab]);

  // 2. Continuous-play look-ahead: while the current page is playing, start
  //    translating the next page in the background so it's ready by the time
  //    doclens:tts-next-page advances to it.
  useEffect(() => {
    if (tab !== "ai" || !isPlaying || !continuousPlay || activePageNumber !== activePage) return;
    const next = activePage + 1;
    if (next <= pageCount) {
      window.dispatchEvent(
        new CustomEvent("doclens:ensure-page-ready", { detail: { docId, pageNumber: next } }),
      );
    }
  }, [tab, isPlaying, continuousPlay, activePageNumber, activePage, pageCount, docId]);

  // 3. Play a page's AI content once it's confirmed ready. Guarded so a page
  //    that already finished auto-playing doesn't replay just because the
  //    user tab-switched away and back.
  const autoPlayedPagesRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    autoPlayedPagesRef.current = new Set();
  }, [docId]);

  useEffect(() => {
    const handlePageReady = (e: Event) => {
      const ev = e as CustomEvent<{ docId: string; pageNumber: number; result: string }>;
      const d = ev.detail;
      if (!d || d.docId !== docId || d.pageNumber !== activePage || tabRef.current !== "ai") return;
      if (autoPlayedPagesRef.current.has(d.pageNumber)) return;
      if (isPlaying && activePageNumber === d.pageNumber && currentTextSource === "ai") return;

      autoPlayedPagesRef.current.add(d.pageNumber);
      if (!hasCompletedTtsVoiceSetup()) {
        requestVoiceOnboarding(() => play(d.result, "ai", d.pageNumber, 0));
      } else {
        play(d.result, "ai", d.pageNumber, 0);
      }
    };
    window.addEventListener("doclens:page-ready", handlePageReady);
    return () => window.removeEventListener("doclens:page-ready", handlePageReady);
  }, [docId, activePage, isPlaying, activePageNumber, currentTextSource, play]);

  const textToRead = tab === "ai" ? activePageData?.pageAi?.result : activePageData?.text;
  const source: TtsSource = tab === "ai" ? "ai" : "original";

  // Shared between desktop and mobile — always mounted (CSS-hidden rather
  // than unmounted) so background AI generation and the
  // doclens:ensure-page-ready listener survive switching to the "Original
  // Text" tab / the reader sheet being closed on mobile — see the auto-read
  // orchestration effects above.
  const body = (
    <div className="flex-1 overflow-hidden">
      <div className={`h-full ${tab === "ai" ? "" : "hidden"}`}>
        <PageWorkstation
          docId={docId}
          pageCount={pageCount}
          aiSummary={aiSummary}
          onPageAiChange={onPageAiChange}
          activePage={activePage}
          setActivePage={setActivePage}
        />
      </div>

      {tab === "text" && (
        <ExtractedTextTab docId={docId} activePage={activePage} aiSummary={aiSummary} />
      )}
    </div>
  );

  const player = pageCount > 0 && activePageData && (
    <TtsPlayer
      text={textToRead}
      source={source}
      pageNumber={activePage}
      onNeedsVoiceOnboarding={requestVoiceOnboarding}
    />
  );

  const voiceDialog = (
    <VoiceOnboardingDialog
      open={voiceDialogOpen}
      onOpenChange={setVoiceDialogOpen}
      onReady={() => {
        const cb = voiceReadyCallbackRef.current;
        voiceReadyCallbackRef.current = null;
        cb?.();
      }}
    />
  );

  if (isMobile) {
    return (
      <>
        <AnimatePresence>
          {mobileReaderOpen && (
            <motion.div
              key="reader-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/50"
              onClick={() => onMobileReaderOpenChange?.(false)}
            />
          )}
        </AnimatePresence>

        <motion.div
          initial={false}
          animate={{ y: mobileReaderOpen ? 0 : "100%" }}
          transition={{ type: "spring", stiffness: 380, damping: 38 }}
          drag="y"
          dragListener={false}
          dragControls={dragControls}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={0.55}
          onDragEnd={(_e, info) => {
            if (info.offset.y > 120 || info.velocity.y > 500) onMobileReaderOpenChange?.(false);
          }}
          className="fixed inset-x-0 bottom-0 z-50 flex h-[86dvh] flex-col rounded-t-3xl border border-border bg-surface shadow-2xl"
          aria-hidden={!mobileReaderOpen}
        >
          {/* Drag surface confined to this handle (dragListener=false above) —
              the content below (TtsPlayer, PageWorkstation, HighlightableText)
              stays free of Framer's pointer/hit-testing machinery and native
              touch scrolling, instead of the whole sheet (incl. all its
              buttons and text) being a drag target with touch-action:none. */}
          <div
            onPointerDown={(e) => dragControls.start(e)}
            style={{ touchAction: "none" }}
            className="flex shrink-0 justify-center pt-3 pb-1"
          >
            <div className="h-1.5 w-10 rounded-full bg-border-strong" />
          </div>

          {/* ─── Segmented tab control ─── */}
          <div className="flex items-center gap-2 px-4 pb-3 pt-3">
            <div className="flex flex-1 rounded-full bg-surface-2/60 p-1">
              <button
                onClick={() => setTab("ai")}
                className={`flex-1 rounded-full py-1.5 text-[13px] font-medium transition-colors ${
                  tab === "ai" ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground"
                }`}
              >
                AI Assistant
              </button>
              <button
                onClick={() => setTab("text")}
                className={`flex-1 rounded-full py-1.5 text-[13px] font-medium transition-colors ${
                  tab === "text" ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground"
                }`}
              >
                Original Text
              </button>
            </div>
            {analyzing && (
              <span className="flex items-center gap-1.5 text-xs text-primary">
                <span className="inline-block h-3 w-3 rounded-full border-[1.5px] border-primary border-t-transparent spin-slow" />
              </span>
            )}
          </div>

          {body}

          {/* Always mounted when player is available, matching desktop behavior and playback flow */}
          {player && (
            <div className="border-t border-border bg-surface/40 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 shrink-0">
              {player}
            </div>
          )}
        </motion.div>

        {voiceDialog}
      </>
    );
  }

  return (
    <div className="flex h-full flex-col bg-surface/30">
      {/* ─── Tab bar ─── */}
      <div className="flex items-center border-b border-border bg-surface/50 backdrop-blur-sm">
        <TabButton active={tab === "ai"} onClick={() => setTab("ai")}>
          AI Assistant
        </TabButton>
        <TabButton active={tab === "text"} onClick={() => setTab("text")}>
          Original Text
        </TabButton>

        <div className="ml-auto flex items-center gap-1 px-3">
          {analyzing && (
            <span className="flex items-center gap-1.5 text-xs text-primary">
              <span className="inline-block h-3 w-3 rounded-full border-[1.5px] border-primary border-t-transparent spin-slow" />
              {status}
            </span>
          )}

          {pageCount > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowExport(!showExport)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
                title="Export"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
              {showExport && (
                <div className="absolute right-0 top-full z-20 mt-1 rounded-lg border border-border bg-surface p-1 shadow-xl">
                  <button
                    onClick={() => {
                      void exportAsMarkdown(docId);
                      setShowExport(false);
                    }}
                    className="block w-full rounded px-3 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-surface-2"
                  >
                    Export as Markdown
                  </button>
                  <button
                    onClick={() => {
                      void exportAsJson(docId);
                      setShowExport(false);
                    }}
                    className="block w-full rounded px-3 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-surface-2"
                  >
                    Export as JSON
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {body}

      {/* Sticky bottom TTS Player */}
      {player && (
        <div className="border-t border-border bg-surface/40 px-4 pb-4 pt-2 shrink-0">{player}</div>
      )}

      {voiceDialog}
    </div>
  );
}

/* ---------- Extracted text tab — single active page ---------- */

function ExtractedTextTab({
  docId,
  activePage,
  aiSummary,
}: {
  docId: string;
  activePage: number;
  aiSummary: Record<number, PageAiSummaryEntry>;
}) {
  if (activePage <= 0) {
    return (
      <div className="flex h-full items-center justify-center px-5 py-4">
        <div className="max-w-sm text-center text-sm text-muted-foreground">
          Select a page to view its extracted text.
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-full overflow-auto px-6 py-5 page-card-enter"
      key={activePage}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("button, select, textarea, input, [role='button']")) return;
        window.dispatchEvent(
          new CustomEvent("doclens:scroll-to-pdf", { detail: { pageNumber: activePage } }),
        );
      }}
    >
      <ExtractedPageRow docId={docId} pageNumber={activePage} summary={aiSummary[activePage]} />
    </div>
  );
}

function ExtractedPageRow({
  docId,
  pageNumber,
  summary,
}: {
  docId: string;
  pageNumber: number;
  summary?: PageAiSummaryEntry;
}) {
  const [data, setData] = useState<{ text: string; columns: number } | null>(null);
  const [ocrRunning, setOcrRunning] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await getPageData(docId, pageNumber);
      if (cancelled) return;
      setData(p ? { text: p.text, columns: p.columns } : { text: "", columns: 1 });
    })();
    return () => {
      cancelled = true;
    };
  }, [docId, pageNumber, summary]);

  const handleRunOcr = async () => {
    setOcrRunning(true);
    const tid = toast.loading("Loading document and running OCR...");
    try {
      const blob = await getDocBlob(docId);
      if (!blob) {
        toast.error("Document binary not found in storage.", { id: tid });
        return;
      }
      const { ocrPageById } = await import("@/lib/pdf");
      const ocrText = await ocrPageById(blob, pageNumber, data?.columns ?? 1);
      if (!ocrText || ocrText.trim().length === 0) {
        toast.error("OCR completed but extracted no text.", { id: tid });
        return;
      }

      const quality = checkTextQuality(ocrText);
      await updatePageData(docId, pageNumber, {
        text: ocrText,
        garbageRatio: quality.symbolRatio,
        ocrRun: true,
      });

      if (isMountedRef.current) {
        setData({ text: ocrText, columns: data?.columns ?? 1 });
      }
      toast.success("Page text updated successfully using OCR!", { id: tid });
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "OCR failed.", { id: tid });
    } finally {
      if (isMountedRef.current) {
        setOcrRunning(false);
      }
    }
  };

  if (data === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="inline-block h-3 w-3 rounded-full border-[1.5px] border-primary border-t-transparent spin-slow" />
        Loading page {pageNumber}…
      </div>
    );
  }

  const quality = checkTextQuality(data.text);
  const showOcrSuggestion = quality.isGarbled || quality.isScanned;

  return (
    <article className="reader-card">
      <header className="mb-4 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Page {pageNumber} — Original Text
        </h3>
        <div className="flex items-center gap-3">
          {data.text && (
            <span className="text-[11px] text-muted-foreground/60">
              {estimateTokens(data.text).toLocaleString()} tokens
            </span>
          )}
          <button
            disabled={ocrRunning}
            onClick={handleRunOcr}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline disabled:opacity-50 cursor-pointer"
          >
            {ocrRunning ? "Running OCR…" : "Run OCR"}
          </button>
        </div>
      </header>

      {showOcrSuggestion && (
        <div className="mb-4 rounded-xl border border-primary/20 bg-primary/5 p-4 text-[13px] leading-relaxed text-foreground/95 backdrop-blur-md">
          <div className="flex items-start gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
              !
            </span>
            <div className="flex-1">
              <p className="font-semibold text-primary">
                {quality.isGarbled
                  ? "Garbled character symbols detected"
                  : "Minimal extractable text found"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {quality.isGarbled
                  ? "This page seems to contain corrupted fonts or symbols instead of standard characters. Run OCR to convert the visual layout to clean, readable text."
                  : "This page might be scanned or contain only images. Run OCR to extract text from the page."}
              </p>
              <button
                disabled={ocrRunning}
                onClick={handleRunOcr}
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground shadow-md transition-all hover:bg-primary/90 disabled:opacity-50 cursor-pointer active:scale-95"
              >
                {ocrRunning ? (
                  <>
                    <span className="inline-block h-3 w-3 rounded-full border-2 border-primary-foreground border-t-transparent spin-slow" />
                    Running OCR…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5 mr-1 inline" />
                    Fix page with OCR
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="reader-text">
        {data.text ? (
          <HighlightableText text={data.text} source="original" pageNumber={pageNumber} />
        ) : (
          <p className="italic text-muted-foreground">No extractable text on this page.</p>
        )}
      </div>
    </article>
  );
}

/* ---------- Shared UI primitives ---------- */

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative px-4 py-2.5 text-[13px] font-medium transition-colors ${
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
      {active && <span className="absolute inset-x-3 -bottom-px h-[2px] rounded-full bg-primary" />}
    </button>
  );
}
