import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useVirtualizer } from "@tanstack/react-virtual";
import { JsonView } from "./JsonView";
import { estimateTokens } from "@/lib/models";
import {
  buildPagePayload,
  fetchModels,
  getKey,
  getMemory,
  getMode,
  getOutputLanguage,
  getSelectedModel,
  getSequential,
  getStyle,
  getTemperature,
  memoryExcerpt,
  MODE_INSTRUCTIONS,
  EXPLANATION_STYLES,
  streamCompletion,
  type GlobalMode,
  type ORModel,
} from "@/lib/openrouter";
import {
  computeSettingsHash,
  getPageData,
  upsertPageAi,
  type PageAi,
  type PageAiSummaryEntry,
  type PageOverrides,
} from "@/lib/storage";
import {
  createSmartTtsController,
  isTtsSupported,
  stopAll as stopAllTts,
} from "@/lib/tts";

interface Props {
  docId: string;
  pageCount: number;
  aiSummary: Record<number, PageAiSummaryEntry>;
  onPageAiChange: (pageNumber: number, entry: PageAiSummaryEntry | null) => void;
}

const STYLES = EXPLANATION_STYLES.map((s) => s.id);
const QUICK_LANGS = ["English", "Arabic", "French", "Hindi", "Spanish", "Japanese"];

/** Throttle setState to at most once per `ms` while leading-edge fires immediately. */
const STREAM_FLUSH_MS = 150;

interface Globals {
  mode: GlobalMode;
  language: string;
  modelId: string;
  style: string;
  temperature: number;
  memory: boolean;
  sequential: boolean;
}

function effective(globals: Globals, ov?: PageOverrides) {
  return {
    mode: ov?.mode ?? globals.mode,
    language: ov?.language ?? globals.language,
    modelId: ov?.modelId ?? globals.modelId,
    style: ov?.style ?? globals.style,
    temperature: ov?.temperature ?? globals.temperature,
    memory: ov?.memory ?? globals.memory,
  };
}

function readGlobals(): Globals {
  return {
    mode: getMode(),
    language: getOutputLanguage(),
    modelId: getSelectedModel(),
    style: getStyle(),
    temperature: getTemperature(),
    memory: getMemory(),
    sequential: getSequential(),
  };
}

function summarize(ai: PageAi): PageAiSummaryEntry {
  return {
    status: ai.status,
    hasResult: !!ai.result,
    isCustom: ai.isCustom,
    settingsHash: ai.settingsHash,
  };
}

export function PageWorkstation({ docId, pageCount, aiSummary, onPageAiChange }: Props) {
  const [globals, setGlobals] = useState<Globals>(readGlobals);
  const [models, setModels] = useState<ORModel[]>([]);
  const [runningPages, setRunningPages] = useState<Set<number>>(new Set());
  /** Live streaming buffers (debounced via setInterval flusher). */
  const [streamBufs, setStreamBufs] = useState<Record<number, string>>({});

  const abortMap = useRef<Map<number, AbortController>>(new Map());
  const runAllRef = useRef<{ cancelled: boolean } | null>(null);
  const [runAllActive, setRunAllActive] = useState(false);
  const [runAllProgress, setRunAllProgress] = useState<{ current: number; total: number; errors: number } | null>(null);
  const mountedRef = useRef(true);
  /** One-shot text overrides keyed by pageNumber (from PDF selection translate). */
  const selectionOverridesRef = useRef<Map<number, string>>(new Map());

  const aiSummaryRef = useRef(aiSummary);
  aiSummaryRef.current = aiSummary;
  const globalsRef = useRef(globals);
  globalsRef.current = globals;
  const onPageAiChangeRef = useRef(onPageAiChange);
  onPageAiChangeRef.current = onPageAiChange;

  // Cleanup: abort everything on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortMap.current.forEach((c) => c.abort());
      abortMap.current.clear();
      if (runAllRef.current) runAllRef.current.cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onFocus = () => setGlobals(readGlobals());
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  useEffect(() => {
    const k = getKey();
    if (!k) return;
    fetchModels(k).then(setModels).catch(() => {});
  }, []);

  const hasKey = !!getKey();

  /* ---------- Per-page execution ---------- */

  const runPage = useCallback(
    async (pageNumber: number, prevExcerpt?: string): Promise<string | undefined> => {
      const key = getKey();
      const currentGlobals = globalsRef.current;
      if (!key) return;

      // Read fresh page text + state from IDB
      const pageRec = await getPageData(docId, pageNumber);
      if (!pageRec) return;
      const state: PageAi = pageRec.pageAi ?? { pageNumber, status: "idle" };
      const eff = effective(currentGlobals, state.overrides);
      if (!eff.modelId) return;

      stopAllTts();

      // One-shot selection override (from PDF text selection → "Translate")
      const selOverride = selectionOverridesRef.current.get(pageNumber);
      if (selOverride) selectionOverridesRef.current.delete(pageNumber);
      const effectiveText = selOverride ?? pageRec.text;

      let payload: Record<string, unknown>;
      if (state.isCustom && state.customRequest) {
        payload = { ...state.customRequest, stream: true };
      } else {
        payload = buildPagePayload({
          modelId: eff.modelId,
          mode: eff.mode,
          language: eff.language,
          style: eff.style,
          temperature: eff.temperature,
          pageNumber,
          pageText: effectiveText,
          previousExcerpt: eff.memory ? prevExcerpt : undefined,
        });
      }

      const hash = computeSettingsHash({
        modelId: eff.modelId,
        mode: eff.mode,
        language: eff.language,
        style: eff.style,
        temperature: eff.temperature,
        memory: eff.memory,
      });

      const ctrl = new AbortController();
      abortMap.current.set(pageNumber, ctrl);
      if (mountedRef.current) {
        setRunningPages((s) => new Set(s).add(pageNumber));
        setStreamBufs((b) => ({ ...b, [pageNumber]: "" }));
      }

      // Persist running status
      await upsertPageAi(docId, pageNumber, { status: "running", error: undefined });
      onPageAiChangeRef.current(pageNumber, { status: "running", hasResult: !!state.result, isCustom: state.isCustom, settingsHash: state.settingsHash });

      // ---- Debounced UI flush ----
      const bufferRef = { current: "" };
      const lastUiRef = { current: "" };
      const flushUi = () => {
        if (!mountedRef.current) return;
        if (bufferRef.current === lastUiRef.current) return;
        lastUiRef.current = bufferRef.current;
        const snapshot = bufferRef.current;
        setStreamBufs((b) => ({ ...b, [pageNumber]: snapshot }));
      };
      const flushTimer = setInterval(flushUi, STREAM_FLUSH_MS);

      try {
        await streamCompletion({
          key,
          payload,
          signal: ctrl.signal,
          onDelta: (d) => {
            bufferRef.current += d;
          },
        });
        // Final flush before persisting to IDB
        flushUi();
        const result = bufferRef.current;
        await upsertPageAi(docId, pageNumber, {
          status: "done",
          result,
          error: undefined,
          settingsHash: hash,
        });
        onPageAiChangeRef.current(pageNumber, summarize({
          ...state,
          status: "done",
          result,
          settingsHash: hash,
        }));
        return result;
      } catch (e) {
        if ((e as Error).name === "AbortError") {
          const status = state.result ? "done" : "idle";
          await upsertPageAi(docId, pageNumber, { status });
          onPageAiChangeRef.current(pageNumber, { ...summarize(state), status });
        } else {
          const err = e instanceof Error ? e.message : "Unknown error";
          await upsertPageAi(docId, pageNumber, { status: "error", error: err });
          onPageAiChangeRef.current(pageNumber, { ...summarize(state), status: "error" });
        }
      } finally {
        clearInterval(flushTimer);
        abortMap.current.delete(pageNumber);
        if (mountedRef.current) {
          setRunningPages((s) => {
            const n = new Set(s);
            n.delete(pageNumber);
            return n;
          });
          setStreamBufs((b) => {
            const next = { ...b };
            delete next[pageNumber];
            return next;
          });
        }
      }
    },
    [docId],
  );

  const cancelPage = useCallback((pageNumber: number) => {
    abortMap.current.get(pageNumber)?.abort();
  }, []);

  // Listen for PDF-viewer "translate selection" events
  const runPageRef = useRef(runPage);
  runPageRef.current = runPage;
  useEffect(() => {
    const handler = (e: Event) => {
      const ev = e as CustomEvent<{ docId: string; pageNumber: number; text: string }>;
      const d = ev.detail;
      if (!d || d.docId !== docId || !d.text) return;
      selectionOverridesRef.current.set(d.pageNumber, d.text);
      void runPageRef.current(d.pageNumber);
    };
    window.addEventListener("doclens:translate-selection", handler);
    return () => window.removeEventListener("doclens:translate-selection", handler);
  }, [docId]);

  const handleRunAll = async () => {
    const freshGlobals = readGlobals();
    setGlobals(freshGlobals);

    runAllRef.current = { cancelled: false };
    setRunAllActive(true);
    let prev: string | undefined;
    let errorCount = 0;
    let processedCount = 0;
    const totalToProcess = pageCount;

    if (mountedRef.current) setRunAllProgress({ current: 0, total: totalToProcess, errors: 0 });

    if (freshGlobals.sequential) {
      for (let n = 1; n <= pageCount; n++) {
        if (runAllRef.current?.cancelled) break;
        const pageRec = await getPageData(docId, n);
        if (!pageRec) {
          processedCount++;
          if (mountedRef.current) setRunAllProgress({ current: processedCount, total: totalToProcess, errors: errorCount });
          continue;
        }
        const state: PageAi = pageRec.pageAi ?? { pageNumber: n, status: "idle" };
        const currentGlobals = readGlobals();
        const eff = effective(currentGlobals, state.overrides);
        const hash = computeSettingsHash({
          modelId: eff.modelId,
          mode: eff.mode,
          language: eff.language,
          style: eff.style,
          temperature: eff.temperature,
          memory: eff.memory,
        });
        const skip =
          state.status === "done" &&
          state.settingsHash === hash &&
          !state.isCustom &&
          !!state.result;
        if (skip) {
          if (eff.memory) prev = memoryExcerpt(state.result);
          processedCount++;
          if (mountedRef.current) setRunAllProgress({ current: processedCount, total: totalToProcess, errors: errorCount });
          continue;
        }
        try {
          const out = await runPage(n, prev);
          if (out && eff.memory) prev = memoryExcerpt(out);
        } catch {
          errorCount++;
        }
        processedCount++;
        if (mountedRef.current) setRunAllProgress({ current: processedCount, total: totalToProcess, errors: errorCount });
      }
    } else {
      let completed = 0;
      const numbers = Array.from({ length: pageCount }, (_, i) => i + 1);
      const results = await Promise.allSettled(
        numbers.map(async (n) => {
          const pageRec = await getPageData(docId, n);
          if (!pageRec) return undefined;
          const state: PageAi = pageRec.pageAi ?? { pageNumber: n, status: "idle" };
          const currentGlobals = readGlobals();
          const eff = effective(currentGlobals, state.overrides);
          const hash = computeSettingsHash({
            modelId: eff.modelId,
            mode: eff.mode,
            language: eff.language,
            style: eff.style,
            temperature: eff.temperature,
            memory: eff.memory,
          });
          if (state.status === "done" && state.settingsHash === hash && !state.isCustom && state.result) {
            completed++;
            if (mountedRef.current) setRunAllProgress({ current: completed, total: totalToProcess, errors: errorCount });
            return undefined;
          }
          try {
            const result = await runPage(n);
            completed++;
            if (mountedRef.current) setRunAllProgress({ current: completed, total: totalToProcess, errors: errorCount });
            return result;
          } catch (e) {
            completed++;
            errorCount++;
            if (mountedRef.current) setRunAllProgress({ current: completed, total: totalToProcess, errors: errorCount });
            throw e;
          }
        }),
      );
      errorCount = results.filter((r) => r.status === "rejected").length;
    }

    if (runAllRef.current?.cancelled) {
      toast.info("Run All cancelled.", { duration: 3000 });
    } else if (errorCount > 0) {
      toast.warning(
        `Completed with ${errorCount} error${errorCount > 1 ? "s" : ""}. Check individual pages for details.`,
        { duration: 5000 },
      );
    } else {
      toast.success(`All ${totalToProcess} pages processed successfully.`, { duration: 3000 });
    }

    if (mountedRef.current) {
      setRunAllActive(false);
      setRunAllProgress(null);
    }
    runAllRef.current = null;
  };

  const cancelRunAll = () => {
    if (runAllRef.current) runAllRef.current.cancelled = true;
    abortMap.current.forEach((c) => c.abort());
  };

  /* ---------- Empty / setup states ---------- */

  if (!hasKey || !globals.modelId) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-widest">setup required</div>
          <p className="mt-2">
            {!hasKey ? "Add your OpenRouter API key to run AI operations." : "Select a model in Settings."}
          </p>
          <Link
            to="/settings"
            className="mt-4 inline-block rounded-md bg-primary px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-primary-foreground"
          >
            open settings
          </Link>
        </div>
      </div>
    );
  }

  if (pageCount === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
        Extract the document first to populate per-page containers.
      </div>
    );
  }

  const doneCount = Object.values(aiSummary).filter((e) => e.status === "done").length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border bg-surface-2 px-4 py-2.5">
        <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          per-page workstation
          <span className="text-foreground">{doneCount}/{pageCount} done</span>
          <span className="text-muted-foreground">
            · {globals.sequential ? "sequential" : "parallel"} · memory {globals.memory ? "on" : "off"}
          </span>
          {runAllProgress && (
            <span className="text-primary">
              · processing {runAllProgress.current}/{runAllProgress.total}
              {runAllProgress.errors > 0 && (
                <span className="text-destructive"> · {runAllProgress.errors} error{runAllProgress.errors > 1 ? "s" : ""}</span>
              )}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {runAllActive ? (
            <button
              onClick={cancelRunAll}
              className="rounded-md border border-destructive/60 bg-destructive/10 px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-destructive hover:bg-destructive/20"
            >
              cancel all
            </button>
          ) : (
            <button
              onClick={handleRunAll}
              className="rounded-md bg-primary px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-primary-foreground hover:opacity-90"
            >
              ▶ run all pages
            </button>
          )}
        </div>
      </div>

      <VirtualPageList
        docId={docId}
        pageCount={pageCount}
        globals={globals}
        models={models}
        aiSummary={aiSummary}
        runningPages={runningPages}
        streamBufs={streamBufs}
        onPageAiChange={onPageAiChange}
        onRun={(n) => void runPage(n)}
        onCancel={cancelPage}
      />
    </div>
  );
}

/* ---------- Virtualized list ---------- */

interface ListProps {
  docId: string;
  pageCount: number;
  globals: Globals;
  models: ORModel[];
  aiSummary: Record<number, PageAiSummaryEntry>;
  runningPages: Set<number>;
  streamBufs: Record<number, string>;
  onPageAiChange: (pageNumber: number, entry: PageAiSummaryEntry | null) => void;
  onRun: (pageNumber: number) => void;
  onCancel: (pageNumber: number) => void;
}

function VirtualPageList(props: ListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: props.pageCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 280,
    overscan: 2,
    measureElement: (el) => el?.getBoundingClientRect().height ?? 280,
  });

  return (
    <div ref={parentRef} className="flex-1 overflow-auto px-4 py-4">
      <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative", width: "100%" }}>
        {rowVirtualizer.getVirtualItems().map((vr) => {
          const pageNumber = vr.index + 1;
          return (
            <div
              key={vr.key}
              data-index={vr.index}
              ref={rowVirtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${vr.start}px)`,
                paddingBottom: 16,
              }}
            >
              <PageCardLoader
                docId={props.docId}
                pageNumber={pageNumber}
                globals={props.globals}
                models={props.models}
                summary={props.aiSummary[pageNumber]}
                isRunning={props.runningPages.has(pageNumber)}
                streamBuf={props.streamBufs[pageNumber] ?? ""}
                onPageAiChange={props.onPageAiChange}
                onRun={() => props.onRun(pageNumber)}
                onCancel={() => props.onCancel(pageNumber)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

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

function PageCardLoader(props: CardLoaderProps) {
  const { docId, pageNumber, summary } = props;
  const [text, setText] = useState<string | null>(null);
  const [columns, setColumns] = useState(1);
  const [pageAi, setPageAi] = useState<PageAi>(() => ({
    pageNumber,
    status: summary?.status ?? "idle",
  }));

  // Fetch own data on mount / when key changes / when summary status flips to "done" elsewhere.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rec = await getPageData(docId, pageNumber);
      if (cancelled) return;
      if (rec) {
        setText(rec.text);
        setColumns(rec.columns);
        setPageAi(rec.pageAi ?? { pageNumber, status: "idle" });
      } else {
        setText("");
        setPageAi({ pageNumber, status: "idle" });
      }
    })();
    return () => {
      cancelled = true;
    };
    // Re-fetch when summary transitions (status or hash change) so we get fresh result text after run.
  }, [docId, pageNumber, summary?.status, summary?.settingsHash, summary?.hasResult]);

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
      <div className="rounded-md border border-border bg-background/40 px-3 py-3 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        page {pageNumber} · loading…
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
      streamBuf={props.streamBuf}
      isRunning={props.isRunning}
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
  isRunning,
  onUpdate,
  onRun,
  onCancel,
}: CardProps) {
  const [view, setView] = useState<"request" | "result">(state.status === "done" ? "result" : "request");
  const [editingJson, setEditingJson] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState("");
  const [ttsState, setTtsState] = useState<"idle" | "playing" | "paused" | "ended">("idle");
  const ttsRef = useRef<ReturnType<typeof createSmartTtsController> | null>(null);

  useEffect(() => {
    if (state.status === "done") setView("result");
    if (state.status === "running") setView("result");
  }, [state.status]);

  // Strict cleanup on unmount: destroy TTS controller fully.
  useEffect(() => {
    return () => {
      ttsRef.current?.destroy();
      ttsRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (isRunning) {
      ttsRef.current?.stop();
      setTtsState("idle");
    }
  }, [isRunning]);

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
      onUpdate({ customRequest: parsed, isCustom: true });
      setEditingJson(false);
    } catch (e) {
      setDraftError(e instanceof Error ? e.message : "Invalid JSON");
    }
  };
  const resetAuto = () => {
    onUpdate({ customRequest: null, isCustom: false });
    setEditingJson(false);
  };

  const handleTtsPlay = () => {
    if (!state.result || !isTtsSupported()) return;
    if (ttsState === "paused" && ttsRef.current) {
      ttsRef.current.resume();
      return;
    }
    ttsRef.current?.destroy();
    const ctrl = createSmartTtsController(state.result, {
      onState: setTtsState,
      language: eff.language,
    });
    ttsRef.current = ctrl;
    ctrl.play();
  };
  const handleTtsPause = () => ttsRef.current?.pause();
  const handleTtsStop = () => {
    ttsRef.current?.stop();
    setTtsState("idle");
  };

  const statusColor =
    state.status === "running"
      ? "text-primary"
      : state.status === "done"
        ? "text-primary"
        : state.status === "error"
          ? "text-destructive"
          : "text-muted-foreground";

  return (
    <article
      className={`rounded-md border bg-background/40 transition-colors ${
        isRunning ? "border-primary/50 ring-1 ring-primary/30" : "border-border"
      }`}
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        <span className="text-foreground">page {pageNumber}</span>
        <span>tok <span className="text-foreground">{estimateTokens(pageText).toLocaleString()}</span></span>
        <span className={statusColor}>● {state.status}</span>
        {state.isCustom && (
          <span className="rounded bg-accent/15 px-1.5 py-0.5 normal-case tracking-normal text-accent">custom</span>
        )}
        {state.overrides && Object.keys(state.overrides).length > 0 && (
          <span className="rounded bg-primary/15 px-1.5 py-0.5 normal-case tracking-normal text-primary">override</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setView("request")}
            className={`rounded px-2 py-0.5 ${view === "request" ? "bg-primary/15 text-primary" : "border border-border text-muted-foreground hover:text-foreground"}`}
          >
            request
          </button>
          <button
            onClick={() => setView("result")}
            className={`rounded px-2 py-0.5 ${view === "result" ? "bg-primary/15 text-primary" : "border border-border text-muted-foreground hover:text-foreground"}`}
            disabled={!state.result && !isRunning}
          >
            result
          </button>
          {isRunning ? (
            <button
              onClick={onCancel}
              className="rounded border border-destructive/60 bg-destructive/10 px-2 py-0.5 text-destructive hover:bg-destructive/20"
            >
              cancel
            </button>
          ) : (
            <button
              onClick={onRun}
              className="rounded bg-primary px-2 py-0.5 text-primary-foreground hover:opacity-90"
            >
              ▶ run
            </button>
          )}
        </div>
      </header>

      {state.result && isTtsSupported() && (
        <div className="flex items-center gap-2 border-b border-border bg-background/20 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          <span>tts</span>
          {ttsState !== "playing" ? (
            <button
              onClick={handleTtsPlay}
              className="rounded border border-border px-2 py-0.5 hover:text-foreground"
            >
              {ttsState === "paused" ? "▶ resume" : "▶ play"}
            </button>
          ) : (
            <button
              onClick={handleTtsPause}
              className="rounded border border-border px-2 py-0.5 hover:text-foreground"
            >
              ❚❚ pause
            </button>
          )}
          <button
            onClick={handleTtsStop}
            disabled={ttsState === "idle" || ttsState === "ended"}
            className="rounded border border-border px-2 py-0.5 hover:text-foreground disabled:opacity-30"
          >
            ■ stop
          </button>
          <span className="ml-auto normal-case text-muted-foreground">{ttsState}</span>
        </div>
      )}

      <details className="border-b border-border bg-background/20 px-3 py-1.5 text-xs">
        <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground">
          overrides {state.overrides && Object.keys(state.overrides).length > 0 ? `(${Object.keys(state.overrides).length})` : ""}
        </summary>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <SmallSelect
            label="mode"
            value={state.overrides?.mode ?? ""}
            onChange={(v) => setOverride({ mode: (v || undefined) as GlobalMode | undefined })}
            options={[["", `inherit (${eff.mode})`], ...Object.entries(MODE_INSTRUCTIONS).map(([k, v]) => [k, v.label] as [string, string])]}
          />
          <SmallSelect
            label="language"
            value={state.overrides?.language ?? ""}
            onChange={(v) => setOverride({ language: v || undefined })}
            options={[["", `inherit (${eff.language})`], ...QUICK_LANGS.map((l) => [l, l] as [string, string])]}
          />
          <SmallSelect
            label="style"
            value={state.overrides?.style ?? ""}
            onChange={(v) => setOverride({ style: v || undefined })}
            options={[["", `inherit (${eff.style})`], ...STYLES.map((s) => [s, s] as [string, string])]}
          />
          <SmallSelect
            label="model"
            value={state.overrides?.modelId ?? ""}
            onChange={(v) => setOverride({ modelId: v || undefined })}
            options={[["", `inherit (${(models.find((m) => m.id === eff.modelId)?.name ?? eff.modelId).slice(0, 22)})`], ...models.slice(0, 80).map((m) => [m.id, (m.name ?? m.id).slice(0, 32)] as [string, string])]}
          />
          <label className="block">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              temp · {(state.overrides?.temperature ?? eff.temperature).toFixed(2)}
              {state.overrides?.temperature === undefined && <span className="ml-1 text-muted-foreground">(inh)</span>}
            </span>
            <input
              type="range" min={0} max={1.5} step={0.05}
              value={state.overrides?.temperature ?? eff.temperature}
              onChange={(e) => setOverride({ temperature: parseFloat(e.target.value) })}
              className="mt-1 w-full accent-primary"
            />
          </label>
          <label className="flex items-center gap-2 self-end font-mono text-[11px] text-muted-foreground">
            <input
              type="checkbox"
              checked={state.overrides?.memory ?? eff.memory}
              onChange={(e) => setOverride({ memory: e.target.checked })}
              className="h-3.5 w-3.5 accent-primary"
            />
            memory{state.overrides?.memory === undefined && " (inh)"}
          </label>
        </div>
        {state.overrides && Object.keys(state.overrides).length > 0 && (
          <button
            onClick={() => onUpdate({ overrides: undefined })}
            className="mt-2 rounded border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >
            clear overrides
          </button>
        )}
      </details>

      {view === "request" ? (
        <div className="px-3 py-3">
          {editingJson ? (
            <>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                spellCheck={false}
                className="h-72 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-[12px] outline-none focus:border-primary"
              />
              {draftError && <div className="mt-1 font-mono text-[11px] text-destructive">{draftError}</div>}
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={saveEdit}
                  className="rounded-md bg-primary px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-primary-foreground hover:opacity-90"
                >
                  save custom
                </button>
                <button
                  onClick={() => setEditingJson(false)}
                  className="rounded-md border border-border px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
                >
                  cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                <span>
                  {state.isCustom ? (
                    <span className="text-accent">custom request — sent verbatim</span>
                  ) : (
                    <span>auto-generated · regenerates as settings change</span>
                  )}
                </span>
                <span className="flex items-center gap-1">
                  <button
                    onClick={startEdit}
                    className="rounded border border-border px-2 py-0.5 hover:text-foreground"
                  >
                    edit
                  </button>
                  {state.isCustom && (
                    <button
                      onClick={resetAuto}
                      className="rounded border border-border px-2 py-0.5 hover:text-foreground"
                    >
                      reset to auto
                    </button>
                  )}
                </span>
              </div>
              <div className="max-h-[40vh] overflow-auto rounded-md border border-border bg-background/60 p-3">
                <JsonView value={previewPayload} />
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="px-3 py-3">
          {state.status === "error" && (
            <div className="mb-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 font-mono text-[11px] text-destructive">
              {state.error}
            </div>
          )}
          <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-background/60 p-3 font-mono text-[12.5px] leading-relaxed text-foreground/90">
            {isRunning
              ? streamBuf || <span className="text-muted-foreground italic">waiting for first token…</span>
              : state.result || <span className="text-muted-foreground italic">no result yet — click ▶ run</span>}
          </pre>
        </div>
      )}
    </article>
  );
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
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded border border-border bg-background px-2 py-1 font-mono text-[11px] outline-none focus:border-primary"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </label>
  );
}
