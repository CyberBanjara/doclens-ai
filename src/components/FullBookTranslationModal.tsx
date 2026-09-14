import { useMemo, useState } from "react";
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
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Eye,
  Languages,
  Loader2,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Sparkles,
  Square,
  Timer,
  XCircle,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import type { FullBookTranslationState } from "@/hooks/useFullBookTranslation";
import { getLanguageEnglishName } from "@/lib/voiceLanguageMap";

interface FullBookTranslationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetLanguage: string;
  pageCount: number;
  aiDoneCount: number;
  state: FullBookTranslationState & {
    start: (options?: { overwriteExisting?: boolean; startPage?: number }) => Promise<void>;
    pause: () => void;
    resume: () => void;
    cancel: () => void;
    setAutoFollow: (val: boolean) => void;
  };
}

export function FullBookTranslationModal({
  open,
  onOpenChange,
  targetLanguage,
  pageCount,
  aiDoneCount,
  state,
}: FullBookTranslationModalProps) {
  const isMobile = useIsMobile();
  const [overwriteExisting, setOverwriteExisting] = useState(false);

  const langEnglish = useMemo(() => getLanguageEnglishName(targetLanguage), [targetLanguage]);
  const untranslatedCount = Math.max(0, pageCount - aiDoneCount);

  const progressPercent = useMemo(() => {
    if (!state.totalTargetPages || state.totalTargetPages === 0) return 0;
    return Math.min(100, Math.round((state.completedCount / state.totalTargetPages) * 100));
  }, [state.completedCount, state.totalTargetPages]);

  const formatEta = (seconds: number | null) => {
    if (seconds === null || seconds <= 0) return "Calculating…";
    if (seconds < 60) return `~${seconds}s remaining`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `~${mins}m ${secs > 0 ? `${secs}s` : ""} remaining`;
  };

  const handleStart = () => {
    void state.start({ overwriteExisting });
  };

  const content = (
    <div className="space-y-5 py-2">
      {/* Target Language Card */}
      <div className="flex items-center justify-between rounded-2xl border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Languages className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-foreground">{targetLanguage}</span>
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                {langEnglish}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Sequential contextual translation with narrative continuity
            </p>
          </div>
        </div>
      </div>

      {/* When Translating: Active Progress View */}
      {state.isTranslating ? (
        <div className="space-y-4 rounded-2xl border border-border bg-surface/50 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span
                  className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    state.isPaused ? "bg-amber-400" : "animate-ping bg-primary"
                  }`}
                />
                <span
                  className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                    state.isPaused ? "bg-amber-500" : "bg-primary"
                  }`}
                />
              </span>
              <span className="text-xs font-bold text-foreground">
                {state.isPaused ? "Translation Paused" : "Translating in Progress"}
              </span>
            </div>
            <span className="text-xs font-mono font-semibold text-primary tabular-nums">
              {state.completedCount} / {state.totalTargetPages} pages ({progressPercent}%)
            </span>
          </div>

          {/* Progress bar */}
          <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full bg-gradient-to-r from-primary to-primary/80 transition-all duration-300 relative rounded-full"
              style={{ width: `${progressPercent}%` }}
            >
              {!state.isPaused && <div className="absolute inset-0 bg-white/20 animate-pulse" />}
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5 text-primary" />
              <span>
                Current: Page <b>{state.currentPage ?? "—"}</b> of {pageCount}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Timer className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{formatEta(state.estimatedSecondsRemaining)}</span>
            </div>
          </div>

          {/* Streaming snippet */}
          {state.currentStreamingSnippet && (
            <div className="rounded-xl bg-background/80 p-3 border border-border/60 text-xs font-serif italic text-muted-foreground line-clamp-2">
              "{state.currentStreamingSnippet}"
            </div>
          )}

          {/* Controls during translation */}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={state.autoFollow}
                onChange={(e) => state.setAutoFollow(e.target.checked)}
                className="h-3.5 w-3.5 rounded accent-primary bg-surface-2 border-border"
              />
              <span>Follow in reader</span>
            </label>

            <div className="flex items-center gap-2">
              {state.isPaused ? (
                <button
                  onClick={state.resume}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-transform active:scale-95 shadow-sm"
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                  Resume
                </button>
              ) : (
                <button
                  onClick={state.pause}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-2 transition-colors"
                >
                  <Pause className="h-3.5 w-3.5" />
                  Pause
                </button>
              )}
              <button
                onClick={state.cancel}
                className="flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/20 transition-colors"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
                Stop
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Configuration & Pre-Run View */
        <div className="space-y-4">
          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl border border-border bg-surface/40 p-3">
              <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                Total
              </div>
              <div className="text-lg font-bold text-foreground mt-0.5">{pageCount}</div>
              <div className="text-[10px] text-muted-foreground">Pages</div>
            </div>
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-emerald-600 dark:text-emerald-400">
              <div className="text-[10px] uppercase font-bold tracking-wider">Translated</div>
              <div className="text-lg font-bold mt-0.5">{aiDoneCount}</div>
              <div className="text-[10px]">Pages</div>
            </div>
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-amber-600 dark:text-amber-400">
              <div className="text-[10px] uppercase font-bold tracking-wider">Remaining</div>
              <div className="text-lg font-bold mt-0.5">{untranslatedCount}</div>
              <div className="text-[10px]">Pages</div>
            </div>
          </div>

          {/* Translation Mode Choice */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground">Translation Scope</label>
            <div className="space-y-2">
              <div
                onClick={() => setOverwriteExisting(false)}
                className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-all ${
                  !overwriteExisting
                    ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                    : "border-border bg-surface/30 hover:border-primary/40"
                }`}
              >
                <div
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                    !overwriteExisting
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground"
                  }`}
                >
                  {!overwriteExisting && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                </div>
                <div>
                  <div className="text-xs font-semibold text-foreground">
                    Translate Untranslated Pages ({untranslatedCount} pages)
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Skips already translated pages and only translates pages that have not yet been
                    processed.
                  </p>
                </div>
              </div>

              <div
                onClick={() => setOverwriteExisting(true)}
                className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-all ${
                  overwriteExisting
                    ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                    : "border-border bg-surface/30 hover:border-primary/40"
                }`}
              >
                <div
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                    overwriteExisting
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground"
                  }`}
                >
                  {overwriteExisting && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                </div>
                <div>
                  <div className="text-xs font-semibold text-foreground">
                    Re-translate Entire Book ({pageCount} pages)
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Overwrites all pages from Page 1 with a fresh sequential translation chain.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const footer = (
    <div className="flex items-center justify-between gap-3 pt-2">
      <button
        onClick={() => onOpenChange(false)}
        className="rounded-xl border border-border bg-surface px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        {state.isTranslating ? "Minimize" : "Close"}
      </button>

      {!state.isTranslating && (
        <button
          onClick={handleStart}
          disabled={!overwriteExisting && untranslatedCount === 0}
          className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-xs font-bold text-primary-foreground transition-all hover:opacity-90 active:scale-95 disabled:opacity-40 shadow-md"
        >
          <Sparkles className="h-4 w-4" />
          Start Full Book Translation
        </button>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="px-4 pb-6 max-h-[85vh]">
          <DrawerHeader className="px-0">
            <DrawerTitle className="flex items-center gap-2 text-base font-bold text-foreground">
              <Sparkles className="h-5 w-5 text-primary" />
              Full Book Translation (Admin)
            </DrawerTitle>
            <DrawerDescription className="text-xs text-muted-foreground">
              Automated sequential page-by-page translation for the entire document
            </DrawerDescription>
          </DrawerHeader>
          <div className="overflow-y-auto">{content}</div>
          <div className="mt-4 border-t border-border pt-3">{footer}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-6 rounded-3xl border-border shadow-2xl bg-popover">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
            <Sparkles className="h-5 w-5 text-primary" />
            Full Book Translation (Admin)
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Automated sequential page-by-page translation for the entire document with continuity
            chaining
          </DialogDescription>
        </DialogHeader>
        {content}
        <div className="border-t border-border pt-4 mt-2">{footer}</div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Floating docked banner shown when full book translation is active in background.
 */
export function FullBookTranslationDock({
  state,
  onOpenModal,
}: {
  state: FullBookTranslationState & {
    pause: () => void;
    resume: () => void;
    cancel: () => void;
  };
  onOpenModal: () => void;
}) {
  if (!state.isTranslating) return null;

  const progressPercent =
    state.totalTargetPages > 0
      ? Math.round((state.completedCount / state.totalTargetPages) * 100)
      : 0;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl border border-primary/30 bg-surface/95 backdrop-blur-xl px-4 py-2.5 shadow-2xl transition-all duration-300 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex items-center gap-2.5">
        <span className="relative flex h-3 w-3">
          <span
            className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
              state.isPaused ? "bg-amber-400" : "animate-ping bg-primary"
            }`}
          />
          <span
            className={`relative inline-flex h-3 w-3 rounded-full ${
              state.isPaused ? "bg-amber-500" : "bg-primary"
            }`}
          />
        </span>
        <div className="text-left">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-foreground">
              {state.isPaused ? "Translation Paused" : "Translating Book…"}
            </span>
            <span className="text-[11px] font-mono text-primary font-bold">
              {state.completedCount}/{state.totalTargetPages} ({progressPercent}%)
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground">Page {state.currentPage ?? "—"}</div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 border-l border-border pl-2.5">
        {state.isPaused ? (
          <button
            onClick={state.resume}
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm transition-transform active:scale-95"
            title="Resume"
          >
            <Play className="h-3 w-3 fill-current" />
          </button>
        ) : (
          <button
            onClick={state.pause}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-surface text-foreground hover:bg-surface-2 transition-colors"
            title="Pause"
          >
            <Pause className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          onClick={state.cancel}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
          title="Stop Translation"
        >
          <Square className="h-3 w-3 fill-current" />
        </button>
        <button
          onClick={onOpenModal}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface-2 hover:text-foreground transition-colors"
          title="Expand View"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
