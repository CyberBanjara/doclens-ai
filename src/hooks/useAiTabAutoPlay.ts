import { useEffect, useRef } from "react";
import { dispatchDocEvent, listenDocEvent } from "@/lib/docEvents";
import { hasCompletedTtsVoiceSetup, type TtsSource } from "@/context/TtsContext";

interface UseAiTabAutoPlayArgs {
  docId: string;
  activePage: number;
  tab: "ai" | "text";
  pageCount: number;
  analyzing?: boolean;
  isPlaying: boolean;
  continuousPlay: boolean;
  activePageNumber: number | null;
  currentTextSource: TtsSource | null;
  play: (text: string, source: TtsSource, pageNumber: number, startIndex?: number) => void;
  requestVoiceOnboarding: (onReady: () => void) => void;
}

/**
 * Seamless AI-tab auto-read orchestration: requests translation for the
 * active (and, during continuous play, look-ahead) page, then plays a page's
 * AI content as soon as it's confirmed ready — see doclens:ensure-page-ready /
 * doclens:page-ready in the Architecture doc for the full event chain.
 */
export function useAiTabAutoPlay({
  docId,
  activePage,
  tab,
  pageCount,
  analyzing = false,
  isPlaying,
  continuousPlay,
  activePageNumber,
  currentTextSource,
  play,
  requestVoiceOnboarding,
}: UseAiTabAutoPlayArgs) {
  // Read the current tab from a ref inside the doclens:page-ready listener so
  // that effect doesn't need `tab` in its dependency array (see effect 3).
  const tabRef = useRef(tab);
  tabRef.current = tab;

  // 1. Whenever the AI tab needs a page ready — the page changed (click,
  //    Prev/Next, page-select), or the user flipped back to "AI Assistant"
  //    after a background translation may have finished while they were on
  //    "Original Text" — ask PageWorkstation to ensure it's generated.
  useEffect(() => {
    if (tab !== "ai" || analyzing || pageCount <= 0) return;
    dispatchDocEvent("doclens:ensure-page-ready", { docId, pageNumber: activePage });
  }, [docId, activePage, tab, analyzing, pageCount]);

  // 2. Continuous-play look-ahead: while the current page is playing, start
  //    translating the next page in the background so it's ready by the time
  //    doclens:tts-next-page advances to it.
  useEffect(() => {
    if (tab !== "ai" || !isPlaying || !continuousPlay || activePageNumber !== activePage) return;
    const next = activePage + 1;
    if (next <= pageCount) {
      dispatchDocEvent("doclens:ensure-page-ready", { docId, pageNumber: next });
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
    return listenDocEvent("doclens:page-ready", (d) => {
      if (d.docId !== docId || d.pageNumber !== activePage || tabRef.current !== "ai") return;
      // Do not automatically trigger speech synthesis unless audio playback is actively playing
      if (!isPlaying) return;
      if (autoPlayedPagesRef.current.has(d.pageNumber)) return;
      if (activePageNumber === d.pageNumber && currentTextSource === "ai") return;

      autoPlayedPagesRef.current.add(d.pageNumber);
      if (!hasCompletedTtsVoiceSetup()) {
        requestVoiceOnboarding(() => play(d.result, "ai", d.pageNumber, 0));
      } else {
        play(d.result, "ai", d.pageNumber, 0);
      }
    });
  }, [
    docId,
    activePage,
    isPlaying,
    activePageNumber,
    currentTextSource,
    play,
    requestVoiceOnboarding,
  ]);
}
