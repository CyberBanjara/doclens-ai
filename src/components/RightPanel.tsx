import { useMemo, useState } from "react";
import { estimateTokens } from "@/lib/models";
import type { PageExtraction } from "@/lib/pdf";
import type { PageAi } from "@/lib/storage";
import { PageWorkstation } from "./PageWorkstation";

type Tab = "text" | "pages";

interface Props {
  pages: PageExtraction[];
  totalPages: number;
  analyzing: boolean;
  status: string;
  pageAi: Record<number, PageAi>;
  onUpdatePage: (pageNumber: number, patch: Partial<PageAi>) => void;
  syncToPage?: number | null;
  onPageChange?: (page: number) => void;
}

export function RightPanel({
  pages,
  totalPages,
  analyzing,
  status,
  pageAi,
  onUpdatePage,
  syncToPage,
  onPageChange,
}: Props) {
  const [tab, setTab] = useState<Tab>("pages");

  const totalTokens = useMemo(
    () => pages.reduce((sum, p) => sum + estimateTokens(p.text), 0),
    [pages],
  );

  const doneCount = pages.filter((p) => pageAi[p.pageNumber]?.status === "done").length;

  return (
    <div className="flex h-full flex-col bg-surface">
      {/* Tabs */}
      <div className="flex items-center border-b border-border">
        <TabButton active={tab === "text"} onClick={() => setTab("text")}>
          Extracted Text
          <Badge>{pages.length}/{totalPages || "—"}</Badge>
        </TabButton>
        <TabButton active={tab === "pages"} onClick={() => setTab("pages")}>
          Pages
          <Badge>{doneCount}/{pages.length || "—"}</Badge>
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

        {tab === "pages" && (
          <PageWorkstation pages={pages} pageAi={pageAi} onUpdatePage={onUpdatePage} />
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
