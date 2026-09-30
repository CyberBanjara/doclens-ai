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
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Languages, Maximize2, Pause, Play, Square } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import type {
  FullBookTranslationState,
  StartFullBookOptions,
} from "@/hooks/useFullBookTranslation";
import { getLanguageEnglishName } from "@/lib/voiceLanguageMap";

interface FullBookTranslationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetLanguage: string;
  pageCount: number;
  aiDoneCount: number;
  state: FullBookTranslationState & {
    start: (options?: StartFullBookOptions) => Promise<void>;
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
  const [startPage, setStartPage] = useState(1);
  const [endPage, setEndPage] = useState(pageCount || 1);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  // Sync endPage when pageCount changes or initializes
  useEffect(() => {
    if (pageCount > 0) {
      setEndPage((prev) => (prev <= 1 || prev > pageCount ? pageCount : prev));
    }
  }, [pageCount]);

  const sanitizedStartPage = Math.max(1, Math.min(startPage || 1, pageCount || 1));
  const sanitizedEndPage = Math.max(
    sanitizedStartPage,
    Math.min(endPage || pageCount || 1, pageCount || 1),
  );
  const pagesInRange = Math.max(1, sanitizedEndPage - sanitizedStartPage + 1);
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
    void state.start({
      overwriteExisting,
      startPage: sanitizedStartPage,
      endPage: sanitizedEndPage,
      cooldownSeconds: Math.max(0, cooldownSeconds || 0),
    });
  };

  const COOLDOWN_PRESETS = [0, 5, 10, 20, 30];

  const content = (
    <div className="space-y-5 py-1">
      {/* ─── Active Translating State ─── */}
      {state.isTranslating ? (
        <div className="space-y-4 rounded-2xl border border-border/80 bg-surface-2/40 p-4">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span
                  className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    state.isPaused
                      ? "bg-amber-400"
                      : state.cooldownRemaining
                        ? "animate-ping bg-amber-500"
                        : "animate-ping bg-primary"
                  }`}
                />
                <span
                  className={`relative inline-flex h-2 w-2 rounded-full ${
                    state.isPaused
                      ? "bg-amber-500"
                      : state.cooldownRemaining
                        ? "bg-amber-500"
                        : "bg-primary"
                  }`}
                />
              </span>
              <span className="font-medium text-foreground">
                {state.isPaused
                  ? "Paused"
                  : state.cooldownRemaining
                    ? `Cooldown (${state.cooldownRemaining}s)`
                    : `Translating page ${state.currentPage ?? "—"} of ${pageCount}`}
              </span>
            </div>
            <span className="font-mono text-xs font-semibold text-primary tabular-nums">
              {state.completedCount} / {state.totalTargetPages} ({progressPercent}%)
            </span>
          </div>

          {/* Progress Bar */}
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full bg-primary transition-all duration-300 rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              Language: <b className="text-foreground font-medium">{targetLanguage}</b>
            </span>
            <span>{formatEta(state.estimatedSecondsRemaining)}</span>
          </div>

          {/* Streaming snippet */}
          {state.currentStreamingSnippet && (
            <p className="rounded-lg bg-surface/80 px-3 py-2 text-xs font-serif italic text-muted-foreground line-clamp-2 border border-border/50">
              "{state.currentStreamingSnippet}"
            </p>
          )}

          {/* Controls */}
          <div className="flex items-center justify-end gap-2 pt-1">
            {state.isPaused ? (
              <button
                onClick={state.resume}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
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
      ) : (
        /* ─── Clean Configuration Form ─── */
        <div className="space-y-4">
          {/* Target Language & Status Summary Pill */}
          <div className="flex items-center justify-between rounded-xl bg-surface-2/50 px-3.5 py-2.5 text-xs border border-border/60">
            <div className="flex items-center gap-2 text-foreground font-medium">
              <Languages className="h-4 w-4 text-primary shrink-0" />
              <span>
                Target: <strong className="font-semibold">{targetLanguage}</strong>
              </span>
              {langEnglish && langEnglish !== targetLanguage && (
                <span className="text-muted-foreground text-[11px]">({langEnglish})</span>
              )}
            </div>
            <div className="text-[11px] text-muted-foreground">
              <span className="font-semibold text-foreground">{aiDoneCount}</span> of {pageCount}{" "}
              translated
            </div>
          </div>

          {/* Page Range Inputs */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-medium text-foreground">
              <span>Page range</span>
              <span className="text-muted-foreground text-[11px]">
                {pagesInRange} {pagesInRange === 1 ? "page" : "pages"}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1">
                <input
                  type="number"
                  min={1}
                  max={sanitizedEndPage}
                  value={startPage}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setStartPage(isNaN(val) ? 1 : Math.max(1, Math.min(val, pageCount || 1)));
                  }}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-center font-mono font-medium text-foreground outline-none focus:border-primary"
                  placeholder="From"
                />
              </div>
              <span className="text-muted-foreground text-xs font-medium">to</span>
              <div className="flex-1">
                <input
                  type="number"
                  min={sanitizedStartPage}
                  max={pageCount || 1}
                  value={endPage}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setEndPage(
                      isNaN(val) ? pageCount || 1 : Math.max(1, Math.min(val, pageCount || 1)),
                    );
                  }}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-center font-mono font-medium text-foreground outline-none focus:border-primary"
                  placeholder="To"
                />
              </div>
            </div>

            {/* Quick Presets */}
            {pageCount > 1 && (
              <div className="flex items-center gap-1.5 pt-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setStartPage(1);
                    setEndPage(pageCount || 1);
                  }}
                  className="rounded-md border border-border/60 bg-surface px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
                >
                  All (1–{pageCount})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStartPage(1);
                    setEndPage(Math.ceil(pageCount / 2));
                  }}
                  className="rounded-md border border-border/60 bg-surface px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
                >
                  1st half
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStartPage(Math.min(pageCount, Math.ceil(pageCount / 2) + 1));
                    setEndPage(pageCount);
                  }}
                  className="rounded-md border border-border/60 bg-surface px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
                >
                  2nd half
                </button>
              </div>
            )}
          </div>

          {/* Cooldown Delay */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-xs font-medium text-foreground">
              <span>Pacing delay between pages</span>
              <span className="font-mono text-xs text-muted-foreground">{cooldownSeconds}s</span>
            </div>
            <div className="flex items-center gap-1.5">
              {COOLDOWN_PRESETS.map((cd) => (
                <button
                  key={cd}
                  type="button"
                  onClick={() => setCooldownSeconds(cd)}
                  className={`flex-1 rounded-lg py-1.5 text-xs font-mono transition-all border ${
                    cooldownSeconds === cd
                      ? "border-primary bg-primary text-primary-foreground font-semibold shadow-xs"
                      : "border-border bg-surface text-muted-foreground hover:text-foreground hover:bg-surface-2"
                  }`}
                >
                  {cd === 0 ? "None" : `${cd}s`}
                </button>
              ))}
            </div>
          </div>

          {/* Overwrite Checkbox Option */}
          <div className="pt-2">
            <label className="flex items-center gap-2.5 cursor-pointer select-none text-xs text-foreground">
              <input
                type="checkbox"
                checked={overwriteExisting}
                onChange={(e) => setOverwriteExisting(e.target.checked)}
                className="h-4 w-4 rounded accent-primary bg-surface border-border cursor-pointer"
              />
              <span>Re-translate already completed pages</span>
            </label>
          </div>
        </div>
      )}
    </div>
  );

  const footer = (
    <div className="flex items-center justify-end gap-2.5 pt-2">
      <button
        onClick={() => onOpenChange(false)}
        className="rounded-lg border border-border px-3.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
      >
        {state.isTranslating ? "Minimize" : "Cancel"}
      </button>

      {!state.isTranslating && (
        <button
          onClick={handleStart}
          disabled={
            !overwriteExisting &&
            untranslatedCount === 0 &&
            sanitizedStartPage === 1 &&
            sanitizedEndPage === pageCount
          }
          className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 active:scale-95 disabled:opacity-40 transition-all shadow-sm"
        >
          Start Translation
        </button>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="px-4 pb-6 max-h-[85vh]">
          <DrawerHeader className="px-0 pb-2">
            <DrawerTitle className="text-base font-semibold text-foreground">
              Translate Book
            </DrawerTitle>
            <DrawerDescription className="text-xs text-muted-foreground">
              Sequential page translation into {targetLanguage}
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
      <DialogContent className="max-w-md p-5 rounded-2xl border-border bg-popover text-popover-foreground shadow-xl">
        <DialogHeader className="pb-1">
          <DialogTitle className="text-base font-semibold text-foreground">
            Translate Book
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Sequential page translation into {targetLanguage}
          </DialogDescription>
        </DialogHeader>
        {content}
        <div className="border-t border-border pt-3 mt-1">{footer}</div>
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
              state.isPaused
                ? "bg-amber-400"
                : state.cooldownRemaining
                  ? "animate-ping bg-amber-500"
                  : "animate-ping bg-primary"
            }`}
          />
          <span
            className={`relative inline-flex h-3 w-3 rounded-full ${
              state.isPaused
                ? "bg-amber-500"
                : state.cooldownRemaining
                  ? "bg-amber-500"
                  : "bg-primary"
            }`}
          />
        </span>
        <div className="text-left">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-foreground">
              {state.isPaused
                ? "Translation Paused"
                : state.cooldownRemaining
                  ? `Cooldown: ${state.cooldownRemaining}s`
                  : "Translating Book…"}
            </span>
            <span className="text-[11px] font-mono text-primary font-bold">
              {state.completedCount}/{state.totalTargetPages} ({progressPercent}%)
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground">
            Page {state.currentPage ?? "—"}
            {state.rangeStart && state.rangeEnd && (
              <span className="ml-1 font-mono">
                ({state.rangeStart}–{state.rangeEnd})
              </span>
            )}
          </div>
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
