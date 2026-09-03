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
  Sparkles,
} from "lucide-react";
import { useMemo } from "react";
import { getLanguageEnglishName } from "@/lib/voiceLanguageMap";

interface TtsPlayerProps {
  text: string | undefined | null;
  source: TtsSource;
  pageNumber: number;
  /** Requests the shared voice-onboarding dialog; `onReady` fires once a voice is selected/downloaded. */
  onNeedsVoiceOnboarding: (onReady: () => void) => void;
}

export function TtsPlayer({ text, source, pageNumber, onNeedsVoiceOnboarding }: TtsPlayerProps) {
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

  const progressPercent = useMemo(() => {
    if (!isCurrentActive || sentences.length === 0) return 0;
    return ((currentSentenceIndex + 1) / sentences.length) * 100;
  }, [isCurrentActive, currentSentenceIndex, sentences.length]);

  const activeSentenceText = useMemo(() => {
    if (!isCurrentActive || sentences.length === 0) return "";
    return sentences[currentSentenceIndex] || "";
  }, [isCurrentActive, currentSentenceIndex, sentences]);

  const sortedVoices = useMemo(() => {
    return [...filteredVoices].sort((a, b) => {
      // Neural voices first
      if (a.isNeural && !b.isNeural) return -1;
      if (!a.isNeural && b.isNeural) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [filteredVoices]);

  const languageLabel = useMemo(() => getLanguageEnglishName(outputLanguage), [outputLanguage]);

  if (!text) {
    return null;
  }

  const handlePlayToggle = () => {
    if (isCurrentActive) {
      if (isPaused) {
        resume();
      } else {
        pause();
      }
      return;
    }

    if (!hasCompletedTtsVoiceSetup()) {
      onNeedsVoiceOnboarding(() => play(text, source, pageNumber, 0));
      return;
    }

    play(text, source, pageNumber, 0);
  };

  return (
    <div className="relative mt-4 overflow-hidden rounded-2xl border border-border bg-card/75 p-4 shadow-lg backdrop-blur-md transition-all duration-200 hover:border-border-strong">
      {/* Progress Bar (Sticky Top inside the card) */}
      {isCurrentActive && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-surface-2">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

      <div className="flex flex-col gap-3">
        {/* Top Section: Info & Title */}
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <h4 className="text-[13px] font-bold text-foreground flex items-center gap-1.5">
              <Volume2 className="h-4 w-4 text-primary" />
              <span>
                {isCurrentActive ? `Reading Page ${pageNumber}` : `Read Page ${pageNumber}`}
              </span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider bg-surface-2 px-1.5 py-0.5 rounded">
                {source === "ai" ? "AI Summary" : "Original Text"}
              </span>
            </h4>
            {isCurrentActive && activeSentenceText && (
              <p className="mt-1 truncate text-xs text-muted-foreground italic max-w-[280px] sm:max-w-md">
                "{activeSentenceText}"
              </p>
            )}
          </div>

          {/* Progress Indicator */}
          {isCurrentActive && sentences.length > 0 && (
            <span className="text-[11px] font-mono text-muted-foreground tabular-nums">
              {currentSentenceIndex + 1}/{sentences.length}
            </span>
          )}
        </div>

        {/* Bottom Section: Controls & Settings */}
        <div className="flex items-center justify-between pt-1">
          {/* Main Playback Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={prevSentence}
              disabled={!isCurrentActive || currentSentenceIndex === 0}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-surface-2 hover:text-foreground disabled:opacity-40"
              title="Previous Sentence"
            >
              <SkipBack className="h-4 w-4" />
            </button>

            <button
              onClick={handlePlayToggle}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-all hover:scale-105 active:scale-95 disabled:opacity-80"
              title={isCurrentActive && !isPaused ? "Pause" : "Play"}
              disabled={isCurrentActive && isNeuralLoading}
            >
              {isCurrentActive && isNeuralLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isCurrentActive && !isPaused ? (
                <Pause className="h-4 w-4 fill-current" />
              ) : (
                <Play className="h-4 w-4 fill-current ml-0.5" />
              )}
            </button>

            {isCurrentActive && (
              <button
                onClick={stop}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-destructive transition-all hover:bg-destructive/10"
                title="Stop Reading"
              >
                <Square className="h-4 w-4 fill-current" />
              </button>
            )}

            <button
              onClick={nextSentence}
              disabled={!isCurrentActive || currentSentenceIndex === sentences.length - 1}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-surface-2 hover:text-foreground disabled:opacity-40"
              title="Next Sentence"
            >
              <SkipForward className="h-4 w-4" />
            </button>
          </div>

          {/* Settings & Voice Controls */}
          <div className="flex items-center gap-2">
            {/* Quick voice selection directly on Workspace player */}
            {sortedVoices.length > 0 && (
              <div className="flex items-center gap-1.5 rounded-lg border border-border bg-surface/60 px-2 py-1">
                <Sparkles className="h-3 w-3 text-primary shrink-0" />
                <select
                  value={selectedVoiceUri || sortedVoices[0]?.voiceURI || ""}
                  onChange={(e) => {
                    setSelectedVoiceUri(e.target.value || null);
                    markTtsVoiceSetupComplete();
                  }}
                  title="Select Voice"
                  className="max-w-[120px] sm:max-w-[160px] truncate bg-transparent text-xs text-foreground outline-none cursor-pointer"
                >
                  {sortedVoices.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI} className="bg-popover text-popover-foreground">
                      {v.name.replace(/^✨\s*Neural\s*/i, "✨ ")}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={continuousPlay}
                onChange={(e) => setContinuousPlay(e.target.checked)}
                className="h-3.5 w-3.5 rounded accent-primary bg-surface-2 border-border"
              />
              <span>Continuous</span>
            </label>

            <Popover>
              <PopoverTrigger asChild>
                <button
                  className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors text-muted-foreground hover:bg-surface-2 hover:text-foreground`}
                  title="Speech Settings"
                >
                  <Settings className="h-4 w-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-[280px] p-4 border border-border bg-popover text-popover-foreground shadow-xl rounded-2xl flex flex-col gap-4">
                <div className="space-y-1">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Speech Configuration
                  </h4>
                  <p className="text-[10px] text-muted-foreground">
                    Configure your voice and reading speed preference.
                  </p>
                </div>

                {/* Voice Selection */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-muted-foreground">
                    {languageLabel} Voices
                  </label>
                  {sortedVoices.length === 0 ? (
                    <div className="text-[11px] text-muted-foreground bg-surface-2/40 px-2 py-1.5 rounded-lg italic">
                      No voices available for {languageLabel}. Install voices in{" "}
                      <a href="/settings" className="text-primary underline">
                        Settings
                      </a>
                      .
                    </div>
                  ) : (
                    <select
                      value={selectedVoiceUri || sortedVoices[0]?.voiceURI || ""}
                      onChange={(e) => {
                        setSelectedVoiceUri(e.target.value || null);
                        markTtsVoiceSetupComplete();
                      }}
                      className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary"
                    >
                      {sortedVoices.map((v) => (
                        <option key={v.voiceURI} value={v.voiceURI}>
                          {v.name} ({v.lang})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Speed rate selection */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                    <span>Reading Speed</span>
                    <span className="font-mono text-primary">{rate.toFixed(1)}x</span>
                  </div>
                  <input
                    type="range"
                    min={0.5}
                    max={2.0}
                    step={0.1}
                    value={rate}
                    onChange={(e) => setRate(parseFloat(e.target.value))}
                    className="w-full accent-primary"
                  />
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>
    </div>
  );
}
export default TtsPlayer;
