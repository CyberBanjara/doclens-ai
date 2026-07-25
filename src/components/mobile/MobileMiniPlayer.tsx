import { Pause, Play, SkipBack, SkipForward, Volume2 } from "lucide-react";
import { useMemo } from "react";
import { useTts } from "@/context/TtsContext";

interface MobileMiniPlayerProps {
  /** Opens the reader sheet — used when nothing is playing yet, to let the
   * user pick what to read (mirrors the desktop TtsPlayer's play button,
   * which needs resolved text/source from RightPanel). */
  onOpenReader: () => void;
}

/**
 * Compact Play/Pause + Back/Next + progress for the mobile floating bottom
 * bar. Reads directly from TtsContext — no props threading needed since
 * it's a context hook, and no playback logic is duplicated: pause/resume/
 * prevSentence/nextSentence call straight into the same context actions
 * TtsPlayer already uses.
 */
export function MobileMiniPlayer({ onOpenReader }: MobileMiniPlayerProps) {
  const {
    isPlaying,
    isPaused,
    sentences,
    currentSentenceIndex,
    pause,
    resume,
    prevSentence,
    nextSentence,
  } = useTts();

  const progressPercent = useMemo(() => {
    if (!isPlaying || sentences.length === 0) return 0;
    return ((currentSentenceIndex + 1) / sentences.length) * 100;
  }, [isPlaying, currentSentenceIndex, sentences.length]);

  if (!isPlaying) {
    return (
      <button
        onClick={onOpenReader}
        className="flex h-11 w-11 items-center justify-center rounded-full text-foreground/80 transition-colors active:scale-95"
        title="Read aloud"
        aria-label="Read aloud"
      >
        <Volume2 className="h-5 w-5" />
      </button>
    );
  }

  return (
    <div className="flex items-center">
      <button
        onClick={prevSentence}
        disabled={currentSentenceIndex === 0}
        className="flex h-11 w-9 items-center justify-center rounded-full text-foreground/80 transition-colors active:scale-95 disabled:opacity-30"
        title="Previous Sentence"
        aria-label="Previous sentence"
      >
        <SkipBack className="h-4 w-4" />
      </button>

      <button
        onClick={() => (isPaused ? resume() : pause())}
        className="relative flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-primary transition-transform active:scale-95"
        title={isPaused ? "Resume" : "Pause"}
        aria-label={isPaused ? "Resume reading" : "Pause reading"}
      >
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 44 44">
          <circle cx="22" cy="22" r="19" fill="none" stroke="var(--border)" strokeWidth="2" />
          <circle
            cx="22"
            cy="22"
            r="19"
            fill="none"
            stroke="var(--primary)"
            strokeWidth="2"
            strokeDasharray={2 * Math.PI * 19}
            strokeDashoffset={2 * Math.PI * 19 * (1 - progressPercent / 100)}
            strokeLinecap="round"
            className="transition-all duration-300"
          />
        </svg>
        {isPaused ? <Play className="h-4 w-4 fill-current ml-0.5" /> : <Pause className="h-4 w-4 fill-current" />}
      </button>

      <button
        onClick={nextSentence}
        disabled={currentSentenceIndex === sentences.length - 1}
        className="flex h-11 w-9 items-center justify-center rounded-full text-foreground/80 transition-colors active:scale-95 disabled:opacity-30"
        title="Next Sentence"
        aria-label="Next sentence"
      >
        <SkipForward className="h-4 w-4" />
      </button>
    </div>
  );
}
