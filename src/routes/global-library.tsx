import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Download,
  FileText,
  Folder,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { SidebarLayout } from "@/components/SidebarLayout";
import { listR2Files, deleteFromR2, downloadFromR2, uploadToR2, reorganizeR2Files } from "@/lib/r2";
import { createDoc } from "@/lib/storage";
import { LoadingLogo } from "@/components/LoadingLogo";
import { getSyncConfig } from "@/lib/sync";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

export const Route = createFileRoute("/global-library")({
  component: GlobalLibraryPage,
  head: () => ({
    meta: [
      { title: "Anuwad — Global Library (Cloudflare R2)" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

interface R2File {
  key: string;
  size: number;
  lastModified?: string;
  url?: string;
}

interface ParsedR2File extends R2File {
  category: string;
  displayName: string;
}

const STANDARD_CATEGORIES: Record<string, { label: string; icon: string; desc: string }> = {
  history: { label: "History", icon: "📜", desc: "history/" },
  economics: { label: "Economics", icon: "📈", desc: "economics/" },
  geography: { label: "Geography", icon: "🌍", desc: "geography/" },
  civics: { label: "Civics", icon: "🏛️", desc: "civics/" },
  science: { label: "Science", icon: "🔬", desc: "science/" },
  uncategorized: { label: "Uncategorized", icon: "📂", desc: "uncategorized/" },
};

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

function parseFileCategory(file: R2File): ParsedR2File {
  const parts = file.key.split("/");
  if (parts.length > 1 && parts[0].trim().length > 0) {
    const category = parts[0].trim().toLowerCase();
    const displayName = parts.slice(1).join("/");
    return { ...file, category, displayName };
  }
  return { ...file, category: "uncategorized", displayName: file.key };
}

function GlobalLibraryPage() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [files, setFiles] = useState<R2File[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [importingKey, setImportingKey] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<R2File | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [syncEnabled, setSyncEnabled] = useState(true);

  // Category navigation & search
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Direct Upload modal states
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadCategory, setUploadCategory] = useState("history");
  const [customUploadCategory, setCustomUploadCategory] = useState("");
  const [uploadingDirect, setUploadingDirect] = useState(false);

  // Reorganize state
  const [reorganizing, setReorganizing] = useState(false);

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
      setFiles((prev) => prev.filter((f) => f.key !== target.key));
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to delete file from R2.", { id: toastId });
    } finally {
      setDeletingKey(null);
    }
  };

  const handleReorganize = async () => {
    if (reorganizing) return;
    setReorganizing(true);
    const toastId = toast.loading("Organising files in R2 bucket into subject virtual folders...");
    try {
      const res = await reorganizeR2Files();
      if (res.movedCount > 0) {
        toast.success(
          `Successfully reorganised ${res.movedCount} files into category virtual folders!`,
          { id: toastId },
        );
      } else {
        toast.info("All files are already organised into category virtual folders.", {
          id: toastId,
        });
      }
      await fetchFiles(true);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to reorganise R2 bucket.", { id: toastId });
    } finally {
      setReorganizing(false);
    }
  };

  const handleDirectUploadSubmit = async () => {
    if (!uploadFile || uploadingDirect) return;
    const targetCat = uploadCategory === "custom" ? customUploadCategory.trim() : uploadCategory;
    setUploadingDirect(true);
    const toastId = toast.loading(
      `Uploading "${uploadFile.name}" to R2 (${targetCat || "uncategorized"})...`,
    );

    try {
      const arrayBuf = await uploadFile.arrayBuffer();
      const base64Data = Buffer.from(arrayBuf).toString("base64");

      const res = await uploadToR2({
        data: {
          fileName: uploadFile.name,
          contentType: uploadFile.type || "application/pdf",
          base64Data,
          category: targetCat,
        },
      });

      if (syncEnabled) {
        try {
          const { saveSupabaseExtraction } = await import("@/lib/supabase");
          const { getTranslationConfig } = await import("@/lib/openrouter");
          const translationConfig = getTranslationConfig();
          await saveSupabaseExtraction({
            data: {
              key: res.key,
              size: uploadFile.size,
              lastModified: new Date().toISOString(),
              numPages: 0,
              text: JSON.stringify({ version: 1, pages: [], translationConfig }),
              usedOcr: false,
              translationConfig,
            },
          });
        } catch (supaErr) {
          console.warn("Failed to initialize Supabase metadata for upload:", supaErr);
        }
      }

      if (res.alreadyExists) {
        toast.warning(`File is already uploaded under key "${res.key}".`, { id: toastId });
      } else {
        toast.success(`Uploaded successfully under folder prefix "${res.category}/"!`, {
          id: toastId,
        });
      }

      setShowUploadModal(false);
      setUploadFile(null);
      await fetchFiles(true);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to upload file to Cloudflare R2.", { id: toastId });
    } finally {
      setUploadingDirect(false);
    }
  };

  return (
    <SidebarLayout
      pageTitle="Global Library"
      topBarRight={
        <div className="flex items-center gap-2">
          {syncEnabled && (
            <button
              onClick={() => setShowUploadModal(true)}
              disabled={loading || reorganizing}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
            >
              <Upload className="h-3.5 w-3.5" /> Upload
            </button>
          )}
          {syncEnabled && (
            <button
              onClick={handleReorganize}
              disabled={loading || reorganizing}
              className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-all hover:bg-primary/20 active:scale-95 disabled:opacity-50"
              title="Automatically rename and move flat files into subject folder prefixes (history/, economics/, etc.)"
            >
              <Zap className="h-3.5 w-3.5" /> {reorganizing ? "Organising…" : "Organise"}
            </button>
          )}
          <button
            onClick={() => void fetchFiles()}
            disabled={loading || !!importingKey || !!deletingKey || reorganizing}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-50"
            aria-label="Refresh"
            title="Refresh"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      }
    >
      {isMobile ? (
        <div className="space-y-4 px-4 pb-24 pt-4">
          {errorMsg ? (
            <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-5 text-center">
              <p className="text-sm text-foreground/90">{errorMsg}</p>
              <button
                onClick={() => void fetchFiles()}
                className="mt-3 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition-transform active:scale-95"
              >
                Retry
              </button>
            </div>
          ) : loading ? (
            <div className="flex h-64 flex-col items-center justify-center">
              <LoadingLogo size={64} label="Loading…" />
            </div>
          ) : (
            <>
              {syncEnabled && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleReorganize}
                    disabled={reorganizing}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-medium text-muted-foreground transition-transform active:scale-95 disabled:opacity-50"
                  >
                    <Zap className="h-3.5 w-3.5" /> {reorganizing ? "Organising…" : "Organise"}
                  </button>
                  <button
                    onClick={() => void fetchFiles()}
                    disabled={loading}
                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-muted-foreground transition-transform active:scale-95 disabled:opacity-50"
                    aria-label="Refresh"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                  </button>
                </div>
              )}

              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-border bg-surface py-2.5 pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
                <button
                  onClick={() => setActiveCategory("all")}
                  className={`flex-shrink-0 rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
                    activeCategory === "all"
                      ? "bg-primary text-primary-foreground"
                      : "bg-surface-2 text-muted-foreground"
                  }`}
                >
                  All ({files.length})
                </button>
                {categoriesList.map((catKey) => {
                  const meta = STANDARD_CATEGORIES[catKey] || {
                    label: catKey.charAt(0).toUpperCase() + catKey.slice(1),
                    icon: "📂",
                  };
                  const stats = categoryStats[catKey] || { count: 0, totalSize: 0 };
                  const isActive = activeCategory === catKey;
                  return (
                    <button
                      key={catKey}
                      onClick={() => setActiveCategory(catKey)}
                      className={`flex-shrink-0 rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "bg-surface-2 text-muted-foreground"
                      }`}
                    >
                      {meta.icon} {meta.label} ({stats.count})
                    </button>
                  );
                })}
              </div>

              {filteredFiles.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-border py-16 text-center">
                  <Folder className="h-7 w-7 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">No documents here yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredFiles.map((file) => {
                    const isImporting = importingKey === file.key;
                    const isDeleting = deletingKey === file.key;
                    const catMeta = STANDARD_CATEGORIES[file.category] || {
                      label: file.category,
                      icon: "📂",
                    };
                    return (
                      <div
                        key={file.key}
                        className="flex items-center gap-3 rounded-2xl border border-border bg-surface/50 p-3"
                      >
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          <FileText className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-foreground">
                            {file.displayName}
                          </div>
                          <div className="truncate text-[11px] text-muted-foreground">
                            {catMeta.icon} {catMeta.label} · {formatBytes(file.size)}
                          </div>
                        </div>
                        <button
                          onClick={() => handleImport(file)}
                          disabled={!!importingKey || !!deletingKey}
                          className="flex-shrink-0 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-transform active:scale-95 disabled:opacity-50"
                        >
                          {isImporting ? (
                            <Download className="h-3.5 w-3.5 animate-pulse" />
                          ) : (
                            "Import"
                          )}
                        </button>
                        {syncEnabled && (
                          <button
                            onClick={() => setDeleteTarget(file)}
                            disabled={!!importingKey || !!deletingKey}
                            className="flex-shrink-0 rounded-full p-1.5 text-muted-foreground transition-transform active:scale-95 disabled:opacity-50"
                            aria-label="Delete"
                          >
                            {isDeleting ? (
                              <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-destructive border-t-transparent spin-slow" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {syncEnabled && (
            <button
              onClick={() => setShowUploadModal(true)}
              className="fixed bottom-[calc(4.25rem+env(safe-area-inset-bottom))] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl transition-transform active:scale-95"
              aria-label="Upload PDF"
            >
              <Plus className="h-6 w-6" />
            </button>
          )}
        </div>
      ) : (
        <div className="mx-auto max-w-7xl space-y-6 p-8">
          <h1 className="sr-only">Cloudflare R2 Global Library</h1>
          <section>
            {errorMsg ? (
              <div className="rounded-[18px] border border-destructive/40 bg-destructive/10 p-6 text-center">
                <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-destructive">
                  configuration error
                </div>
                <p className="mt-2 text-sm text-foreground/95">{errorMsg}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Make sure you have populated the Cloudflare R2 credentials (`R2_ACCOUNT_ID`,
                  `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`) in your `.env` file.
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
            ) : (
              <div className="space-y-6">
                {/* Virtual Category Folder Grid */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
                  {/* All Files card */}
                  <button
                    type="button"
                    onClick={() => setActiveCategory("all")}
                    className={`flex flex-col justify-between rounded-xl border p-4 text-left transition-all hover:scale-[1.02] cursor-pointer ${
                      activeCategory === "all"
                        ? "border-primary bg-primary/10 ring-1 ring-primary"
                        : "border-border bg-surface/50 hover:bg-surface-2"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-2xl">📚</span>
                      <span className="rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground">
                        {files.length}
                      </span>
                    </div>
                    <div className="mt-3 font-semibold text-sm text-foreground truncate">
                      All Files
                    </div>
                  </button>

                  {categoriesList.map((catKey) => {
                    const meta = STANDARD_CATEGORIES[catKey] || {
                      label: catKey.charAt(0).toUpperCase() + catKey.slice(1),
                      icon: "📂",
                      desc: `${catKey}/`,
                    };
                    const stats = categoryStats[catKey] || { count: 0, totalSize: 0 };
                    const isActive = activeCategory === catKey;

                    return (
                      <button
                        key={catKey}
                        type="button"
                        onClick={() => setActiveCategory(catKey)}
                        className={`flex flex-col justify-between rounded-xl border p-4 text-left transition-all hover:scale-[1.02] cursor-pointer ${
                          isActive
                            ? "border-primary bg-primary/10 ring-1 ring-primary"
                            : "border-border bg-surface/50 hover:bg-surface-2"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-2xl">{meta.icon}</span>
                          <span className="rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground">
                            {stats.count}
                          </span>
                        </div>
                        <div
                          className="mt-3 font-semibold text-sm text-foreground truncate"
                          title={meta.label}
                        >
                          {meta.label}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Toolbar & Search Bar */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-border bg-surface/40 p-4">
                  <span className="text-sm font-medium text-foreground">
                    {activeCategory === "all"
                      ? "All folders"
                      : STANDARD_CATEGORIES[activeCategory]?.label || activeCategory}
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                      {filteredFiles.length} {filteredFiles.length === 1 ? "document" : "documents"}
                    </span>
                  </span>
                  <div className="relative max-w-xs w-full">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full rounded-lg border border-border bg-surface py-1.5 pl-8 pr-8 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label="Clear search"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Files Table / Empty state */}
                {filteredFiles.length === 0 ? (
                  <div className="glass-panel rounded-xl border-dashed p-10 text-center">
                    <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                      folder empty
                    </div>
                    <p className="mt-2 text-sm text-foreground/80">
                      No documents found in <span className="font-semibold">{activeCategory}</span>{" "}
                      folder prefix.
                    </p>
                    {syncEnabled && (
                      <button
                        onClick={() => {
                          if (activeCategory !== "all" && activeCategory !== "uncategorized") {
                            setUploadCategory(activeCategory);
                          }
                          setShowUploadModal(true);
                        }}
                        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
                      >
                        + Upload to {activeCategory}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-border bg-surface/30 backdrop-blur-md">
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-left text-sm">
                        <thead>
                          <tr className="border-b border-border bg-surface-2/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            <th className="px-6 py-4">Document Name</th>
                            <th className="px-6 py-4">Category Folder</th>
                            <th className="px-6 py-4">Size</th>
                            <th className="px-6 py-4">Uploaded On</th>
                            <th className="px-6 py-4 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40">
                          {filteredFiles.map((file) => {
                            const isImporting = importingKey === file.key;
                            const isDeleting = deletingKey === file.key;
                            const catMeta = STANDARD_CATEGORIES[file.category] || {
                              label: file.category,
                              icon: "📂",
                            };

                            return (
                              <tr
                                key={file.key}
                                className="group transition-colors hover:bg-surface-2/20"
                              >
                                <td className="px-6 py-4 font-medium text-foreground">
                                  <div className="flex items-center gap-3">
                                    <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                                    <span
                                      className="block max-w-md truncate font-medium"
                                      title={file.key}
                                    >
                                      {file.displayName}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2/60 px-2.5 py-1 text-xs font-medium text-foreground">
                                    <span>{catMeta.icon}</span>
                                    <span>{catMeta.label}</span>
                                  </span>
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
                                    {syncEnabled && (
                                      <button
                                        onClick={() => setDeleteTarget(file)}
                                        disabled={!!importingKey || !!deletingKey}
                                        className="rounded-lg border border-destructive/20 px-3 py-1.5 text-xs font-medium text-destructive transition-all hover:bg-destructive/10 active:scale-95 disabled:opacity-50 cursor-pointer"
                                      >
                                        {isDeleting ? "Deleting…" : "Delete"}
                                      </button>
                                    )}
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
              </div>
            )}
          </section>
        </div>
      )}

      {/* Direct R2 Upload Modal */}
      {(() => {
        const uploadBody = (
          <>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">PDF Document</label>
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setUploadFile(e.target.files[0]);
                  }
                }}
                className="w-full rounded-md border border-border bg-surface p-2 text-xs text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-primary hover:file:bg-primary/20 cursor-pointer"
              />
            </div>

            <div className="mt-4 space-y-2">
              <label className="text-xs font-medium text-foreground">Select Category Folder</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: "history", label: "📜 History", desc: "history/" },
                  { id: "economics", label: "📈 Economics", desc: "economics/" },
                  { id: "geography", label: "🌍 Geography", desc: "geography/" },
                  { id: "civics", label: "🏛️ Civics", desc: "civics/" },
                  { id: "science", label: "🔬 Science", desc: "science/" },
                  { id: "custom", label: "✏️ Custom", desc: "Custom prefix" },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setUploadCategory(cat.id)}
                    className={`flex flex-col items-start rounded-lg border p-3 text-left transition-all ${
                      uploadCategory === cat.id
                        ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary"
                        : "border-border bg-surface hover:bg-surface-2 text-muted-foreground"
                    }`}
                  >
                    <span className="font-semibold text-sm">{cat.label}</span>
                    <span className="text-[11px] font-mono text-muted-foreground">{cat.desc}</span>
                  </button>
                ))}
              </div>

              {uploadCategory === "custom" && (
                <div className="mt-2 space-y-1">
                  <label className="text-xs font-medium text-foreground">
                    Custom Category Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. mathematics, literature"
                    value={customUploadCategory}
                    onChange={(e) => setCustomUploadCategory(e.target.value)}
                    className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              )}
            </div>
          </>
        );

        const uploadFooter = (
          <>
            <button
              onClick={() => setShowUploadModal(false)}
              className="rounded-lg border border-border px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-surface-2 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDirectUploadSubmit}
              disabled={
                !uploadFile ||
                uploadingDirect ||
                (uploadCategory === "custom" && !customUploadCategory.trim())
              }
              className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {uploadingDirect ? "Uploading…" : "Upload File"}
            </button>
          </>
        );

        if (isMobile) {
          return (
            <Drawer open={showUploadModal} onOpenChange={setShowUploadModal}>
              <DrawerContent>
                <DrawerHeader>
                  <DrawerTitle>Upload PDF to Global Vault</DrawerTitle>
                  <DrawerDescription>
                    Select a PDF and assign a category folder for Cloudflare R2 storage.
                  </DrawerDescription>
                </DrawerHeader>
                <div className="overflow-y-auto px-6 pb-2">{uploadBody}</div>
                <DrawerFooter>{uploadFooter}</DrawerFooter>
              </DrawerContent>
            </Drawer>
          );
        }

        return (
          <Dialog open={showUploadModal} onOpenChange={setShowUploadModal}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Upload PDF to Global Vault</DialogTitle>
                <DialogDescription>
                  Select a PDF document and assign a category folder prefix for Cloudflare R2
                  storage.
                </DialogDescription>
              </DialogHeader>
              <div className="py-3">{uploadBody}</div>
              <DialogFooter>{uploadFooter}</DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

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
