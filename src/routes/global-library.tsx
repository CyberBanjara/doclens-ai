import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  FileText,
  Globe,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { SidebarLayout } from "@/components/SidebarLayout";
import { deleteFromR2, downloadFromR2 } from "@/lib/r2";
import { getCachedR2Files, setCachedR2Files } from "@/lib/r2-cache";
import { createDoc } from "@/lib/storage";
import { LoadingLogo } from "@/components/LoadingLogo";
import { getSyncConfig } from "@/lib/sync";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatBytes, formatDate, base64ToBlob, parseFileCategory, type R2File, type ParsedR2File } from "@/lib/file-utils";
import { CategoryMarqueeRow, type CategoryMarqueeItem } from "@/components/CategoryMarqueeRow";
import { DeleteFileDialog } from "@/components/DeleteFileDialog";
import { useAuth } from "@/context/AuthContext";

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
  const { user, loading: authLoading, signInWithGoogle } = useAuth();

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

  const fetchFiles = async (silent = false, forceRefresh = false) => {
    if (!silent) setLoading(true);
    setErrorMsg(null);
    try {
      const res = await getCachedR2Files({ forceRefresh });
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

  const marqueeItems: CategoryMarqueeItem[] = useMemo(() => {
    const allItem: CategoryMarqueeItem = {
      key: "all",
      label: `All (${files.length})`,
      icon: "🌐",
      active: activeCategory === "all",
      onClick: () => setActiveCategory("all"),
    };

    const catItems: CategoryMarqueeItem[] = categoriesList.map((catKey) => {
      const meta = STANDARD_CATEGORIES[catKey] || { label: catKey, icon: "📂" };
      const count = categoryStats[catKey]?.count || 0;
      return {
        key: catKey,
        label: `${meta.label} (${count})`,
        icon: meta.icon,
        active: activeCategory === catKey,
        onClick: () => setActiveCategory(catKey),
      };
    });

    return [allItem, ...catItems];
  }, [files.length, categoriesList, activeCategory, categoryStats]);

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

  return (
    <SidebarLayout
      pageTitle="Global Library"
      topBarRight={
        <div className="flex items-center gap-2">
          <button
            onClick={() => void fetchFiles(false, true)}
            disabled={!user || loading || !!importingKey || !!deletingKey}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-50"
            aria-label="Refresh"
            title="Refresh"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      }
    >
      <div className={`transition-all duration-300 ${!user ? "filter blur-[5px] pointer-events-none select-none opacity-50" : ""}`}>
        {isMobile ? (
          <div className="space-y-4 px-4 pb-24 pt-4">
          {errorMsg ? (
            <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-5 text-center">
              <p className="text-sm text-foreground/90">{errorMsg}</p>
              <button
                onClick={() => void fetchFiles(false, true)}
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

              {/* Horizontal Category Selector */}
              <div className="-mx-4 flex overflow-x-auto px-4 py-1 no-scrollbar space-x-2">
                <button
                  onClick={() => setActiveCategory("all")}
                  className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-all ${
                    activeCategory === "all"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-surface-2/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span>🌐</span>
                  <span>All ({files.length})</span>
                </button>
                {categoriesList.map((catKey) => {
                  const meta = STANDARD_CATEGORIES[catKey] || { label: catKey, icon: "📂" };
                  const count = categoryStats[catKey]?.count || 0;
                  const isActive = activeCategory === catKey;
                  return (
                    <button
                      key={catKey}
                      onClick={() => setActiveCategory(catKey)}
                      className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-all ${
                        isActive
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "bg-surface-2/60 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <span>{meta.icon}</span>
                      <span>
                        {meta.label} ({count})
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Files Mobile List */}
              {filteredFiles.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-surface/30 p-8 text-center">
                  <p className="text-xs text-muted-foreground">No documents found.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
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
                        className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface/60 p-3.5 backdrop-blur-md shadow-sm"
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs">{catMeta.icon}</span>
                            <span className="truncate text-xs font-semibold text-foreground">
                              {file.displayName}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                            <span>{formatBytes(file.size)}</span>
                            <span>•</span>
                            <span>{formatDate(file.lastModified)}</span>
                          </div>
                        </div>

                        <button
                          onClick={() => handleImport(file)}
                          disabled={!!importingKey || !!deletingKey}
                          className="shrink-0 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-transform active:scale-95 disabled:opacity-50"
                        >
                          {isImporting ? "Importing…" : "Import"}
                        </button>

                        {syncEnabled && (
                          <button
                            onClick={() => setDeleteTarget(file)}
                            disabled={!!importingKey || !!deletingKey}
                            className="shrink-0 text-muted-foreground hover:text-destructive p-1.5 transition-colors"
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
                  onClick={() => void fetchFiles(false, true)}
                  className="mt-4 rounded-full bg-primary px-4 py-1.5 font-mono text-[11px] uppercase tracking-widest text-primary-foreground hover:opacity-90 active:scale-95 transition-all shadow-sm"
                >
                  Retry
                </button>
              </div>
            ) : loading ? (
              <div className="flex h-64 flex-col items-center justify-center">
                <LoadingLogo size={72} label="Loading Global Library…" />
              </div>
            ) : (
              <div className="space-y-6">
                {/* Horizontal Category Cards */}
                <CategoryMarqueeRow items={marqueeItems} />

                {/* Toolbar */}
                <div className="flex items-center justify-between gap-4">
                  <div className="relative w-72">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search global library..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full rounded-xl border border-border bg-surface/50 py-2 pl-9 pr-9 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none transition-colors"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Showing <span className="font-semibold text-foreground">{filteredFiles.length}</span> documents
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
      </div>

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
                Sign in with your Google account to access, sync, and download shared documents from the Global Library.
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
