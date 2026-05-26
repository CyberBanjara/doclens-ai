import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { SidebarLayout } from "@/components/SidebarLayout";
import { DocumentCard } from "@/components/DocumentCard";
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
    <SidebarLayout
      pageTitle="Library"
      onNewDocument={handleFile}
      topBarRight={
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-border bg-surface px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            {loading ? "loading…" : `${docs.length} document${docs.length === 1 ? "" : "s"}`}
          </span>
        </div>
      }
    >
      <div className="mx-auto max-w-7xl space-y-8 p-8">
        {/* Hero Section */}
        <section>
          <div className="mb-6">
            <h3 className="text-4xl font-bold tracking-tight text-foreground">
              Intelligence Library
            </h3>
            <p className="mt-2 max-w-2xl text-base text-muted-foreground">
              Upload documents for surgical-precision analysis, automated summaries, and multi-language extraction.
            </p>
          </div>

          {/* API Key Banner */}
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
              <button
                onClick={() => openApiKeyModal()}
                className="rounded-md bg-primary px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-primary-foreground hover:opacity-90"
              >
                add api key
              </button>
            </div>
          )}

          {/* Drag & Drop Zone */}
          <div className="h-56">
            <Dropzone onFile={handleFile} />
          </div>
        </section>

        {/* Documents Grid Section */}
        <section>
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-primary">☰</span>
              <span className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
                Recent Documents
              </span>
            </div>
            <div className="flex gap-2">
              <button className="rounded-lg bg-surface-2 p-2 text-muted-foreground hover:text-primary transition-colors" aria-label="Grid view">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
              </button>
              <button className="rounded-lg bg-surface p-2 text-muted-foreground hover:text-primary transition-colors" aria-label="List view">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" d="M3 6h18M3 12h18M3 18h18" />
                </svg>
              </button>
            </div>
          </div>

          {!loading && docs.length === 0 ? (
            <div className="glass-panel rounded-xl border-dashed p-10 text-center">
              <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                empty library
              </div>
              <p className="mt-2 text-sm text-foreground/80">
                Upload a PDF above to get started.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {docs.map((d) => (
                <DocumentCard key={d.id} doc={d} onDelete={handleDeleteClick} />
              ))}
            </div>
          )}
        </section>
      </div>

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
    </SidebarLayout>
  );
}
