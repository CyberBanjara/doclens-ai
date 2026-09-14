import { useCallback, useRef, useState, useEffect } from "react";
import { toast } from "sonner";
import { executePageTranslation } from "@/lib/pageTranslationRunner";
import { getPageData, type PageAiSummaryEntry } from "@/lib/storage";
import { summarize } from "@/lib/pageAi";

export interface FullBookTranslationState {
  isTranslating: boolean;
  isPaused: boolean;
  currentPage: number | null;
  completedCount: number;
  totalTargetPages: number;
  failedPages: number[];
  currentStreamingSnippet: string;
  autoFollow: boolean;
  estimatedSecondsRemaining: number | null;
}

export function useFullBookTranslation({
  docId,
  pageCount,
  onPageAiChange,
  onPageChange,
}: {
  docId: string;
  pageCount: number;
  onPageAiChange?: (pageNumber: number, entry: PageAiSummaryEntry | null) => void;
  onPageChange?: (pageNumber: number) => void;
}) {
  const [isTranslating, setIsTranslating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentPage, setCurrentPage] = useState<number | null>(null);
  const [completedCount, setCompletedCount] = useState(0);
  const [totalTargetPages, setTotalTargetPages] = useState(0);
  const [failedPages, setFailedPages] = useState<number[]>([]);
  const [currentStreamingSnippet, setCurrentStreamingSnippet] = useState("");
  const [autoFollow, setAutoFollow] = useState(true);
  const [estimatedSecondsRemaining, setEstimatedSecondsRemaining] = useState<number | null>(null);

  const isTranslatingRef = useRef(false);
  const isPausedRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const autoFollowRef = useRef(true);
  autoFollowRef.current = autoFollow;

  // Clean up if unmounted during translation
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const pause = useCallback(() => {
    if (!isTranslatingRef.current) return;
    isPausedRef.current = true;
    setIsPaused(true);
    toast.info("Full book translation paused.");
  }, []);

  const resume = useCallback(() => {
    if (!isTranslatingRef.current) return;
    isPausedRef.current = false;
    setIsPaused(false);
    toast.info("Resuming full book translation...");
  }, []);

  const cancel = useCallback(() => {
    if (!isTranslatingRef.current) return;
    isTranslatingRef.current = false;
    isPausedRef.current = false;
    setIsTranslating(false);
    setIsPaused(false);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    toast.warning("Full book translation stopped.");
  }, []);

  const start = useCallback(
    async (options?: { overwriteExisting?: boolean; startPage?: number }) => {
      if (isTranslatingRef.current || pageCount <= 0) return;

      const overwriteExisting = options?.overwriteExisting ?? false;
      const startPage = Math.max(1, options?.startPage ?? 1);

      // Determine which pages need translation
      const pagesToProcess: number[] = [];
      for (let p = startPage; p <= pageCount; p++) {
        if (overwriteExisting) {
          pagesToProcess.push(p);
        } else {
          const rec = await getPageData(docId, p);
          if (rec?.pageAi?.status !== "done" || !rec.pageAi.result?.trim()) {
            pagesToProcess.push(p);
          }
        }
      }

      if (pagesToProcess.length === 0) {
        toast.info("All pages in this book are already translated!");
        return;
      }

      isTranslatingRef.current = true;
      isPausedRef.current = false;
      setIsTranslating(true);
      setIsPaused(false);
      setCompletedCount(0);
      setTotalTargetPages(pagesToProcess.length);
      setFailedPages([]);
      setCurrentStreamingSnippet("");
      setEstimatedSecondsRemaining(pagesToProcess.length * 4);

      const pageDurations: number[] = [];
      const failed: number[] = [];
      let done = 0;

      const toastId = toast.loading(
        `Starting Full Book Translation (0/${pagesToProcess.length} pages)...`,
      );

      for (let i = 0; i < pagesToProcess.length; i++) {
        if (!isTranslatingRef.current) break;

        // Handle pause loop
        while (isPausedRef.current) {
          if (!isTranslatingRef.current) break;
          await new Promise((res) => setTimeout(res, 400));
        }
        if (!isTranslatingRef.current) break;

        const pNum = pagesToProcess[i];
        setCurrentPage(pNum);

        if (autoFollowRef.current && onPageChange) {
          onPageChange(pNum);
        }

        const pageStartTime = Date.now();
        const ctrl = new AbortController();
        abortControllerRef.current = ctrl;

        toast.loading(`Translating Page ${pNum} (${done + 1}/${pagesToProcess.length})...`, {
          id: toastId,
        });

        try {
          const res = await executePageTranslation({
            docId,
            pageNumber: pNum,
            signal: ctrl.signal,
            forceRegenerate: overwriteExisting,
            onDelta: (chunk) => {
              setCurrentStreamingSnippet((prev) => (prev + chunk).slice(-150));
            },
          });

          if (!res.success) {
            if (ctrl.signal.aborted) {
              break;
            }
            console.warn(`[FullBook] Page ${pNum} translation failed:`, res.error);
            failed.push(pNum);
            setFailedPages([...failed]);
          } else {
            done++;
            setCompletedCount(done);

            // Update workstation summary
            const updatedRec = await getPageData(docId, pNum);
            if (updatedRec?.pageAi && onPageAiChange) {
              onPageAiChange(pNum, summarize(updatedRec.pageAi));
            }

            // Estimate remaining time
            const durationSec = (Date.now() - pageStartTime) / 1000;
            pageDurations.push(durationSec);
            const avgDuration = pageDurations.reduce((a, b) => a + b, 0) / pageDurations.length;
            const remainingPages = pagesToProcess.length - (i + 1);
            setEstimatedSecondsRemaining(Math.round(remainingPages * avgDuration));
          }
        } catch (err) {
          if (ctrl.signal.aborted) {
            break;
          }
          console.error(`[FullBook] Error on page ${pNum}:`, err);
          failed.push(pNum);
          setFailedPages([...failed]);
        } finally {
          abortControllerRef.current = null;
        }
      }

      const wasCancelled = !isTranslatingRef.current;
      isTranslatingRef.current = false;
      isPausedRef.current = false;
      setIsTranslating(false);
      setIsPaused(false);
      setCurrentPage(null);
      setCurrentStreamingSnippet("");
      setEstimatedSecondsRemaining(null);

      if (wasCancelled) {
        toast.info(`Full book translation stopped. ${done} pages translated.`, {
          id: toastId,
        });
      } else if (failed.length === 0) {
        toast.success(
          `🎉 Full book translation complete! All ${done} pages translated successfully.`,
          { id: toastId, duration: 6000 },
        );
      } else {
        toast.warning(
          `Finished with ${done} pages translated. ${failed.length} page(s) encountered issues.`,
          { id: toastId, duration: 6000 },
        );
      }
    },
    [docId, pageCount, onPageAiChange, onPageChange],
  );

  return {
    isTranslating,
    isPaused,
    currentPage,
    completedCount,
    totalTargetPages,
    failedPages,
    currentStreamingSnippet,
    autoFollow,
    setAutoFollow,
    estimatedSecondsRemaining,
    start,
    pause,
    resume,
    cancel,
  };
}
