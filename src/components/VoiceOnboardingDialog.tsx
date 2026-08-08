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
import { Loader2, Volume2 } from "lucide-react";
import { markTtsVoiceSetupComplete, useTts } from "@/context/TtsContext";
import { LANGUAGES, filterVoicesByLanguage } from "@/lib/voiceLanguageMap";
import { setOutputLanguage as persistOutputLanguage } from "@/lib/openrouter";
import { getFriendlyErrorMessage, isOnline, OFFLINE_MESSAGE } from "@/lib/network";
import { useIsMobile } from "@/hooks/use-mobile";

interface VoiceOnboardingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called once a voice is selected and ready (downloaded, if needed) to play. */
  onReady: () => void;
}

export function VoiceOnboardingDialog({ open, onOpenChange, onReady }: VoiceOnboardingDialogProps) {
  const isMobile = useIsMobile();
  const { outputLanguage, availableVoices, setOutputLanguage, setSelectedVoiceUri, downloadVoice, refreshVoices } =
    useTts();

  const [pickedLanguage, setPickedLanguage] = useState(outputLanguage);
  const [pickedVoiceUri, setPickedVoiceUri] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Reset local picks and load neural voice catalog each time the dialog is (re)opened
  useEffect(() => {
    if (open) {
      void refreshVoices(true);
      setPickedLanguage(outputLanguage);
      setPickedVoiceUri(null);
      setDownloading(false);
      setProgress(0);
      setError(null);
    }
  }, [open, outputLanguage, refreshVoices]);

  const voicesForLanguage = useMemo(() => {
    return filterVoicesByLanguage(availableVoices, pickedLanguage).sort((a, b) => {
      if (a.isNeural && !b.isNeural) return -1;
      if (!a.isNeural && b.isNeural) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [availableVoices, pickedLanguage]);

  const effectiveVoiceUri = useMemo(() => {
    if (pickedVoiceUri && voicesForLanguage.some((v) => v.voiceURI === pickedVoiceUri)) {
      return pickedVoiceUri;
    }
    return (
      voicesForLanguage.find((v) => v.isNeural)?.voiceURI ?? voicesForLanguage[0]?.voiceURI ?? null
    );
  }, [pickedVoiceUri, voicesForLanguage]);

  const handlePickLanguage = (langId: string) => {
    setPickedLanguage(langId);
    setPickedVoiceUri(null);
    setError(null);
  };

  const handleStart = async () => {
    if (!effectiveVoiceUri || downloading) return;
    setError(null);

    const voice = voicesForLanguage.find((v) => v.voiceURI === effectiveVoiceUri);

    if (voice?.isNeural && !voice.isDownloaded && !isOnline()) {
      setError(OFFLINE_MESSAGE);
      return;
    }

    setOutputLanguage(pickedLanguage);
    persistOutputLanguage(pickedLanguage);
    setSelectedVoiceUri(effectiveVoiceUri);

    if (voice?.isNeural && !voice.isDownloaded) {
      setDownloading(true);
      setProgress(0);
      try {
        await downloadVoice(effectiveVoiceUri, setProgress);
      } catch (err) {
        setDownloading(false);
        setError(getFriendlyErrorMessage(err, "Failed to download voice model. Please try again."));
        return;
      }
      setDownloading(false);
    }

    markTtsVoiceSetupComplete();
    onOpenChange(false);
    onReady();
  };

  const body = (
    <>
      <div className="space-y-3">
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          language
        </div>
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.id}
              onClick={() => handlePickLanguage(lang.id)}
              disabled={downloading}
              className={`rounded-md border px-3 py-1.5 text-sm transition-colors disabled:opacity-50 ${
                pickedLanguage === lang.id
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-background text-muted-foreground hover:text-foreground"
              }`}
            >
              {lang.native}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 space-y-3">
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          voice
        </div>
        {voicesForLanguage.length === 0 ? (
          <div className="rounded-lg bg-surface-2/40 px-3 py-2 text-xs italic text-muted-foreground">
            No voices available for this language yet.
          </div>
        ) : (
          <select
            value={effectiveVoiceUri ?? ""}
            onChange={(e) => setPickedVoiceUri(e.target.value || null)}
            disabled={downloading}
            className="w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-sm text-foreground outline-none focus:border-primary disabled:opacity-60"
          >
            {voicesForLanguage.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} ({v.lang}){v.isNeural && v.isDownloaded ? " — downloaded" : ""}
              </option>
            ))}
          </select>
        )}
      </div>

      {downloading && (
        <div className="mt-5 space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              Downloading voice model…
            </span>
            <span className="font-mono text-primary">{progress}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full bg-primary transition-all duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="mt-5 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}
    </>
  );

  const footerButtons = (
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
        className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-40"
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
            <DrawerDescription>
              Pick a language and voice to hear this page read aloud. Neural voices may need a
              one-time download.
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
      <DialogContent className="max-h-[85vh] overflow-hidden p-0 sm:max-w-[560px]">
        <div className="border-b border-border px-6 py-5">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Volume2 className="h-4 w-4 text-primary" />
              Choose a voice
            </DialogTitle>
            <DialogDescription>
              Pick a language and voice to hear this page read aloud. Neural voices may need a
              one-time download.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="max-h-[calc(85vh-160px)] overflow-auto px-6 py-5">{body}</div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
          {footerButtons}
        </div>
      </DialogContent>
    </Dialog>
  );
}
