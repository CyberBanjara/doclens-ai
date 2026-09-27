import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  getKey,
  setAiProvider,
  OpenRouterError,
  openApiKeyModal,
  readGlobals,
  isOmniRouterConfigured,
  OmniRouterError,
  extractStreamingTranslation,
  type Globals,
} from "@/lib/openrouter";
import { getDoc, getPageData, upsertPageAi, type PageAiSummaryEntry } from "@/lib/storage";
import { cleanAiText, summarize } from "@/lib/pageAi";
import {
  executePageTranslation,
  cancelPageTranslation,
  getRunningPagesForDoc,
  isPageTranslating,
} from "@/lib/pageTranslationRunner";
import { listenDocEvent } from "@/lib/docEvents";

const STREAM_FLUSH_MS = 60;

/**
 * Hook for per-page AI translation management in the UI.
 * Connects directly to the detached global background runner:
 * - Never aborts running translations when Workspace unmounts or routes change.
 * - Deduplicates requests so 1 page = 1 request.
 * - Aborts only on explicit user cancellation (cancelPage).
 */
export function usePageTranslation(
  docId: string,
  globalsRef: React.RefObject<Globals>,
  onPageAiChangeRef: React.RefObject<
    (pageNumber: number, entry: PageAiSummaryEntry | null) => void
  >,
  mountedRef: React.RefObject<boolean>,
  ensureKeyReady: () => boolean,
) {
  const [runningPages, setRunningPages] = useState<Set<number>>(() => {
    return new Set(getRunningPagesForDoc(docId));
  });

  const [streamBufs, setStreamBufs] = useState<Record<number, string>>({});
  const selectionOverridesRef = useRef<Map<number, string>>(new Map());

  // Re-sync with running background tasks and listen for status events
  useEffect(() => {
    if (mountedRef.current) {
      setRunningPages(new Set(getRunningPagesForDoc(docId)));
    }

    const unlistenStatus = listenDocEvent("doclens:page-status-changed", (data) => {
      if (data.docId !== docId) return;
      if (!mountedRef.current) return;

      const pNum = data.pageNumber;
      if (data.status === "running") {
        setRunningPages((prev) => new Set(prev).add(pNum));
      } else {
        setRunningPages((prev) => {
          const next = new Set(prev);
          next.delete(pNum);
          return next;
        });
        setStreamBufs((prev) => {
          const next = { ...prev };
          delete next[pNum];
          return next;
        });

        // Notify parent summary if completed
        void getPageData(docId, pNum).then((rec) => {
          if (rec?.pageAi && onPageAiChangeRef.current) {
            onPageAiChangeRef.current(pNum, summarize(rec.pageAi));
          }
        });
      }
    });

    return () => {
      unlistenStatus();
    };
  }, [docId, mountedRef, onPageAiChangeRef]);

  const runPage = useCallback(
    async (pageNumber: number): Promise<string | undefined> => {
      const docRec = await getDoc(docId);
      const pageRec = await getPageData(docId, pageNumber);

      if (!pageRec || !pageRec.text?.trim()) {
        if (!docRec || (docRec.pageCount ?? 0) === 0) {
          return undefined;
        }
        const msg = "No text content found on this page to process.";
        toast.error(msg);
        await upsertPageAi(docId, pageNumber, { status: "error", error: msg });
        onPageAiChangeRef.current?.(pageNumber, {
          status: "error",
          hasResult: false,
          isCustom: false,
        });
        return undefined;
      }

      const currentGlobals = globalsRef.current || readGlobals();
      const isOmni = (currentGlobals.provider ?? "omnirouter") === "omnirouter";

      if (isOmni && !isOmniRouterConfigured()) {
        setAiProvider("openrouter");
      }

      const key = getKey();
      if (!isOmni && !key) {
        ensureKeyReady();
        await upsertPageAi(docId, pageNumber, {
          status: "error",
          error: "No OpenRouter API key configured.",
        });
        onPageAiChangeRef.current?.(pageNumber, {
          status: "error",
          hasResult: false,
          isCustom: false,
        });
        return undefined;
      }

      const selOverride = selectionOverridesRef.current.get(pageNumber);
      if (selOverride) selectionOverridesRef.current.delete(pageNumber);

      if (mountedRef.current) {
        setRunningPages((s) => new Set(s).add(pageNumber));
        setStreamBufs((b) => ({ ...b, [pageNumber]: "" }));
      }

      const bufferRef = { current: "" };
      const lastUiRef = { current: "" };
      let flushScheduled = false;

      const flushUi = () => {
        if (!mountedRef.current) return;
        if (bufferRef.current === lastUiRef.current) return;
        lastUiRef.current = bufferRef.current;
        const liveExtracted = extractStreamingTranslation(bufferRef.current);
        const snapshot = cleanAiText(liveExtracted || bufferRef.current);
        setStreamBufs((b) => ({ ...b, [pageNumber]: snapshot }));
      };

      const scheduleFlush = () => {
        if (flushScheduled) return;
        flushScheduled = true;
        setTimeout(() => {
          flushScheduled = false;
          flushUi();
        }, STREAM_FLUSH_MS);
      };

      try {
        const res = await executePageTranslation({
          docId,
          pageNumber,
          globals: currentGlobals,
          customTextOverride: selOverride,
          onDelta: (chunk) => {
            bufferRef.current += chunk;
            if (!lastUiRef.current) {
              flushUi();
            } else {
              scheduleFlush();
            }
          },
        });

        if (res.success && res.result) {
          const freshRec = await getPageData(docId, pageNumber);
          if (freshRec?.pageAi) {
            onPageAiChangeRef.current?.(pageNumber, summarize(freshRec.pageAi));
          }
          return res.result;
        } else if (res.error) {
          const err = res.error;
          if (res.error !== "Aborted by user") {
            const isDailyOrQuota =
              /daily_limit|rate_limit|quota|credits/i.test(err) ||
              /50 free pages|daily limit|rate limit|quota/i.test(err);
            if (isDailyOrQuota) {
              toast.error(err, {
                duration: 8000,
                action: { label: "Get Free Key", onClick: () => openApiKeyModal(err, true) },
              });
              openApiKeyModal(err, true);
            } else {
              toast.error(err);
            }
          }
        }
        return undefined;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Translation failed";
        console.error("usePageTranslation error:", err);
        toast.error(errorMsg);
        return undefined;
      } finally {
        if (mountedRef.current) {
          setRunningPages((s) => {
            const n = new Set(s);
            n.delete(pageNumber);
            return n;
          });
          setStreamBufs((b) => {
            const next = { ...b };
            delete next[pageNumber];
            return next;
          });
        }
      }
    },
    [docId, ensureKeyReady, globalsRef, onPageAiChangeRef, mountedRef],
  );

  const runPageOnce = useCallback(
    async (pageNumber: number): Promise<string | undefined> => {
      return runPage(pageNumber);
    },
    [runPage],
  );

  /** Explicitly cancel an in-flight page translation */
  const cancelPage = useCallback(
    (pageNumber: number) => {
      cancelPageTranslation(docId, pageNumber);
      if (mountedRef.current) {
        setRunningPages((s) => {
          const n = new Set(s);
          n.delete(pageNumber);
          return n;
        });
        setStreamBufs((b) => {
          const next = { ...b };
          delete next[pageNumber];
          return next;
        });
      }
    },
    [docId, mountedRef],
  );

  return { runningPages, streamBufs, runPageOnce, cancelPage, selectionOverridesRef, isPageTranslating };
}
