import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { PdfViewer } from "@/components/PdfViewer";
import { RightPanel } from "@/components/RightPanel";
import { extractPdfPages, type PageExtraction } from "@/lib/pdf";
import {
  getDoc,
  setLastOpened,
  touchDoc,
  updateDoc,
  upsertPageAi,
  StorageError,
  type DocRecord,
  type PageAi,
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
  const [pages, setPages] = useState<PageExtraction[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [status, setStatus] = useState("");
  const [pageAi, setPageAi] = useState<Record<number, PageAi>>({});
  const [pdfSyncTarget, setPdfSyncTarget] = useState<number | null>(null);
  const [panelSyncTarget, setPanelSyncTarget] = useState<number | null>(null);
  const syncLockRef = useRef<number>(0);

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
      setPages(rec.pages ?? []);
      setTotalPages(rec.pageCount || rec.pages?.length || 0);
      setPageAi(rec.pageAi ?? {});
      await touchDoc(id);
      await setLastOpened(id);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleAnalyze = async () => {
    if (!doc || analyzing) return;
    setAnalyzing(true);
    setPages([]);
    setStatus("extracting…");
    try {
      const collected: PageExtraction[] = [];
      await extractPdfPages(doc.data, (page, total) => {
        setTotalPages(total);
        collected.push(page);
        setPages([...collected]);
        setStatus(`page ${page.pageNumber}/${total}`);
      });
      setStatus(`done · ${collected.length} pages`);
      try {
        await updateDoc(id, { pages: collected, pageCount: collected.length });
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

  const handleUpdatePage = (pageNumber: number, patch: Partial<PageAi>) => {
    setPageAi((prev) => {
      const existing = prev[pageNumber] ?? { pageNumber, status: "idle" as const };
      return { ...prev, [pageNumber]: { ...existing, ...patch, pageNumber } };
    });
    void upsertPageAi(id, pageNumber, patch);
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
              {analyzing ? "analyzing…" : pages.length ? "re-extract" : "analyze document"}
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
          <PdfViewer
            data={doc.data}
            initialScrollTop={doc.scrollTop}
            onScroll={(top) => updateDoc(id, { scrollTop: top })}
            syncToPage={pdfSyncTarget}
            onPageChange={(p) => {
              if (Date.now() < syncLockRef.current) return;
              syncLockRef.current = Date.now() + 600;
              setPanelSyncTarget(p);
            }}
          />
        </section>
        <section className="h-full overflow-hidden">
          <RightPanel
            pages={pages}
            totalPages={totalPages || pages.length}
            analyzing={analyzing}
            status={status}
            pageAi={pageAi}
            onUpdatePage={handleUpdatePage}
            syncToPage={panelSyncTarget}
            onPageChange={(p) => {
              if (Date.now() < syncLockRef.current) return;
              syncLockRef.current = Date.now() + 600;
              setPdfSyncTarget(p);
            }}
          />
        </section>
      </main>
    </div>
  );
}
