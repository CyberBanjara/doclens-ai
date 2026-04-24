import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Dropzone } from "@/components/Dropzone";
import {
  createDoc,
  deleteDoc,
  getLastOpened,
  listDocs,
  setLastOpened,
  type DocSummary,
} from "@/lib/storage";

export const Route = createFileRoute("/")({
  component: DashboardPage,
  ssr: false,
  head: () => ({
    meta: [
      { title: "DocLens — Document Library" },
      {
        name: "description",
        content:
          "Your private, browser-only PDF library. Upload, inspect, and run AI on documents — nothing leaves your device unless you choose.",
      },
    ],
  }),
});

function DashboardPage() {
  const navigate = useNavigate();
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRestore, setAutoRestore] = useState(true);

  useEffect(() => {
    (async () => {
      const list = await listDocs();
      setDocs(list);
      setLoading(false);

      // Auto-restore last opened doc on launch
      if (autoRestore) {
        const last = await getLastOpened();
        if (last && list.some((d) => d.id === last)) {
          navigate({ to: "/doc/$id", params: { id: last } });
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFile = async (f: File) => {
    setAutoRestore(false);
    const buf = await f.arrayBuffer();
    const rec = await createDoc(f, buf);
    navigate({ to: "/doc/$id", params: { id: rec.id } });
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this document and all its AI results?")) return;
    await deleteDoc(id);
    setDocs((prev) => prev.filter((d) => d.id !== id));
  };

  const stayHere = async () => {
    setAutoRestore(false);
    await setLastOpened(null);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8" onClick={stayHere}>
        <div className="mb-6 flex items-baseline justify-between">
          <div>
            <h2 className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
              library
            </h2>
            <p className="mt-1 text-2xl font-semibold tracking-tight">Your documents</p>
          </div>
          <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            {loading ? "loading…" : `${docs.length} document${docs.length === 1 ? "" : "s"}`}
          </div>
        </div>

        <div className="mb-8 h-44">
          <Dropzone onFile={handleFile} />
        </div>

        {!loading && docs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-surface/50 p-10 text-center">
            <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              empty library
            </div>
            <p className="mt-2 text-sm text-foreground/80">
              Upload a PDF above to get started.
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {docs.map((d) => (
              <li key={d.id}>
                <Link
                  to="/doc/$id"
                  params={{ id: d.id }}
                  className="group block rounded-lg border border-border bg-surface p-4 transition-colors hover:border-border-strong hover:bg-surface-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground group-hover:text-primary">
                        {d.fileName}
                      </div>
                      <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        {(d.fileSize / 1024).toFixed(1)} KB
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleDelete(d.id, e)}
                      className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                      aria-label="Delete document"
                    >
                      del
                    </button>
                  </div>
                  <div className="mt-4 flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    <span>
                      <span className="text-foreground">{d.pageCount || "—"}</span> pages
                    </span>
                    <span className="flex items-center gap-2">
                      {d.hasExtraction && (
                        <span className="rounded bg-primary/15 px-1.5 py-0.5 text-primary">
                          extracted
                        </span>
                      )}
                      {d.aiResultCount > 0 && (
                        <span className="rounded bg-accent/15 px-1.5 py-0.5 text-accent">
                          {d.aiResultCount} ai
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="mt-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    opened {formatRelative(d.lastOpenedAt)}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function formatRelative(ts: number): string {
  if (!ts) return "never";
  const diff = Date.now() - ts;
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}
