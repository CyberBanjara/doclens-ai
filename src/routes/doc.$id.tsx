import { ClientOnly, createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { createClientOnlyFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PdfViewer } from "@/components/PdfViewer";
import { RightPanel } from "@/components/RightPanel";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileTopBar } from "@/components/mobile/MobileTopBar";
import { MobileBottomBar } from "@/components/mobile/MobileBottomBar";
import { MobileOverflowSheet } from "@/components/mobile/MobileOverflowSheet";
import { MobilePageJumpSheet } from "@/components/mobile/MobilePageJumpSheet";
import {
  getDoc,
  getDocBlob,
  getPageAiSummary,
  setLastOpened,
  touchDoc,
  updateDoc,
  writePages,
  updatePageData,
  getAllPages,
  StorageError,
  type DocRecord,
  type PageAiSummaryEntry,
} from "@/lib/storage";
import { syncFromSupabase, syncToSupabase, getSyncConfig } from "@/lib/sync";
import { checkTextQuality } from "@/lib/pdf";
import { ChevronLeft, ChevronRight, Cloud, RefreshCw, Settings, Zap } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

const extractPdfPagesClient = createClientOnlyFn(
  async (
    blob: Blob,
    onPage: (
      page: { pageNumber: number; text: string; columns: number; garbageRatio: number },
      total: number,
    ) => void,
  ) => {
    const { extractPdfPages } = await import("@/lib/pdf");
    return extractPdfPages(blob, onPage);
  },
);

const runOcrOnGarbledPagesClient = createClientOnlyFn(
  async (
    blob: Blob,
    pages: {
      pageNumber: number;
      text: string;
      columns: number;
      garbageRatio: number;
      ocrRun?: boolean;
    }[],
    onProgress: (pageNumber: number, total: number) => void,
    onPageOcrComplete?: (
      pageNumber: number,
      text: string,
      garbageRatio: number,
    ) => Promise<void> | void,
  ) => {
    const { runOcrOnGarbledPages } = await import("@/lib/pdf");
    return runOcrOnGarbledPages(blob, pages, onProgress, onPageOcrComplete);
  },
);

export const Route = createFileRoute("/doc/$id")({
  component: DocPage,
  validateSearch: (search: Record<string, unknown>): { page?: number } => {
    const p = Number(search.page);
    return { page: p > 0 && Number.isFinite(p) ? Math.floor(p) : undefined };
  },
  head: () => ({
    meta: [{ title: "Anuwad — Document Reader" }],
  }),
});

function DocPage() {
  const { id } = Route.useParams();
  const { page: urlPage } = Route.useSearch();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [readerOpen, setReaderOpen] = useState(false);
  const [pageJumpOpen, setPageJumpOpen] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const lastScrollTopRef = useRef(0);
  const handlePdfScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const top = e.currentTarget.scrollTop;
    const delta = top - lastScrollTopRef.current;
    lastScrollTopRef.current = top;
    if (top < 40) {
      setChromeVisible(true);
      return;
    }
    if (delta > 4) setChromeVisible(false);
    else if (delta < -4) setChromeVisible(true);
  }, []);
  const [doc, setDoc] = useState<DocRecord | null>(null);
  const [missing, setMissing] = useState(false);
  const [pageCount, setPageCount] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [status, setStatus] = useState("");
  /** Lightweight summary only — full text + result are read on demand per page. */
  const [aiSummary, setAiSummary] = useState<Record<number, PageAiSummaryEntry>>({});
  const [activePage, setActivePageRaw] = useState<number>(urlPage ?? 1);
  const [syncEnabled, setSyncEnabled] = useState(true);

  /** Sync page changes to the URL query param (?page=N) */
  const setActivePage = useCallback(
    (p: number) => {
      setActivePageRaw(p);
      void navigate({
        to: "/doc/$id",
        params: { id },
        search: { page: p },
        replace: true,
      });
      void updateDoc(id, { lastReadPage: p }).catch((e) =>
        console.error("Failed to persist last-read page:", e),
      );
    },
    [id, navigate],
  );

  const goToLastTranslatedPage = useCallback(() => {
    const entries = Object.entries(aiSummary).filter(([_, entry]) => entry.status === "done");
    if (entries.length === 0) {
      toast.info("No pages have been translated yet.");
      return;
    }

    let bestPage = -1;
    let maxTime = -1;
    let maxPageNum = -1;

    for (const [pageStr, entry] of entries) {
      const pageNum = Number(pageStr);
      if (pageNum > maxPageNum) {
        maxPageNum = pageNum;
      }
      if (entry.updatedAt && entry.updatedAt > maxTime) {
        maxTime = entry.updatedAt;
        bestPage = pageNum;
      }
    }

    const targetPage = bestPage !== -1 ? bestPage : maxPageNum;
    if (targetPage !== -1) {
      setActivePage(targetPage);
      toast.success(`Jumped to last translated page: ${targetPage}`);
    }
  }, [aiSummary, setActivePage]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let configEnabled = false;
      try {
        const config = await getSyncConfig();
        configEnabled = config.enabled;
        if (!cancelled) {
          setSyncEnabled(config.enabled);
        }
      } catch (e) {
        console.error("Failed to fetch global sync config:", e);
      }

      const rec = await getDoc(id);
      if (cancelled) return;
      if (!rec) {
        setMissing(true);
        return;
      }

      let currentRec = rec;
      let pc = currentRec.pageCount ?? 0;

      // Check if we need to sync from Supabase first (if page count is 0)
      if (pc === 0) {
        setStatus("checking cloud cache…");
        const synced = await syncFromSupabase(id, currentRec.fileName);
        if (synced && !cancelled) {
          const updatedRec = await getDoc(id);
          if (updatedRec) {
            currentRec = updatedRec;
            pc = currentRec.pageCount ?? 0;
            toast.success("Loaded page text and translations from shared cloud vault!");
          }
        }
      } else if (configEnabled) {
        // If we already have the pages locally, check Supabase for updates in the background
        void (async () => {
          try {
            const updated = await syncFromSupabase(id, currentRec.fileName);
            if (updated && !cancelled) {
              const updatedRec = await getDoc(id);
              if (updatedRec) {
                setDoc(updatedRec);
                const sum = await getPageAiSummary(id);
                if (!cancelled) {
                  setAiSummary(sum);
                  toast.success("Sync: updated translations fetched from cloud!");
                }
              }
            }
          } catch (e) {
            console.error("Background sync check failed:", e);
          }
        })();
      }

      // Compute isScannedPdf if not set on existing document
      if (currentRec.isScannedPdf === undefined && pc > 0) {
        const pages = await getAllPages(id);
        const scannedCount = pages.filter((p) => checkTextQuality(p.text).isScanned).length;
        const isScannedPdf = pages.length > 0 && scannedCount / pages.length >= 0.5;
        await updateDoc(id, { isScannedPdf });
        currentRec.isScannedPdf = isScannedPdf;
      }

      const sum = await getPageAiSummary(id);
      if (cancelled) return;
      setAiSummary(sum);
      setDoc(currentRec);
      setPageCount(pc);
      // Clamp activePage if the URL had a page beyond the document's range
      if (pc > 0 && activePage > pc) setActivePageRaw(pc);
      try {
        await touchDoc(id);
        await setLastOpened(id);
      } catch (e) {
        // Non-fatal — don't let a "last opened" bookkeeping failure block
        // restoring the reader below.
        console.error("Failed to update last-opened bookkeeping:", e);
      }

      // If no page was passed in the URL search params, and there's a saved last read page:
      if (!urlPage && currentRec.lastReadPage) {
        const targetPage = Math.min(pc > 0 ? pc : Infinity, currentRec.lastReadPage);
        setActivePage(targetPage);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const refreshSummary = async () => {
    const sum = await getPageAiSummary(id);
    setAiSummary(sum);
  };

  const handleAnalyze = async () => {
    if (!doc || analyzing) return;
    setAnalyzing(true);
    setStatus("extracting…");
    try {
      const blob = await getDocBlob(id);
      if (!blob) {
        toast.error("PDF binary not found in storage.");
        setAnalyzing(false);
        return;
      }
      let lastTotal = 0;
      const collected: {
        pageNumber: number;
        text: string;
        columns: number;
        garbageRatio: number;
      }[] = [];
      await extractPdfPagesClient(blob, (page, total) => {
        lastTotal = total;
        collected.push({
          pageNumber: page.pageNumber,
          text: page.text,
          columns: page.columns,
          garbageRatio: page.garbageRatio,
        });
        setPageCount(total);
        setStatus(`page ${page.pageNumber}/${total}`);
      });
      try {
        const scannedCount = collected.filter((p) => checkTextQuality(p.text).isScanned).length;
        const isScannedPdf = collected.length > 0 && scannedCount / collected.length >= 0.5;

        await writePages(id, collected);
        await updateDoc(id, { pageCount: collected.length, isScannedPdf });
        setDoc((prev) => (prev ? { ...prev, pageCount: collected.length, isScannedPdf } : null));
        setPageCount(collected.length || lastTotal);
        await refreshSummary();
        setStatus(`done · ${collected.length} pages`);
        toast.success(`Extracted ${collected.length} pages successfully.`);
        if (syncEnabled) {
          void syncToSupabase(id);
        }
      } catch (e) {
        console.error("Failed to save extracted pages:", e);
        if (e instanceof StorageError && e.code === "QUOTA_EXCEEDED") {
          toast.error(e.message);
        } else {
          const detail = e instanceof Error ? e.message : String(e);
          toast.error(`Extraction complete but failed to save: ${detail}`);
        }
        setAnalyzing(false);
        return;
      }

      // Fallback OCR checks and execution on garbled pages
      setStatus("OCR Processing: Page 1 of " + collected.length);
      try {
        await runOcrOnGarbledPagesClient(
          blob,
          collected,
          (pageNumber, total) => {
            setStatus(`OCR Processing: Page ${pageNumber} of ${total}`);
          },
          async (pageNumber, ocrText, garbageRatio) => {
            await updatePageData(id, pageNumber, {
              text: ocrText,
              garbageRatio,
              ocrRun: true,
            });
            await refreshSummary();
          },
        );
        setStatus(`done · ${collected.length} pages`);
        if (syncEnabled) {
          void syncToSupabase(id);
        }
      } catch (ocrErr) {
        console.warn("OCR fallback failed:", ocrErr);
        toast.error(
          "OCR fallback failed: " + (ocrErr instanceof Error ? ocrErr.message : "unknown"),
        );
      } finally {
        collected.length = 0;
      }
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : "unknown";
      setStatus("error: " + msg);
      toast.error(`Extraction failed: ${msg}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const [uploading, setUploading] = useState(false);
  const [showUploadCategoryModal, setShowUploadCategoryModal] = useState(false);
  const [categoryChoice, setCategoryChoice] = useState("history");
  const [customCategoryInput, setCustomCategoryInput] = useState("");

  const handleUploadToR2 = () => {
    if (uploading || !doc) return;
    setShowUploadCategoryModal(true);
  };

  const confirmCategoryUpload = async () => {
    if (uploading || !doc) return;
    const finalCategory = categoryChoice === "custom" ? customCategoryInput.trim() : categoryChoice;
    setShowUploadCategoryModal(false);
    setUploading(true);
    const toastId = toast.loading("Preparing document for R2 upload...");
    try {
      const blob = await getDocBlob(id);
      if (!blob) {
        toast.error("Document binary not found in storage.", { id: toastId });
        setUploading(false);
        return;
      }

      toast.loading(`Uploading to Cloudflare R2 (${finalCategory || "uncategorized"})...`, { id: toastId });

      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const result = reader.result as string;
          const base64 = result.split(",")[1];
          resolve(base64);
        };
        reader.onerror = reject;
      });
      reader.readAsDataURL(blob);
      const base64Data = await base64Promise;

      const { uploadToR2 } = await import("@/lib/r2");
      const res = await uploadToR2({
        data: {
          fileName: doc.fileName,
          contentType: blob.type || "application/pdf",
          base64Data,
          category: finalCategory,
        },
      });

      if (res.alreadyExists) {
        toast.warning(`Document is already uploaded in "${res.key}".`, { id: toastId });
      } else {
        toast.success(`Uploaded successfully under folder prefix "${res.category}/"!`, { id: toastId });
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to upload document to R2.", { id: toastId });
    } finally {
      setUploading(false);
    }
  };

  const [syncingSupabase, setSyncingSupabase] = useState(false);

  const handleSyncToSupabase = async () => {
    if (syncingSupabase || !doc) return;
    setSyncingSupabase(true);
    const toastId = toast.loading("Syncing pages and translations to Supabase...");
    try {
      await syncToSupabase(id);
      toast.success("Successfully synced pages and translations to Supabase!", { id: toastId });
    } catch (e: any) {
      console.error(e);
      const msg = e?.message || String(e);
      if (msg.includes("relation") && msg.includes("does not exist")) {
        toast.error("Table pdf_extractions does not exist in Supabase. Please run the SQL schema migration.", { id: toastId, duration: 8000 });
      } else {
        toast.error(msg, { id: toastId });
      }
    } finally {
      setSyncingSupabase(false);
    }
  };

  const autoAnalyzedRef = useRef<Record<string, boolean>>({});

  // Auto-trigger text analysis on document load if not yet extracted
  useEffect(() => {
    if (doc && pageCount === 0 && !analyzing && !autoAnalyzedRef.current[id]) {
      autoAnalyzedRef.current[id] = true;
      void handleAnalyze();
    }
  }, [doc, pageCount, analyzing, id]);

  /** Called by per-row workstation cards to keep the doc-level summary in sync. */
  const handlePageAiChange = (pageNumber: number, entry: PageAiSummaryEntry | null) => {
    setAiSummary((prev) => {
      const next = { ...prev };
      if (entry) next[pageNumber] = entry;
      else delete next[pageNumber];
      return next;
    });
  };

  /* ─── Edge states ─── */

  if (missing) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground">
        <div className="text-center">
          <div className="text-sm text-muted-foreground">Document not found</div>
          <Link
            to="/"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
          >
            ← Back to Library
          </Link>
        </div>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="inline-block h-4 w-4 rounded-full border-2 border-primary border-t-transparent spin-slow" />
          Loading document…
        </div>
      </div>
    );
  }

  /* ─── Derive document name ─── */
  const docName = doc.fileName.replace(/\.pdf$/i, "");
  const doneCount = Object.values(aiSummary).filter((e) => e.status === "done").length;

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* ─── Slim Document Header (desktop only — mobile uses the floating MobileTopBar overlay) ─── */}
      {!isMobile && (
      <header className="flex h-12 flex-shrink-0 items-center justify-between border-b border-border bg-surface/80 backdrop-blur-md px-4">
        {/* Left: Back + Title */}
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to="/"
            className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-surface-2"
            title="Back to Library"
          >
            <img
              src="/light_13746323.png"
              alt="DocLens Logo"
              className="h-7 w-7 object-contain rounded-md"
            />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold text-foreground">{docName}</h1>
          </div>
        </div>

        {/* Center: Page Navigation */}
        {pageCount > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActivePage(Math.max(1, activePage - 1))}
              disabled={activePage <= 1}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-30"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="flex h-8 items-center gap-2 rounded-md bg-surface-2/60 px-3">
              <select
                value={activePage}
                onChange={(e) => setActivePage(Number(e.target.value))}
                className="cursor-pointer bg-transparent pl-1 pr-6 text-center text-xs font-medium tabular-nums text-foreground outline-none"
                style={{ minWidth: `${Math.max(4.25, String(pageCount).length + 3.5)}rem` }}
                aria-label="Select page"
              >
                {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => {
                  const hasAi = aiSummary[n]?.status === "done";
                  return (
                    <option key={n} value={n} className="bg-surface">
                      {n} {hasAi ? "🔵" : ""}
                    </option>
                  );
                })}
              </select>
              <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                / {pageCount}
              </span>
            </div>
            <button
              onClick={() => setActivePage(Math.min(pageCount, activePage + 1))}
              disabled={activePage >= pageCount}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-30"
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            {doneCount > 0 && (
              <button
                onClick={goToLastTranslatedPage}
                className="ml-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary transition-colors hover:bg-primary/20 hover:underline"
                title="Go to last translated page"
              >
                {doneCount} translated
              </button>
            )}
          </div>
        )}

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5">
          {!pageCount && (
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {analyzing ? "Analyzing…" : "Analyze Document"}
            </button>
          )}
          {pageCount > 0 && (
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-40"
              title={analyzing ? status : "Re-extract pages"}
            >
              {analyzing ? (
                <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-primary border-t-transparent spin-slow" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
            </button>
          )}
          {pageCount > 0 && syncEnabled && (
            <button
              onClick={handleUploadToR2}
              disabled={uploading}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-40"
              title={uploading ? "Uploading to R2..." : "Upload to Cloudflare R2"}
            >
              {uploading ? (
                <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-primary border-t-transparent spin-slow" />
              ) : (
                <Cloud className="h-3.5 w-3.5" />
              )}
            </button>
          )}
          {pageCount > 0 && syncEnabled && (
            <button
              onClick={handleSyncToSupabase}
              disabled={syncingSupabase}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-40"
              title={syncingSupabase ? "Syncing to Supabase..." : "Sync to Supabase"}
            >
              {syncingSupabase ? (
                <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-primary border-t-transparent spin-slow" />
              ) : (
                <Zap className="h-3.5 w-3.5" />
              )}
            </button>
          )}
          <Link
            to="/settings"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
            title="Settings"
          >
            <Settings className="h-3.5 w-3.5" />
          </Link>
        </div>
      </header>
      )}

      {/* ─── Main Content ─── */}
      <ClientOnly
        fallback={
          <main className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            <div className="flex items-center gap-3">
              <span className="inline-block h-4 w-4 rounded-full border-2 border-primary border-t-transparent spin-slow" />
              Loading…
            </div>
          </main>
        }
      >
        {isMobile ? (
          <div className="relative flex-1 overflow-hidden">
            <PdfViewer
              docId={id}
              activePage={activePage}
              setActivePage={setActivePage}
              onScroll={handlePdfScroll}
            />
            <MobileTopBar
              docName={docName}
              activePage={activePage}
              pageCount={pageCount}
              visible={chromeVisible}
              onOpenPageJump={() => setPageJumpOpen(true)}
            />
            <MobileBottomBar
              onOpenReader={() => setReaderOpen(true)}
              onOpenOverflow={() => setOverflowOpen(true)}
            />
            <RightPanel
              docId={id}
              pageCount={pageCount}
              analyzing={analyzing}
              status={status}
              aiSummary={aiSummary}
              onPageAiChange={handlePageAiChange}
              activePage={activePage}
              setActivePage={setActivePage}
              mobileReaderOpen={readerOpen}
              onMobileReaderOpenChange={setReaderOpen}
            />
            <MobilePageJumpSheet
              open={pageJumpOpen}
              onOpenChange={setPageJumpOpen}
              pageCount={pageCount}
              activePage={activePage}
              aiSummary={aiSummary}
              onJump={setActivePage}
            />
            <MobileOverflowSheet
              open={overflowOpen}
              onOpenChange={setOverflowOpen}
              docId={id}
              pageCount={pageCount}
              analyzing={analyzing}
              status={status}
              uploading={uploading}
              syncingSupabase={syncingSupabase}
              syncEnabled={syncEnabled}
              onAnalyze={handleAnalyze}
              onUploadToR2={handleUploadToR2}
              onSyncToSupabase={handleSyncToSupabase}
            />
          </div>
        ) : (
          <main className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-2">
            <section className="relative h-full overflow-hidden">
              <PdfViewer docId={id} activePage={activePage} setActivePage={setActivePage} />
            </section>
            <section className="h-full overflow-hidden border-t border-border md:border-t-0 md:border-l">
              <RightPanel
                docId={id}
                pageCount={pageCount}
                analyzing={analyzing}
                status={status}
                aiSummary={aiSummary}
                onPageAiChange={handlePageAiChange}
                activePage={activePage}
                setActivePage={setActivePage}
              />
            </section>
          </main>
        )}
      </ClientOnly>

      {/* Category Selection Modal for R2 Upload */}
      {isMobile ? (
        <Drawer open={showUploadCategoryModal} onOpenChange={setShowUploadCategoryModal}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Select R2 Category Folder</DrawerTitle>
              <DrawerDescription>
                Choose a category folder prefix to store this PDF in the shared Cloudflare R2 bucket.
              </DrawerDescription>
            </DrawerHeader>
            <div className="space-y-4 overflow-y-auto px-6 pb-2">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: "history", label: "📜 History", desc: "history/" },
                  { id: "economics", label: "📈 Economics", desc: "economics/" },
                  { id: "geography", label: "🌍 Geography", desc: "geography/" },
                  { id: "civics", label: "🏛️ Civics", desc: "civics/" },
                  { id: "science", label: "🔬 Science", desc: "science/" },
                  { id: "custom", label: "✏️ Custom", desc: "Custom prefix" },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategoryChoice(cat.id)}
                    className={`flex flex-col items-start rounded-lg border p-3 text-left transition-all ${
                      categoryChoice === cat.id
                        ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary"
                        : "border-border bg-surface hover:bg-surface-2 text-muted-foreground"
                    }`}
                  >
                    <span className="font-semibold text-sm">{cat.label}</span>
                    <span className="text-[11px] font-mono text-muted-foreground">{cat.desc}</span>
                  </button>
                ))}
              </div>
              {categoryChoice === "custom" && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">Custom Category Name</label>
                  <input
                    type="text"
                    placeholder="e.g. mathematics, philosophy"
                    value={customCategoryInput}
                    onChange={(e) => setCustomCategoryInput(e.target.value)}
                    className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              )}
            </div>
            <DrawerFooter>
              <button
                onClick={() => setShowUploadCategoryModal(false)}
                className="rounded-lg border border-border px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-surface-2 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmCategoryUpload}
                disabled={categoryChoice === "custom" && !customCategoryInput.trim()}
                className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                Upload to Category
              </button>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      ) : (
      <Dialog open={showUploadCategoryModal} onOpenChange={setShowUploadCategoryModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Select R2 Category Folder</DialogTitle>
            <DialogDescription>
              Choose a category folder prefix to store this PDF in the shared Cloudflare R2 bucket.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: "history", label: "📜 History", desc: "history/" },
                { id: "economics", label: "📈 Economics", desc: "economics/" },
                { id: "geography", label: "🌍 Geography", desc: "geography/" },
                { id: "civics", label: "🏛️ Civics", desc: "civics/" },
                { id: "science", label: "🔬 Science", desc: "science/" },
                { id: "custom", label: "✏️ Custom", desc: "Custom prefix" },
              ].map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategoryChoice(cat.id)}
                  className={`flex flex-col items-start rounded-lg border p-3 text-left transition-all ${
                    categoryChoice === cat.id
                      ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary"
                      : "border-border bg-surface hover:bg-surface-2 text-muted-foreground"
                  }`}
                >
                  <span className="font-semibold text-sm">{cat.label}</span>
                  <span className="text-[11px] font-mono text-muted-foreground">{cat.desc}</span>
                </button>
              ))}
            </div>
            {categoryChoice === "custom" && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Custom Category Name</label>
                <input
                  type="text"
                  placeholder="e.g. mathematics, philosophy"
                  value={customCategoryInput}
                  onChange={(e) => setCustomCategoryInput(e.target.value)}
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <button
              onClick={() => setShowUploadCategoryModal(false)}
              className="rounded-lg border border-border px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-surface-2 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={confirmCategoryUpload}
              disabled={categoryChoice === "custom" && !customCategoryInput.trim()}
              className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              Upload to Category
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      )}
    </div>
  );
}
