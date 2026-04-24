import { useEffect, useMemo, useRef, useState } from "react";
import { JsonView } from "./JsonView";
import { estimateTokens } from "@/lib/models";
import type { PageExtraction } from "@/lib/pdf";
import {
  MODE_INSTRUCTIONS,
  chunkForContext,
  fetchModels,
  getKey,
  getOutputLanguage,
  getSelectedModel,
  setOutputLanguage,
  streamCompletion,
  type ORModel,
} from "@/lib/openrouter";
import type { AiMode, AiResult } from "@/lib/storage";
import { Link } from "@tanstack/react-router";

type Tab = "text" | "request" | "ai";

interface Props {
  pages: PageExtraction[];
  totalPages: number;
  analyzing: boolean;
  status: string;
  fullText: string;
  aiResults: AiResult[];
  onAiResult: (result: AiResult) => void;
  onDeleteAiResult: (id: string) => void;
}

const QUICK_LANGS = ["English", "Arabic", "French", "Hindi", "Spanish", "Japanese"];

export function RightPanel({
  pages,
  totalPages,
  analyzing,
  status,
  fullText,
  aiResults,
  onAiResult,
  onDeleteAiResult,
}: Props) {
  const [tab, setTab] = useState<Tab>("text");
  const [chunkIdx, setChunkIdx] = useState(0);

  const totalTokens = useMemo(
    () => pages.reduce((sum, p) => sum + estimateTokens(p.text), 0),
    [pages],
  );

  // === AI execution state ===
  const [mode, setMode] = useState<AiMode>("summarize");
  const [language, setLanguage] = useState(getOutputLanguage());
  const [orModels, setOrModels] = useState<ORModel[]>([]);
  const [orModelId, setOrModelId] = useState(getSelectedModel());
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [streamBuf, setStreamBuf] = useState("");
  const [runError, setRunError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  // Live request log — every chunk dispatched to OpenRouter is recorded here
  // so the Request Preview tab shows exactly what was (or will be) sent.
  interface RequestLogEntry {
    chunkIndex: number; // 0-based
    chunkCount: number;
    payload: Record<string, unknown>;
    dispatchedAt: number;
    chars: number;
    tokens: number;
  }
  const [requestLog, setRequestLog] = useState<RequestLogEntry[]>([]);
  const safeChunkIdx = Math.min(chunkIdx, Math.max(0, requestLog.length - 1));
  const currentRequest = requestLog[safeChunkIdx];

  useEffect(() => {
    const k = getKey();
    if (!k) return;
    fetchModels(k)
      .then((m) => {
        setOrModels(m);
        if (!getSelectedModel() && m[0]) {
          setOrModelId(m[0].id);
        }
      })
      .catch(() => {});
  }, []);

  const orModel = orModels.find((m) => m.id === orModelId);
  const hasKey = !!getKey();
  const canRun = hasKey && !!orModelId && pages.length > 0 && !running;

  const handleRun = async () => {
    if (!canRun) return;
    const key = getKey();
    if (!key) return;
    setRunError("");
    setRunning(true);
    setStreamBuf("");
    setRequestLog([]);
    setChunkIdx(0);
    setTab("ai");
    abortRef.current = new AbortController();
    setOutputLanguage(language);

    try {
      const ctx = orModel?.context_length ?? orModel?.top_provider?.context_length ?? 8000;
      const chunks = chunkForContext(fullText, ctx);
      const system = `You are a document assistant. Always respond in ${language}.`;
      const instruction = MODE_INSTRUCTIONS[mode].instruction;
      let combined = "";

      for (let i = 0; i < chunks.length; i++) {
        if (abortRef.current?.signal.aborted) break;
        setProgress(`Chunk ${i + 1} of ${chunks.length} — Processing…`);
        const userContent = `${instruction}\n\n${chunks[i]}`;
        const payload: Record<string, unknown> = {
          model: orModelId,
          stream: true,
          max_tokens: 4000,
          messages: [
            { role: "system", content: system },
            { role: "user", content: userContent },
          ],
        };
        const entry: RequestLogEntry = {
          chunkIndex: i,
          chunkCount: chunks.length,
          payload,
          dispatchedAt: Date.now(),
          chars: userContent.length,
          tokens: estimateTokens(userContent),
        };
        setRequestLog((prev) => [...prev, entry]);
        setChunkIdx(i);
        if (chunks.length > 1) {
          combined += `\n\n--- Chunk ${i + 1}/${chunks.length} ---\n\n`;
          setStreamBuf(combined);
        }
        await streamCompletion({
          key,
          model: orModelId,
          system,
          user: userContent,
          signal: abortRef.current.signal,
          onDelta: (d) => {
            combined += d;
            setStreamBuf(combined);
          },
        });
      }

      const result: AiResult = {
        id: `${mode}-${language}-${orModelId}-${Date.now()}`,
        mode,
        language,
        modelId: orModelId,
        modelLabel: orModel?.name ?? orModelId,
        content: combined.trim(),
        createdAt: Date.now(),
        chunkCount: chunks.length,
      };
      onAiResult(result);
      setProgress(`Done · ${chunks.length} chunk${chunks.length === 1 ? "" : "s"}`);
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        setProgress("Cancelled");
      } else {
        setRunError(e instanceof Error ? e.message : "Unknown error");
        setProgress("");
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
  };

  return (
    <div className="flex h-full flex-col bg-surface">
      {/* Operation bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-2 px-4 py-2.5">
        <div className="flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          ai pipeline
        </div>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as AiMode)}
          className="rounded border border-border bg-background px-2 py-1 font-mono text-[11px] text-foreground outline-none focus:border-primary"
        >
          {Object.entries(MODE_INSTRUCTIONS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <select
          value={QUICK_LANGS.includes(language) ? language : "__custom"}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "__custom") return;
            setLanguage(v);
            setOutputLanguage(v);
          }}
          className="rounded border border-border bg-background px-2 py-1 font-mono text-[11px] text-foreground outline-none focus:border-primary"
          title="Output language"
        >
          {QUICK_LANGS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
          {!QUICK_LANGS.includes(language) && <option value="__custom">{language}</option>}
        </select>
        <div className="ml-auto flex items-center gap-2">
          {orModel && (
            <span className="hidden font-mono text-[10px] uppercase tracking-widest text-muted-foreground sm:inline">
              {orModel.name?.slice(0, 28) ?? orModelId}
            </span>
          )}
          {running ? (
            <button
              onClick={handleCancel}
              className="rounded-md border border-destructive/60 bg-destructive/10 px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-destructive hover:bg-destructive/20"
            >
              cancel
            </button>
          ) : (
            <button
              onClick={handleRun}
              disabled={!canRun}
              className="rounded-md bg-primary px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              title={
                !hasKey
                  ? "Set your OpenRouter key in Settings"
                  : !orModelId
                    ? "Pick a model in Settings"
                    : pages.length === 0
                      ? "Extract the document first"
                      : "Run"
              }
            >
              ▶ run
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center border-b border-border">
        <TabButton active={tab === "text"} onClick={() => setTab("text")}>
          Extracted Text
          <Badge>{pages.length}/{totalPages || "—"}</Badge>
        </TabButton>
        <TabButton active={tab === "ai"} onClick={() => setTab("ai")}>
          AI Results
          <Badge>{aiResults.length + (running ? 1 : 0)}</Badge>
        </TabButton>
        <TabButton active={tab === "request"} onClick={() => setTab("request")}>
          Request Preview
          <Badge>{requestLog.length || 0}</Badge>
        </TabButton>
        <div className="ml-auto px-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {analyzing ? <span className="text-primary">{status}</span> : status || "idle"}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden">
        {tab === "text" && (
          <div className="h-full overflow-auto px-5 py-4">
            {pages.length === 0 ? (
              <EmptyState>
                Click <span className="text-primary">Analyze Document</span> to stream extracted text here.
              </EmptyState>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                  <span>{totalTokens.toLocaleString()} tokens · {pages.length} pages</span>
                  <span>columns detected per page</span>
                </div>
                {pages.map((p) => (
                  <article key={p.pageNumber} className="rounded-md border border-border bg-background/40">
                    <header className="flex items-center justify-between border-b border-border px-3 py-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                      <span>page {p.pageNumber}</span>
                      <span className="flex items-center gap-3">
                        <span>cols: <span className="text-foreground">{p.columns}</span></span>
                        <span>tok: <span className="text-foreground">{estimateTokens(p.text).toLocaleString()}</span></span>
                      </span>
                    </header>
                    <pre className="whitespace-pre-wrap break-words px-3 py-3 font-mono text-[12.5px] leading-relaxed text-foreground/90">
                      {p.text || <span className="text-muted-foreground italic">(no extractable text)</span>}
                    </pre>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "ai" && (
          <div className="flex h-full flex-col">
            {!hasKey || !orModelId ? (
              <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
                <div>
                  <div className="font-mono text-[11px] uppercase tracking-widest">setup required</div>
                  <p className="mt-2">
                    {!hasKey
                      ? "Add your OpenRouter API key to run AI operations."
                      : "Select a model to run AI operations."}
                  </p>
                  <Link
                    to="/settings"
                    className="mt-4 inline-block rounded-md bg-primary px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-primary-foreground"
                  >
                    open settings
                  </Link>
                </div>
              </div>
            ) : (
              <>
                {(running || streamBuf) && (
                  <div className="border-b border-border bg-background/40 px-4 py-3">
                    <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-widest">
                      <span className="text-primary">{progress || "running…"}</span>
                      <span className="text-muted-foreground">
                        {MODE_INSTRUCTIONS[mode].label} · {language}
                      </span>
                    </div>
                    <pre className="mt-3 max-h-[40vh] overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-background/60 p-3 font-mono text-[12.5px] leading-relaxed text-foreground/90">
                      {streamBuf || <span className="text-muted-foreground italic">waiting for first token…</span>}
                    </pre>
                  </div>
                )}
                {runError && (
                  <div className="border-b border-border bg-destructive/10 px-4 py-2 font-mono text-[11px] text-destructive">
                    {runError}
                  </div>
                )}
                <div className="flex-1 overflow-auto px-5 py-4">
                  {aiResults.length === 0 && !running && !streamBuf ? (
                    <EmptyState>
                      Pick a mode and click <span className="text-primary">▶ run</span> to stream live AI output.
                    </EmptyState>
                  ) : (
                    <ul className="space-y-4">
                      {[...aiResults]
                        .sort((a, b) => b.createdAt - a.createdAt)
                        .map((r) => (
                          <li key={r.id} className="rounded-md border border-border bg-background/40">
                            <header className="flex items-center justify-between border-b border-border px-3 py-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                              <span className="flex items-center gap-2">
                                <span className="rounded bg-primary/15 px-1.5 py-0.5 text-primary">
                                  {MODE_INSTRUCTIONS[r.mode].label}
                                </span>
                                <span className="rounded bg-accent/15 px-1.5 py-0.5 text-accent">{r.language}</span>
                                <span className="truncate">{r.modelLabel}</span>
                              </span>
                              <span className="flex items-center gap-2">
                                <span>{new Date(r.createdAt).toLocaleString()}</span>
                                <button
                                  onClick={() => onDeleteAiResult(r.id)}
                                  className="rounded border border-border px-1.5 py-0.5 hover:text-destructive"
                                >
                                  del
                                </button>
                              </span>
                            </header>
                            <pre className="whitespace-pre-wrap break-words px-3 py-3 font-mono text-[12.5px] leading-relaxed text-foreground/90">
                              {r.content}
                            </pre>
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {tab === "request" && (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-border bg-background/40 px-4 py-2">
              <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                <select
                  value={previewModelId}
                  onChange={(e) => setPreviewModelId(e.target.value)}
                  className="rounded border border-border bg-background px-2 py-0.5 font-mono text-[11px] text-foreground outline-none focus:border-primary"
                >
                  {MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <button
                  className="rounded border border-border px-2 py-0.5 hover:border-border-strong disabled:opacity-30"
                  disabled={!currentChunk || safeChunkIdx === 0}
                  onClick={() => setChunkIdx((i) => Math.max(0, i - 1))}
                >
                  ← prev
                </button>
                <span className="text-foreground">
                  chunk {previewChunks.length === 0 ? 0 : safeChunkIdx + 1} / {previewChunks.length}
                </span>
                <button
                  className="rounded border border-border px-2 py-0.5 hover:border-border-strong disabled:opacity-30"
                  disabled={!currentChunk || safeChunkIdx >= previewChunks.length - 1}
                  onClick={() => setChunkIdx((i) => Math.min(previewChunks.length - 1, i + 1))}
                >
                  next →
                </button>
              </div>
              {currentChunk && (
                <div className="flex items-center gap-2 font-mono text-[11px]">
                  <span className="rounded bg-primary/15 px-2 py-0.5 text-primary">
                    {currentChunk.tokens.toLocaleString()} tok
                  </span>
                  <span className="text-muted-foreground">
                    pages {currentChunk.pageRange[0]}–{currentChunk.pageRange[1]}
                  </span>
                </div>
              )}
            </div>
            <div className="flex-1 overflow-auto px-5 py-4">
              {payload ? (
                <JsonView value={payload} />
              ) : (
                <EmptyState>
                  The exact JSON payload that would be sent to{" "}
                  <span className="text-primary">{previewModel.label}</span> will appear here.
                </EmptyState>
              )}
            </div>
            <div className="border-t border-border bg-background/40 px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              <span className="text-foreground/70">preview only</span> · this is what an LLM would receive
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-2 px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.15em] transition-colors ${
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
      {active && <span className="absolute inset-x-3 -bottom-px h-px bg-primary" />}
    </button>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
      {children}
    </span>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="max-w-sm text-center text-sm text-muted-foreground">{children}</div>
    </div>
  );
}
