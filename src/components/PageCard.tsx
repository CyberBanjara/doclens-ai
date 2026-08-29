import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, KeyRound } from "lucide-react";
import {
  buildPagePayload,
  EXPLANATION_STYLES,
  TRANSLATION_STYLES,
  MODE_LABELS,
  openApiKeyModal,
  type GlobalMode,
  type Globals,
  type ORModel,
} from "@/lib/openrouter";
import {
  getPageData,
  upsertPageAi,
  type PageAi,
  type PageAiSummaryEntry,
  type PageOverrides,
} from "@/lib/storage";
import { effective, summarize } from "@/lib/pageAi";
import { HighlightableText } from "./HighlightableText";
import { LoadingLogo } from "@/components/LoadingLogo";

const STYLES = EXPLANATION_STYLES.map((s) => s.id);
const QUICK_LANGS = [
  "हिंदी",
  "বাংলা",
  "తెలుగు",
  "മലയാളം",
  "தமிழ்",
  "English",
  "Spanish",
  "French",
  "Japanese",
];

/* ---------- Per-page card loader (fetches its own data) ---------- */

interface CardLoaderProps {
  docId: string;
  pageNumber: number;
  globals: Globals;
  models: ORModel[];
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

  // Track stream buffer to eliminate any frame lag / empty flash when isRunning transitions to false
  const streamCacheRef = useRef("");
  if (streamBuf) {
    streamCacheRef.current = streamBuf;
  }

  // Fetch own data on mount / when key changes / when summary status flips to "done" elsewhere.
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
        }
      } else {
        setText("");
        setPageAi({ pageNumber, status: "idle" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [docId, pageNumber, summary?.status, summary?.settingsHash, summary?.hasResult, isRunning]);

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
      models={props.models}
      streamBuf={streamBuf}
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
  models: ORModel[];
  streamBuf: string;
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
  models,
  streamBuf,
  fallbackResult,
  isRunning,
  onUpdate,
  onRun,
  onCancel,
}: CardProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [editingJson, setEditingJson] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState("");

  const autoPayload = useMemo(() => {
    return buildPagePayload({
      modelId: eff.modelId,
      mode: eff.mode,
      language: eff.language,
      style: eff.style,
      temperature: eff.temperature,
      pageNumber,
      pageText,
    });
  }, [eff.modelId, eff.mode, eff.language, eff.style, eff.temperature, pageNumber, pageText]);

  const previewPayload = state.isCustom && state.customRequest ? state.customRequest : autoPayload;
  const overrideCount = state.overrides ? Object.keys(state.overrides).length : 0;

  const setOverride = (patch: Partial<PageOverrides>) => {
    onUpdate({ overrides: { ...(state.overrides ?? {}), ...patch } });
  };

  const startEdit = () => {
    setDraft(JSON.stringify(previewPayload, null, 2));
    setDraftError("");
    setEditingJson(true);
  };
  const saveEdit = () => {
    try {
      const parsed = JSON.parse(draft);
      if (typeof parsed !== "object" || !parsed) throw new Error("Not an object");
      // Reset status so a stale pre-edit result is never mistaken for fresh
      // output of this new custom request (see doclens:ensure-page-ready).
      onUpdate({ customRequest: parsed, isCustom: true, status: "idle" });
      setEditingJson(false);
    } catch (e) {
      setDraftError(e instanceof Error ? e.message : "Invalid JSON");
    }
  };
  const resetAuto = () => {
    onUpdate({ customRequest: null, isCustom: false });
    setEditingJson(false);
  };

  /* Determine button label from mode */
  const modeLabel = MODE_LABELS[eff.mode] || "Translate";
  const hasResult = !!state.result || isRunning;

  return (
    <article className={`reader-card ${isRunning ? "!border-primary/20" : ""}`}>
      {/* ─── Header ─── */}
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Page {pageNumber}
          </h3>
          {state.status === "done" && (
            <span className="flex h-1.5 w-1.5 rounded-full bg-primary" title="Translated" />
          )}
          {state.status === "running" && (
            <span className="inline-block h-3 w-3 rounded-full border-[1.5px] border-primary border-t-transparent spin-slow" />
          )}
          {state.status === "error" && (
            <span className="flex h-1.5 w-1.5 rounded-full bg-destructive" title="Error" />
          )}
          {state.isCustom && (
            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
              Custom
            </span>
          )}
          {overrideCount > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              {overrideCount} override{overrideCount > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* Settings gear */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${showSettings ? "bg-surface-2 text-foreground" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"}`}
            title="Configure"
          >
            ⚙
          </button>

          {/* Run / Cancel */}
          {isRunning ? (
            <button
              onClick={onCancel}
              className="ml-1 rounded-lg border border-destructive/30 px-2.5 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={onRun}
              className="ml-1 rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              {modeLabel}
            </button>
          )}
        </div>
      </header>

      {/* ─── Settings panel (collapsed by default) ─── */}
      <div className={`collapsible-content ${showSettings ? "open" : ""}`}>
        <div>
          <div className="mb-4 space-y-3 rounded-lg bg-surface-2/30 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Page Overrides</span>
              <div className="flex items-center gap-2">
                {state.isCustom && (
                  <button
                    onClick={resetAuto}
                    className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/20 cursor-pointer"
                  >
                    Reset to Auto
                  </button>
                )}
                <button
                  onClick={editingJson ? () => setEditingJson(false) : startEdit}
                  className="rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
                >
                  {editingJson ? "Hide JSON" : "Edit JSON"}
                </button>
              </div>
            </div>

            <OverrideControls
              eff={eff}
              models={models}
              overrides={state.overrides}
              onSetOverride={setOverride}
              onClearOverrides={() => onUpdate({ overrides: undefined })}
            />

            {editingJson && (
              <div className="rounded-lg border border-border bg-background/40 p-3">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  spellCheck={false}
                  className="h-56 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-[12px] outline-none focus:border-primary"
                />
                {draftError && <div className="mt-1 text-xs text-destructive">{draftError}</div>}
                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={saveEdit}
                    className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90 cursor-pointer"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingJson(false)}
                    className="rounded-md border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Error banner if request failed ─── */}
      {state.error &&
        !isRunning &&
        (/50 free pages|daily limit|rate limit|quota/i.test(state.error) ? (
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
            <span>{state.error}</span>
            <button
              onClick={onRun}
              className="ml-3 font-semibold underline hover:opacity-80 text-[11px] cursor-pointer"
            >
              Retry
            </button>
          </div>
        ))}

      {/* ─── Result / Streaming content ─── */}
      {(() => {
        const displayResult = state.result || (!isRunning && fallbackResult ? fallbackResult : "");
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

function SmallSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-muted-foreground capitalize">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-border bg-background/50 px-2 py-1.5 text-[12px] text-foreground outline-none focus:border-primary"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function OverrideControls({
  eff,
  models,
  overrides,
  onSetOverride,
  onClearOverrides,
}: {
  eff: ReturnType<typeof effective>;
  models: ORModel[];
  overrides?: PageOverrides;
  onSetOverride: (patch: Partial<PageOverrides>) => void;
  onClearOverrides: () => void;
}) {
  const hasOverrides = !!overrides && Object.keys(overrides).length > 0;

  const styleOptions = useMemo(() => {
    return (eff.mode === "translate" ? TRANSLATION_STYLES : EXPLANATION_STYLES).map(
      (s) => [s.id, s.label] as [string, string],
    );
  }, [eff.mode]);

  const langOptions = useMemo(() => {
    const list = QUICK_LANGS.map((l) => [l, l] as [string, string]);
    if (eff.language && !QUICK_LANGS.includes(eff.language)) {
      return [[eff.language, eff.language] as [string, string], ...list];
    }
    return list;
  }, [eff.language]);

  const modelOptions = useMemo(() => {
    const list = models
      .slice(0, 80)
      .map((m) => [m.id, (m.name ?? m.id).slice(0, 32)] as [string, string]);
    if (eff.modelId && !list.some(([id]) => id === eff.modelId)) {
      return [[eff.modelId, eff.modelId.slice(0, 32)] as [string, string], ...list];
    }
    return list;
  }, [models, eff.modelId]);

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <SmallSelect
          label="Mode"
          value={eff.mode}
          onChange={(v) => {
            const nextMode = v as GlobalMode;
            let nextStyle = eff.style;
            if (nextMode === "translate" && !TRANSLATION_STYLES.some((s) => s.id === nextStyle)) {
              nextStyle = "Native";
            } else if (
              nextMode === "explain" &&
              !EXPLANATION_STYLES.some((s) => s.id === nextStyle)
            ) {
              nextStyle = "Standard";
            }
            onSetOverride({ mode: nextMode, style: nextStyle });
          }}
          options={Object.entries(MODE_LABELS).map(([k, v]) => [k, v] as [string, string])}
        />
        <SmallSelect
          label="Language"
          value={eff.language}
          onChange={(v) => onSetOverride({ language: v })}
          options={langOptions}
        />
        <SmallSelect
          label="Style"
          value={eff.style}
          onChange={(v) => onSetOverride({ style: v })}
          options={styleOptions}
        />
        <SmallSelect
          label="Model"
          value={eff.modelId}
          onChange={(v) => onSetOverride({ modelId: v })}
          options={modelOptions}
        />
        <label className="block">
          <span className="text-[11px] font-medium text-muted-foreground">
            Temperature · {(overrides?.temperature ?? eff.temperature).toFixed(2)}
          </span>
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.05}
            value={overrides?.temperature ?? eff.temperature}
            onChange={(e) => onSetOverride({ temperature: parseFloat(e.target.value) })}
            className="mt-1 w-full accent-primary"
          />
        </label>
      </div>
      {hasOverrides && (
        <button
          onClick={onClearOverrides}
          className="mt-2 rounded-md border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          Clear Overrides
        </button>
      )}
    </div>
  );
}
