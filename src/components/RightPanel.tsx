import { useMemo, useState } from "react";
import { JsonView } from "./JsonView";
import { MODELS, buildRequestPayload, chunkPages, estimateTokens, type ModelSpec } from "@/lib/models";
import type { PageExtraction } from "@/lib/pdf";

type Tab = "text" | "request";

interface Props {
  pages: PageExtraction[];
  totalPages: number;
  modelId: string;
  onModelChange: (id: string) => void;
  analyzing: boolean;
  status: string;
}

export function RightPanel({
  pages,
  totalPages,
  modelId,
  onModelChange,
  analyzing,
  status,
}: Props) {
  const [tab, setTab] = useState<Tab>("text");
  const [chunkIdx, setChunkIdx] = useState(0);

  const model = MODELS.find((m) => m.id === modelId) ?? MODELS[0];
  const chunks = useMemo(() => chunkPages(pages, model), [pages, model]);
  const totalTokens = useMemo(
    () => pages.reduce((sum, p) => sum + estimateTokens(p.text), 0),
    [pages],
  );

  const safeChunkIdx = Math.min(chunkIdx, Math.max(0, chunks.length - 1));
  const currentChunk = chunks[safeChunkIdx];
  const payload = currentChunk ? buildRequestPayload(model, currentChunk) : null;

  return (
    <div className="flex h-full flex-col bg-surface">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-border bg-surface-2 px-4 py-2.5">
        <div className="flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          pipeline
        </div>
        <ModelSelector value={modelId} onChange={onModelChange} />
      </div>

      {/* Tabs */}
      <div className="flex items-center border-b border-border">
        <TabButton active={tab === "text"} onClick={() => setTab("text")}>
          Extracted Text
          <Badge>{pages.length}/{totalPages || "—"}</Badge>
        </TabButton>
        <TabButton active={tab === "request"} onClick={() => setTab("request")}>
          API Request Preview
          <Badge>{chunks.length || 0}</Badge>
        </TabButton>
        <div className="ml-auto px-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {analyzing ? <span className="text-primary">{status}</span> : status || "idle"}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden">
        {tab === "text" ? (
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
        ) : (
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
                  The exact JSON payload that would be sent to{" "}
                  <span className="text-primary">{model.label}</span> will appear here.
                </EmptyState>
              )}
            </div>
            <div className="border-t border-border bg-background/40 px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              <span className="text-foreground/70">no api call is made</span> · this is what an LLM would receive
            </div>
          </div>
        )}
      </div>

      {/* Coming soon footer */}
      <div className="border-t border-border bg-surface-2 px-4 py-2">
        <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-widest">
          <span className="text-muted-foreground">coming soon:</span>
          <ComingSoon>send request</ComingSoon>
          <ComingSoon>translate</ComingSoon>
          <ComingSoon>export</ComingSoon>
        </div>
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

function ComingSoon({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded border border-dashed border-border px-2 py-0.5 text-muted-foreground/70">
      {children}
    </span>
  );
}

function ModelSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
      model
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-border bg-background px-2 py-1 font-mono text-[11px] text-foreground outline-none focus:border-primary"
      >
        {MODELS.map((m: ModelSpec) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
    </label>
  );
}
