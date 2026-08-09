import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { SidebarLayout } from "@/components/SidebarLayout";
import { DocumentCard } from "@/components/DocumentCard";
import { Dropzone } from "@/components/Dropzone";
import { useIsMobile } from "@/hooks/use-mobile";
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
  validateKey,
  type KeyStatus,
} from "@/lib/openrouter";
import { createDoc, deleteDoc, listDocs, StorageError, type DocSummary } from "@/lib/storage";

export const Route = createFileRoute("/library")({
  component: LibraryPage,
  head: () => ({
    meta: [
      { title: "Local Library — Anuwad" },
      {
        name: "description",
        content: "Access and manage your private locally stored PDF documents in Anuwad.",
      },
    ],
  }),
});

function LibraryPage() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DocSummary | null>(null);
  const [keyStatus, setKeyStatus] = useState<KeyStatus>("unknown");

  useEffect(() => {
    setKeyStatus(getKeyStatus());
    void validateKey().then(() => setKeyStatus(getKeyStatus()));
    return onKeyChange(() => setKeyStatus(getKeyStatus()));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await listDocs();
      if (cancelled) return;
      setDocs(list);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
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

  const filteredDocs = useMemo(() => {
    if (!searchQuery.trim()) return docs;
    const q = searchQuery.toLowerCase();
    return docs.filter((d) => d.fileName.toLowerCase().includes(q));
  }, [docs, searchQuery]);

  return (
    <SidebarLayout pageTitle="Library" onNewDocument={handleFile}>
      {isMobile ? (
        <div className="space-y-4 px-4 pb-24 pt-3">
          {keyStatus !== "valid" && (
            <div
              className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 ${
                keyStatus === "invalid"
                  ? "border-destructive/40 bg-destructive/10"
                  : "border-primary/40 bg-primary/5"
              }`}
            >
              <p
                className={`text-xs leading-snug ${keyStatus === "invalid" ? "text-destructive" : "text-foreground/85"}`}
              >
                {keyStatus === "invalid"
                  ? "API key was rejected."
                  : "Set up your API key to translate."}
              </p>
              <button
                onClick={() => openApiKeyModal()}
                className="shrink-0 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground transition-transform active:scale-95"
              >
                Fix
              </button>
            </div>
          )}

          {/* Search bar on mobile when docs exist */}
          {docs.length > 3 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search documents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface/50 pl-9 pr-3 py-2 text-xs outline-none focus:border-primary transition-colors"
              />
            </div>
          )}

          {!loading && docs.length === 0 ? (
            <div className="py-8">
              <Dropzone onFile={handleFile} gridCard />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Dropzone onFile={handleFile} gridCard />
              {filteredDocs.map((d) => (
                <DocumentCard key={d.id} doc={d} onDelete={handleDeleteClick} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="mx-auto max-w-7xl space-y-6 p-8">
          {/* Header toolbar with search */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-foreground">Local Library</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {docs.length} {docs.length === 1 ? "document" : "documents"} stored locally on this device
              </p>
            </div>

            {docs.length > 0 && (
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search local documents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-border bg-surface/50 pl-9 pr-4 py-2 text-xs outline-none focus:border-primary transition-colors shadow-sm"
                />
              </div>
            )}
          </div>

          {/* API Key Banner */}
          {keyStatus !== "valid" && (
            <div
              className={`flex flex-col gap-3 rounded-[18px] border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
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
                    ? "The server OpenRouter key was rejected. Update the environment variable to keep translating."
                    : "Configure OPENROUTER_API_KEY on the server to start translating documents."}
                </p>
              </div>
              <button
                onClick={() => openApiKeyModal()}
                className="rounded-full bg-primary px-4 py-1.5 font-mono text-[11px] uppercase tracking-widest text-primary-foreground hover:opacity-90 active:scale-95 transition-all shadow-sm"
              >
                check key
              </button>
            </div>
          )}

          {!loading && docs.length === 0 ? (
            <div className="h-64 max-w-xl mx-auto">
              <Dropzone onFile={handleFile} />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              <Dropzone onFile={handleFile} gridCard />
              {filteredDocs.map((d) => (
                <DocumentCard key={d.id} doc={d} onDelete={handleDeleteClick} />
              ))}
            </div>
          )}
        </div>
      )}

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
