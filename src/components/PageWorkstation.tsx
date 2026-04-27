import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { JsonView } from "./JsonView";
import { estimateTokens } from "@/lib/models";
import type { PageExtraction } from "@/lib/pdf";
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
  streamCompletion,
  type GlobalMode,
  type ORModel,
} from "@/lib/openrouter";
import { computeSettingsHash, type PageAi, type PageOverrides } from "@/lib/storage";
import {
  createTtsController,
  isTtsSupported,
  stopAll as stopAllTts,
} from "@/lib/tts";

interface Props {
  pages: PageExtraction[];
  pageAi: Record<number, PageAi>;
  onUpdatePage: (pageNumber: number, patch: Partial<PageAi>) => void;
  /** Externally-driven scroll target (from PDF viewer). */
  syncToPage?: number | null;
  /** Fired when the user scrolls a page card into view. */
  onPageChange?: (page: number) => void;
}

const STYLES = ["Neutral", "Formal", "Casual", "Academic", "Concise", "Detailed", "Friendly"];
const QUICK_LANGS = ["English", "Arabic", "French", "Hindi", "Spanish", "Japanese"];

function effective(globals: ReturnType<typeof readGlobals>, ov?: PageOverrides) {
  return {
    mode: ov?.mode ?? globals.mode,
    language: ov?.language ?? globals.language,
    modelId: ov?.modelId ?? globals.modelId,
    style: ov?.style ?? globals.style,
    temperature: ov?.temperature ?? globals.temperature,
    memory: ov?.memory ?? globals.memory,
  };
}

function readGlobals() {
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

export function PageWorkstation({ pages, pageAi, onUpdatePage, syncToPage, onPageChange }: Props) {
  const [globals, setGlobals] = useState(readGlobals);
  const [models, setModels] = useState<ORModel[]>([]);
  const [runningPages, setRunningPages] = useState<Set<number>>(new Set());
  const [streamBufs, setStreamBufs] = useState<Record<number, string>>({});
  const abortMap = useRef<Map<number, AbortController>>(new Map());
  const runAllRef = useRef<{ cancelled: boolean } | null>(null);
  const [runAllActive, setRunAllActive] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const lockEmitUntilRef = useRef<number>(0);
  const [currentPage, setCurrentPage] = useState(1);

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

  // External sync → scroll target card
  useEffect(() => {
    if (!syncToPage) return;
    const el = cardRefs.current.get(syncToPage);
    if (!el || !scrollRef.current) return;
    lockEmitUntilRef.current = Date.now() + 500;
    const top = el.offsetTop - 8;
    scrollRef.current.scrollTo({ top, behavior: "smooth" });
    if (syncToPage !== currentPage) stopAllTts();
    setCurrentPage(syncToPage);
  }, [syncToPage]);

  // Track scroll → emit current page
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let raf = 0;
    const compute = () => {
      const midpoint = el.scrollTop + el.clientHeight / 3;
      let active = currentPage;
      for (const [pn, node] of cardRefs.current.entries()) {
        if (node.offsetTop <= midpoint) active = pn;
        else break;
      }
      if (active !== currentPage) {
        setCurrentPage(active);
        if (Date.now() > lockEmitUntilRef.current) onPageChange?.(active);
      }
    };
    const handler = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(compute);
    };
    el.addEventListener("scroll", handler, { passive: true });
    return () => {
      el.removeEventListener("scroll", handler);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [currentPage, onPageChange]);

  const hasKey = !!getKey();

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

  if (pages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
        Extract the document first to populate per-page containers.
      </div>
    );
  }

  const runPage = async (pageNumber: number, prevExcerpt?: string) => {
    const page = pages.find((p) => p.pageNumber === pageNumber);
    if (!page) return;
    const state = pageAi[pageNumber];
    const eff = effective(globals, state?.overrides);
    const key = getKey();
    if (!key || !eff.modelId) return;

    // Stop any TTS for this page on re-run
    stopAllTts();

    let payload: Record<string, unknown>;
    if (state?.isCustom && state.customRequest) {
      payload = { ...state.customRequest, stream: true };
    } else {
      payload = buildPagePayload({
        modelId: eff.modelId,
        mode: eff.mode as GlobalMode,
        language: eff.language,
        style: eff.style,
        temperature: eff.temperature,
        pageNumber,
        pageText: page.text,
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
    setRunningPages((s) => new Set(s).add(pageNumber));
    setStreamBufs((b) => ({ ...b, [pageNumber]: "" }));
    onUpdatePage(pageNumber, { status: "running", error: undefined, lastSentRequest: payload });

    let buf = "";
    try {
      await streamCompletion({
        key,
        payload,
        signal: ctrl.signal,
        onDelta: (d) => {
          buf += d;
          setStreamBufs((b) => ({ ...b, [pageNumber]: buf }));
        },
      });
      onUpdatePage(pageNumber, { status: "done", result: buf, error: undefined, settingsHash: hash });
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        onUpdatePage(pageNumber, { status: state?.result ? "done" : "idle" });
      } else {
        onUpdatePage(pageNumber, { status: "error", error: e instanceof Error ? e.message : "Unknown error" });
      }
    } finally {
      abortMap.current.delete(pageNumber);
      setRunningPages((s) => {
        const n = new Set(s);
        n.delete(pageNumber);
        return n;
      });
    }
    return buf;
  };

  const cancelPage = (pageNumber: number) => {
    abortMap.current.get(pageNumber)?.abort();
  };

  const handleRunAll = async () => {
    runAllRef.current = { cancelled: false };
    setRunAllActive(true);
    let prev: string | undefined;
    if (globals.sequential) {
      for (const page of pages) {
        if (runAllRef.current?.cancelled) break;
        const state = pageAi[page.pageNumber];
        const eff = effective(globals, state?.overrides);
        const hash = computeSettingsHash({
          modelId: eff.modelId,
          mode: eff.mode,
          language: eff.language,
          style: eff.style,
          temperature: eff.temperature,
          memory: eff.memory,
        });
        // Skip if already done with matching settings and not custom
        const skip =
          state?.status === "done" &&
          state.settingsHash === hash &&
          !state.isCustom &&
          !!state.result;
        if (skip) {
          if (eff.memory) prev = memoryExcerpt(state.result);
          continue;
        }
        const out = await runPage(page.pageNumber, prev);
        if (out && eff.memory) prev = memoryExcerpt(out);
      }
    } else {
      await Promise.all(
        pages.map((p) => {
          const state = pageAi[p.pageNumber];
          const eff = effective(globals, state?.overrides);
          const hash = computeSettingsHash({
            modelId: eff.modelId,
            mode: eff.mode,
            language: eff.language,
            style: eff.style,
            temperature: eff.temperature,
            memory: eff.memory,
          });
          if (state?.status === "done" && state.settingsHash === hash && !state.isCustom && state.result) {
            return Promise.resolve(undefined);
          }
          return runPage(p.pageNumber);
        }),
      );
    }
    setRunAllActive(false);
  };

  const cancelRunAll = () => {
    if (runAllRef.current) runAllRef.current.cancelled = true;
    abortMap.current.forEach((c) => c.abort());
  };

  const doneCount = pages.filter((p) => pageAi[p.pageNumber]?.status === "done").length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border bg-surface-2 px-4 py-2.5">
        <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          per-page workstation
          <span className="text-foreground">{doneCount}/{pages.length} done</span>
          <span className="text-muted-foreground">
            · {globals.sequential ? "sequential" : "parallel"} · memory {globals.memory ? "on" : "off"}
          </span>
        </div>
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

      <div ref={scrollRef} className="flex-1 overflow-auto px-4 py-4 space-y-4">
        {pages.map((page) => {
          const state = pageAi[page.pageNumber] ?? {
            pageNumber: page.pageNumber,
            status: "idle" as const,
          };
          const eff = effective(globals, state.overrides);
          return (
            <div
              key={page.pageNumber}
              ref={(el) => {
                if (el) cardRefs.current.set(page.pageNumber, el);
                else cardRefs.current.delete(page.pageNumber);
              }}
            >
              <PageCard
                page={page}
                state={state}
                eff={eff}
                models={models}
                streamBuf={streamBufs[page.pageNumber] ?? ""}
                isRunning={runningPages.has(page.pageNumber)}
                isCurrent={currentPage === page.pageNumber}
                onUpdate={(patch) => onUpdatePage(page.pageNumber, patch)}
                onRun={() => runPage(page.pageNumber)}
                onCancel={() => cancelPage(page.pageNumber)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface CardProps {
  page: PageExtraction;
  state: PageAi;
  eff: ReturnType<typeof effective>;
  models: ORModel[];
  streamBuf: string;
  isRunning: boolean;
  isCurrent: boolean;
  onUpdate: (patch: Partial<PageAi>) => void;
  onRun: () => void;
  onCancel: () => void;
}

function PageCard({ page, state, eff, models, streamBuf, isRunning, isCurrent, onUpdate, onRun, onCancel }: CardProps) {
  const [view, setView] = useState<"request" | "result">(state.status === "done" ? "result" : "request");
  const [editingJson, setEditingJson] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState("");
  const [ttsState, setTtsState] = useState<"idle" | "playing" | "paused" | "ended">("idle");
  const ttsRef = useRef<ReturnType<typeof createTtsController> | null>(null);

  useEffect(() => {
    if (state.status === "done") setView("result");
    if (state.status === "running") setView("result");
  }, [state.status]);

  // Stop TTS on result change / re-run
  useEffect(() => {
    return () => {
      ttsRef.current?.stop();
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
      mode: eff.mode as GlobalMode,
      language: eff.language,
      style: eff.style,
      temperature: eff.temperature,
      pageNumber: page.pageNumber,
      pageText: page.text,
    });
  }, [eff.modelId, eff.mode, eff.language, eff.style, eff.temperature, page.pageNumber, page.text]);

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
    ttsRef.current?.stop();
    const ctrl = createTtsController(state.result, {
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
        isCurrent ? "border-primary/50 ring-1 ring-primary/30" : "border-border"
      }`}
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        <span className="text-foreground">page {page.pageNumber}</span>
        <span>tok <span className="text-foreground">{estimateTokens(page.text).toLocaleString()}</span></span>
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

      {/* TTS bar */}
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

      {/* Per-page overrides strip */}
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
