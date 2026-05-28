import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { estimateTokens } from "@/lib/models";
import { getAllPages, getPageData, type PageAiSummaryEntry } from "@/lib/storage";
import { PageWorkstation } from "./PageWorkstation";

type Tab = "text" | "pages";

interface Props {
  docId: string;
  pageCount: number;
  analyzing: boolean;
  status: string;
  aiSummary: Record<number, PageAiSummaryEntry>;
  onPageAiChange: (pageNumber: number, entry: PageAiSummaryEntry | null) => void;
  activePage: number;
  setActivePage: (p: number) => void;
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

async function exportAsMarkdown(docId: string) {
  const pages = await getAllPages(docId);
  const lines: string[] = ["# DocLens AI — Export", "", `> Exported at ${new Date().toISOString()}`, ""];
  for (const page of pages) {
    lines.push(`## Page ${page.pageNumber}`, "");
    lines.push("### Extracted Text", "");
    lines.push(page.text || "*(no extractable text)*", "");
    if (page.pageAi?.status === "done" && page.pageAi.result) {
      lines.push("### AI Result", "");
      lines.push(page.pageAi.result, "");
    }
    lines.push("---", "");
  }
  downloadBlob(lines.join("\n"), "doclens-export.md", "text/markdown;charset=utf-8");
  toast.success("Exported as Markdown.");
}

async function exportAsJson(docId: string) {
  const pages = await getAllPages(docId);
  const data = pages.map((page) => ({
    pageNumber: page.pageNumber,
    columns: page.columns,
    tokenEstimate: estimateTokens(page.text),
    extractedText: page.text,
    ai:
      page.pageAi?.status === "done" && page.pageAi.result
        ? {
            status: page.pageAi.status,
            result: page.pageAi.result,
            settingsHash: page.pageAi.settingsHash,
            updatedAt: page.pageAi.updatedAt,
          }
        : null,
  }));
  downloadBlob(
    JSON.stringify({ exportedAt: new Date().toISOString(), pages: data }, null, 2),
    "doclens-export.json",
    "application/json;charset=utf-8",
  );
  toast.success("Exported as JSON.");
}

/* ---------- Component ---------- */

export function RightPanel({
  docId,
  pageCount,
  analyzing,
  status,
  aiSummary,
  onPageAiChange,
  activePage,
  setActivePage,
}: Props) {
  const [tab, setTab] = useState<Tab>("pages");

  const doneCount = useMemo(
    () => Object.values(aiSummary).filter((e) => e.status === "done").length,
    [aiSummary],
  );
  const hasResults = pageCount > 0;

  return (
    <div className="flex h-full flex-col bg-surface">
      {/* Tabs */}
      <div className="flex items-center border-b border-border">
        <TabButton active={tab === "text"} onClick={() => setTab("text")}>
          Extracted Text
          <Badge>{pageCount || "—"}</Badge>
        </TabButton>
        <TabButton active={tab === "pages"} onClick={() => setTab("pages")}>
          Pages
          <Badge>
            {doneCount}/{pageCount || "—"}
          </Badge>
        </TabButton>
        <div className="ml-auto flex items-center gap-2 px-4">
          {hasResults && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => void exportAsMarkdown(docId)}
                className="rounded border border-border bg-background px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
                title="Export as Markdown"
              >
                ↓ md
              </button>
              <button
                onClick={() => void exportAsJson(docId)}
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

      {/* Page Navigation Controls */}
      {pageCount > 0 && (
        <div className="flex items-center justify-between border-b border-border bg-surface-2/40 backdrop-blur-md px-4 py-2 font-mono text-xs">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActivePage(Math.max(1, activePage - 1))}
              disabled={activePage <= 1}
              className="rounded border border-border bg-background/50 px-2.5 py-1 text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              ← Prev
            </button>
            <span className="text-muted-foreground">
              Page <span className="text-foreground font-bold">{activePage}</span> of {pageCount}
            </span>
            <button
              onClick={() => setActivePage(Math.min(pageCount, activePage + 1))}
              disabled={activePage >= pageCount}
              className="rounded border border-border bg-background/50 px-2.5 py-1 text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next →
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Go to:</span>
            <select
              value={activePage}
              onChange={(e) => setActivePage(Number(e.target.value))}
              className="rounded border border-border bg-background/50 px-2 py-1 font-mono text-[11px] text-foreground outline-none focus:border-primary"
            >
              {Array.from({ length: pageCount }, (_, i) => i + 1).map((pageNum) => (
                <option key={pageNum} value={pageNum} className="bg-surface">
                  Page {pageNum}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-hidden">
        {tab === "text" && (
          <ExtractedTextTab docId={docId} activePage={activePage} />
        )}

        {tab === "pages" && (
          <PageWorkstation
            docId={docId}
            pageCount={pageCount}
            aiSummary={aiSummary}
            onPageAiChange={onPageAiChange}
            activePage={activePage}
            setActivePage={setActivePage}
          />
        )}
      </div>
    </div>
  );
}

/* ---------- Extracted text tab — single active page ---------- */

function ExtractedTextTab({ docId, activePage }: { docId: string; activePage: number }) {
  if (activePage <= 0) {
    return (
      <div className="flex h-full items-center justify-center px-5 py-4">
        <div className="max-w-sm text-center text-sm text-muted-foreground">
          Select a page to view its extracted text.
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto px-5 py-4">
      <div className="right-panel-item-wrap w-full">
        <ExtractedPageRow docId={docId} pageNumber={activePage} />
      </div>
    </div>
  );
}

function ExtractedPageRow({ docId, pageNumber }: { docId: string; pageNumber: number }) {
  const [data, setData] = useState<{ text: string; columns: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await getPageData(docId, pageNumber);
      if (cancelled) return;
      setData(p ? { text: p.text, columns: p.columns } : { text: "", columns: 1 });
    })();
    return () => {
      cancelled = true;
    };
  }, [docId, pageNumber]);

  return (
    <article className="rounded-md border border-border bg-background/40">
      <header className="flex items-center justify-between border-b border-border px-3 py-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        <span>page {pageNumber}</span>
        <span className="flex items-center gap-3">
          <span>
            cols: <span className="text-foreground">{data?.columns ?? "—"}</span>
          </span>
          <span>
            tok:{" "}
            <span className="text-foreground">
              {data ? estimateTokens(data.text).toLocaleString() : "…"}
            </span>
          </span>
        </span>
      </header>
      <pre className="whitespace-pre-wrap break-words px-3 py-3 font-mono text-[12.5px] leading-relaxed text-foreground/90">
        {data === null ? (
          <span className="text-muted-foreground italic">loading…</span>
        ) : data.text ? (
          data.text
        ) : (
          <span className="text-muted-foreground italic">(no extractable text)</span>
        )}
      </pre>
    </article>
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
