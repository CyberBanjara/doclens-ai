import { useEffect, useRef } from "react";
import { dispatchDocEvent, listenDocEvent } from "@/lib/docEvents";
import { hasCompletedTtsVoiceSetup, type TtsSource } from "@/context/TtsContext";
import type { PageDataRecord } from "@/lib/storage";

interface UseAiTabAutoPlayArgs {
  docId: string;
  activePage: number;
  activePageData: PageDataRecord | null;
  tab: "ai" | "text";
  pageCount: number;
  analyzing?: boolean;
  isPlaying: boolean;
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
 * 2. Directly uses `activePageData` when available and listens to `doclens:page-ready` events.
 * 3. Prefetches / look-aheads the next page in the background while the current page is being read.
 */
export function useAiTabAutoPlay({
  docId,
  activePage,
  activePageData,
  tab,
  pageCount,
  analyzing = false,
  isPlaying,
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

  const continuousPlayRef = useRef(continuousPlay);
  continuousPlayRef.current = continuousPlay;

  const activePageRef = useRef(activePage);
  activePageRef.current = activePage;

  const activePageNumberRef = useRef(activePageNumber);
  activePageNumberRef.current = activePageNumber;

  const lastTriggeredKeyRef = useRef<string | null>(null);

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

  // 1. Page transition auto-advance playback handler for already translated pages
  useEffect(() => {
    const isPendingTransition =
      isPlaying && continuousPlay && activePageNumber !== null && activePageNumber !== activePage;

    if (!isPendingTransition) return;

    if (activePageData && activePageData.pageNumber === activePage) {
      if (tab === "ai") {
        const result = activePageData.pageAi?.result;
        const isDone = activePageData.pageAi?.status === "done";
        if (isDone && result?.trim()) {
          startPlaybackForPage(result, "ai", activePage);
        } else {
          stop();
        }
      } else if (tab === "text") {
        const text = activePageData.text;
        if (text?.trim()) {
          startPlaybackForPage(text, "original", activePage);
        } else {
          stop();
        }
      }
    }
  }, [activePage, activePageData, isPlaying, continuousPlay, activePageNumber, tab, docId, stop]);

  // 4. Listen for real-time page-ready events when background generation completes
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

      if (isTransition && d.result) {
        startPlaybackForPage(d.result, "ai", d.pageNumber);
      }
    });
  }, [docId, currentTextSource]);
}
