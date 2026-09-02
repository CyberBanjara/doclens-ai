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
import { ProfileDropdown } from "@/components/ProfileDropdown";
import {
  getDoc,
  getDocBlob,
  getPageAiSummary,
  getPageData,
  setLastOpened,
  touchDoc,
  updateDoc,
  writePages,
  updatePageData,
  StorageError,
  type DocRecord,
  type PageAiSummaryEntry,
} from "@/lib/storage";
import { syncFromSupabase, syncToSupabase, getSyncConfig } from "@/lib/sync";
import { fetchAvailableLanguagesForBook } from "@/lib/supabase";
import { getOutputLanguage, setOutputLanguage } from "@/lib/openrouter";
import { UserPreferencesModal } from "@/components/UserPreferencesModal";
import { saveEducationLevel, type EducationLevel } from "@/lib/classification";
import { useAuth } from "@/context/AuthContext";
import { checkTextQuality } from "@/lib/textCleaning";
import { R2UploadDialog } from "@/components/R2UploadDialog";
import { ChevronLeft, ChevronRight, Cloud, RefreshCw, Settings, Zap } from "lucide-react";

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
    const { runOcrOnGarbledPages } = await import("@/lib/pdfOcr");
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
    meta: [{ title: "Anuwad — Document Reader" }, { name: "robots", content: "noindex, nofollow" }],
  }),
});

function DocPage() {
  const { id } = Route.useParams();
  const { page: urlPage } = Route.useSearch();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { user, loading: authLoading, updateProfile, isAdmin } = useAuth();
  const [readerOpen, setReaderOpen] = useState(false);
  const [pageJumpOpen, setPageJumpOpen] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [doc, setDoc] = useState<DocRecord | null>(null);
  const [missing, setMissing] = useState(false);
  const [pageCount, setPageCount] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [status, setStatus] = useState("");
  /** Lightweight summary only — full text + result are read on demand per page. */
  const [aiSummary, setAiSummary] = useState<Record<number, PageAiSummaryEntry>>({});
  const [activePage, setActivePageRaw] = useState<number>(urlPage ?? 1);
  const [syncEnabled, setSyncEnabled] = useState(true);

  // One-time Preferences Setup (Language & Class)
  const [preferencesModalOpen, setPreferencesModalOpen] = useState(false);

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

  // Handle saving native language & class/standard preferences
  const handleSavePreferences = async (chosenLang: string, chosenLevel: EducationLevel) => {
    setPreferencesModalOpen(false);
    setOutputLanguage(chosenLang);
    saveEducationLevel(chosenLevel);

    if (user) {
      try {
        await updateProfile({
          nativeLanguage: chosenLang,
          educationLevel: chosenLevel,
        });
        toast.success(`Preferences saved (${chosenLang}, ${chosenLevel})`);
      } catch (err) {
        console.error("Failed to save user preferences in Firebase/JWT:", err);
      }
    }

    await updateDoc(id, {
      hasChosenLanguage: true,
      selectedLanguage: chosenLang,
    });
    setDoc((prev) =>
      prev ? { ...prev, hasChosenLanguage: true, selectedLanguage: chosenLang } : null,
    );

    if (syncEnabled && doc) {
      const toastId = toast.loading(`Loading ${chosenLang} translations...`);
      try {
        await syncFromSupabase(id, doc.fileName, chosenLang, true);
        const sum = await getPageAiSummary(id);
        setAiSummary(sum);
        toast.success(`Active translation language: ${chosenLang}`, { id: toastId });
      } catch (e) {
        console.warn("Language sync note:", e);
        toast.dismiss(toastId);
      }
    }
  };

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

      const currentRec = rec;
      const pc = currentRec.pageCount ?? 0;

      // Before Step 3 (Supabase fetch) and Step 4 (AI translation), validate JWT token.
      // If JWT is present but does not contain user's native language and class/standard,
      // show the one-time popup asking for both.
      if (!authLoading) {
        if (user && (!user.nativeLanguage || !user.educationLevel)) {
          setPreferencesModalOpen(true);
        } else if (!user && !currentRec.hasChosenLanguage && !getOutputLanguage()) {
          setPreferencesModalOpen(true);
        }
      }

      // Automatically resolve active language (JWT stored native language takes top priority)
      const activeLang =
        user?.nativeLanguage || currentRec.selectedLanguage || getOutputLanguage() || "हिंदी";

      if (currentRec.selectedLanguage !== activeLang) {
        void updateDoc(id, { selectedLanguage: activeLang });
        currentRec.selectedLanguage = activeLang;
      }

      if (configEnabled && pc > 0 && (!user || (user.nativeLanguage && user.educationLevel))) {
        // Step 3: Run background sync from Supabase for the active native language
        void (async () => {
          try {
            const updated = await syncFromSupabase(id, currentRec.fileName, activeLang, false);
            if (updated && !cancelled) {
              const updatedRec = await getDoc(id);
              if (updatedRec) {
                setDoc(updatedRec);
                const sum = await getPageAiSummary(id);
                if (!cancelled) {
                  setAiSummary(sum);
                }
              }
            }
          } catch (e) {
            console.error("Background sync check failed:", e);
          }
        })();
      }

      // Sync translations when user changes language in the workspace or settings
      const handleLangChange = (e: any) => {
        const newLang = e?.detail;
        if (!newLang || !configEnabled) return;
        void (async () => {
          try {
            await updateDoc(id, { selectedLanguage: newLang });
            await syncFromSupabase(id, currentRec.fileName, newLang, true);
            if (!cancelled) {
              const updatedRec = await getDoc(id);
              if (updatedRec) {
                setDoc(updatedRec);
                const sum = await getPageAiSummary(id);
                if (!cancelled) {
                  setAiSummary(sum);
                }
              }
            }
          } catch (err) {
            console.warn("Language sync check note:", err);
          }
        })();
      };

      window.addEventListener("doclens:output-language-changed" as any, handleLangChange);

      // Compute isScannedPdf if not set on existing document (sample first 5 pages)
      if (currentRec.isScannedPdf === undefined && pc > 0) {
        const sampleLimit = Math.min(pc, 5);
        let scannedCount = 0;
        for (let i = 1; i <= sampleLimit; i++) {
          const p = await getPageData(id, i);
          if (p && checkTextQuality(p.text).isScanned) {
            scannedCount++;
          }
        }
        const isScannedPdf = sampleLimit > 0 && scannedCount / sampleLimit >= 0.5;
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
      window.removeEventListener("doclens:output-language-changed" as any, () => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const refreshSummary = async () => {
    const sum = await getPageAiSummary(id);
    setAiSummary(sum);
  };

  /**
   * 4-Stage Document Processing Pipeline:
   * 1. PDF.js Text Extraction (extract layout & text)
   * 2. OCR Processing (identify missing/unusable/garbled pages and run OCR to completion)
   * 3. Supabase Check / Fetch (sync existing translation data for book + language)
   * 4. AI Translation Ready (unblocks AI translation to run on final extracted text)
   */
  const handleAnalyze = async (forcedDoc?: DocRecord) => {
    const currentDoc = forcedDoc || doc;
    if (!currentDoc || analyzing) return;
    setAnalyzing(true);
    setStatus("Stage 1/4: PDF text extraction…");

    try {
      const blob = await getDocBlob(id);
      if (!blob) {
        toast.error("PDF binary not found in storage.");
        setAnalyzing(false);
        return;
      }

      // ─────────────────────────────────────────────────────────────────
      // STAGE 1: PDF.js Text Extraction
      // ─────────────────────────────────────────────────────────────────
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
        setStatus(`Stage 1/4: PDF extraction (page ${page.pageNumber}/${total})`);
      });

      const scannedCount = collected.filter((p) => checkTextQuality(p.text).isScanned).length;
      const isScannedPdf = collected.length > 0 && scannedCount / collected.length >= 0.5;

      await writePages(id, collected);
      await updateDoc(id, { pageCount: collected.length, isScannedPdf });
      setDoc((prev) => (prev ? { ...prev, pageCount: collected.length, isScannedPdf } : null));
      setPageCount(collected.length || lastTotal);
      await refreshSummary();

      // ─────────────────────────────────────────────────────────────────
      // STAGE 2: OCR Processing
      // ─────────────────────────────────────────────────────────────────
      setStatus("Stage 2/4: Checking text quality & running OCR…");
      try {
        await runOcrOnGarbledPagesClient(
          blob,
          collected,
          (pageNumber, total) => {
            setStatus(`Stage 2/4: OCR Processing (page ${pageNumber}/${total})`);
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
      } catch (ocrErr) {
        console.warn("OCR fallback note:", ocrErr);
        toast.error(
          "OCR check completed with note: " +
            (ocrErr instanceof Error ? ocrErr.message : "unknown"),
        );
      }

      // ─────────────────────────────────────────────────────────────────
      // STAGE 3: Supabase Check / Fetch
      // ─────────────────────────────────────────────────────────────────
      setStatus("Stage 3/4: Checking translations in Supabase…");
      if (syncEnabled) {
        try {
          const freshDoc = (await getDoc(id)) || currentDoc;
          const activeLang =
            user?.nativeLanguage || freshDoc.selectedLanguage || getOutputLanguage() || "हिंदी";
          await syncFromSupabase(id, freshDoc.fileName, activeLang, false);
          const updatedRec = await getDoc(id);
          if (updatedRec) {
            setDoc(updatedRec);
          }
          await refreshSummary();
        } catch (syncErr) {
          console.warn("Supabase initial translation check note:", syncErr);
        }
      }

      // ─────────────────────────────────────────────────────────────────
      // STAGE 4: AI Translation Ready
      // ─────────────────────────────────────────────────────────────────
      setStatus(`done · ${collected.length} pages`);
      toast.success(`Document processed (${collected.length} pages ready).`);
    } catch (err) {
      console.error("Document processing error:", err);
      const msg = err instanceof Error ? err.message : "unknown";
      setStatus("error: " + msg);
      toast.error(`Extraction failed: ${msg}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const [uploading, setUploading] = useState(false);
  const [showUploadCategoryModal, setShowUploadCategoryModal] = useState(false);
  const [uploadSubject, setUploadSubject] = useState("history");
  const [uploadEducationLevel, setUploadEducationLevel] = useState("class-10");

  const handleUploadToR2 = () => {
    if (uploading || !doc) return;
    setShowUploadCategoryModal(true);
  };

  const confirmCategoryUpload = async (customFileName?: string) => {
    if (uploading || !doc) return;
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

      toast.loading(`Uploading to Cloudflare R2 (${uploadSubject}/${uploadEducationLevel})...`, {
        id: toastId,
      });

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

      const targetFileName = customFileName?.trim() || doc.fileName || "document.pdf";
      const normalizedFileName = targetFileName.toLowerCase().endsWith(".pdf")
        ? targetFileName
        : `${targetFileName}.pdf`;

      const { uploadToR2, uploadThumbnailToR2 } = await import("@/lib/r2");
      const res = await uploadToR2({
        data: {
          fileName: normalizedFileName,
          contentType: blob.type || "application/pdf",
          base64Data,
          subject: uploadSubject,
          educationLevel: uploadEducationLevel,
        },
      });

      if (res.key) {
        try {
          const { renderPageToJpegBlob } = await import("@/hooks/useThumbnail");
          const thumbBlob = await renderPageToJpegBlob(blob);
          const thumbReader = new FileReader();
          thumbReader.onloadend = () => {
            const result = thumbReader.result as string;
            if (result) {
              const thumbBase64 = result.split(",")[1];
              if (thumbBase64) {
                uploadThumbnailToR2({ data: { fileKey: res.key, base64Data: thumbBase64 } }).catch(
                  () => {},
                );
              }
            }
          };
          thumbReader.readAsDataURL(thumbBlob);
        } catch (thumbErr) {
          console.warn("Thumbnail upload to R2 failed:", thumbErr);
        }
      }

      if (res.alreadyExists) {
        toast.warning(`Document is already uploaded in "${res.key}".`, { id: toastId });
      } else {
        toast.success(`Uploaded successfully under folder prefix "${res.category}/"!`, {
          id: toastId,
        });
      }

      // Automatically sync pages and translations to Supabase under the category key
      if ((isAdmin || syncEnabled) && pageCount > 0) {
        void syncToSupabase(id, res.key, doc.selectedLanguage).catch((err) =>
          console.warn("Auto-sync to Supabase after R2 upload failed:", err),
        );
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
    const toastId = toast.loading("Syncing translations to Supabase...");
    try {
      await syncToSupabase(id, undefined, doc.selectedLanguage);
      toast.success("Successfully synced translations to Supabase!", { id: toastId });
    } catch (e: any) {
      console.error(e);
      const msg = e?.message || String(e);
      if (msg.includes("relation") && msg.includes("does not exist")) {
        toast.error(
          "Translation table or book_languages does not exist in Supabase. Please run the SQL schema migration.",
          { id: toastId, duration: 8000 },
        );
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
            to="/library"
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
    <div className="flex h-dvh flex-col bg-background text-foreground">
      {/* ─── Slim Document Header (desktop only — mobile uses the floating MobileTopBar overlay) ─── */}
      {!isMobile && (
        <header className="relative z-40 flex h-12 flex-shrink-0 items-center justify-between border-b border-border bg-surface/80 backdrop-blur-md px-4">
          {/* Left: Back + Title */}
          <div className="flex items-center gap-3 min-w-0">
            <Link
              to="/"
              className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-surface-2"
              title="Home"
            >
              <img
                src="/light_13746323.png"
                alt="Anuwad Logo"
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
                onClick={() => handleAnalyze()}
                disabled={analyzing}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {analyzing ? "Analyzing…" : "Analyze Document"}
              </button>
            )}
            {pageCount > 0 && (
              <button
                onClick={() => handleAnalyze()}
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
            {pageCount > 0 && (isAdmin || syncEnabled) && (
              <button
                onClick={handleUploadToR2}
                disabled={uploading}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-40 cursor-pointer"
                title={uploading ? "Uploading to R2..." : "Upload to Cloudflare R2"}
              >
                {uploading ? (
                  <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-primary border-t-transparent spin-slow" />
                ) : (
                  <Cloud className="h-3.5 w-3.5" />
                )}
              </button>
            )}
            {pageCount > 0 && (isAdmin || syncEnabled) && (
              <button
                onClick={handleSyncToSupabase}
                disabled={syncingSupabase}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-40 cursor-pointer"
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
            <ProfileDropdown />
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
            <PdfViewer docId={id} activePage={activePage} setActivePage={setActivePage} />
            <MobileTopBar
              docName={docName}
              activePage={activePage}
              pageCount={pageCount}
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
              syncEnabled={isAdmin || syncEnabled}
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

      {/* 2-Step Subject & Class Selection Modal for R2 Upload */}
      <R2UploadDialog
        isMobile={isMobile}
        open={showUploadCategoryModal}
        onOpenChange={setShowUploadCategoryModal}
        existingDocFileName={doc?.fileName}
        uploadCategory={uploadSubject}
        onCategoryChange={setUploadSubject}
        uploadEducationLevel={uploadEducationLevel}
        onEducationLevelChange={setUploadEducationLevel}
        uploadingDirect={uploading}
        onSubmit={(customFileName) => void confirmCategoryUpload(customFileName)}
      />

      {/* One-Time Native Language & Class/Standard Setup Modal */}
      <UserPreferencesModal
        open={preferencesModalOpen}
        initialLanguage={
          user?.nativeLanguage || doc?.selectedLanguage || getOutputLanguage() || "हिंदी"
        }
        initialEducationLevel={user?.educationLevel || "class-10"}
        isInitialSetup={true}
        onSave={handleSavePreferences}
      />
    </div>
  );
}
