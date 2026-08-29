import { useEffect, useRef, useMemo } from "react";
import { useTts, type TtsSource } from "@/context/TtsContext";
import { splitSentences } from "@/lib/tts";

interface HighlightableTextProps {
  text: string;
  source: TtsSource;
  pageNumber: number;
}

export function HighlightableText({ text, source, pageNumber }: HighlightableTextProps) {
  const {
    isPlaying,
    currentSentenceIndex,
    currentTextSource,
    activePageNumber,
    play,
    seekSentence,
  } = useTts();

  const sentences = useMemo(() => splitSentences(text), [text]);
  const activeSpanRef = useRef<HTMLSpanElement | null>(null);

  const isActiveText = isPlaying && currentTextSource === source && activePageNumber === pageNumber;

  // Scroll active sentence into view smoothly when it changes
  useEffect(() => {
    if (isActiveText && activeSpanRef.current) {
      activeSpanRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [isActiveText, currentSentenceIndex]);

  const handleSentenceClick = (index: number) => {
    if (isActiveText) {
      seekSentence(index);
    } else {
      play(text, source, pageNumber, index);
    }
  };

  if (sentences.length === 0) {
    return <span className="text-muted-foreground italic">No readable text.</span>;
  }

  return (
    <div className="whitespace-pre-wrap break-words">
      {sentences.map((sentence, idx) => {
        const isActiveSentence = isActiveText && idx === currentSentenceIndex;

        return (
          <span
            key={idx}
            ref={isActiveSentence ? activeSpanRef : undefined}
            onClick={() => handleSentenceClick(idx)}
            className={`reader-chunk inline ${isActiveSentence ? "reader-chunk-active" : ""}`}
            title="Click to read from here"
          >
            {sentence}
          </span>
        );
      })}
    </div>
  );
}
export default HighlightableText;
