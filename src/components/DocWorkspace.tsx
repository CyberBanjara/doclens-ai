import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { PdfViewer } from "./PdfViewer";
import { RightPanel } from "./RightPanel";
import { SettingsPanel } from "./SettingsPanel";
import { extractPdfPages, type PageExtraction } from "@/lib/pdf";
import {
  getDoc,
  updateDoc,
  deleteDoc,
  getSetting,
  setSetting,
  settingsKeys,
  type DocRecord,
} from "@/lib/storage";
import { fetchModels, modelContext, type ORModel } from "@/lib/openrouter";

export function DocWorkspace({ id }: { id: string }) {
  const navigate = useNavigate();
  const [doc, setDoc] = useState<DocRecord | null>(null);
  const [pages, setPages] = useState<PageExtraction[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [status, setStatus] = useState("");
  const [modelId, setModelId] = useState("");
  const [models, setModels] = useState<ORModel[] | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [missing, setMissing] = useState(false);

  // Load document & last-used model
  useEffect(() => {
    (async () => {
      const d = await getDoc(id);
      if (!d) {
        setMissing(true);
        return;
      }
      setDoc(d);
      setPages(d.pages ?? []);
      setTotalPages(d.pages?.length ?? 0);
      const last = (await getSetting<string>(settingsKeys.lastModelId)) ?? "";
      setModelId(last);
    })();
  }, [id]);

  // Fetch model registry once (for context-window lookup)
  useEffect(() => {
    fetchModels()
      .then(setModels)
      .catch(() => setModels([]));
  }, []);

  const selectedModel = models?.find((m) => m.id === modelId);
  const modelContextTokens = selectedModel ? modelContext(selectedModel) : 8000;

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
      await updateDoc(doc.id, { pages: collected });
    } catch (err) {
      console.error(err);
      setStatus("error: " + (err instanceof Error ? err.message : "unknown"));
    } finally {
      setAnalyzing(false);
    }
  };

  const handleDelete = async () => {
    if (!doc) return;
    if (!confirm(`Delete "${doc.name}"?`)) return;
    await deleteDoc(doc.id);
    navigate({ to: "/" });
  };

  const handleSelectModel = async (mid: string) => {
    setModelId(mid);
    await setSetting(settingsKeys.lastModelId, mid);
  };

  if (missing) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <div className="text-center">
          <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            document not found
          </div>
          <Link
            to="/"
            className="mt-4 inline-block rounded-md bg-primary px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-primary-foreground"
          >
            back to library
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between gap-3 border-b border-border bg-surface px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background font-mono text-sm text-muted-foreground hover:text-foreground"
            aria-label="Back to library"
          >
            ←
          </Link>
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary font-mono text-sm font-bold text-primary-foreground">
            ◐
          </div>
          <div className="flex min-w-0 items-baseline gap-2">
            <h1 className="truncate text-base font-semibold tracking-tight">
              {doc?.name ?? "loading…"}
            </h1>
            {doc && (
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                {(doc.size / 1024).toFixed(1)} kb
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={handleAnalyze}
            disabled={!doc || analyzing}
            className="rounded-md bg-primary px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {analyzing ? "analyzing…" : pages.length ? "re-analyze" : "analyze document"}
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="rounded-md border border-border bg-background px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >
            ⚙
          </button>
          <button
            onClick={handleDelete}
            className="rounded-md border border-border bg-background px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-destructive"
          >
            delete
          </button>
        </div>
      </header>

      <main className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-2">
        <section className="relative h-full overflow-hidden border-b border-border md:border-b-0 md:border-r">
          <PdfViewer data={doc?.data ?? null} />
        </section>
        <section className="h-full overflow-hidden">
          <RightPanel
            pages={pages}
            totalPages={totalPages || pages.length}
            modelId={modelId}
            modelContextTokens={modelContextTokens}
            analyzing={analyzing}
            status={status}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        </section>
      </main>

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        selectedModel={modelId}
        onSelectModel={handleSelectModel}
      />
    </div>
  );
}
