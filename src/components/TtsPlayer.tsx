import {
  hasCompletedTtsVoiceSetup,
  markTtsVoiceSetupComplete,
  useTts,
  type TtsSource,
} from "@/context/TtsContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Play,
  Pause,
  Square,
  SkipForward,
  SkipBack,
  Settings,
  Volume2,
  Loader2,
  Repeat,
  Check,
} from "lucide-react";
import { useCallback, useMemo } from "react";
import { filterVoicesByLanguage, getLanguageEnglishName } from "@/lib/voiceLanguageMap";

/**
 * Display-only cleanup of voice names: strips decorative prefixes (e.g. "✨ Neural")
 * and capitalises, e.g. "✨ Neural pratham (Hindi)" → "Pratham (Hindi)".
 * The underlying voice name/URI is never modified.
 */
function formatVoiceName(name: string, languageLabel: string): string {
  const cleaned = name
    .replace(/^✨\s*/u, "")
    .replace(/^neural\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const titled = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return /\(.+\)$/.test(titled) || !languageLabel ? titled : `${titled} (${languageLabel})`;
}

interface TtsPlayerProps {
  text: string | undefined | null;
  source: TtsSource;
  pageNumber: number;
  aiBadgeLabel?: string;
  /** Requests the shared voice-onboarding dialog; `onReady` fires once a voice is selected/downloaded. */
  onNeedsVoiceOnboarding: (onReady: () => void) => void;
}

export function TtsPlayer({
  text,
  source,
  pageNumber,
  aiBadgeLabel,
  onNeedsVoiceOnboarding,
}: TtsPlayerProps) {
  const {
    isPlaying,
    isPaused,
    sentences,
    currentSentenceIndex,
    currentTextSource,
    activePageNumber,
    rate,
    selectedVoiceUri,
    availableVoices,
    filteredVoices,
    outputLanguage,
    continuousPlay,
    isNeuralLoading,
    isLoadingVoices,
    play,
    pause,
    resume,
    stop,
    nextSentence,
    prevSentence,
    setRate,
    setSelectedVoiceUri,
    setContinuousPlay,
  } = useTts();

  const isCurrentActive =
    isPlaying && currentTextSource === source && activePageNumber === pageNumber;

  const isTransitioningToThisPage =
    isPlaying &&
    continuousPlay &&
    activePageNumber !== null &&
    activePageNumber > 0 &&
    activePageNumber !== pageNumber;

  const progressPercent = useMemo(() => {
    if (!isCurrentActive || sentences.length === 0) return 0;
    return ((currentSentenceIndex + 1) / sentences.length) * 100;
  }, [isCurrentActive, currentSentenceIndex, sentences.length]);

  const sortedVoices = useMemo(() => {
    return [...filteredVoices].sort((a, b) => {
      // Neural voices first
      if (a.isNeural && !b.isNeural) return -1;
      if (!a.isNeural && b.isNeural) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [filteredVoices]);

  // Stable ref: keeps the selected voice visible when the list opens without
  // re-scrolling on every playback re-render, and never scrolls the page.
  const scrollSelectedVoiceIntoView = useCallback((el: HTMLButtonElement | null) => {
    const list = el?.parentElement;
    if (!el || !list) return;
    list.scrollTop = el.offsetTop - list.offsetTop - list.clientHeight / 2 + el.offsetHeight / 2;
  }, []);

  const languageLabel = useMemo(() => getLanguageEnglishName(outputLanguage), [outputLanguage]);

  if (!text && !isTransitioningToThisPage) {
    return null;
  }

  const handlePlayToggle = () => {
    if (!text) return;
    if (isCurrentActive) {
      if (isPaused) {
        resume();
      } else {
        pause();
      }
      return;
    }

    const isPiperVoiceReady = () => {
      if (!hasCompletedTtsVoiceSetup()) {
        return false;
      }
      const targetVoices =
        filteredVoices.length > 0
          ? filteredVoices
          : filterVoicesByLanguage(availableVoices, outputLanguage);

      const neuralVoices = targetVoices.filter((v) => v.isNeural);
      if (neuralVoices.length > 0) {
        const selected = targetVoices.find((v) => v.voiceURI === selectedVoiceUri);
        if (selected) {
          return selected.isNeural ? Boolean(selected.isDownloaded) : true;
        }
        return neuralVoices.some((v) => v.isDownloaded);
      }
      return targetVoices.length > 0;
    };

    if (!isPiperVoiceReady()) {
      onNeedsVoiceOnboarding(() => play(text, source, pageNumber, 0));
      return;
    }

    play(text, source, pageNumber, 0);
  };

  const sourceLabel = source === "ai" ? aiBadgeLabel || "AI Content" : "Original Text";
  const isBusy = (isCurrentActive && isNeuralLoading) || isTransitioningToThisPage;
  const showStop = isCurrentActive || isTransitioningToThisPage;

  const iconBtn =
    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:pointer-events-none disabled:opacity-35";

  return (
    <div className="@container relative mt-4 overflow-hidden rounded-2xl border border-border/70 bg-card/80 shadow-lg shadow-black/10 backdrop-blur-md">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-2.5">
        {/* Left: source + progress meta */}
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="flex min-w-0 items-center gap-1.5 rounded-full bg-surface-2/70 py-1 pl-1.5 pr-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
            title={sourceLabel}
          >
            <Volume2
              className={`h-3.5 w-3.5 shrink-0 text-primary ${isCurrentActive && !isPaused ? "animate-pulse" : ""}`}
            />
            <span className="hidden truncate @[22rem]:inline">{sourceLabel}</span>
          </span>
          {isTransitioningToThisPage ? (
            <span className="truncate text-[11px] text-primary/80 animate-pulse">Preparing…</span>
          ) : (
            isCurrentActive &&
            sentences.length > 0 && (
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                {currentSentenceIndex + 1}
                <span className="opacity-50">/{sentences.length}</span>
              </span>
            )
          )}
        </div>

        {/* Center: transport controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={prevSentence}
            disabled={!isCurrentActive || currentSentenceIndex === 0}
            className={iconBtn}
            title="Previous Sentence"
            aria-label="Previous sentence"
          >
            <SkipBack className="h-4 w-4 fill-current" />
          </button>

          <button
            onClick={handlePlayToggle}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md shadow-primary/25 transition-transform hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:opacity-80 disabled:hover:scale-100"
            title={
              isCurrentActive && !isPaused
                ? "Pause"
                : isTransitioningToThisPage
                  ? "Loading next page..."
                  : "Play"
            }
            aria-label={isCurrentActive && !isPaused ? "Pause" : "Play"}
            disabled={isBusy}
          >
            {isBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isCurrentActive && !isPaused ? (
              <Pause className="h-4 w-4 fill-current" />
            ) : (
              <Play className="ml-0.5 h-4 w-4 fill-current" />
            )}
          </button>

          <button
            onClick={nextSentence}
            disabled={!isCurrentActive || currentSentenceIndex === sentences.length - 1}
            className={iconBtn}
            title="Next Sentence"
            aria-label="Next sentence"
          >
            <SkipForward className="h-4 w-4 fill-current" />
          </button>
        </div>

        {/* Right: secondary actions */}
        <div className="flex min-w-0 items-center justify-end gap-1">
          {showStop && (
            <button
              onClick={stop}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
              title="Stop Reading"
              aria-label="Stop reading"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </button>
          )}

          <button
            type="button"
            role="switch"
            aria-checked={continuousPlay}
            onClick={() => setContinuousPlay(!continuousPlay)}
            className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
              continuousPlay
                ? "bg-primary/12 text-primary hover:bg-primary/18"
                : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            }`}
            title={continuousPlay ? "Continuous reading: on" : "Continuous reading: off"}
          >
            <Repeat className="h-3.5 w-3.5" />
            <span className="hidden @[26rem]:inline">Continuous</span>
          </button>

          <Popover>
            <PopoverTrigger asChild>
              <button className={iconBtn} title="Speech Settings" aria-label="Speech settings">
                <Settings className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={10}
              className="flex w-64 flex-col gap-3 rounded-2xl border-border/70 p-2.5 shadow-xl shadow-black/20"
            >
              {/* Voice */}
              <div className="flex flex-col gap-1.5">
                <span className="px-1 text-[11px] font-medium text-muted-foreground">Voice</span>
                {isLoadingVoices && sortedVoices.length === 0 ? (
                  <div className="flex h-9 items-center gap-2 rounded-lg bg-surface-2/50 px-2.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                    Loading voices…
                  </div>
                ) : sortedVoices.length === 0 ? (
                  <div className="rounded-lg bg-surface-2/50 px-2.5 py-2 text-xs text-muted-foreground">
                    No {languageLabel} voices installed.{" "}
                    <a href="/settings" className="font-medium text-primary hover:underline">
                      Settings
                    </a>
                  </div>
                ) : (
                  <div
                    role="listbox"
                    aria-label={`${languageLabel} voices`}
                    className="flex max-h-44 flex-col gap-0.5 overflow-y-auto rounded-xl bg-surface-2/40 p-1 [scrollbar-width:thin]"
                  >
                    {sortedVoices.map((v) => {
                      const selected = v.voiceURI === selectedVoiceUri;
                      return (
                        <button
                          key={v.voiceURI}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          ref={selected ? scrollSelectedVoiceIntoView : undefined}
                          onClick={() => {
                            setSelectedVoiceUri(v.voiceURI || null);
                            markTtsVoiceSetupComplete();
                          }}
                          className={`flex h-8 w-full shrink-0 items-center justify-between gap-2 rounded-lg px-2.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                            selected
                              ? "bg-primary/12 font-medium text-primary"
                              : "text-foreground/85 hover:bg-surface-2 hover:text-foreground"
                          }`}
                        >
                          <span className="truncate">{formatVoiceName(v.name, languageLabel)}</span>
                          {selected && <Check className="h-3.5 w-3.5 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Speed */}
              <div className="flex flex-col gap-2 px-1 pb-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-muted-foreground">Speed</span>
                  <span className="rounded-md bg-surface-2/60 px-1.5 py-0.5 font-mono text-[11px] font-medium tabular-nums text-foreground">
                    {rate.toFixed(1)}x
                  </span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={2.0}
                  step={0.1}
                  value={rate}
                  onChange={(e) => setRate(parseFloat(e.target.value))}
                  aria-label="Speed"
                  style={{
                    background: `linear-gradient(to right, var(--primary) ${((rate - 0.5) / 1.5) * 100}%, var(--surface-2) ${((rate - 0.5) / 1.5) * 100}%)`,
                  }}
                  className="h-1 w-full cursor-pointer appearance-none rounded-full focus-visible:outline-none [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-primary [&::-moz-range-thumb]:bg-background [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-primary [&::-webkit-slider-thumb]:bg-background [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:transition-transform hover:[&::-webkit-slider-thumb]:scale-115 focus-visible:[&::-webkit-slider-thumb]:ring-4 focus-visible:[&::-webkit-slider-thumb]:ring-primary/25"
                />
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Progress rail */}
      <div className="h-0.5 w-full bg-surface-2/60">
        <div
          className="h-full bg-primary transition-[width] duration-300 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
}
export default TtsPlayer;
