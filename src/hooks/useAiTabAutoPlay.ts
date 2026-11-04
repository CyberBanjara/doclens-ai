import { useEffect, useRef } from "react";
import { listenDocEvent } from "@/lib/docEvents";
import { hasCompletedTtsVoiceSetup, type TtsSource } from "@/context/TtsContext";
import { getPageData, type PageAiSummaryEntry, type PageDataRecord } from "@/lib/storage";
import { executePageTranslation, isPageTranslating } from "@/lib/pageTranslationRunner";
import {
  getAiProvider,
  getCustomKey,
  getKeyStatus,
  isOmniRouterConfigured,
  readGlobals,
} from "@/lib/openrouter";
import { getStoredAuthToken } from "@/lib/auth-client";
import { getFirebaseAuth } from "@/lib/firebase";

interface UseAiTabAutoPlayArgs {
  docId: string;
  activePage: number;
  activePageData: PageDataRecord | null;
  tab: "ai" | "text";
  pageCount: number;
  analyzing?: boolean;
  isPlaying: boolean;
  isPaused?: boolean;
  isNeuralLoading?: boolean;
  aiSummary?: Record<number, PageAiSummaryEntry>;
  continuousPlay: boolean;
  activePageNumber: number | null;
  currentTextSource: TtsSource | null;
  play: (text: string, source: TtsSource, pageNumber: number, startIndex?: number) => void;
  stop: () => void;
  requestVoiceOnboarding: (onReady: () => void) => void;
}

/** Check if current user is authenticated (via session token or Firebase auth) */
function isUserAuthenticated(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(getStoredAuthToken() || getFirebaseAuth().currentUser);
}

/** Check if current AI provider is configured and ready to execute requests */
function isProviderConfigured(): boolean {
  const globals = readGlobals();
  const provider = globals.provider || getAiProvider();
  if (provider === "managed") {
    // Managed AI uses serverless backend with server-side keys
    return true;
  }
  if (provider === "ollama") {
    return true;
  }
  if (provider === "omnirouter") {
    return isOmniRouterConfigured();
  }
  if (provider === "openrouter") {
    const customKey = getCustomKey();
    return Boolean(customKey && getKeyStatus() !== "invalid");
  }
  return true;
}

/** Check if a translation is available for the given page (without checking prior read status or settings hash) */
async function getAvailableTranslation(
  docId: string,
  pageNumber: number,
  activePageData: PageDataRecord | null,
): Promise<string | null> {
  // 1. Check in-memory activePageData if it matches this page
  if (activePageData && activePageData.pageNumber === pageNumber) {
    const res = activePageData.pageAi?.result?.trim();
    if (res) return res;
  }

  // 2. Check IndexedDB storage directly
  try {
    const rec = await getPageData(docId, pageNumber);
    const res = rec?.pageAi?.result?.trim();
    if (res) return res;
  } catch {
    // Ignore storage lookup errors
  }

  return null;
}

/**
 * Continuous play and AI auto-read orchestration:
 * 1. While TTS is reading page N and Continuous mode is enabled, ongoing TTS processing is never interrupted.
 * 2. Once TTS processing for page N is complete (neural synthesis finished and audio streaming),
 *    checks whether page N+1 has already been translated.
 * 3. If page N+1 is not translated, automatically triggers its translation in the background without interrupting playback.
 * 4. When the user reaches page N+1, automatically starts TTS playback of its translated text.
 * 5. Continues this cycle for every subsequent page as long as Continuous mode remains enabled.
 * 6. The user never needs to manually click the Play button for subsequent pages.
 */
export function useAiTabAutoPlay({
  docId,
  activePage,
  activePageData,
  tab,
  pageCount,
  analyzing = false,
  isPlaying,
  isPaused = false,
  isNeuralLoading = false,
  aiSummary,
  continuousPlay,
  activePageNumber,
  currentTextSource,
  play,
  stop,
  requestVoiceOnboarding,
}: UseAiTabAutoPlayArgs) {
  const tabRef = useRef(tab);
  tabRef.current = tab;

  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;

  const continuousPlayRef = useRef(continuousPlay);
  continuousPlayRef.current = continuousPlay;

  const activePageRef = useRef(activePage);
  activePageRef.current = activePage;

  const activePageNumberRef = useRef(activePageNumber);
  activePageNumberRef.current = activePageNumber;

  const aiSummaryRef = useRef(aiSummary);
  aiSummaryRef.current = aiSummary;

  const lastTriggeredKeyRef = useRef<string | null>(null);
  const lookaheadScheduledPageRef = useRef<number | null>(null);

  const startPlaybackForPage = (text: string, source: TtsSource, pageNumber: number) => {
    const key = `${pageNumber}:${source}`;
    if (lastTriggeredKeyRef.current === key && activePageNumberRef.current === pageNumber) {
      return;
    }
    lastTriggeredKeyRef.current = key;

    if (!hasCompletedTtsVoiceSetup()) {
      requestVoiceOnboarding(() => play(text, source, pageNumber, 0));
    } else {
      play(text, source, pageNumber, 0);
    }
  };

  // 1. Look-ahead background translation:
  // While TTS is reading page N, do not interrupt ongoing TTS speech synthesis.
  // Once the TTS processing for page N is complete (audio is actively playing and processor is free),
  // check whether page N+1 has already been translated.
  // If N+1 is not translated, automatically trigger its translation in the background.
  useEffect(() => {
    if (!isPlaying || isPaused || !continuousPlay || tab !== "ai" || isNeuralLoading || analyzing) {
      return;
    }

    // Only initiate look-ahead when audio playback has stabilized on current page
    if (activePageNumber === null || activePageNumber <= 0 || activePageNumber !== activePage) {
      return;
    }

    const nextPage = activePage + 1;
    if (nextPage > pageCount) {
      return;
    }

    // Skip if already in-flight or already scheduled in this cycle
    if (isPageTranslating(docId, nextPage) || lookaheadScheduledPageRef.current === nextPage) {
      return;
    }

    // Verify auth and provider readiness before triggering translation
    if (!isUserAuthenticated() || !isProviderConfigured()) {
      return;
    }

    // Check if next page is already translated in aiSummary
    const nextSummary = aiSummaryRef.current?.[nextPage];
    if (nextSummary?.hasResult && nextSummary?.status === "done") {
      return;
    }

    // Settle delay: ensures initial TTS neural synthesis has completed and audio is smoothly streaming
    let cancelIdle: (() => void) | null = null;
    const timer = setTimeout(() => {
      const scheduleIdle = (callback: () => void, timeoutMs = 2000) => {
        if (typeof window !== "undefined" && "requestIdleCallback" in window) {
          const handle = (window as any).requestIdleCallback(callback, { timeout: timeoutMs });
          return () => (window as any).cancelIdleCallback(handle);
        }
        const handle = setTimeout(callback, 50);
        return () => clearTimeout(handle);
      };

      cancelIdle = scheduleIdle(async () => {
        // Re-verify conditions before dispatching translation
        if (
          !isPlayingRef.current ||
          isPausedRef.current ||
          !continuousPlayRef.current ||
          tabRef.current !== "ai" ||
          activePageNumberRef.current !== activePageRef.current ||
          isPageTranslating(docId, nextPage)
        ) {
          return;
        }

        // Verify next page exists and has text to process
        const nextRec = await getPageData(docId, nextPage).catch(() => null);
        if (!nextRec || !nextRec.text?.trim()) {
          return;
        }

        // Only check whether its translation is available (do not check prior read status)
        if (nextRec.pageAi?.result?.trim()) {
          return;
        }

        // Re-verify provider and auth readiness
        if (!isUserAuthenticated() || !isProviderConfigured()) {
          return;
        }

        lookaheadScheduledPageRef.current = nextPage;
        const currentGlobals = readGlobals();
        void executePageTranslation({
          docId,
          pageNumber: nextPage,
          globals: currentGlobals,
        }).catch((err) => {
          console.warn(`[AutoPlay] Lookahead translation error for page ${nextPage}:`, err);
        });
      });
    }, 1200);

    return () => {
      clearTimeout(timer);
      cancelIdle?.();
    };
  }, [
    docId,
    activePage,
    pageCount,
    tab,
    analyzing,
    isPlaying,
    isPaused,
    isNeuralLoading,
    continuousPlay,
    activePageNumber,
    aiSummary,
  ]);

  // 2. Page transition auto-advance playback handler:
  // When TTS completes page N and advances to page N+1:
  // - If page N+1 is translated, automatically starts TTS playback of its translated text.
  // - If N+1 translation is in flight, stays in transition state (DO NOT call stop!).
  // - If N+1 translation has not been triggered yet, triggers it immediately without calling stop.
  useEffect(() => {
    const isPendingTransition =
      isPlaying &&
      continuousPlay &&
      activePageNumber !== null &&
      activePageNumber > 0 &&
      activePageNumber !== activePage;

    if (!isPendingTransition) return;

    let cancelled = false;

    const handleTransition = async () => {
      if (tab === "ai") {
        // Check if translation is available for activePage (do not check prior read status)
        const availableText = await getAvailableTranslation(docId, activePage, activePageData);
        if (cancelled) return;

        if (availableText) {
          startPlaybackForPage(availableText, "ai", activePage);
          return;
        }

        // If translation is currently in-flight in background, wait for it (DO NOT call stop!)
        if (isPageTranslating(docId, activePage)) {
          return;
        }

        // Check storage again in case it just finished
        const rec = await getPageData(docId, activePage).catch(() => null);
        if (cancelled) return;
        if (rec?.pageAi?.result?.trim()) {
          startPlaybackForPage(rec.pageAi.result, "ai", activePage);
          return;
        }
        if (rec?.pageAi?.status === "running") {
          return;
        }

        // If translation is not yet started, trigger it now without stopping playback
        if (!isUserAuthenticated() || !isProviderConfigured()) {
          stop();
          return;
        }

        lookaheadScheduledPageRef.current = activePage;
        const currentGlobals = readGlobals();
        void executePageTranslation({
          docId,
          pageNumber: activePage,
          globals: currentGlobals,
        }).catch(() => {});
        return;
      } else if (tab === "text") {
        let text =
          activePageData && activePageData.pageNumber === activePage
            ? activePageData.text
            : undefined;

        if (!text) {
          const rec = await getPageData(docId, activePage).catch(() => null);
          if (cancelled) return;
          if (rec && rec.pageNumber === activePage) {
            text = rec.text;
          }
        }

        if (text?.trim()) {
          startPlaybackForPage(text, "original", activePage);
        } else {
          stop();
        }
      }
    };

    void handleTransition();

    return () => {
      cancelled = true;
    };
  }, [activePage, activePageData, isPlaying, continuousPlay, activePageNumber, tab, docId, stop]);

  // 3. Listen for real-time page-ready events when background generation completes
  useEffect(() => {
    return listenDocEvent("doclens:page-ready", (d) => {
      if (d.docId !== docId || d.pageNumber !== activePageRef.current || tabRef.current !== "ai") {
        return;
      }
      if (!isPlayingRef.current) return;

      const isTransition =
        activePageNumberRef.current === null ||
        activePageNumberRef.current !== activePageRef.current ||
        currentTextSource !== "ai";

      if (isTransition && d.result?.trim()) {
        startPlaybackForPage(d.result, "ai", d.pageNumber);
      }
    });
  }, [docId, currentTextSource]);

  // 4. Stop cleanly if translation errors out while waiting in transition
  useEffect(() => {
    return listenDocEvent("doclens:page-status-changed", (d) => {
      if (d.docId !== docId || d.pageNumber !== activePageRef.current || tabRef.current !== "ai") {
        return;
      }
      if (!isPlayingRef.current) return;

      if (d.status === "error") {
        const isTransition =
          activePageNumberRef.current === null ||
          activePageNumberRef.current !== activePageRef.current;
        if (isTransition) {
          stop();
        }
      }
    });
  }, [docId, stop]);
}
