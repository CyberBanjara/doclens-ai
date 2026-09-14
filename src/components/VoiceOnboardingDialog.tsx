import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Check, Download, Loader2, Sparkles, Volume2, VolumeX } from "lucide-react";
import { markTtsVoiceSetupComplete, useTts } from "@/context/TtsContext";
import { filterVoicesByLanguage } from "@/lib/voiceLanguageMap";
import { getOutputLanguage, setOutputLanguage as persistOutputLanguage } from "@/lib/openrouter";
import { getFriendlyErrorMessage, isOnline, OFFLINE_MESSAGE } from "@/lib/network";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/context/AuthContext";

interface VoiceOnboardingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called once a voice is selected and ready (downloaded, if needed) to play. */
  onReady: () => void;
}

export function VoiceOnboardingDialog({ open, onOpenChange, onReady }: VoiceOnboardingDialogProps) {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const {
    outputLanguage,
    availableVoices,
    isLoadingVoices,
    setOutputLanguage,
    setSelectedVoiceUri,
    downloadVoice,
    refreshVoices,
  } = useTts();

  const currentLanguage = useMemo(() => {
    return user?.nativeLanguage || getOutputLanguage() || outputLanguage || "हिंदी";
  }, [user?.nativeLanguage, outputLanguage]);

  const [pickedVoiceUri, setPickedVoiceUri] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadingUri, setDownloadingUri] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Reset local picks and ensure neural voice catalog is fresh each time the dialog is (re)opened
  useEffect(() => {
    if (open) {
      void refreshVoices(true);
      setPickedVoiceUri(null);
      setDownloading(false);
      setDownloadingUri(null);
      setProgress(0);
      setError(null);
    }
  }, [open, refreshVoices]);

  const voicesForLanguage = useMemo(() => {
    if (!currentLanguage) return [];
    return filterVoicesByLanguage(availableVoices, currentLanguage).sort((a, b) => {
      if (a.isNeural && !b.isNeural) return -1;
      if (!a.isNeural && b.isNeural) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [availableVoices, currentLanguage]);

  const hasVoices = voicesForLanguage.length > 0;

  const effectiveVoiceUri = useMemo(() => {
    if (pickedVoiceUri && voicesForLanguage.some((v) => v.voiceURI === pickedVoiceUri)) {
      return pickedVoiceUri;
    }
    return (
      voicesForLanguage.find((v) => v.isNeural && v.isDownloaded)?.voiceURI ??
      voicesForLanguage.find((v) => v.isNeural)?.voiceURI ??
      voicesForLanguage[0]?.voiceURI ??
      null
    );
  }, [pickedVoiceUri, voicesForLanguage]);

  const handleDownloadCard = async (voiceUri: string) => {
    if (downloading) return;
    setError(null);
    if (!isOnline()) {
      setError(OFFLINE_MESSAGE);
      return;
    }
    setDownloading(true);
    setDownloadingUri(voiceUri);
    setProgress(0);
    try {
      await downloadVoice(voiceUri, setProgress);
      await refreshVoices(true);
    } catch (err) {
      setError(getFriendlyErrorMessage(err, "Failed to download voice model. Please try again."));
    } finally {
      setDownloading(false);
      setDownloadingUri(null);
    }
  };

  const handleStart = async () => {
    if (!effectiveVoiceUri || downloading) return;
    setError(null);

    const voice = voicesForLanguage.find((v) => v.voiceURI === effectiveVoiceUri);

    if (voice?.isNeural && !voice.isDownloaded && !isOnline()) {
      setError(OFFLINE_MESSAGE);
      return;
    }

    setOutputLanguage(currentLanguage);
    persistOutputLanguage(currentLanguage);
    setSelectedVoiceUri(effectiveVoiceUri);

    if (voice?.isNeural && !voice.isDownloaded) {
      setDownloading(true);
      setDownloadingUri(effectiveVoiceUri);
      setProgress(0);
      try {
        await downloadVoice(effectiveVoiceUri, setProgress);
        await refreshVoices(true);
      } catch (err) {
        setDownloading(false);
        setDownloadingUri(null);
        setError(getFriendlyErrorMessage(err, "Failed to download voice model. Please try again."));
        return;
      }
      setDownloading(false);
      setDownloadingUri(null);
    }

    markTtsVoiceSetupComplete();
    onOpenChange(false);
    onReady();
  };

  const body = (
    <div className="space-y-3">
      {isLoadingVoices && !hasVoices ? (
        <div className="flex flex-col items-center justify-center py-10 text-center space-y-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-foreground">Loading available voices…</h4>
            <p className="text-xs text-muted-foreground">
              Discovering neural voices for {currentLanguage}
            </p>
          </div>
        </div>
      ) : !hasVoices ? (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-amber-700 dark:text-amber-400">
          <div className="flex items-start gap-3">
            <VolumeX className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-foreground">
                No voice available for {currentLanguage}
              </h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                There are currently no neural speech models or device voices available for{" "}
                {currentLanguage}. Audio playback is not supported for this language.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="max-h-[50vh] overflow-y-auto pr-1 space-y-2.5">
          {voicesForLanguage.map((v) => {
            const isSelected = effectiveVoiceUri === v.voiceURI;
            const isThisDownloading = downloading && downloadingUri === v.voiceURI;
            const cleanName =
              v.name
                .replace(/^✨\s*Neural\s*/i, "")
                .replace(/\s*\([^)]*\)\s*$/i, "")
                .trim() || v.name;

            return (
              <div
                key={v.voiceURI}
                onClick={() => {
                  if (!downloading) {
                    setPickedVoiceUri(v.voiceURI);
                  }
                }}
                className={`group relative flex flex-col rounded-xl border p-3.5 transition-all duration-200 cursor-pointer ${
                  isSelected
                    ? "border-primary bg-primary/[0.06] shadow-sm ring-1 ring-primary/40"
                    : "border-border bg-card/60 hover:border-primary/40 hover:bg-surface-2/40"
                } ${downloading && !isThisDownloading ? "opacity-60 pointer-events-none" : ""}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Radio circle */}
                    <div
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/30 group-hover:border-primary/50"
                      }`}
                    >
                      {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                    </div>

                    {/* Voice details */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-foreground truncate">
                          {cleanName}
                        </span>
                        {v.isNeural ? (
                          <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                            <Sparkles className="h-2.5 w-2.5" />
                            Neural HD
                          </span>
                        ) : (
                          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                            System
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">{v.lang}</p>
                    </div>
                  </div>

                  {/* Status / Action */}
                  <div className="shrink-0">
                    {v.isNeural ? (
                      v.isDownloaded ? (
                        <span className="flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                          <Check className="h-3 w-3" />
                          Ready
                        </span>
                      ) : isThisDownloading ? (
                        <span className="flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary font-mono tabular-nums">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          {progress}%
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPickedVoiceUri(v.voiceURI);
                            void handleDownloadCard(v.voiceURI);
                          }}
                          className="flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary hover:bg-primary/20 transition-colors"
                        >
                          <Download className="h-3 w-3" />
                          Download
                        </button>
                      )
                    ) : (
                      <span className="rounded-md bg-surface-2 px-2 py-1 text-[11px] font-medium text-muted-foreground">
                        Ready
                      </span>
                    )}
                  </div>
                </div>

                {/* Inline Progress Bar (When downloading this card) */}
                {isThisDownloading && (
                  <div className="mt-3 w-full">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary/20">
                      <div
                        className="h-full bg-gradient-to-r from-primary to-primary/80 transition-all duration-200 relative overflow-hidden rounded-full"
                        style={{ width: `${progress}%` }}
                      >
                        <div className="absolute inset-0 bg-white/30 animate-pulse" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}
    </div>
  );

  const footerButtons = (
    <>
      {!hasVoices ? (
        <button
          onClick={() => onOpenChange(false)}
          className="rounded-md bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          Got it
        </button>
      ) : (
        <>
          <button
            onClick={() => onOpenChange(false)}
            disabled={downloading}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleStart}
            disabled={!effectiveVoiceUri || downloading}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-40"
          >
            {downloading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Downloading…
              </>
            ) : (
              "Start Reading"
            )}
          </button>
        </>
      )}
    </>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={(next) => !downloading && onOpenChange(next)}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-2">
              <Volume2 className="h-4 w-4 text-primary" />
              Choose a voice
            </DrawerTitle>
            <DrawerDescription className="sr-only">
              Voice options available for this language
            </DrawerDescription>
          </DrawerHeader>
          <div className="overflow-y-auto px-6 pb-2">{body}</div>
          <DrawerFooter>{footerButtons}</DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !downloading && onOpenChange(next)}>
      <DialogContent className="max-h-[85vh] overflow-hidden p-0 sm:max-w-[500px]">
        <div className="border-b border-border px-6 py-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Volume2 className="h-4.5 w-4.5 text-primary" />
              Choose a voice
            </DialogTitle>
            <DialogDescription className="sr-only">
              Voice options available for this language
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="max-h-[calc(85vh-140px)] overflow-auto px-6 py-4">{body}</div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-3.5">
          {footerButtons}
        </div>
      </DialogContent>
    </Dialog>
  );
}
