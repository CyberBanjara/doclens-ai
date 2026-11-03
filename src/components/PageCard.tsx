import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, KeyRound, SlidersHorizontal, ChevronDown, Code2, X } from "lucide-react";
import {
  buildPagePayload,
  MODE_LABELS,
  openApiKeyModal,
  extractProviderErrorMessage,
  type GlobalMode,
  type Globals,
  type ORModel,
} from "@/lib/openrouter";
import {
  getPageData,
  upsertPageAi,
  type PageAi,
  type PageAiSummaryEntry,
} from "@/lib/storage";
import { effective, summarize } from "@/lib/pageAi";
import { HighlightableText } from "./HighlightableText";
import { LoadingLogo } from "@/components/LoadingLogo";
import { getPreviousContext } from "@/lib/contextStore";

export interface ModeOption {
  id: string;
  label: string;
  mode: GlobalMode;
  style: string;
  description: string;
}

export const MODE_OPTIONS: ModeOption[] = [
  {
    id: "translate",
    label: "Translate",
    mode: "translate",
    style: "Native",
    description: "Translate content preserving structure",
  },
  {
    id: "standard",
    label: "Standard",
    mode: "explain",
    style: "Standard",
    description: "Clear and organized balanced explanation",
  },
  {
    id: "simple",
    label: "Simple",
    mode: "explain",
    style: "Simple",
    description: "Beginner-friendly explanation with everyday analogies",
  },
  {
    id: "story",
    label: "Story",
    mode: "explain",
    style: "Story",
    description: "Engaging scenario and narrative-driven explanation",
  },
  {
    id: "deep",
    label: "Deep",
    mode: "explain",
    style: "Deep",
    description: "In-depth technical analysis and critical reasoning",
  },
  {
    id: "ai",
    label: "AI Mode",
    mode: "explain",
    style: "AI",
    description: "First-principles holistic reasoning and synthesis",
  },
];

/* ---------- Per-page card loader (fetches its own data) ---------- */

interface CardLoaderProps {
  docId: string;
  pageNumber: number;
  globals: Globals;
  models?: ORModel[];
  omniModels?: ORModel[];
  ollamaModels?: ORModel[];
  summary?: PageAiSummaryEntry;
  isRunning: boolean;
  streamBuf: string;
  onPageAiChange: (pageNumber: number, entry: PageAiSummaryEntry | null) => void;
  onRun: () => void;
  onCancel: () => void;
}

export function PageCardLoader(props: CardLoaderProps) {
  const { docId, pageNumber, summary, isRunning, streamBuf } = props;
  const [text, setText] = useState<string | null>(null);
  const [columns, setColumns] = useState(1);
  const [pageAi, setPageAi] = useState<PageAi>(() => ({
    pageNumber,
    status: summary?.status ?? "idle",
  }));
  const [prevContext, setPrevContext] = useState<string>("");

  // Track stream buffer to eliminate frame lag when isRunning transitions to false
  const streamCacheRef = useRef("");
  if (streamBuf) {
    streamCacheRef.current = streamBuf;
  }

  // Fetch own data on mount / when key changes / when summary status flips or language changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rec = await getPageData(docId, pageNumber);
      if (cancelled) return;
      if (rec) {
        setText(rec.text);
        setColumns(rec.columns);
        if (rec.pageAi) {
          setPageAi(rec.pageAi);
        } else {
          streamCacheRef.current = "";
          setPageAi({ pageNumber, status: "idle" });
        }
      } else {
        setText("");
        streamCacheRef.current = "";
        setPageAi({ pageNumber, status: "idle" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    docId,
    pageNumber,
    summary?.status,
    summary?.settingsHash,
    summary?.hasResult,
    isRunning,
    props.globals.language,
  ]);

  // Fetch previous continuity context for this page
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const eff = effective(props.globals, pageAi.overrides);
      const ctx = await getPreviousContext(docId, pageNumber, eff);
      if (cancelled) return;
      setPrevContext(ctx);
    })();
    return () => {
      cancelled = true;
    };
  }, [docId, pageNumber, pageAi.overrides, props.globals, summary?.status]);

  const handleUpdate = async (patch: Partial<PageAi>) => {
    setPageAi((prev) => ({ ...prev, ...patch, pageNumber }));
    await upsertPageAi(docId, pageNumber, patch);
    const rec = await getPageData(docId, pageNumber);
    if (rec?.pageAi) {
      props.onPageAiChange(pageNumber, summarize(rec.pageAi));
    }
  };

  if (text === null) {
    return (
      <div className="flex h-full min-h-[240px] items-center justify-center rounded-xl border border-border bg-surface/30">
        <LoadingLogo size={72} label={`Loading page ${pageNumber}…`} />
      </div>
    );
  }

  return (
    <PageCard
      docId={docId}
      pageNumber={pageNumber}
      pageText={text}
      columns={columns}
      state={pageAi}
      eff={effective(props.globals, pageAi.overrides)}
      globals={props.globals}
      streamBuf={streamBuf}
      previousContext={prevContext}
      fallbackResult={streamCacheRef.current}
      isRunning={isRunning}
      onUpdate={handleUpdate}
      onRun={props.onRun}
      onCancel={props.onCancel}
    />
  );
}

/* ---------- Card UI ---------- */

interface CardProps {
  docId: string;
  pageNumber: number;
  pageText: string;
  columns: number;
  state: PageAi;
  eff: ReturnType<typeof effective>;
  globals: Globals;
  streamBuf: string;
  previousContext?: string;
  fallbackResult?: string;
  isRunning: boolean;
  onUpdate: (patch: Partial<PageAi>) => void;
  onRun: () => void;
  onCancel: () => void;
}

function PageCard({
  pageNumber,
  pageText,
  state,
  eff,
  globals,
  streamBuf,
  previousContext,
  isRunning,
  onUpdate,
  onRun,
  onCancel,
}: CardProps) {
  const [showModeSelector, setShowModeSelector] = useState(false);
  const [editingJson, setEditingJson] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState("");

  // Build the automatic schema payload for previewing / editing JSON
  const autoPayload = useMemo(() => {
    return buildPagePayload({
      modelId: eff.modelId,
      mode: eff.mode,
      language: eff.language,
      style: eff.style,
      temperature: eff.temperature,
      pageNumber,
      pageText,
      previousContext,
    });
  }, [
    eff.modelId,
    eff.mode,
    eff.language,
    eff.style,
    eff.temperature,
    pageNumber,
    pageText,
    previousContext,
  ]);

  const previewPayload = state.isCustom && state.customRequest ? state.customRequest : autoPayload;

  // Reactively keep draft in sync with autoPayload unless custom request is active
  useEffect(() => {
    if (!state.isCustom) {
      setDraft(JSON.stringify(previewPayload, null, 2));
      setDraftError("");
    }
  }, [previewPayload, state.isCustom]);

  // Close mode selector if page processing starts
  useEffect(() => {
    if (isRunning) {
      setShowModeSelector(false);
    }
  }, [isRunning]);

  const activeModeTitle = useMemo(() => {
    if (state.overrides?.mode === "translate") return "Translate";
    if (state.overrides?.mode === "explain") {
      return state.overrides.style || "Explain";
    }
    return null;
  }, [state.overrides]);

  const hasModeOverride = !!activeModeTitle;

  const isCurrentMode = (opt: ModeOption) => {
    if (state.isCustom) return false;
    if (opt.mode === "translate") {
      return eff.mode === "translate";
    }
    return eff.mode === "explain" && eff.style === opt.style;
  };

  const handleSelectMode = (opt: ModeOption) => {
    const matchesGlobal =
      globals.mode === opt.mode &&
      (opt.mode === "translate" || globals.style === opt.style);

    if (matchesGlobal) {
      onUpdate({
        overrides: undefined,
        isCustom: false,
        customRequest: null,
      });
    } else {
      onUpdate({
        overrides: {
          mode: opt.mode,
          style: opt.style,
        },
        isCustom: false,
        customRequest: null,
      });
    }
    setShowModeSelector(false);
    setEditingJson(false);
  };

  const startEdit = () => {
    setDraft(JSON.stringify(previewPayload, null, 2));
    setDraftError("");
    setEditingJson(true);
    setShowModeSelector(false);
  };

  const saveEdit = () => {
    try {
      const parsed = JSON.parse(draft);
      if (typeof parsed !== "object" || !parsed) {
        throw new Error("Payload must be a valid JSON object");
      }
      onUpdate({ customRequest: parsed, isCustom: true, status: "idle" });
      setEditingJson(false);
    } catch (e) {
      setDraftError(e instanceof Error ? e.message : "Invalid JSON syntax");
    }
  };

  const resetAuto = () => {
    onUpdate({ customRequest: null, isCustom: false });
    setEditingJson(false);
  };

  /* Determine button label from mode */
  const modeLabel = MODE_LABELS[eff.mode] || (eff.mode === "translate" ? "Translate" : "Explain");

  return (
    <article className={`reader-card ${isRunning ? "!border-primary/20" : ""}`}>
      {/* ─── Header ─── */}
      <header className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground shrink-0">
            Page {pageNumber}
          </h3>
          {state.status === "done" && (
            <span className="flex h-1.5 w-1.5 rounded-full bg-primary shrink-0" title="Completed" />
          )}
          {state.status === "running" && (
            <span className="inline-block h-3 w-3 rounded-full border-[1.5px] border-primary border-t-transparent spin-slow shrink-0" />
          )}
          {state.status === "error" && (
            <span className="flex h-1.5 w-1.5 rounded-full bg-destructive shrink-0" title="Error" />
          )}

          {/* Custom JSON Badge or Mode Override Badge */}
          {state.isCustom ? (
            <div className="inline-flex items-center gap-1 rounded-full bg-accent/15 border border-accent/25 px-2 py-0.5 text-[10px] font-medium text-accent shrink-0">
              <Code2 className="h-2.5 w-2.5" />
              <span>Custom JSON</span>
              <button
                type="button"
                onClick={resetAuto}
                className="ml-0.5 rounded-full hover:bg-accent/20 p-0.5 cursor-pointer text-accent"
                title="Reset to automatic mode"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          ) : hasModeOverride ? (
            <button
              type="button"
              onClick={() => onUpdate({ overrides: undefined })}
              className="group inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/20 transition-colors cursor-pointer shrink-0"
              title="Page mode overridden. Click to reset to document default."
            >
              <span>{activeModeTitle}</span>
              <X className="h-2.5 w-2.5 opacity-60 group-hover:opacity-100" />
            </button>
          ) : null}
        </div>

        {/* ─── Right Controls: Inline Mode Selector or Mode & Action Buttons ─── */}
        {showModeSelector && !isRunning ? (
          <div className="flex items-center gap-1 animate-in fade-in duration-150 max-w-full">
            <div className="flex items-center gap-0.5 rounded-lg border border-border/70 bg-surface-2/70 p-0.5 shadow-xs overflow-x-auto no-scrollbar">
              {MODE_OPTIONS.map((opt) => {
                const isCurrent = isCurrentMode(opt);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleSelectMode(opt)}
                    className={`shrink-0 rounded-md px-2.5 py-1 text-[11px] font-medium transition-all cursor-pointer ${
                      isCurrent
                        ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                        : "text-muted-foreground hover:bg-surface hover:text-foreground"
                    }`}
                    title={opt.description}
                  >
                    {opt.label}
                  </button>
                );
              })}

              {/* Subtle divider */}
              <div className="mx-0.5 h-3.5 w-px bg-border/70 shrink-0" />

              {/* Edit JSON Option */}
              <button
                type="button"
                onClick={startEdit}
                className={`shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-all cursor-pointer ${
                  state.isCustom || editingJson
                    ? "bg-accent/20 text-accent font-semibold"
                    : "text-muted-foreground hover:bg-surface hover:text-foreground"
                }`}
                title="Edit raw prompt JSON payload"
              >
                <Code2 className="h-3 w-3" />
                <span>JSON</span>
              </button>
            </div>

            {/* Dismiss selector */}
            <button
              type="button"
              onClick={() => setShowModeSelector(false)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground cursor-pointer"
              title="Close"
              aria-label="Close mode selector"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Mode trigger button */}
            <button
              type="button"
              onClick={() => {
                setShowModeSelector(true);
                setEditingJson(false);
              }}
              disabled={isRunning}
              className="flex h-7 items-center gap-1.5 rounded-lg border border-border/60 bg-surface-2/40 px-2.5 text-xs font-medium text-foreground transition-all hover:bg-surface-2 hover:border-border cursor-pointer disabled:opacity-50"
              title="Select Page Mode"
              aria-label="Select Page Mode"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
              <span>Mode</span>
              <ChevronDown className="h-3 w-3 text-muted-foreground opacity-70" />
            </button>

            {/* Run / Stop button */}
            {isRunning ? (
              <button
                type="button"
                onClick={onCancel}
                className="rounded-lg border border-destructive/30 px-2.5 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 cursor-pointer"
              >
                Stop
              </button>
            ) : (
              <button
                type="button"
                onClick={onRun}
                className="rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 cursor-pointer"
              >
                {modeLabel}
              </button>
            )}
          </div>
        )}
      </header>

      {/* ─── Inline JSON Editor Panel ─── */}
      {editingJson && (
        <div className="mb-4 rounded-xl border border-border/80 bg-surface-2/40 p-3 shadow-xs animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="mb-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Code2 className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-semibold text-foreground">Edit Page JSON Payload</span>
              {state.isCustom && (
                <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium text-accent">
                  Custom Active
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {state.isCustom && (
                <button
                  type="button"
                  onClick={resetAuto}
                  className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/20 transition-colors cursor-pointer"
                >
                  Reset to Auto
                </button>
              )}
              <button
                type="button"
                onClick={() => setEditingJson(false)}
                className="flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-2 hover:text-foreground cursor-pointer"
                title="Close JSON editor"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>

          <textarea
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setDraftError("");
            }}
            spellCheck={false}
            className="h-56 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-[11px] leading-relaxed text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
          />

          {draftError && (
            <div className="mt-1.5 text-xs text-destructive font-medium">{draftError}</div>
          )}

          <div className="mt-2.5 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditingJson(false)}
              className="rounded-lg border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-surface hover:text-foreground cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveEdit}
              className="rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90 cursor-pointer shadow-xs transition-opacity"
            >
              Save & Apply
            </button>
          </div>
        </div>
      )}

      {/* ─── Error banner if request failed ─── */}
      {state.error &&
        !isRunning &&
        (/50 free pages|reached the free daily limit/i.test(state.error) ? (
          <div className="mb-4 rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-4 text-xs">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/20 text-primary">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-foreground text-[13px]">
                    50 Free Pages Used Today
                  </h4>
                  <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    Daily Limit
                  </span>
                </div>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  You've used your 50 free pages for today! Continue reading without interruption by
                  using your own free OpenRouter API key for another 50 free pages every day.
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    onClick={() => openApiKeyModal(state.error, true)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-95 cursor-pointer"
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    <span>Get Your Free Key</span>
                  </button>
                  <button
                    onClick={onRun}
                    className="rounded-lg border border-border bg-background/60 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-2 cursor-pointer"
                  >
                    Retry
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-center justify-between">
            <span className="flex-1 mr-2 leading-relaxed">
              {extractProviderErrorMessage(state.error) || state.error}
            </span>
            <button
              onClick={onRun}
              className="ml-3 font-semibold underline hover:opacity-80 text-[11px] cursor-pointer shrink-0"
            >
              Retry
            </button>
          </div>
        ))}

      {/* ─── Result / Streaming content ─── */}
      {(() => {
        const displayResult = state.status === "done" && state.result ? state.result : "";
        return (
          <div className="reader-text">
            {isRunning ? (
              streamBuf ? (
                <div className="whitespace-pre-wrap break-words">{streamBuf}</div>
              ) : (
                <div className="flex items-center justify-center py-8">
                  <LoadingLogo
                    size={56}
                    label={`${modeLabel === "Translate" ? "Translating" : "Generating"}…`}
                  />
                </div>
              )
            ) : displayResult ? (
              <ReadableResult text={displayResult} pageNumber={pageNumber} />
            ) : (
              <p className="text-center text-sm text-muted-foreground py-8">
                Click <span className="font-semibold text-primary">{modeLabel}</span> to process
                this page.
              </p>
            )}
          </div>
        );
      })()}
    </article>
  );
}

function ReadableResult({ text, pageNumber }: { text: string; pageNumber: number }) {
  return <HighlightableText text={text} source="ai" pageNumber={pageNumber} />;
}
