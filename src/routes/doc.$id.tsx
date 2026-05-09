import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { PdfViewer } from "@/components/PdfViewer";
import { RightPanel } from "@/components/RightPanel";
import { extractPdfPages } from "@/lib/pdf";
import {
  getDoc,
  getDocBlob,
  getPageAiSummary,
  setLastOpened,
  touchDoc,
  updateDoc,
  writePages,
  StorageError,
  type DocRecord,
  type PageAiSummaryEntry,
} from "@/lib/storage";

export const Route = createFileRoute("/doc/$id")({
  component: DocPage,
  head: () => ({
    meta: [{ title: "DocLens — Document" }],
  }),
});

function DocPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<DocRecord | null>(null);
  const [missing, setMissing] = useState(false);
  const [pageCount, setPageCount] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [status, setStatus] = useState("");
  /** Lightweight summary only — full text + result are read on demand per page. */
  const [aiSummary, setAiSummary] = useState<Record<number, PageAiSummaryEntry>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rec = await getDoc(id);
      if (cancelled) return;
      if (!rec) {
        setMissing(true);
        return;
      }
      setDoc(rec);
      setPageCount(rec.pageCount ?? 0);
      const sum = await getPageAiSummary(id);
      if (cancelled) return;
      setAiSummary(sum);
      await touchDoc(id);
      await setLastOpened(id);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const refreshSummary = async () => {
    const sum = await getPageAiSummary(id);
    setAiSummary(sum);
  };

  const handleAnalyze = async () => {
    if (!doc || analyzing) return;
    setAnalyzing(true);
    setStatus("extracting…");
    try {
      const blob = await getDocBlob(id);
      if (!blob) {
        toast.error("PDF binary not found in storage.");
        setAnalyzing(false);
        return;
      }
      let lastTotal = 0;
      const collected: { pageNumber: number; text: string; columns: number; garbageRatio: number }[] = [];
      await extractPdfPages(blob, (page, total) => {
        lastTotal = total;
        collected.push({
          pageNumber: page.pageNumber,
          text: page.text,
          columns: page.columns,
          garbageRatio: page.garbageRatio,
        });
        setPageCount(total);
        setStatus(`page ${page.pageNumber}/${total}`);
      });
      try {
        await writePages(id, collected);
        await updateDoc(id, { pageCount: collected.length });
        setPageCount(collected.length || lastTotal);
        await refreshSummary();
        setStatus(`done · ${collected.length} pages`);
        toast.success(`Extracted ${collected.length} pages successfully.`);
      } catch (e) {
        if (e instanceof StorageError && e.code === "QUOTA_EXCEEDED") {
          toast.error(e.message);
        } else {
          toast.error("Extraction complete but failed to save. Storage may be full.");
        }
      }
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : "unknown";
      setStatus("error: " + msg);
      toast.error(`Extraction failed: ${msg}`);
    } finally {
      setAnalyzing(false);
    }
  };

  /** Called by per-row workstation cards to keep the doc-level summary in sync. */
  const handlePageAiChange = (pageNumber: number, entry: PageAiSummaryEntry | null) => {
    setAiSummary((prev) => {
      const next = { ...prev };
      if (entry) next[pageNumber] = entry;
      else delete next[pageNumber];
      return next;
    });
  };

  if (missing) {
    return (
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <AppHeader />
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              document not found
            </div>
            <Link
              to="/"
              className="mt-3 inline-block rounded-md bg-primary px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-primary-foreground"
            >
              back to library
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <AppHeader />
        <div className="flex flex-1 items-center justify-center font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          loading…
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <AppHeader
        right={
          <>
            <div className="hidden items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 font-mono text-[11px] sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              <span className="max-w-[260px] truncate text-foreground">{doc.fileName}</span>
              <span className="text-muted-foreground">{(doc.fileSize / 1024).toFixed(1)} KB</span>
            </div>
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="rounded-md bg-primary px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {analyzing ? "analyzing…" : pageCount ? "re-extract" : "analyze document"}
            </button>
            <button
              onClick={() => navigate({ to: "/" })}
              className="rounded-md border border-border bg-background px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
            >
              library
            </button>
          </>
        }
      />
      <main className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-2">
        <section className="relative h-full overflow-hidden border-b border-border md:border-b-0 md:border-r">
          <PdfViewer docId={id} />
        </section>
        <section className="h-full overflow-hidden">
          <RightPanel
            docId={id}
            pageCount={pageCount}
            analyzing={analyzing}
            status={status}
            aiSummary={aiSummary}
            onPageAiChange={handlePageAiChange}
          />
        </section>
      </main>
    </div>
  );
}
