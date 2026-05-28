import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useVirtualizer } from "@tanstack/react-virtual";
import { estimateTokens } from "@/lib/models";
import {
  buildPagePayload,
  fetchModels,
  getKey,
  getKeyStatus,
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
  onKeyChange,
  OpenRouterError,
  openApiKeyModal,
  streamCompletion,
  mapLimit,
  validateKey,
  type GlobalMode,
  type KeyStatus,
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
const QUICK_LANGS = ["हिंदी", "বাংলা", "తెలుగు", "മലയാളം", "English", "Spanish", "French", "Japanese"];

/** Throttle setState to at most once per `ms` while leading-edge fires immediately. */
const STREAM_FLUSH_MS = 150;

interface RunAllBatch {
  cancelled: boolean;
}

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
  const runAllRef = useRef<RunAllBatch | null>(null);
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
      // Fully tear down Piper engine to reclaim WASM/AudioContext memory
      import("@/lib/neural-tts/piper-engine").then((p) => p.destroyEngine()).catch(() => {});
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

  const [keyStatus, setKeyStatusState] = useState<KeyStatus>("unknown");
  useEffect(() => {
    setKeyStatusState(getKeyStatus());
    return onKeyChange(() => {
      setKeyStatusState(getKeyStatus());
      const k = getKey();
      if (k) fetchModels(k).then(setModels).catch(() => {});
    });
  }, []);

  const hasKey = !!getKey();
  const keyReady = keyStatus !== "invalid" && keyStatus !== "missing" && hasKey;

  /** Returns true if the key is usable; otherwise opens modal + shows toast and returns false. */
  const ensureKeyReady = useCallback((): boolean => {
    if (!getKey()) {
      toast.error("Add your OpenRouter API key to run translations.");
      openApiKeyModal("Add a valid OpenRouter API key to start translating.");
      return false;
    }
    if (getKeyStatus() === "invalid") {
      toast.error("Your OpenRouter API key is invalid or expired.");
      openApiKeyModal("Your OpenRouter API key is invalid or expired.");
      return false;
    }
    return true;
  }, []);

  const ensureRunAllKeyReady = useCallback(async (): Promise<boolean> => {
    const key = getKey().trim();
    if (!ensureKeyReady() || !key) return false;

    const valid = await validateKey(key);
    setKeyStatusState(getKeyStatus());
    if (valid) return true;

    const invalid = getKeyStatus() === "invalid";
    const message = invalid
      ? "Your OpenRouter API key is invalid or expired. Run All stopped before processing pages."
      : "Could not verify your OpenRouter API key. Run All stopped before processing pages.";
    toast.error(message);
    if (invalid) openApiKeyModal(message);
    return false;
  }, [ensureKeyReady]);

  /* ---------- Per-page execution ---------- */

  const runPage = useCallback(
    async (pageNumber: number, prevExcerpt?: string, batch?: RunAllBatch): Promise<string | undefined> => {
      const key = getKey();
      const currentGlobals = globalsRef.current;
      if (!key) {
        ensureKeyReady();
        return;
      }
      if (batch?.cancelled) return;


      // Read fresh page text + state from IDB
      const pageRec = await getPageData(docId, pageNumber);
      if (!pageRec) return;
      if (batch?.cancelled) return;
      const state: PageAi = pageRec.pageAi ?? { pageNumber, status: "idle" };
      const eff = effective(currentGlobals, state.overrides);
      if (!eff.modelId) return;
      if (batch?.cancelled) return;

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
      if (batch?.cancelled) {
        abortMap.current.delete(pageNumber);
        return;
      }
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
        if (batch?.cancelled) {
          ctrl.abort();
          return;
        }
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
          if (e instanceof OpenRouterError && e.kind === "auth") {
            toast.error(err);
            openApiKeyModal(err);
          } else if (e instanceof OpenRouterError) {
            toast.error(err);
          }
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
    if (!(await ensureRunAllKeyReady())) return;
    const freshGlobals = readGlobals();
    setGlobals(freshGlobals);


    const batch: RunAllBatch = { cancelled: false };
    runAllRef.current = batch;
    setRunAllActive(true);
    let prev: string | undefined;
    let errorCount = 0;
    let processedCount = 0;
    const totalToProcess = pageCount;

    if (mountedRef.current) setRunAllProgress({ current: 0, total: totalToProcess, errors: 0 });

    if (freshGlobals.sequential) {
      for (let n = 1; n <= pageCount; n++) {
        if (batch.cancelled) break;
        const pageRec = await getPageData(docId, n);
        if (batch.cancelled) break;
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
          const out = await runPage(n, prev, batch);
          if (batch.cancelled) break;
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
      const results = await mapLimit(
        numbers,
        3,
        async (n) => {
          if (batch.cancelled) return { status: "fulfilled" as const, value: undefined };
          const pageRec = await getPageData(docId, n);
          if (batch.cancelled) return { status: "fulfilled" as const, value: undefined };
          if (!pageRec) return { status: "fulfilled" as const, value: undefined };
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
            return { status: "fulfilled" as const, value: undefined };
          }
          if (batch.cancelled) return { status: "fulfilled" as const, value: undefined };
          try {
            const result = await runPage(n, undefined, batch);
            completed++;
            if (mountedRef.current) setRunAllProgress({ current: completed, total: totalToProcess, errors: errorCount });
            return { status: "fulfilled" as const, value: result };
          } catch (e) {
            completed++;
            errorCount++;
            if (mountedRef.current) setRunAllProgress({ current: completed, total: totalToProcess, errors: errorCount });
            return { status: "rejected" as const, reason: e };
          }
        }
      );
      errorCount = results.filter((r) => r.status === "rejected").length;
    }

    if (batch.cancelled) {
      toast.info("Run All cancelled.", { duration: 3000 });
    } else if (errorCount > 0) {
      toast.warning(
        `Completed with ${errorCount} error${errorCount > 1 ? "s" : ""}. Check individual pages for details.`,
        { duration: 5000 },
      );
    } else {
      toast.success(`All ${totalToProcess} pages processed successfully.`, { duration: 3000 });
    }

    if (mountedRef.current && runAllRef.current === batch) {
      setRunAllActive(false);
      setRunAllProgress(null);
    }
    if (runAllRef.current === batch) runAllRef.current = null;
  };

  const cancelRunAll = () => {
    if (runAllRef.current) runAllRef.current.cancelled = true;
    abortMap.current.forEach((c) => c.abort());
    if (mountedRef.current) {
      setRunAllActive(false);
      setRunAllProgress(null);
    }
  };

  /* ---------- Empty / setup states ---------- */

  if (!keyReady || !globals.modelId) {
    const noKey = !hasKey;
    const invalid = keyStatus === "invalid";
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
        <div>
          <div
            className={`font-mono text-[11px] uppercase tracking-widest ${
              invalid ? "text-destructive" : ""
            }`}
          >
            {invalid ? "api key invalid" : noKey ? "api key required" : "setup required"}
          </div>
          <p className="mt-2">
            {invalid
              ? "Your saved OpenRouter key is invalid or expired."
              : noKey
                ? "Add your OpenRouter API key to start translating."
                : "Select a model in Settings."}
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            {keyReady ? null : (
              <button
                onClick={() => openApiKeyModal()}
                className="rounded-md bg-primary px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-primary-foreground hover:opacity-90"
              >
                add api key
              </button>
            )}
            <Link
              to="/settings"
              className="rounded-md border border-border bg-background px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
            >
              open settings
            </Link>
          </div>
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
      <div className="border-b border-border bg-surface-2 px-4 py-3">
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-background/50 px-4 py-3">
          <div className="flex flex-wrap items-center gap-4 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_8px_rgba(78,222,163,0.6)]" />
              per-page workstation
            </span>
            <span>
              progress <span className="text-primary">{doneCount}/{pageCount} done</span>
            </span>
            <span>
              {globals.sequential ? "sequential" : "parallel"} · memory {globals.memory ? "on" : "off"}
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
                className="rounded-md bg-primary px-4 py-2 font-mono text-[11px] font-black uppercase tracking-widest text-primary-foreground shadow-[0_10px_24px_rgba(78,222,163,0.14)] hover:opacity-90"
              >
                ▶ run all pages
              </button>
            )}
          </div>
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
              <div data-index={pageNumber} className="right-panel-item-wrap w-full">
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

      {view === "request" ? (
        <div className="space-y-3 px-3 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              <span>primary overrides</span>
              {overrideCount > 0 && (
                <span className="rounded border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-primary">
                  {overrideCount} active
                </span>
              )}
              {state.isCustom && (
                <span className="rounded border border-accent/25 bg-accent/10 px-1.5 py-0.5 text-accent">
                  custom json
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {state.isCustom && (
                <button
                  onClick={resetAuto}
                  className="rounded-md bg-primary px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-primary-foreground hover:opacity-90"
                >
                  reset to auto
                </button>
              )}
              <button
                onClick={editingJson ? () => setEditingJson(false) : startEdit}
                className="rounded-md border border-border bg-background px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:border-border-strong hover:text-foreground"
              >
                {editingJson ? "hide json" : "advanced: edit json"}
              </button>
            </div>
          </div>

          <OverrideControls
            eff={eff}
            models={models}
            overrides={state.overrides}
            onSetOverride={setOverride}
            onClearOverrides={() => onUpdate({ overrides: undefined })}
            surface="primary"
          />

          {editingJson && (
            <div className="rounded-md border border-border bg-background/40 p-3">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {state.isCustom ? "custom request — sent verbatim" : "auto-generated request"}
              </div>
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
            </div>
          )}

          {!editingJson && state.isCustom && (
            <div className="rounded-md border border-accent/20 bg-accent/10 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-accent">
              custom JSON is active. Click advanced edit JSON to inspect or change it.
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3 px-3 py-3">
          {state.status === "error" && (
            <div className="mb-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 font-mono text-[11px] text-destructive">
              {state.error}
            </div>
          )}
          {state.result && isTtsSupported() && (
            <div className="flex items-center justify-between rounded-md border border-border bg-surface-2 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  TTS
                </span>
                {ttsState !== "playing" ? (
                  <button
                    onClick={handleTtsPlay}
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-primary/25 bg-primary/10 text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                    title={ttsState === "paused" ? "Resume speech" : "Play speech"}
                  >
                    ▶
                  </button>
                ) : (
                  <button
                    onClick={handleTtsPause}
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-foreground transition-colors hover:border-primary hover:text-primary"
                    title="Pause speech"
                  >
                    ❚❚
                  </button>
                )}
                <button
                  onClick={handleTtsStop}
                  disabled={ttsState === "idle" || ttsState === "ended"}
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:border-destructive/60 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-30"
                  title="Stop speech"
                >
                  ■
                </button>
              </div>
              <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {ttsState}
              </span>
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

function OverrideControls({
  eff,
  models,
  overrides,
  onSetOverride,
  onClearOverrides,
  surface,
}: {
  eff: ReturnType<typeof effective>;
  models: ORModel[];
  overrides?: PageOverrides;
  onSetOverride: (patch: Partial<PageOverrides>) => void;
  onClearOverrides: () => void;
  surface?: "primary";
}) {
  const hasOverrides = !!overrides && Object.keys(overrides).length > 0;
  const wrapperClass =
    surface === "primary"
      ? "rounded-md border border-border bg-background/30 p-3"
      : "pt-2";

  return (
    <div className={wrapperClass}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <SmallSelect
          label="mode"
          value={overrides?.mode ?? ""}
          onChange={(v) => onSetOverride({ mode: (v || undefined) as GlobalMode | undefined })}
          options={[
            ["", MODE_INSTRUCTIONS[eff.mode].label],
            ...Object.entries(MODE_INSTRUCTIONS).map(([k, v]) => [k, v.label] as [string, string]),
          ]}
        />
        <SmallSelect
          label="language"
          value={overrides?.language ?? ""}
          onChange={(v) => onSetOverride({ language: v || undefined })}
          options={[["", eff.language], ...QUICK_LANGS.map((l) => [l, l] as [string, string])]}
        />
        <SmallSelect
          label="style"
          value={overrides?.style ?? ""}
          onChange={(v) => onSetOverride({ style: v || undefined })}
          options={[["", eff.style], ...STYLES.map((s) => [s, s] as [string, string])]}
        />
        <SmallSelect
          label="model"
          value={overrides?.modelId ?? ""}
          onChange={(v) => onSetOverride({ modelId: v || undefined })}
          options={[
            [
              "",
              (models.find((m) => m.id === eff.modelId)?.name ?? eff.modelId).slice(0, 32),
            ],
            ...models.slice(0, 80).map((m) => [m.id, (m.name ?? m.id).slice(0, 32)] as [string, string]),
          ]}
        />
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            temp · {(overrides?.temperature ?? eff.temperature).toFixed(2)}
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
        <label className="flex items-center gap-2 self-end font-mono text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={overrides?.memory ?? eff.memory}
            onChange={(e) => onSetOverride({ memory: e.target.checked })}
            className="h-3.5 w-3.5 accent-primary"
          />
          memory
        </label>
      </div>
      {hasOverrides && (
        <button
          onClick={onClearOverrides}
          className="mt-2 rounded border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
        >
          clear overrides
        </button>
      )}
    </div>
  );
}
