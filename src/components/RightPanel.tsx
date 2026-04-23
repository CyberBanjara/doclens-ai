import { useEffect, useMemo, useState } from "react";
import { JsonView } from "./JsonView";
import { chunkPages, estimateTokens, OPERATIONS, operationPrompt, type Chunk, type Operation } from "@/lib/chunking";
import { streamChat } from "@/lib/openrouter";
import { getSetting, settingsKeys } from "@/lib/storage";
import type { PageExtraction } from "@/lib/pdf";

interface Props {
  pages: PageExtraction[];
  totalPages: number;
  modelId: string;
  modelContextTokens: number;
  analyzing: boolean;
  status: string;
  onOpenSettings: () => void;
}

type Tab = "text" | "ai" | "request";

interface ChunkResult {
  chunkIndex: number;
  pageRange: [number, number];
  output: string;
  done: boolean;
  error?: string;
}

export function RightPanel({
  pages,
  totalPages,
  modelId,
  modelContextTokens,
  analyzing,
  status,
  onOpenSettings,
}: Props) {
  const [tab, setTab] = useState<Tab>("text");
  const [op, setOp] = useState<Operation>("summarize");
  const [chunkIdx, setChunkIdx] = useState(0);
  const [results, setResults] = useState<ChunkResult[]>([]);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  // Reserve ~25% of context for the response; cap chunk size at 12k tok for sanity.
  const chunkBudget = Math.min(12_000, Math.floor(modelContextTokens * 0.7));
  const chunks = useMemo(() => chunkPages(pages, chunkBudget), [pages, chunkBudget]);
  const totalTokens = useMemo(
    () => pages.reduce((sum, p) => sum + estimateTokens(p.text), 0),
    [pages],
  );

  const safeChunkIdx = Math.min(chunkIdx, Math.max(0, chunks.length - 1));
  const currentChunk = chunks[safeChunkIdx];
  const previewPayload = currentChunk
    ? buildPayload(modelId, currentChunk, op)
    : null;

  // Reset results when chunks change (new doc / new pages)
  useEffect(() => {
    setResults([]);
  }, [pages, modelId, op]);

  const run = async () => {
    setRunError(null);
    const apiKey = (await getSetting<string>(settingsKeys.openrouterApiKey)) ?? "";
    if (!apiKey) {
      setRunError("Add your OpenRouter API key in Settings first.");
      onOpenSettings();
      return;
    }
    if (!modelId) {
      setRunError("Pick a model in Settings first.");
      onOpenSettings();
      return;
    }
    if (chunks.length === 0) {
      setRunError("No extracted text yet — analyze the document first.");
      return;
    }
    setRunning(true);
    setTab("ai");
    setResults(
      chunks.map((c) => ({
        chunkIndex: c.index,
        pageRange: c.pageRange,
        output: "",
        done: false,
      })),
    );

    for (const chunk of chunks) {
      try {
        await streamChat({
          apiKey,
          model: modelId,
          messages: [
            { role: "system", content: operationPrompt(op) },
            { role: "user", content: chunk.text },
          ],
          onDelta: (delta) => {
            setResults((prev) =>
              prev.map((r) =>
                r.chunkIndex === chunk.index ? { ...r, output: r.output + delta } : r,
              ),
            );
          },
        });
        setResults((prev) =>
          prev.map((r) => (r.chunkIndex === chunk.index ? { ...r, done: true } : r)),
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : "stream failed";
        setResults((prev) =>
          prev.map((r) =>
            r.chunkIndex === chunk.index ? { ...r, done: true, error: msg } : r,
          ),
        );
        setRunError(msg);
        break;
      }
    }
    setRunning(false);
  };

  return (
    <div className="flex h-full flex-col bg-surface">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-2 px-4 py-2.5">
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          pipeline
          <span className="text-foreground/70">
            · {modelId || "no model"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={op}
            onChange={(e) => setOp(e.target.value as Operation)}
            className="rounded border border-border bg-background px-2 py-1 font-mono text-[11px] text-foreground outline-none focus:border-primary"
          >
            {OPERATIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            onClick={run}
            disabled={running || chunks.length === 0}
            className="rounded-md bg-primary px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {running ? "running…" : `run · ${chunks.length} chunk${chunks.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>

      {runError && (
        <div className="border-b border-border bg-destructive/10 px-4 py-2 font-mono text-[11px] text-destructive">
          {runError}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center border-b border-border">
        <TabButton active={tab === "text"} onClick={() => setTab("text")}>
          Extracted Text
          <Badge>{pages.length}/{totalPages || "—"}</Badge>
        </TabButton>
        <TabButton active={tab === "ai"} onClick={() => setTab("ai")}>
          AI Results
          <Badge>{results.filter((r) => r.done).length}/{results.length || 0}</Badge>
        </TabButton>
        <TabButton active={tab === "request"} onClick={() => setTab("request")}>
          Request Preview
          <Badge>{chunks.length || 0}</Badge>
        </TabButton>
        <div className="ml-auto px-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {analyzing ? <span className="text-primary">{status}</span> : status || "idle"}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden">
        {tab === "text" && (
          <ExtractedText pages={pages} totalTokens={totalTokens} />
        )}
        {tab === "ai" && (
          <AiResults results={results} />
        )}
        {tab === "request" && (
          <RequestPreview
            chunks={chunks}
            currentChunk={currentChunk}
            safeChunkIdx={safeChunkIdx}
            setChunkIdx={setChunkIdx}
            payload={previewPayload}
            modelId={modelId}
          />
        )}
      </div>
    </div>
  );
}

function buildPayload(modelId: string, chunk: Chunk, op: Operation) {
  return {
    model: modelId,
    messages: [
      { role: "system", content: operationPrompt(op) },
      { role: "user", content: chunk.text },
    ],
    stream: true,
  };
}

function ExtractedText({
  pages,
  totalTokens,
}: {
  pages: PageExtraction[];
  totalTokens: number;
}) {
  if (pages.length === 0) {
    return (
      <EmptyState>
        Click <span className="text-primary">Analyze Document</span> to extract text.
      </EmptyState>
    );
  }
  return (
    <div className="h-full overflow-auto px-5 py-4">
      <div className="mb-4 flex items-center justify-between font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        <span>{totalTokens.toLocaleString()} tokens · {pages.length} pages</span>
        <span>columns detected per page</span>
      </div>
      <div className="space-y-4">
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
              {p.text || <span className="italic text-muted-foreground">(no extractable text)</span>}
            </pre>
          </article>
        ))}
      </div>
    </div>
  );
}

function AiResults({ results }: { results: ChunkResult[] }) {
  if (results.length === 0) {
    return (
      <EmptyState>
        Pick an operation above and hit <span className="text-primary">run</span>.
        Responses stream chunk-by-chunk and stay anchored to source pages.
      </EmptyState>
    );
  }
  return (
    <div className="h-full overflow-auto px-5 py-4 space-y-4">
      {results.map((r) => (
        <article key={r.chunkIndex} className="rounded-md border border-border bg-background/40">
          <header className="flex items-center justify-between border-b border-border px-3 py-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            <span>
              chunk {r.chunkIndex + 1} · pages {r.pageRange[0]}–{r.pageRange[1]}
            </span>
            <span className={r.error ? "text-destructive" : r.done ? "text-primary" : "text-foreground/60"}>
              {r.error ? "error" : r.done ? "done" : "streaming…"}
            </span>
          </header>
          <pre className="whitespace-pre-wrap break-words px-3 py-3 font-mono text-[12.5px] leading-relaxed text-foreground/90">
            {r.error ? <span className="text-destructive">{r.error}</span> : r.output || <span className="italic text-muted-foreground">…</span>}
          </pre>
        </article>
      ))}
    </div>
  );
}

function RequestPreview({
  chunks,
  currentChunk,
  safeChunkIdx,
  setChunkIdx,
  payload,
  modelId,
}: {
  chunks: Chunk[];
  currentChunk: Chunk | undefined;
  safeChunkIdx: number;
  setChunkIdx: (fn: (i: number) => number) => void;
  payload: unknown;
  modelId: string;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border bg-background/40 px-4 py-2">
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          <button
            className="rounded border border-border px-2 py-0.5 hover:border-border-strong disabled:opacity-30"
            disabled={!currentChunk || safeChunkIdx === 0}
            onClick={() => setChunkIdx((i) => Math.max(0, i - 1))}
          >
            ← prev
          </button>
          <span className="text-foreground">
            chunk {chunks.length === 0 ? 0 : safeChunkIdx + 1} / {chunks.length}
          </span>
          <button
            className="rounded border border-border px-2 py-0.5 hover:border-border-strong disabled:opacity-30"
            disabled={!currentChunk || safeChunkIdx >= chunks.length - 1}
            onClick={() => setChunkIdx((i) => Math.min(chunks.length - 1, i + 1))}
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
            JSON payload that will be sent to{" "}
            <span className="text-primary">{modelId || "the selected model"}</span>.
          </EmptyState>
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
    <div className="flex h-full items-center justify-center px-6">
      <div className="max-w-sm text-center text-sm text-muted-foreground">{children}</div>
    </div>
  );
}
