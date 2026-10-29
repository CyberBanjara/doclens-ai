import { useEffect, useRef } from "react";
import { listenDocEvent } from "@/lib/docEvents";
import { hasCompletedTtsVoiceSetup, type TtsSource } from "@/context/TtsContext";
import { getPageData, type PageAiSummaryEntry, type PageDataRecord } from "@/lib/storage";
import { executePageTranslation, isPageTranslating } from "@/lib/pageTranslationRunner";
import { getKey, isOmniRouterConfigured, readGlobals } from "@/lib/openrouter";
import { effective, hashFor } from "@/lib/pageAi";
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

/**
 * Continuous play and AI auto-read orchestration:
 * 1. Automatically initiates and transitions TTS playback when advancing across pages.
 * 2. Look-ahead background translation: while page N is actively reading and continuous play is on,
 *    once initial TTS speech synthesis finishes and the processor is free, automatically begins
 *    translating/explaining page N+1 according to the active global mode and style settings.
 * 3. Cache freshness verification: ensures that pre-translation and auto-advance strictly use the
 *    translation/explanation matching the active global mode (e.g. Explain, Translate) and style.
 * 4. Gracefully handles transition states without aborting playback while waiting for background processing.
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
  // When TTS is actively playing page N with continuous play enabled,
  // wait for TTS speech synthesis to complete and processor/WASM thread to be free,
  // then automatically pre-translate/explain page N+1 matching the active global settings.
  useEffect(() => {
    if (!isPlaying || isPaused || !continuousPlay || tab !== "ai" || isNeuralLoading || analyzing) {
      return;
    }

    // Only initiate look-ahead when audio playback has stabilized on the current page
    if (activePageNumber === null || activePageNumber <= 0 || activePageNumber !== activePage) {
      return;
    }

    const nextPage = activePage + 1;
    if (nextPage > pageCount) {
      return;
    }

    const currentGlobals = readGlobals();
    const currentHash = hashFor(effective(currentGlobals));

    // Check if next page is already translated and matches the current mode/style
    const nextSummary = aiSummaryRef.current?.[nextPage];
    const isNextPageFresh =
      nextSummary?.status === "done" &&
      nextSummary.hasResult &&
      (nextSummary.isCustom || nextSummary.settingsHash === currentHash);

    if (isNextPageFresh) {
      return;
    }

    // Check if already in-flight or already scheduled in this cycle
    if (isPageTranslating(docId, nextPage) || lookaheadScheduledPageRef.current === nextPage) {
      return;
    }

    // RACE CONDITION & PROCESSOR LOAD CONTROL:
    // Settle delay (1500ms) after audio is actively playing:
    // - Ensures initial Piper ONNX WASM synthesis is completely finished.
    // - Audio is smoothly streaming through Web Audio/hardware audio pipeline (near 0% CPU).
    // - If user rapidly pauses, stops, or navigates, lookahead is safely cancelled before starting.
    let cancelIdle: (() => void) | null = null;
    const timer = setTimeout(() => {
      const scheduleIdle = (callback: () => void, timeoutMs = 2500) => {
        if (typeof window !== "undefined" && "requestIdleCallback" in window) {
          const handle = (window as any).requestIdleCallback(callback, { timeout: timeoutMs });
          return () => (window as any).cancelIdleCallback(handle);
        }
        const handle = setTimeout(callback, 100);
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

        // If already translated in storage with matching mode & settings, skip rerun
        const isStorageFresh =
          nextRec.pageAi?.status === "done" &&
          nextRec.pageAi?.result?.trim() &&
          (nextRec.pageAi.isCustom || nextRec.pageAi.settingsHash === currentHash);

        if (isStorageFresh) {
          return;
        }

        // Check authentication & provider configuration
        const user = getFirebaseAuth().currentUser;
        if (!user) return;
        if (!getKey() && !isOmniRouterConfigured()) return;

        lookaheadScheduledPageRef.current = nextPage;

        void executePageTranslation({
          docId,
          pageNumber: nextPage,
          globals: currentGlobals,
        }).catch((err) => {
          console.warn(`[AutoPlay] Lookahead processing error for page ${nextPage}:`, err);
        });
      });
    }, 1500);

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
  // When TTS completes page N and advances to page N+1, smoothly start playback
  // if N+1 is ready for the current mode/style, or wait for the in-flight processing to finish (without calling stop()).
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
        const currentGlobals = readGlobals();
        const currentHash = hashFor(effective(currentGlobals));

        // Step A: Check activePageData from state
        let pageResult =
          activePageData && activePageData.pageNumber === activePage
            ? activePageData.pageAi?.result
            : undefined;
        let pageStatus =
          activePageData && activePageData.pageNumber === activePage
            ? activePageData.pageAi?.status
            : undefined;
        let pageSettingsHash =
          activePageData && activePageData.pageNumber === activePage
            ? activePageData.pageAi?.settingsHash
            : undefined;
        let isCustom =
          activePageData && activePageData.pageNumber === activePage
            ? !!activePageData.pageAi?.isCustom
            : false;

        // Step B: If activePageData not yet synced for this page or settings mismatch, check storage directly
        if (
          !pageResult ||
          pageStatus !== "done" ||
          (!isCustom && pageSettingsHash !== currentHash)
        ) {
          const rec = await getPageData(docId, activePage).catch(() => null);
          if (cancelled) return;
          if (rec && rec.pageNumber === activePage) {
            pageResult = rec.pageAi?.result;
            pageStatus = rec.pageAi?.status;
            pageSettingsHash = rec.pageAi?.settingsHash;
            isCustom = !!rec.pageAi?.isCustom;
          }
        }

        // If translation is ready and matches current settings/mode, begin playback immediately
        const isFresh =
          pageStatus === "done" &&
          pageResult?.trim() &&
          (isCustom || pageSettingsHash === currentHash);

        if (isFresh && pageResult) {
          startPlaybackForPage(pageResult, "ai", activePage);
          return;
        }

        // If translation is currently running in background, stay in transition state (DO NOT stop!)
        if (pageStatus === "running" || isPageTranslating(docId, activePage)) {
          return;
        }

        // If page has not been started yet (idle) or has a stale result from a different mode/style,
        // trigger translation with current settings/mode now
        const user = getFirebaseAuth().currentUser;
        if (!user || (!getKey() && !isOmniRouterConfigured())) {
          stop();
          return;
        }

        lookaheadScheduledPageRef.current = activePage;
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
