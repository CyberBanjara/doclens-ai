import { useMemo, useState } from "react";
import { toast } from "sonner";
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

/* ---------- Export helpers ---------- */

function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportAsMarkdown(pages: PageExtraction[], pageAi: Record<number, PageAi>) {
  const lines: string[] = ["# DocLens AI — Export", "", `> Exported at ${new Date().toISOString()}`, ""];

  for (const page of pages) {
    lines.push(`## Page ${page.pageNumber}`, "");

    // Extracted text
    lines.push("### Extracted Text", "");
    lines.push(page.text || "*(no extractable text)*", "");

    // AI result
    const ai = pageAi[page.pageNumber];
    if (ai?.status === "done" && ai.result) {
      lines.push("### AI Result", "");
      lines.push(ai.result, "");
    }

    lines.push("---", "");
  }

  const content = lines.join("\n");
  downloadBlob(content, "doclens-export.md", "text/markdown;charset=utf-8");
  toast.success("Exported as Markdown.");
}

function exportAsJson(pages: PageExtraction[], pageAi: Record<number, PageAi>) {
  const data = pages.map((page) => {
    const ai = pageAi[page.pageNumber];
    return {
      pageNumber: page.pageNumber,
      columns: page.columns,
      tokenEstimate: estimateTokens(page.text),
      extractedText: page.text,
      ai: ai?.status === "done" && ai.result
        ? {
            status: ai.status,
            result: ai.result,
            settingsHash: ai.settingsHash,
            updatedAt: ai.updatedAt,
          }
        : null,
    };
  });

  const content = JSON.stringify({ exportedAt: new Date().toISOString(), pages: data }, null, 2);
  downloadBlob(content, "doclens-export.json", "application/json;charset=utf-8");
  toast.success("Exported as JSON.");
}

/* ---------- Component ---------- */

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
  const hasResults = doneCount > 0 || pages.length > 0;

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
        <div className="ml-auto flex items-center gap-2 px-4">
          {hasResults && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => exportAsMarkdown(pages, pageAi)}
                className="rounded border border-border bg-background px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
                title="Export as Markdown"
              >
                ↓ md
              </button>
              <button
                onClick={() => exportAsJson(pages, pageAi)}
                className="rounded border border-border bg-background px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
                title="Export as JSON"
              >
                ↓ json
              </button>
            </div>
          )}
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {analyzing ? <span className="text-primary">{status}</span> : status || "idle"}
          </span>
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
          <PageWorkstation
            pages={pages}
            pageAi={pageAi}
            onUpdatePage={onUpdatePage}
            syncToPage={syncToPage}
            onPageChange={onPageChange}
          />
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
