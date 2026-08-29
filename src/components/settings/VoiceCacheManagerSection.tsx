import { CircleCheck, FolderOpen, Loader2, Sparkles, Trash2, VolumeX } from "lucide-react";
import { getLanguageEnglishName } from "@/lib/voiceLanguageMap";
import type { TtsVoice } from "@/context/TtsContext";

interface VoiceCacheManagerSectionProps {
  language: string;
  isOpfs: boolean;
  languageFilteredNeuralVoices: TtsVoice[];
  downloadProgress: Record<string, number>;
  onDownloadVoice: (voiceId: string) => void;
  onDeleteVoice: (voiceId: string) => void;
  onClearVoiceCache: () => void;
}

export function VoiceCacheManagerSection({
  language,
  isOpfs,
  languageFilteredNeuralVoices,
  downloadProgress,
  onDownloadVoice,
  onDeleteVoice,
  onClearVoiceCache,
}: VoiceCacheManagerSectionProps) {
  return (
    <section className="glass-panel flex flex-col rounded-[18px] p-4 md:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Sparkles className="h-5 w-5 flex-shrink-0 text-primary" />
          <div>
            <h3 className="text-lg font-semibold text-foreground">Natural Voice Cache Manager</h3>
            <p className="text-xs text-muted-foreground">
              Showing voices for{" "}
              <span className="font-semibold text-primary">{getLanguageEnglishName(language)}</span>
              . Pre-download and manage neural speech models for instant offline playback.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${isOpfs ? "bg-primary/10 text-primary" : "bg-yellow-500/10 text-yellow-500"}`}
          >
            <FolderOpen className="h-3.5 w-3.5" />
            {isOpfs ? "OPFS (Primary)" : "IndexedDB (Fallback)"}
          </span>
          <button
            onClick={onClearVoiceCache}
            className="flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold text-destructive transition-all hover:bg-destructive/10 active:scale-95"
          >
            <Trash2 className="h-3.5 w-3.5" /> Clear All Voices
          </button>
        </div>
      </div>

      {languageFilteredNeuralVoices.length === 0 ? (
        <div className="my-auto flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface/30 px-6 py-10 text-center">
          <VolumeX className="mb-3 h-7 w-7 text-muted-foreground" />
          <p className="text-sm font-medium text-muted-foreground">
            No neural voices available for{" "}
            <span className="text-foreground font-semibold">
              {getLanguageEnglishName(language)}
            </span>
            .
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Neural TTS voices are available for languages like Hindi, English, French, German,
            Spanish, and many more.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:max-h-[480px] md:overflow-y-auto md:pr-1">
          {languageFilteredNeuralVoices.map((voice) => {
            const voiceId = voice.voiceURI;
            const isCached = voice.isDownloaded;
            const progress = downloadProgress[voiceId];
            const isDownloading = progress !== undefined;

            return (
              <div
                key={voiceId}
                className={`flex flex-col justify-between rounded-xl border p-4 transition-all ${
                  isCached ? "border-primary/20 bg-primary/5" : "border-border bg-background"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-bold text-foreground">
                      {voice.name.replace(/^✨ Neural /, "")}
                    </span>
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-bold text-muted-foreground uppercase">
                      {voice.lang}
                    </span>
                  </div>
                  <span className="block font-mono text-[10px] text-muted-foreground truncate mb-3">
                    {voiceId}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4 mt-auto">
                  <span className="text-xs font-semibold">
                    {isDownloading ? (
                      <span className="flex items-center gap-1 font-bold text-primary">
                        <Loader2 className="h-3 w-3 animate-spin" /> Downloading {progress}%
                      </span>
                    ) : isCached ? (
                      <span className="flex items-center gap-1 text-primary">
                        <CircleCheck className="h-3 w-3" /> Cached
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Not cached</span>
                    )}
                  </span>

                  {isCached ? (
                    <button
                      onClick={() => onDeleteVoice(voiceId)}
                      className="rounded-full bg-destructive/10 px-3 py-1.5 text-xs font-bold text-destructive hover:bg-destructive/20 active:scale-95 transition-all"
                    >
                      Delete
                    </button>
                  ) : (
                    <button
                      onClick={() => onDownloadVoice(voiceId)}
                      disabled={isDownloading}
                      className="rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/95 active:scale-95 transition-all disabled:opacity-50"
                    >
                      {isDownloading ? "Downloading…" : "Download"}
                    </button>
                  )}
                </div>

                {isDownloading && (
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-background">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
