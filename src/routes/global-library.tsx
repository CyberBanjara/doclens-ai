import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Globe, RefreshCw, Search, X, Layers, FolderOpen, Upload } from "lucide-react";
import { SidebarLayout } from "@/components/SidebarLayout";
import { deleteFromR2, downloadFromR2 } from "@/lib/r2";
import { getCachedR2Files, setCachedR2Files } from "@/lib/r2-cache";
import { createDoc, listDocs, type DocSummary } from "@/lib/storage";
import { LoadingLogo } from "@/components/LoadingLogo";
import { getSyncConfig } from "@/lib/sync";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  formatBytes,
  base64ToBlob,
  parseFileCategory,
  type R2File,
  type ParsedR2File,
} from "@/lib/file-utils";
import { DeleteFileDialog } from "@/components/DeleteFileDialog";
import { R2UploadDialog } from "@/components/R2UploadDialog";
import { useAuth } from "@/context/AuthContext";
import { CategoryVerticalHeap, getCategoryMeta } from "@/components/CategoryVerticalHeap";
import { GlobalLibraryCard } from "@/components/GlobalLibraryCard";

export const Route = createFileRoute("/global-library")({
  component: GlobalLibraryPage,
  head: () => ({
    meta: [
      { title: "Anuwad — Global Library (Cloudflare R2)" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

const STANDARD_CATEGORIES: Record<string, { label: string; icon: string; desc: string }> = {
  history: { label: "History", icon: "📜", desc: "history/" },
  economics: { label: "Economics", icon: "📈", desc: "economics/" },
  geography: { label: "Geography", icon: "🌍", desc: "geography/" },
  civics: { label: "Civics", icon: "🏛️", desc: "civics/" },
  science: { label: "Science", icon: "🔬", desc: "science/" },
  uncategorized: { label: "Uncategorized", icon: "📂", desc: "uncategorized/" },
};

function GlobalLibraryPage() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { user, isAdmin, loading: authLoading, signInWithGoogle } = useAuth();

  const [files, setFiles] = useState<R2File[]>([]);
  const [localDocs, setLocalDocs] = useState<DocSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [importingKey, setImportingKey] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<R2File | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [syncEnabled, setSyncEnabled] = useState(true);

  // Category navigation & search
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // R2 Direct Upload states
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadCategory, setUploadCategory] = useState<string>("uncategorized");
  const [customUploadCategory, setCustomUploadCategory] = useState<string>("");
  const [uploadingDirect, setUploadingDirect] = useState(false);

  const handleDirectUpload = async () => {
    if (!uploadFile || uploadingDirect) return;
    setUploadingDirect(true);
    const toastId = toast.loading(`Uploading "${uploadFile.name}" to Cloudflare R2...`);
    try {
      const { uploadToR2, uploadThumbnailToR2 } = await import("@/lib/r2");
      const { renderPageToJpegBlob } = await import("@/hooks/useThumbnail");
      const { fileToBase64 } = await import("@/lib/file-utils");

      const base64Data = await fileToBase64(uploadFile);
      const selectedCat =
        uploadCategory === "custom" ? customUploadCategory.trim() : uploadCategory;

      const res = await uploadToR2({
        data: {
          fileName: uploadFile.name,
          contentType: uploadFile.type || "application/pdf",
          base64Data,
          category: selectedCat,
        },
      });

      try {
        const thumbBlob = await renderPageToJpegBlob(uploadFile);
        const thumbBase64 = await fileToBase64(thumbBlob);
        await uploadThumbnailToR2({
          data: {
            fileKey: res.key,
            base64Data: thumbBase64,
          },
        });
      } catch (thumbErr) {
        console.warn("Could not generate thumbnail during direct upload:", thumbErr);
      }

      toast.success(`Successfully uploaded "${uploadFile.name}" to R2 (${res.category})!`, {
        id: toastId,
      });
      setUploadDialogOpen(false);
      setUploadFile(null);
      void fetchFiles(false, true);
    } catch (e: any) {
      console.error("Direct upload failed:", e);
      toast.error(e?.message || "Failed to upload file to Cloudflare R2.", { id: toastId });
    } finally {
      setUploadingDirect(false);
    }
  };

  const fetchFiles = async (silent = false, forceRefresh = false) => {
    if (!silent) setLoading(true);
    setErrorMsg(null);
    try {
      const [res, docs] = await Promise.all([
        getCachedR2Files({ forceRefresh }),
        listDocs().catch(() => []),
      ]);
      setFiles(res.files || []);
      setLocalDocs(docs || []);
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e?.message || "Failed to list files from Cloudflare R2.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const config = await getSyncConfig();
        if (!cancelled) {
          setSyncEnabled(config.enabled);
        }
      } catch (e) {
        console.error("Failed to fetch global sync config:", e);
      }
      if (!cancelled) {
        void fetchFiles();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const parsedFiles: ParsedR2File[] = useMemo(() => {
    return files.map(parseFileCategory);
  }, [files]);

  // Aggregate Category counts & size
  const categoryStats = useMemo(() => {
    const map: Record<string, { count: number; totalSize: number }> = {};
    for (const f of parsedFiles) {
      if (!map[f.category]) {
        map[f.category] = { count: 0, totalSize: 0 };
      }
      map[f.category].count += 1;
      map[f.category].totalSize += f.size;
    }
    return map;
  }, [parsedFiles]);

  const categoriesList = useMemo(() => {
    const keys = new Set([...Object.keys(STANDARD_CATEGORIES), ...Object.keys(categoryStats)]);
    return Array.from(keys);
  }, [categoryStats]);

  // Map of local doc filename -> doc id
  const localDocsMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const d of localDocs) {
      if (d.fileName) {
        map[d.fileName.toLowerCase()] = d.id;
      }
    }
    return map;
  }, [localDocs]);

  const filteredFiles = useMemo(() => {
    return parsedFiles.filter((f) => {
      const matchesCat = activeCategory === "all" || f.category === activeCategory;
      const matchesSearch =
        !searchQuery.trim() ||
        f.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.key.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCat && matchesSearch;
    });
  }, [parsedFiles, activeCategory, searchQuery]);

  const activeCategoryMeta = useMemo(() => {
    return getCategoryMeta(activeCategory);
  }, [activeCategory]);

  const totalLibrarySize = useMemo(() => {
    return parsedFiles.reduce((sum, f) => sum + f.size, 0);
  }, [parsedFiles]);

  const handleImport = async (file: R2File) => {
    if (importingKey) return;
    setImportingKey(file.key);
    const toastId = toast.loading(`Downloading "${file.key}"...`);
    try {
      const res = await downloadFromR2({ data: { key: file.key } });
      toast.loading("Saving to local Library...", { id: toastId });

      const blob = base64ToBlob(res.base64Data, res.contentType);
      const cleanName = file.key.split("/").pop() || file.key;
      const docFile = new File([blob], cleanName, { type: res.contentType });
      const arrayBuffer = await docFile.arrayBuffer();

      const docRec = await createDoc(docFile, arrayBuffer);

      // Retrieve saved translation config from Supabase or active settings & sync
      try {
        const { fetchSupabaseExtraction } = await import("@/lib/supabase");
        const { applyTranslationConfig, getTranslationConfig } = await import("@/lib/openrouter");
        const { syncFromSupabase } = await import("@/lib/sync");

        const supaRes = await fetchSupabaseExtraction({ data: { key: file.key } });
        if (supaRes && supaRes.found && supaRes.record?.text) {
          try {
            const parsed = JSON.parse(supaRes.record.text);
            if (parsed && typeof parsed === "object" && parsed.translationConfig) {
              applyTranslationConfig(parsed.translationConfig, docRec.id);
            } else {
              applyTranslationConfig(getTranslationConfig(), docRec.id);
            }
          } catch {
            applyTranslationConfig(getTranslationConfig(), docRec.id);
          }
        } else {
          applyTranslationConfig(getTranslationConfig(), docRec.id);
        }

        // Sync pages & AI outputs from Supabase
        await syncFromSupabase(docRec.id, file.key);
      } catch (syncErr) {
        console.warn("Error loading translation settings from Supabase:", syncErr);
        const { applyTranslationConfig, getTranslationConfig } = await import("@/lib/openrouter");
        applyTranslationConfig(getTranslationConfig(), docRec.id);
      }

      toast.success(`Successfully imported "${cleanName}" to your local library!`, { id: toastId });

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
      setFiles((prev) => {
        const next = prev.filter((f) => f.key !== target.key);
        setCachedR2Files(next);
        return next;
      });
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to delete file from R2.", { id: toastId });
    } finally {
      setDeletingKey(null);
    }
  };

  const [syncingThumbnails, setSyncingThumbnails] = useState(false);

  const handleSyncAllThumbnails = async () => {
    if (syncingThumbnails || files.length === 0) return;
    setSyncingThumbnails(true);
    const toastId = toast.loading("Checking & syncing missing PDF thumbnails in R2...");
    let syncedCount = 0;
    try {
      const { getThumbnailFromR2, downloadFromR2 } = await import("@/lib/r2");
      const { renderPageToJpegBlob } = await import("@/hooks/useThumbnail");
      const { base64ToBlob } = await import("@/lib/file-utils");
      const { uploadBlobAsThumbnailToR2 } = await import("@/hooks/useR2Thumbnail");

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const check = await getThumbnailFromR2({ data: { fileKey: file.key } });
          if (!check.found) {
            toast.loading(
              `Generating thumbnail (${i + 1}/${files.length}): "${file.key.split("/").pop() || file.key}"...`,
              { id: toastId },
            );
            const res = await downloadFromR2({ data: { key: file.key } });
            const pdfBlob = base64ToBlob(res.base64Data, res.contentType);
            // Drop base64 string reference immediately to free heap
            res.base64Data = "";
            const thumbBlob = await renderPageToJpegBlob(pdfBlob);
            const ok = await uploadBlobAsThumbnailToR2(file.key, thumbBlob);
            if (ok) syncedCount++;

            // Brief yield to allow browser garbage collection between large files
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
        } catch (err) {
          console.warn(`Failed syncing thumbnail for ${file.key}:`, err);
        }
      }

      if (syncedCount > 0) {
        toast.success(
          `Successfully generated and saved ${syncedCount} missing thumbnails to Cloudflare R2!`,
          { id: toastId },
        );
        void fetchFiles(true, true);
      } else {
        toast.success("All R2 PDF thumbnails are already generated and stored in Cloudflare R2!", {
          id: toastId,
        });
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to sync R2 thumbnails.", { id: toastId });
    } finally {
      setSyncingThumbnails(false);
    }
  };

  return (
    <SidebarLayout
      pageTitle="Global Library"
      topBarRight={
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              onClick={() => setUploadDialogOpen(true)}
              disabled={!user || loading || syncingThumbnails || !!importingKey || !!deletingKey}
              className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-primary/40 bg-primary/10 text-xs font-semibold text-primary transition-colors hover:bg-primary/20 disabled:opacity-50 cursor-pointer shadow-sm"
              aria-label="Upload PDF to R2"
              title="Upload PDF document to Cloudflare R2"
            >
              <Upload className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Upload PDF</span>
            </button>
          )}

          {isAdmin && (
            <button
              onClick={() => void handleSyncAllThumbnails()}
              disabled={!user || loading || syncingThumbnails || !!importingKey || !!deletingKey}
              className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-border bg-surface text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-50 cursor-pointer"
              aria-label="Sync R2 Thumbnails"
              title="Generate & store missing PDF thumbnails in Cloudflare R2"
            >
              <Layers
                className={`h-3.5 w-3.5 ${syncingThumbnails ? "animate-spin text-primary" : ""}`}
              />
              <span className="hidden sm:inline">Sync Thumbnails</span>
            </button>
          )}

          <button
            onClick={() => void fetchFiles(false, true)}
            disabled={!user || loading || syncingThumbnails || !!importingKey || !!deletingKey}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-50 cursor-pointer"
            aria-label="Refresh"
            title="Refresh library"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      }
    >
      <div
        className={`transition-all duration-300 ${!user ? "filter blur-[5px] pointer-events-none select-none opacity-50" : ""}`}
      >
        <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8 space-y-6">
          <h1 className="sr-only">Cloudflare R2 Global Library</h1>

          {errorMsg ? (
            <div className="rounded-3xl border border-destructive/40 bg-destructive/10 p-6 sm:p-8 text-center max-w-2xl mx-auto shadow-lg">
              <div className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-destructive">
                configuration error
              </div>
              <p className="mt-2 text-sm text-foreground/95">{errorMsg}</p>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                Make sure you have populated the Cloudflare R2 credentials (`R2_ACCOUNT_ID`,
                `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`) in your `.env` file.
              </p>
              <button
                onClick={() => void fetchFiles(false, true)}
                className="mt-4 rounded-full bg-primary px-5 py-2 font-mono text-xs uppercase tracking-widest text-primary-foreground hover:opacity-90 active:scale-95 transition-all shadow-md cursor-pointer font-bold"
              >
                Retry Connection
              </button>
            </div>
          ) : loading ? (
            <div className="flex h-96 flex-col items-center justify-center">
              <LoadingLogo size={72} label="Loading Global Library…" />
            </div>
          ) : (
            /* Main Split Layout: Left Vertical Category Heap & Right Playcard Grid */
            <div className="flex flex-col lg:flex-row items-start gap-6 lg:gap-8">
              {/* Left Column: Vertical Category Heap Sidebar */}
              <CategoryVerticalHeap
                categories={categoriesList}
                activeCategory={activeCategory}
                onSelectCategory={setActiveCategory}
                categoryStats={categoryStats}
                totalCount={files.length}
                totalSize={totalLibrarySize}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                syncEnabled={syncEnabled}
              />

              {/* Right Column: Library Playcards Container */}
              <main className="flex-1 min-w-0 w-full space-y-5">
                {/* Active Category Banner / Toolbar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-border/80 bg-surface/50 p-4 sm:p-5 backdrop-blur-xl shadow-sm">
                  <div className="flex items-center gap-3.5">
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-2xl shadow-inner border ${activeCategoryMeta.borderAccent} bg-gradient-to-br ${activeCategoryMeta.gradient}`}
                    >
                      {activeCategoryMeta.icon}
                    </div>
                    <div>
                      <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                        {activeCategoryMeta.label}
                      </h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Showing{" "}
                        <span className="font-bold text-foreground">{filteredFiles.length}</span>{" "}
                        {filteredFiles.length === 1 ? "playcard" : "playcards"}
                        {searchQuery && (
                          <span>
                            {" "}
                            matching "
                            <span className="text-primary font-medium">{searchQuery}</span>"
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground self-end sm:self-center">
                    <span className="rounded-xl border border-border/60 bg-surface-2/60 px-3 py-1.5 font-mono text-[11px] font-semibold text-foreground">
                      {filteredFiles.length} / {files.length} Total
                    </span>
                  </div>
                </div>

                {/* Playcard Grid */}
                {filteredFiles.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-border/80 bg-surface/30 p-12 text-center space-y-3">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-2/70 text-3xl shadow-inner border border-border/60">
                      <FolderOpen className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-base font-bold text-foreground">No documents found</p>
                      <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
                        {searchQuery
                          ? `No documents matching "${searchQuery}" in ${activeCategoryMeta.label}.`
                          : `There are currently no document playcards in the "${activeCategoryMeta.label}" category.`}
                      </p>
                    </div>
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery("")}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface-2 px-4 py-2 text-xs font-semibold text-foreground transition-all hover:bg-surface hover:border-border-strong active:scale-95 cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                        Clear Search Filter
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
                    {filteredFiles.map((file) => {
                      const cleanName = file.displayName || file.key.split("/").pop() || file.key;
                      const localId =
                        localDocsMap[cleanName.toLowerCase()] ||
                        localDocsMap[file.key.toLowerCase()] ||
                        null;

                      return (
                        <GlobalLibraryCard
                          key={file.key}
                          file={file}
                          localDocId={localId}
                          importing={importingKey === file.key}
                          deleting={deletingKey === file.key}
                          syncEnabled={syncEnabled}
                          onImport={handleImport}
                          onDelete={(f) => setDeleteTarget(f)}
                          onOpenLocalDoc={(docId) =>
                            navigate({ to: "/doc/$id", params: { id: docId } })
                          }
                        />
                      );
                    })}
                  </div>
                )}
              </main>
            </div>
          )}
        </div>
      </div>

      {/* Direct R2 Upload Dialog for Admin */}
      <R2UploadDialog
        isMobile={isMobile}
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        uploadFile={uploadFile}
        onFileChange={setUploadFile}
        uploadCategory={uploadCategory}
        onCategoryChange={setUploadCategory}
        customUploadCategory={customUploadCategory}
        onCustomCategoryChange={setCustomUploadCategory}
        uploadingDirect={uploadingDirect}
        onSubmit={() => void handleDirectUpload()}
      />

      {/* Delete confirmation dialog */}
      <DeleteFileDialog
        fileKey={deleteTarget?.key ?? null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
      />

      {/* Full-screen Authentication Overlay Popup */}
      {!user && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/40 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm sm:max-w-md rounded-3xl border border-border/80 bg-card/95 p-6 sm:p-8 shadow-2xl backdrop-blur-xl text-center space-y-5 sm:space-y-6 animate-in zoom-in-95 duration-200">
            <div className="mx-auto flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-inner">
              <Globe className="h-7 w-7 sm:h-8 sm:w-8 animate-pulse text-primary" />
            </div>

            <div className="space-y-1.5 sm:space-y-2">
              <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
                Access Global Library
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
                Sign in with your Google account to access, sync, and download shared documents from
                the Global Library.
              </p>
            </div>

            {authLoading ? (
              <div className="py-4 flex flex-col items-center justify-center gap-2">
                <LoadingLogo size={44} label="Checking authentication..." />
              </div>
            ) : (
              <div className="space-y-3">
                <button
                  onClick={() => void signInWithGoogle()}
                  className="flex w-full items-center justify-center gap-3 rounded-2xl bg-primary py-3 sm:py-3.5 px-4 text-xs sm:text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:opacity-95 active:scale-95 cursor-pointer"
                >
                  <svg className="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>Sign in with Google</span>
                </button>

                <button
                  onClick={() => navigate({ to: "/" })}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface/80 py-2.5 px-4 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground cursor-pointer"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Back to My Library</span>
                </button>
              </div>
            )}

            <div className="flex items-center justify-center gap-4 text-[10px] sm:text-[11px] text-muted-foreground font-medium pt-0.5">
              <a href="/privacy" className="hover:text-primary transition-colors">
                Privacy Policy
              </a>
              <span>•</span>
              <a href="/terms" className="hover:text-primary transition-colors">
                Terms of Service
              </a>
            </div>
          </div>
        </div>
      )}
    </SidebarLayout>
  );
}
