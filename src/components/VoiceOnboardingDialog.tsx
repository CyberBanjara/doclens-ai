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
import { Check, CheckCircle2, Download, Languages, Loader2, Sparkles, Volume2 } from "lucide-react";
import {
  markTtsVoiceSetupComplete,
  useTts,
  isNeuralVoiceUri,
  type TtsVoice,
} from "@/context/TtsContext";
import { useAuth } from "@/context/AuthContext";
import { getStoredAuthToken, apiFetchCurrentUser } from "@/lib/auth-client";
import { LANGUAGES, filterVoicesByLanguage } from "@/lib/voiceLanguageMap";
import { setOutputLanguage as persistOutputLanguage, getOutputLanguage } from "@/lib/openrouter";
import { getFriendlyErrorMessage, isOnline, OFFLINE_MESSAGE } from "@/lib/network";
import { useIsMobile } from "@/hooks/use-mobile";

interface VoiceOnboardingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called once a voice is selected and ready (downloaded, if needed) to play. */
  onReady: () => void;
}

function parseJwtPayload(token: string): Record<string, any> | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

function parseVoiceInfo(voice: TtsVoice) {
  const isNeural = !!voice.isNeural || isNeuralVoiceUri(voice.voiceURI);
  let displayName = voice.name;
  let quality = "";
  const locale = voice.lang || "";

  if (isNeural) {
    const match = voice.voiceURI.match(
      /^[a-z]{2,3}(?:_[a-zA-Z0-9]+)?-([a-zA-Z0-9_]+)-([a-zA-Z0-9_]+)/i,
    );
    if (match) {
      const rawName = match[1];
      displayName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
      quality = match[2].charAt(0).toUpperCase() + match[2].slice(1);
    } else {
      displayName = voice.name.replace(/^✨\s*Neural\s*/i, "").replace(/\s*\(.*?\)$/, "");
      quality = "Neural";
    }
  }

  return {
    displayName,
    quality: quality || (isNeural ? "Standard" : "System"),
    locale,
    isNeural,
    isDownloaded: !!voice.isDownloaded,
  };
}

export function VoiceOnboardingDialog({ open, onOpenChange, onReady }: VoiceOnboardingDialogProps) {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const {
    outputLanguage,
    availableVoices,
    setOutputLanguage,
    setSelectedVoiceUri,
    downloadVoice,
    refreshVoices,
  } = useTts();

  const [jwtFetchedLang, setJwtFetchedLang] = useState<string | null>(null);
  const [pickedVoiceUri, setPickedVoiceUri] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Directly parse native language from stored JWT token as an immediate synchronous source
  const jwtLanguageFromToken = useMemo(() => {
    const token = getStoredAuthToken();
    if (token) {
      const payload = parseJwtPayload(token);
      if (typeof payload?.nativeLanguage === "string" && payload.nativeLanguage.trim()) {
        return payload.nativeLanguage.trim();
      }
    }
    return null;
  }, []);

  // Fetch current user on open to ensure latest profile data
  useEffect(() => {
    if (open) {
      void refreshVoices(true);
      setPickedVoiceUri(null);
      setDownloading(false);
      setProgress(0);
      setError(null);

      void apiFetchCurrentUser()
        .then((u) => {
          if (u?.nativeLanguage?.trim()) {
            setJwtFetchedLang(u.nativeLanguage.trim());
          }
        })
        .catch(() => {});
    }
  }, [open, refreshVoices]);

  // Target language automatically resolved from JWT data (no manual language selection required)
  const targetLanguage = useMemo(() => {
    return (
      user?.nativeLanguage?.trim() ||
      jwtFetchedLang ||
      jwtLanguageFromToken ||
      outputLanguage?.trim() ||
      getOutputLanguage()?.trim() ||
      "हिंदी"
    );
  }, [user?.nativeLanguage, jwtFetchedLang, jwtLanguageFromToken, outputLanguage]);

  const targetLanguageInfo = useMemo(() => {
    const norm = targetLanguage.toLowerCase().trim();
    const found = LANGUAGES.find(
      (l) =>
        l.id.toLowerCase() === norm ||
        l.english.toLowerCase() === norm ||
        l.native.toLowerCase() === norm,
    );
    if (found) return found;
    return {
      id: targetLanguage,
      native: targetLanguage,
      english: targetLanguage,
      script: "Universal",
    };
  }, [targetLanguage]);

  const voicesForLanguage = useMemo(() => {
    const filtered = filterVoicesByLanguage(availableVoices, targetLanguage);
    return filtered.sort((a, b) => {
      // Neural voices first
      if (a.isNeural && !b.isNeural) return -1;
      if (!a.isNeural && b.isNeural) return 1;
      // Downloaded voices first
      if (a.isDownloaded && !b.isDownloaded) return -1;
      if (!a.isDownloaded && b.isDownloaded) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [availableVoices, targetLanguage]);

  // Fallback to English voices if no voice is available for a rare language
  const displayVoices = useMemo(() => {
    if (voicesForLanguage.length > 0) return voicesForLanguage;
    return filterVoicesByLanguage(availableVoices, "English");
  }, [voicesForLanguage, availableVoices]);

  const effectiveVoiceUri = useMemo(() => {
    if (pickedVoiceUri && displayVoices.some((v) => v.voiceURI === pickedVoiceUri)) {
      return pickedVoiceUri;
    }
    return (
      displayVoices.find((v) => v.isNeural && v.isDownloaded)?.voiceURI ??
      displayVoices.find((v) => v.isNeural)?.voiceURI ??
      displayVoices[0]?.voiceURI ??
      null
    );
  }, [pickedVoiceUri, displayVoices]);

  const handleStart = async () => {
    if (!effectiveVoiceUri || downloading) return;
    setError(null);

    const voice = displayVoices.find((v) => v.voiceURI === effectiveVoiceUri);

    if (voice?.isNeural && !voice.isDownloaded && !isOnline()) {
      setError(OFFLINE_MESSAGE);
      return;
    }

    setOutputLanguage(targetLanguage);
    persistOutputLanguage(targetLanguage);
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

  const selectedVoice = displayVoices.find((v) => v.voiceURI === effectiveVoiceUri);
  const isSelectedDownloaded = selectedVoice?.isDownloaded;

  const body = (
    <div className="space-y-4">
      {/* ─── Preselected Language Header (from JWT Token) ─── */}
      <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-3.5 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Languages className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-foreground">
                {targetLanguageInfo.english}
                {targetLanguageInfo.native !== targetLanguageInfo.english
                  ? ` (${targetLanguageInfo.native})`
                  : ""}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <Check className="h-2.5 w-2.5 stroke-[3]" />
                Auto-selected from profile
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Available voice models calibrated for your language
            </p>
          </div>
        </div>
      </div>

      {/* ─── Available Voice Options (Tab / Rectangular Box UI) ─── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-0.5">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Select Voice Package
          </span>
          <span className="text-[11px] text-muted-foreground">
            {displayVoices.length} option{displayVoices.length === 1 ? "" : "s"} available
          </span>
        </div>

        {displayVoices.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface-2/30 p-6 text-center">
            <Volume2 className="mx-auto h-7 w-7 text-muted-foreground/60" />
            <p className="mt-2 text-sm font-medium text-foreground">No voice models found</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Connecting to voice catalog... please wait a moment.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 max-h-[300px] overflow-y-auto pr-0.5">
            {displayVoices.map((voice) => {
              const info = parseVoiceInfo(voice);
              const isSelected = effectiveVoiceUri === voice.voiceURI;

              return (
                <button
                  type="button"
                  key={voice.voiceURI}
                  onClick={() => !downloading && setPickedVoiceUri(voice.voiceURI)}
                  className={`group relative flex w-full cursor-pointer items-center justify-between rounded-xl border p-3.5 text-left transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    isSelected
                      ? "border-primary bg-primary/[0.08] shadow-sm ring-1 ring-primary/30"
                      : "border-border bg-card/60 hover:border-border-strong hover:bg-surface-2/60"
                  } ${downloading ? "pointer-events-none opacity-60" : ""}`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${
                        isSelected
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "bg-surface-2 text-muted-foreground group-hover:bg-surface-3 group-hover:text-foreground"
                      }`}
                    >
                      <Volume2 className="h-4 w-4" />
                    </div>

                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-foreground tracking-tight">
                          {info.displayName}
                        </span>
                        {info.isNeural ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
                            <Sparkles className="h-2.5 w-2.5" />
                            Piper Neural
                          </span>
                        ) : (
                          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                            System
                          </span>
                        )}
                        <span className="rounded-full border border-border/50 bg-surface-2/60 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                          {info.quality}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-mono text-[11px] opacity-75">{info.locale}</span>
                        <span className="opacity-40">•</span>
                        {info.isDownloaded ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium text-[11px]">
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                            Ready (Offline)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-muted-foreground text-[11px]">
                            <Download className="h-3 w-3 shrink-0 text-primary" />
                            Download required (~15 MB)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="ml-3 shrink-0">
                    <div
                      className={`flex h-5 w-5 items-center justify-center rounded-full border transition-all ${
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground shadow-sm"
                          : "border-border bg-background group-hover:border-border-strong"
                      }`}
                    >
                      {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Download Progress Indicator ─── */}
      {downloading && (
        <div className="rounded-xl border border-border bg-surface-2/50 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span>Downloading Piper voice package into local browser storage…</span>
            </span>
            <span className="font-mono font-semibold text-primary">{progress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full bg-primary transition-all duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* ─── Error Notification ─── */}
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          {error}
        </div>
      )}
    </div>
  );

  const footerButtons = (
    <div className="flex items-center justify-end gap-2 w-full">
      <button
        type="button"
        onClick={() => onOpenChange(false)}
        disabled={downloading}
        className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-surface-2 hover:text-foreground disabled:opacity-50 transition-colors"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={handleStart}
        disabled={!effectiveVoiceUri || downloading}
        className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-95 disabled:opacity-50 transition-all"
      >
        {downloading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Downloading…
          </>
        ) : isSelectedDownloaded ? (
          <>
            <Volume2 className="h-4 w-4" />
            Start Reading
          </>
        ) : (
          <>
            <Download className="h-4 w-4" />
            Download & Start Reading
          </>
        )}
      </button>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={(next) => !downloading && onOpenChange(next)}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-2 text-base">
              <Volume2 className="h-4 w-4 text-primary" />
              Voice Package Setup
            </DrawerTitle>
            <DrawerDescription className="text-xs">
              Audio is powered by high-fidelity neural speech synthesis. Download your voice once
              for fast offline playback.
            </DrawerDescription>
          </DrawerHeader>
          <div className="overflow-y-auto px-5 pb-3">{body}</div>
          <DrawerFooter className="px-5">{footerButtons}</DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !downloading && onOpenChange(next)}>
      <DialogContent className="max-h-[85vh] overflow-hidden p-0 sm:max-w-[540px] rounded-2xl">
        <div className="border-b border-border px-6 py-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Volume2 className="h-4 w-4 text-primary" />
              Voice Package Setup
            </DialogTitle>
            <DialogDescription className="text-xs">
              Audio is powered by high-fidelity neural speech synthesis. Download your voice once
              for fast offline playback.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="max-h-[calc(85vh-140px)] overflow-y-auto px-6 py-4">{body}</div>

        <div className="border-t border-border px-6 py-3.5 bg-surface/30">{footerButtons}</div>
      </DialogContent>
    </Dialog>
  );
}
