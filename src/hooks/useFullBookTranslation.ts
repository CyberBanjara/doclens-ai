import { useCallback, useRef, useState, useEffect } from "react";
import { toast } from "sonner";
import { executePageTranslation, cancelPageTranslation } from "@/lib/pageTranslationRunner";
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
  cooldownRemaining: number | null;
  rangeStart: number | null;
  rangeEnd: number | null;
}

export interface StartFullBookOptions {
  overwriteExisting?: boolean;
  startPage?: number;
  endPage?: number;
  cooldownSeconds?: number;
}

export function useFullBookTranslation({
  docId,
  pageCount,
  onPageAiChange,
}: {
  docId: string;
  pageCount: number;
  onPageAiChange?: (pageNumber: number, entry: PageAiSummaryEntry | null) => void;
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
  const [cooldownRemaining, setCooldownRemaining] = useState<number | null>(null);
  const [rangeStart, setRangeStart] = useState<number | null>(null);
  const [rangeEnd, setRangeEnd] = useState<number | null>(null);

  const isTranslatingRef = useRef(false);
  const isPausedRef = useRef(false);
  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const activePageRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);
  const autoFollowRef = useRef(true);
  const toastIdRef = useRef<string | number | null>(null);
  autoFollowRef.current = autoFollow;

  // On unmount: stop queueing NEXT pages, dismiss active toast, but let the CURRENT actively running page finish and save in background!
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      isTranslatingRef.current = false;
      if (toastIdRef.current) {
        toast.dismiss(toastIdRef.current);
        toastIdRef.current = null;
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

  /** Explicitly stop / cancel full book translation by user action */
  const cancel = useCallback(() => {
    if (!isTranslatingRef.current) return;
    isTranslatingRef.current = false;
    isPausedRef.current = false;
    setIsTranslating(false);
    setIsPaused(false);
    setCooldownRemaining(null);

    if (activePageRef.current !== null) {
      cancelPageTranslation(docId, activePageRef.current);
    }
    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
      activeAbortControllerRef.current = null;
    }
    if (toastIdRef.current) {
      toast.warning("Full book translation stopped.", { id: toastIdRef.current });
      toastIdRef.current = null;
    } else {
      toast.warning("Full book translation stopped.");
    }
  }, [docId]);

  const start = useCallback(
    async (options?: StartFullBookOptions) => {
      if (isTranslatingRef.current || pageCount <= 0) return;

      const overwriteExisting = options?.overwriteExisting ?? false;
      const rawStart = options?.startPage ?? 1;
      const rawEnd = options?.endPage ?? pageCount;
      const startPage = Math.max(1, Math.min(rawStart, pageCount));
      const endPage = Math.max(startPage, Math.min(rawEnd, pageCount));
      const cooldownSeconds = Math.max(0, options?.cooldownSeconds ?? 0);

      // Determine which pages in range need translation
      const pagesToProcess: number[] = [];
      for (let p = startPage; p <= endPage; p++) {
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
        toast.info(
          `No untranslated pages found in the selected range (Pages ${startPage}–${endPage}).`,
        );
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
      setCooldownRemaining(null);
      setRangeStart(startPage);
      setRangeEnd(endPage);
      setEstimatedSecondsRemaining(pagesToProcess.length * (4 + cooldownSeconds));

      const pageDurations: number[] = [];
      const failed: number[] = [];
      let done = 0;

      const toastId = toast.loading(
        `Starting Full Book Translation (0/${pagesToProcess.length} pages, range ${startPage}-${endPage})...`,
      );
      toastIdRef.current = toastId;

      for (let i = 0; i < pagesToProcess.length; i++) {
        if (!isTranslatingRef.current || !isMountedRef.current) break;

        // Handle pause loop
        while (isPausedRef.current) {
          if (!isTranslatingRef.current || !isMountedRef.current) break;
          await new Promise((res) => setTimeout(res, 400));
        }
        if (!isTranslatingRef.current || !isMountedRef.current) break;

        const pNum = pagesToProcess[i];
        activePageRef.current = pNum;
        if (isMountedRef.current) {
          setCurrentPage(pNum);
        }

        const pageStartTime = Date.now();
        const ctrl = new AbortController();
        activeAbortControllerRef.current = ctrl;

        if (isMountedRef.current && toastIdRef.current) {
          toast.loading(`Translating Page ${pNum} (${done + 1}/${pagesToProcess.length})...`, {
            id: toastIdRef.current,
          });
        }

        let snippetBuffer = "";
        let snippetTimer: NodeJS.Timeout | null = null;

        try {
          const res = await executePageTranslation({
            docId,
            pageNumber: pNum,
            forceRegenerate: overwriteExisting,
            onDelta: (chunk) => {
              if (!isMountedRef.current) return;
              snippetBuffer = (snippetBuffer + chunk).slice(-150);
              if (!snippetTimer) {
                snippetTimer = setTimeout(() => {
                  snippetTimer = null;
                  if (isMountedRef.current) {
                    setCurrentStreamingSnippet(snippetBuffer);
                  }
                }, 250);
              }
            },
          });

          if (!res.success) {
            if (ctrl.signal.aborted) {
              break;
            }
            console.warn(`[FullBook] Page ${pNum} translation failed:`, res.error);
            failed.push(pNum);
            if (isMountedRef.current) {
              setFailedPages([...failed]);
            }
          } else {
            done++;
            if (isMountedRef.current) {
              setCompletedCount(done);
            }

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
            if (isMountedRef.current) {
              setEstimatedSecondsRemaining(
                Math.round(remainingPages * (avgDuration + cooldownSeconds)),
              );
            }
          }
        } catch (err) {
          if (ctrl.signal.aborted) {
            break;
          }
          console.error(`[FullBook] Error on page ${pNum}:`, err);
          failed.push(pNum);
          if (isMountedRef.current) {
            setFailedPages([...failed]);
          }
        } finally {
          if (snippetTimer) {
            clearTimeout(snippetTimer);
            snippetTimer = null;
          }
          activeAbortControllerRef.current = null;
          activePageRef.current = null;
        }

        // Cooldown between requests if more pages are remaining
        if (
          i < pagesToProcess.length - 1 &&
          cooldownSeconds > 0 &&
          isTranslatingRef.current &&
          isMountedRef.current
        ) {
          let cdLeft = cooldownSeconds;
          while (cdLeft > 0 && isTranslatingRef.current && isMountedRef.current) {
            // Handle pause during cooldown
            while (isPausedRef.current) {
              if (!isTranslatingRef.current || !isMountedRef.current) break;
              await new Promise((res) => setTimeout(res, 400));
            }
            if (!isTranslatingRef.current || !isMountedRef.current) break;

            if (isMountedRef.current) {
              setCooldownRemaining(cdLeft);
            }
            await new Promise((res) => setTimeout(res, 1000));
            cdLeft--;
          }
          if (isMountedRef.current) {
            setCooldownRemaining(null);
          }
        }
      }

      const wasCancelled = !isTranslatingRef.current;
      isTranslatingRef.current = false;
      isPausedRef.current = false;

      if (isMountedRef.current) {
        setIsTranslating(false);
        setIsPaused(false);
        setCurrentPage(null);
        setCooldownRemaining(null);
        setEstimatedSecondsRemaining(null);
      }

      const activeToastId = toastIdRef.current;
      toastIdRef.current = null;

      if (activeToastId) {
        if (wasCancelled) {
          toast.info(`Full book translation stopped. ${done} pages were translated.`, {
            id: activeToastId,
          });
        } else if (failed.length === 0) {
          toast.success(
            `Full book translation completed! ${done} page(s) translated (range ${startPage}–${endPage}).`,
            { id: activeToastId },
          );
        } else {
          toast.warning(
            `Translation completed with ${failed.length} failed page(s): ${failed.join(", ")}`,
            { id: activeToastId },
          );
        }
      } else if (isMountedRef.current) {
        if (wasCancelled) {
          toast.info(`Full book translation stopped. ${done} pages were translated.`);
        } else if (failed.length === 0) {
          toast.success(
            `Full book translation completed! ${done} page(s) translated (range ${startPage}–${endPage}).`,
          );
        } else {
          toast.warning(
            `Translation completed with ${failed.length} failed page(s): ${failed.join(", ")}`,
          );
        }
      }
    },
    [docId, pageCount, onPageAiChange],
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
    estimatedSecondsRemaining,
    cooldownRemaining,
    rangeStart,
    rangeEnd,
    start,
    pause,
    resume,
    cancel,
    setAutoFollow,
  };
}

