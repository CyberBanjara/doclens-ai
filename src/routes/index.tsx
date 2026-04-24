import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Dropzone } from "@/components/Dropzone";
import { PdfViewer } from "@/components/PdfViewer";
import { RightPanel } from "@/components/RightPanel";
import { extractPdfPages, type PageExtraction } from "@/lib/pdf";
import { MODELS } from "@/lib/models";
import { clearDoc, loadDoc, saveDoc } from "@/lib/storage";

export const Route = createFileRoute("/")({
  component: DocLensPage,
  ssr: false,
  head: () => ({
    meta: [
      { title: "DocLens — Document → AI pipeline inspector" },
      {
        name: "description",
        content:
          "DocLens is a privacy-first, browser-only PDF inspector that shows exactly what an LLM would receive — extracted text, chunking, and the raw API request — before any call is made.",
      },
      { property: "og:title", content: "DocLens — Document → AI pipeline inspector" },
      {
        property: "og:description",
        content:
          "See exactly what an LLM API would receive from your PDF — fully client-side, no uploads.",
      },
    ],
  }),
});

function DocLensPage() {
  const [file, setFile] = useState<{ name: string; size: number } | null>(null);
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);
  const [pages, setPages] = useState<PageExtraction[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [modelId, setModelId] = useState<string>(MODELS[0].id);
  const [analyzing, setAnalyzing] = useState(false);
  const [status, setStatus] = useState("");

  // Restore on mount
  useEffect(() => {
    (async () => {
      const stored = await loadDoc();
      if (stored) {
        setFile({ name: stored.fileName, size: stored.fileSize });
        setPdfData(stored.data);
        setPages(stored.pages ?? []);
        setModelId(stored.modelId);
      }
    })();
  }, []);

  const handleFile = async (f: File) => {
    const buf = await f.arrayBuffer();
    setFile({ name: f.name, size: f.size });
    setPdfData(buf);
    setPages([]);
    setTotalPages(0);
    setStatus("");
    await saveDoc({ fileName: f.name, fileSize: f.size, data: buf, pages: null, modelId });
  };

  const handleAnalyze = async () => {
    if (!pdfData || analyzing) return;
    setAnalyzing(true);
    setPages([]);
    setStatus("extracting…");
    try {
      const collected: PageExtraction[] = [];
      await extractPdfPages(pdfData, (page, total) => {
        setTotalPages(total);
        collected.push(page);
        setPages([...collected]);
        setStatus(`page ${page.pageNumber}/${total}`);
      });
      setStatus(`done · ${collected.length} pages`);
      if (file) {
        await saveDoc({
          fileName: file.name,
          fileSize: file.size,
          data: pdfData,
          pages: collected,
          modelId,
        });
      }
    } catch (err) {
      console.error(err);
      setStatus("error: " + (err instanceof Error ? err.message : "unknown"));
    } finally {
      setAnalyzing(false);
    }
  };

  const handleReset = async () => {
    await clearDoc();
    setFile(null);
    setPdfData(null);
    setPages([]);
    setTotalPages(0);
    setStatus("");
  };

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-border bg-surface px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary font-mono text-sm font-bold text-primary-foreground">
            ◐
          </div>
          <div className="flex items-baseline gap-2">
            <h1 className="text-base font-semibold tracking-tight">DocLens</h1>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              document → ai pipeline inspector
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {file && (
            <div className="hidden items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 font-mono text-[11px] sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              <span className="max-w-[260px] truncate text-foreground">{file.name}</span>
              <span className="text-muted-foreground">
                {(file.size / 1024).toFixed(1)} KB
              </span>
            </div>
          )}
          <button
            onClick={handleAnalyze}
            disabled={!pdfData || analyzing}
            className="rounded-md bg-primary px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {analyzing ? "analyzing…" : "analyze document"}
          </button>
          {file && (
            <button
              onClick={handleReset}
              className="rounded-md border border-border bg-background px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
            >
              reset
            </button>
          )}
        </div>
      </header>

      {/* Split */}
      <main className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-2">
        <section className="relative h-full overflow-hidden border-b border-border md:border-b-0 md:border-r">
          {pdfData ? (
            <PdfViewer data={pdfData} />
          ) : (
            <div className="h-full p-6">
              <Dropzone onFile={handleFile} />
            </div>
          )}
        </section>
        <section className="h-full overflow-hidden">
          <RightPanel
            pages={pages}
            totalPages={totalPages || pages.length}
            modelId={modelId}
            onModelChange={(id) => {
              setModelId(id);
              if (file && pdfData) {
                saveDoc({
                  fileName: file.name,
                  fileSize: file.size,
                  data: pdfData,
                  pages,
                  modelId: id,
                });
              }
            }}
            analyzing={analyzing}
            status={status}
          />
        </section>
      </main>
    </div>
  );
}
