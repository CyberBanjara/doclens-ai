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
import {
  BookOpen,
  CheckCircle2,
  Clock,
  Eye,
  Languages,
  Loader2,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Sliders,
  Sparkles,
  Square,
  Timer,
  XCircle,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import type { FullBookTranslationState, StartFullBookOptions } from "@/hooks/useFullBookTranslation";
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

  const COOLDOWN_PRESETS = [0, 5, 10, 20, 30, 60];

  const content = (
    <div className="space-y-4 py-2">
      {/* Target Language Card */}
      <div className="flex items-center justify-between rounded-2xl border border-primary/20 bg-primary/5 p-3.5">
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
                    state.isPaused
                      ? "bg-amber-400"
                      : state.cooldownRemaining
                        ? "animate-ping bg-amber-500"
                        : "animate-ping bg-primary"
                  }`}
                />
                <span
                  className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                    state.isPaused
                      ? "bg-amber-500"
                      : state.cooldownRemaining
                        ? "bg-amber-500"
                        : "bg-primary"
                  }`}
                />
              </span>
              <span className="text-xs font-bold text-foreground">
                {state.isPaused
                  ? "Translation Paused"
                  : state.cooldownRemaining
                    ? `Cooldown Active (${state.cooldownRemaining}s)`
                    : "Translating in Progress"}
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
              {!state.isPaused && !state.cooldownRemaining && (
                <div className="absolute inset-0 bg-white/20 animate-pulse" />
              )}
            </div>
          </div>

          {/* Active Cooldown Banner */}
          {state.cooldownRemaining && state.cooldownRemaining > 0 ? (
            <div className="flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-amber-600 dark:text-amber-400 animate-pulse">
              <div className="flex items-center gap-2 text-xs font-semibold">
                <Clock className="h-4 w-4" />
                <span>Cooldown delay before next request…</span>
              </div>
              <span className="font-mono text-xs font-bold tabular-nums">
                {state.cooldownRemaining}s
              </span>
            </div>
          ) : null}

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5 text-primary" />
              <span>
                Current: Page <b>{state.currentPage ?? "—"}</b> of {pageCount}
                {state.rangeStart && state.rangeEnd && (
                  <span className="text-muted-foreground/75 font-mono ml-1">
                    (Range: {state.rangeStart}–{state.rangeEnd})
                  </span>
                )}
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
          <div className="flex items-center justify-end pt-2 border-t border-border">
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
          <div className="grid grid-cols-3 gap-2.5 text-center">
            <div className="rounded-xl border border-border bg-surface/40 p-2.5">
              <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                Total
              </div>
              <div className="text-base font-bold text-foreground mt-0.5">{pageCount}</div>
              <div className="text-[10px] text-muted-foreground">Pages</div>
            </div>
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-2.5 text-emerald-600 dark:text-emerald-400">
              <div className="text-[10px] uppercase font-bold tracking-wider">Translated</div>
              <div className="text-base font-bold mt-0.5">{aiDoneCount}</div>
              <div className="text-[10px]">Pages</div>
            </div>
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-2.5 text-amber-600 dark:text-amber-400">
              <div className="text-[10px] uppercase font-bold tracking-wider">Remaining</div>
              <div className="text-base font-bold mt-0.5">{untranslatedCount}</div>
              <div className="text-[10px]">Pages</div>
            </div>
          </div>

          {/* Option 1: Page Range Controls */}
          <div className="rounded-2xl border border-border bg-surface/30 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <BookOpen className="h-3.5 w-3.5 text-primary" />
                <span>Page Range</span>
              </div>
              <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-mono font-semibold text-primary">
                {pagesInRange} {pagesInRange === 1 ? "page" : "pages"} selected
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground mb-1 block">
                  Start Page
                </label>
                <input
                  type="number"
                  min={1}
                  max={sanitizedEndPage}
                  value={startPage}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val)) setStartPage(Math.max(1, Math.min(val, pageCount || 1)));
                    else setStartPage(1);
                  }}
                  className="w-full rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-mono font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground mb-1 block">
                  End Page
                </label>
                <input
                  type="number"
                  min={sanitizedStartPage}
                  max={pageCount || 1}
                  value={endPage}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val)) setEndPage(Math.max(1, Math.min(val, pageCount || 1)));
                    else setEndPage(pageCount || 1);
                  }}
                  className="w-full rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-mono font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
            </div>

            {/* Quick Range Presets */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  setStartPage(1);
                  setEndPage(pageCount || 1);
                }}
                className="rounded-lg border border-border/70 bg-surface px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-surface-2 hover:text-foreground transition-colors"
              >
                All (1–{pageCount})
              </button>
              {pageCount > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setStartPage(1);
                      setEndPage(Math.ceil(pageCount / 2));
                    }}
                    className="rounded-lg border border-border/70 bg-surface px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-surface-2 hover:text-foreground transition-colors"
                  >
                    1st Half (1–{Math.ceil(pageCount / 2)})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStartPage(Math.min(pageCount, Math.ceil(pageCount / 2) + 1));
                      setEndPage(pageCount);
                    }}
                    className="rounded-lg border border-border/70 bg-surface px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-surface-2 hover:text-foreground transition-colors"
                  >
                    2nd Half ({Math.min(pageCount, Math.ceil(pageCount / 2) + 1)}–{pageCount})
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Option 2: Cooldown Between Requests */}
          <div className="rounded-2xl border border-border bg-surface/30 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <Clock className="h-3.5 w-3.5 text-primary" />
                <span>Cooldown Between Requests</span>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={0}
                  max={300}
                  value={cooldownSeconds}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setCooldownSeconds(isNaN(val) ? 0 : Math.max(0, Math.min(val, 300)));
                  }}
                  className="w-16 rounded-lg border border-border bg-surface px-2 py-1 text-right text-xs font-mono font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <span className="text-xs font-medium text-muted-foreground">sec</span>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Pause period after each page translation finishes before initiating the next page.
            </p>

            {/* Cooldown Presets */}
            <div className="flex flex-wrap items-center gap-1.5">
              {COOLDOWN_PRESETS.map((cd) => (
                <button
                  key={cd}
                  type="button"
                  onClick={() => setCooldownSeconds(cd)}
                  className={`rounded-lg border px-2 py-1 text-[10px] font-mono font-medium transition-all ${
                    cooldownSeconds === cd
                      ? "border-primary bg-primary/10 text-primary font-bold ring-1 ring-primary/30"
                      : "border-border/70 bg-surface text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                  }`}
                >
                  {cd === 0 ? "0s (None)" : `${cd}s`}
                </button>
              ))}
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
                    Translate Untranslated Pages in Range ({sanitizedStartPage}–{sanitizedEndPage})
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Skips already translated pages and only translates unprocessed pages within the
                    selected range.
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
                    Re-translate Range ({sanitizedStartPage}–{sanitizedEndPage} • {pagesInRange}{" "}
                    {pagesInRange === 1 ? "page" : "pages"})
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Overwrites and re-translates all pages in the selected range with fresh
                    continuity chaining.
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
          disabled={!overwriteExisting && untranslatedCount === 0 && sanitizedStartPage === 1 && sanitizedEndPage === pageCount}
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
              Automated sequential page-by-page translation for the document
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
            Automated sequential page-by-page translation with continuity chaining
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

