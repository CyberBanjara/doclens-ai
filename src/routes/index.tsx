import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Dropzone } from "@/components/Dropzone";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  getKeyStatus,
  onKeyChange,
  openApiKeyModal,
  type KeyStatus,
} from "@/lib/openrouter";
import {
  createDoc,
  deleteDoc,
  getLastOpened,
  listDocs,
  StorageError,
  type DocSummary,
} from "@/lib/storage";


export const Route = createFileRoute("/")({
  component: DashboardPage,
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

const COLD_LAUNCH_KEY = "doclens.coldLaunchHandled";

function DashboardPage() {
  const navigate = useNavigate();
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<DocSummary | null>(null);
  const [keyStatus, setKeyStatus] = useState<KeyStatus>("unknown");

  useEffect(() => {
    setKeyStatus(getKeyStatus());
    return onKeyChange(() => setKeyStatus(getKeyStatus()));
  }, []);


  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await listDocs();
      if (cancelled) return;
      setDocs(list);
      setLoading(false);

      // Auto-restore only on cold launch (first dashboard mount this session).
      // Any subsequent navigation to "/" must show the dashboard.
      const alreadyHandled = sessionStorage.getItem(COLD_LAUNCH_KEY);
      sessionStorage.setItem(COLD_LAUNCH_KEY, "1");
      if (alreadyHandled) return;

      const last = await getLastOpened();
      if (last && list.some((d) => d.id === last)) {
        navigate({ to: "/doc/$id", params: { id: last } });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFile = async (f: File) => {
    try {
      const buf = await f.arrayBuffer();
      const rec = await createDoc(f, buf);
      navigate({ to: "/doc/$id", params: { id: rec.id } });
    } catch (e) {
      if (e instanceof StorageError && e.code === "QUOTA_EXCEEDED") {
        toast.error(e.message);
      } else {
        toast.error("Failed to save document. Please try again.");
        console.error(e);
      }
    }
  };

  const handleDeleteClick = (doc: DocSummary, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleteTarget(doc);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    const { id, fileName } = deleteTarget;
    setDeleteTarget(null);
    try {
      await deleteDoc(id);
      setDocs((prev) => prev.filter((d) => d.id !== id));
      toast.success(`"${fileName}" deleted.`);
    } catch (e) {
      toast.error("Failed to delete document.");
      console.error(e);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8">
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

        {keyStatus !== "valid" && (
          <div
            className={`mb-6 flex flex-col gap-3 rounded-lg border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
              keyStatus === "invalid"
                ? "border-destructive/40 bg-destructive/10"
                : "border-primary/40 bg-primary/5"
            }`}
          >
            <div className="min-w-0">
              <div
                className={`font-mono text-[10px] uppercase tracking-[0.2em] ${
                  keyStatus === "invalid" ? "text-destructive" : "text-primary"
                }`}
              >
                {keyStatus === "invalid" ? "api key invalid" : "get started"}
              </div>
              <p className="mt-1 text-sm text-foreground/85">
                {keyStatus === "invalid"
                  ? "Your saved OpenRouter key was rejected. Update it to keep translating."
                  : "Add your OpenRouter API key to start translating documents."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => openApiKeyModal()}
                className="rounded-md bg-primary px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-primary-foreground hover:opacity-90"
              >
                add api key
              </button>
              <Link
                to="/settings"
                className="rounded-md border border-border bg-background px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
              >
                settings
              </Link>
            </div>
          </div>
        )}


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
                      onClick={(e) => handleDeleteClick(d, e)}
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

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <span className="font-medium text-foreground">{deleteTarget?.fileName}</span> and all
              its AI results. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
