import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { SidebarLayout } from "@/components/SidebarLayout";
import { listR2Files, deleteFromR2, downloadFromR2 } from "@/lib/r2";
import { createDoc } from "@/lib/storage";
import { LoadingLogo } from "@/components/LoadingLogo";
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

export const Route = createFileRoute("/global-library")({
  component: GlobalLibraryPage,
  head: () => ({
    meta: [{ title: "Anuwad — Global Library (Cloudflare R2)" }],
  }),
});

interface R2File {
  key: string;
  size: number;
  lastModified?: string;
  url?: string;
}

function formatBytes(bytes: number, decimals = 2) {
  if (!bytes) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function formatDate(dateStr?: string) {
  if (!dateStr) return "Unknown";
  try {
    const d = new Date(dateStr);
    return d.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch (e) {
    return dateStr;
  }
}

function base64ToBlob(base64: string, mimeType = "application/pdf") {
  const byteCharacters = atob(base64);
  const byteArrays = [];
  for (let offset = 0; offset < byteCharacters.length; offset += 512) {
    const slice = byteCharacters.slice(offset, offset + 512);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    byteArrays.push(byteArray);
  }
  return new Blob(byteArrays, { type: mimeType });
}

function GlobalLibraryPage() {
  const navigate = useNavigate();
  const [files, setFiles] = useState<R2File[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [importingKey, setImportingKey] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<R2File | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  const fetchFiles = async (silent = false) => {
    if (!silent) setLoading(true);
    setErrorMsg(null);
    try {
      const res = await listR2Files();
      setFiles(res.files || []);
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e?.message || "Failed to list files from Cloudflare R2.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchFiles();
  }, []);

  const handleImport = async (file: R2File) => {
    if (importingKey) return;
    setImportingKey(file.key);
    const toastId = toast.loading(`Downloading "${file.key}"...`);
    try {
      const res = await downloadFromR2({ data: { key: file.key } });
      toast.loading("Saving to local Library...", { id: toastId });

      const blob = base64ToBlob(res.base64Data, res.contentType);
      const docFile = new File([blob], file.key, { type: res.contentType });
      const arrayBuffer = await docFile.arrayBuffer();

      const docRec = await createDoc(docFile, arrayBuffer);
      toast.success(`Successfully imported "${file.key}" to your local library!`, { id: toastId });

      navigate({ to: "/doc/$id", params: { id: docRec.id } });
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || `Failed to import "${file.key}".`, { id: toastId });
    } finally {
      setImportingKey(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    setDeletingKey(target.key);
    const toastId = toast.loading(`Deleting "${target.key}" from R2...`);
    try {
      await deleteFromR2({ data: { key: target.key } });
      toast.success(`"${target.key}" deleted from Cloudflare R2.`, { id: toastId });
      setFiles((prev) => prev.filter((f) => f.key !== target.key));
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to delete file from R2.", { id: toastId });
    } finally {
      setDeletingKey(null);
    }
  };

  return (
    <SidebarLayout
      pageTitle="Global Library"
      topBarRight={
        <div className="flex items-center gap-3">
          <button
            onClick={() => void fetchFiles()}
            disabled={loading || !!importingKey || !!deletingKey}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground hover:bg-surface-2 disabled:opacity-50"
          >
            {loading ? "refreshing…" : "refresh"}
          </button>
        </div>
      }
    >
      <div className="mx-auto max-w-7xl space-y-8 p-8">
        <section>
          <div className="mb-6">
            <h1 className="text-4xl font-bold tracking-tight text-foreground">
              Cloudflare R2 Shared Space
            </h1>
            <p className="mt-2 max-w-2xl text-base text-muted-foreground">
              A shared cloud vault powered by Cloudflare R2. Upload local documents from the Workstation, view what's shared in the cloud, and import shared documents to translate offline.
            </p>
          </div>

          {errorMsg ? (
            <div className="rounded-[18px] border border-destructive/40 bg-destructive/10 p-6 text-center">
              <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-destructive">
                configuration error
              </div>
              <p className="mt-2 text-sm text-foreground/95">{errorMsg}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Make sure you have populated the Cloudflare R2 credentials (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`) in your `.env` file.
              </p>
              <button
                onClick={() => void fetchFiles()}
                className="mt-4 rounded-full bg-primary px-4 py-1.5 font-mono text-[11px] uppercase tracking-widest text-primary-foreground hover:opacity-90 active:scale-95 transition-all shadow-sm"
              >
                Retry
              </button>
            </div>
          ) : loading ? (
            <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-border bg-surface/30">
              <LoadingLogo size={72} label="Listing Cloudflare R2 files..." />
            </div>
          ) : files.length === 0 ? (
            <div className="glass-panel rounded-xl border-dashed p-10 text-center">
              <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                empty cloud vault
              </div>
              <p className="mt-2 text-sm text-foreground/80">
                There are no shared PDFs in the R2 bucket. Upload a document from the Workstation to see it here.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-surface/30 backdrop-blur-md">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-2/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <th className="px-6 py-4">File Name</th>
                      <th className="px-6 py-4">Size</th>
                      <th className="px-6 py-4">Uploaded On</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {files.map((file) => {
                      const isImporting = importingKey === file.key;
                      const isDeleting = deletingKey === file.key;

                      return (
                        <tr
                          key={file.key}
                          className="group transition-colors hover:bg-surface-2/20"
                        >
                          <td className="px-6 py-4 font-medium text-foreground">
                            <div className="flex items-center gap-3">
                              <span className="text-xl">📄</span>
                              <span className="truncate max-w-md block" title={file.key}>
                                {file.key}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-muted-foreground">
                            {formatBytes(file.size)}
                          </td>
                          <td className="px-6 py-4 text-muted-foreground">
                            {formatDate(file.lastModified)}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-3">
                              <button
                                onClick={() => handleImport(file)}
                                disabled={!!importingKey || !!deletingKey}
                                className="rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-all hover:bg-primary/20 active:scale-95 disabled:opacity-50 cursor-pointer"
                              >
                                {isImporting ? "Importing…" : "Import"}
                              </button>
                              <button
                                onClick={() => setDeleteTarget(file)}
                                disabled={!!importingKey || !!deletingKey}
                                className="rounded-lg border border-destructive/20 px-3 py-1.5 text-xs font-medium text-destructive transition-all hover:bg-destructive/10 active:scale-95 disabled:opacity-50 cursor-pointer"
                              >
                                {isDeleting ? "Deleting…" : "Delete"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete from cloud?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <span className="font-medium text-foreground">{deleteTarget?.key}</span> from the
              shared Cloudflare R2 bucket. Your local copy (if imported) will not be affected. This
              action cannot be undone.
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
