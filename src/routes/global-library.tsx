import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Globe,
  RefreshCw,
  Search,
  X,
  Layers,
  FolderOpen,
  Upload,
  GraduationCap,
  ChevronDown,
} from "lucide-react";
import { SidebarLayout } from "@/components/SidebarLayout";
import { deleteFromR2, downloadFromR2 } from "@/lib/r2";
import { getCachedR2Files, setCachedR2Files } from "@/lib/r2-cache";
import { createDoc, listDocs, type DocSummary } from "@/lib/storage";
import { LoadingLogo } from "@/components/LoadingLogo";
import { getSyncConfig } from "@/lib/sync";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatBytes, base64ToBlob, type R2File } from "@/lib/file-utils";
import { DeleteFileDialog } from "@/components/DeleteFileDialog";
import { R2UploadDialog } from "@/components/R2UploadDialog";
import { useAuth } from "@/context/AuthContext";
import { CategoryVerticalHeap } from "@/components/CategoryVerticalHeap";
import { CategoryMarqueeRow } from "@/components/CategoryMarqueeRow";
import { GlobalLibraryCard } from "@/components/GlobalLibraryCard";
import { EducationLevelModal } from "@/components/EducationLevelModal";
import {
  classifyR2Book,
  filterBooks,
  getSavedEducationLevel,
  saveEducationLevel,
  getEducationLevelMeta,
  getSubjectCategoryMeta,
  SUBJECT_CATEGORIES,
  type ClassifiedBook,
  type EducationLevel,
  type SubjectCategory,
} from "@/lib/classification";

export const Route = createFileRoute("/global-library")({
  component: GlobalLibraryPage,
  head: () => ({
    meta: [
      { title: "Global Library — NCERT Curriculum & Chapters" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function GlobalLibraryPage() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { user, isAdmin, loading: authLoading, signInWithGoogle, updateProfile } = useAuth();

  const [files, setFiles] = useState<R2File[]>([]);
  const [localDocs, setLocalDocs] = useState<DocSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [importingKey, setImportingKey] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<R2File | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [syncEnabled, setSyncEnabled] = useState(true);

  // Education Level state & First-time detection
  const [educationLevel, setEducationLevel] = useState<EducationLevel>(
    () => (user?.educationLevel as EducationLevel) || getSavedEducationLevel() || "class-10",
  );
  const [educationModalOpen, setEducationModalOpen] = useState(false);
  const [isFirstTime, setIsFirstTime] = useState(false);

  // Category navigation (Strictly one of the 4 subject categories)
  const [activeCategory, setActiveCategory] = useState<SubjectCategory>("history");
  const [searchQuery, setSearchQuery] = useState("");

  // R2 Direct Upload states (Admin)
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadCategory, setUploadCategory] = useState<string>("history");
  const [uploadEducationLevel, setUploadEducationLevel] = useState<string>("class-10");
  const [uploadingDirect, setUploadingDirect] = useState(false);

  // Initialize Education Level from user session or localStorage
  useEffect(() => {
    const savedLevel = (user?.educationLevel as EducationLevel) || getSavedEducationLevel();
    if (savedLevel) {
      setEducationLevel(savedLevel);
    } else {
      // First time user visiting Global Library
      setIsFirstTime(true);
      setEducationModalOpen(true);
    }

    const handleLevelChanged = (e: any) => {
      if (e?.detail) {
        setEducationLevel(e.detail);
      }
    };
    window.addEventListener("doclens:education-level-changed" as any, handleLevelChanged);
    return () => {
      window.removeEventListener("doclens:education-level-changed" as any, handleLevelChanged);
    };
  }, [user]);

  const handleDirectUpload = async (customFileName?: string) => {
    if (!uploadFile || uploadingDirect) return;
    setUploadingDirect(true);
    const targetFileName = customFileName?.trim() || uploadFile.name || "document.pdf";
    const normalizedFileName = targetFileName.toLowerCase().endsWith(".pdf")
      ? targetFileName
      : `${targetFileName}.pdf`;
    const toastId = toast.loading(`Uploading "${normalizedFileName}" to Cloudflare R2...`);
    try {
      const { uploadToR2, uploadThumbnailToR2 } = await import("@/lib/r2");
      const { renderPageToJpegBlob } = await import("@/hooks/useThumbnail");
      const { fileToBase64 } = await import("@/lib/file-utils");

      const base64Data = await fileToBase64(uploadFile);

      const res = await uploadToR2({
        data: {
          fileName: normalizedFileName,
          contentType: uploadFile.type || "application/pdf",
          base64Data,
          subject: uploadCategory,
          educationLevel: uploadEducationLevel,
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

      toast.success(`Successfully uploaded "${normalizedFileName}" to R2 (${res.category})!`, {
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
      if (forceRefresh && !silent) {
        toast.success("Global Library refreshed from cloud!");
      }
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

  // Classify all raw files into standardized 4 categories + education level
  const classifiedFiles: ClassifiedBook[] = useMemo(() => {
    return files.map(classifyR2Book);
  }, [files]);

  // Aggregate Subject Category stats specifically for the currently selected Education Level
  const categoryStats = useMemo(() => {
    const map: Record<SubjectCategory, { count: number; totalSize: number }> = {
      history: { count: 0, totalSize: 0 },
      "political-science": { count: 0, totalSize: 0 },
      economics: { count: 0, totalSize: 0 },
      miscellaneous: { count: 0, totalSize: 0 },
    };

    for (const f of classifiedFiles) {
      const matchesLevel =
        educationLevel === "gov-exams"
          ? f.educationLevel === "gov-exams" ||
            f.educationLevel === "general" ||
            f.educationLevel === "class-11" ||
            f.educationLevel === "class-12"
          : f.educationLevel === educationLevel || f.educationLevel === "general";

      if (matchesLevel) {
        if (map[f.category]) {
          map[f.category].count += 1;
          map[f.category].totalSize += f.size;
        } else {
          map.miscellaneous.count += 1;
          map.miscellaneous.totalSize += f.size;
        }
      }
    }
    return map;
  }, [classifiedFiles, educationLevel]);

  // Filter books matching current education level and active subject category
  const filteredFiles = useMemo(() => {
    return filterBooks(classifiedFiles, educationLevel, activeCategory, searchQuery);
  }, [classifiedFiles, educationLevel, activeCategory, searchQuery]);

  const levelTotalCount = useMemo(() => {
    return Object.values(categoryStats).reduce((sum, s) => sum + s.count, 0);
  }, [categoryStats]);

  const currentLevelMeta = useMemo(() => {
    return getEducationLevelMeta(educationLevel);
  }, [educationLevel]);

  const activeCategoryMeta = useMemo(() => {
    return getSubjectCategoryMeta(activeCategory);
  }, [activeCategory]);

  // Track education tiers that contain chapters in R2
  const availableLevelsWithChapters = useMemo(() => {
    const map: Record<string, number> = {};
    for (const f of classifiedFiles) {
      if (f.educationLevel && f.educationLevel !== "general") {
        map[f.educationLevel] = (map[f.educationLevel] || 0) + 1;
      }
    }
    return map;
  }, [classifiedFiles]);

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

      const docRec = await createDoc(docFile, arrayBuffer, file.key);

      // Copy cached thumbnail to local doc if already available
      try {
        const { getThumbnail, saveThumbnailBlob } = await import("@/lib/storage");
        const r2Thumb = await getThumbnail(`r2_thumb_${file.key}`);
        if (r2Thumb && r2Thumb.startsWith("blob:")) {
          const thumbBlob = await fetch(r2Thumb).then((r) => r.blob());
          await saveThumbnailBlob(docRec.id, thumbBlob);
        }
      } catch {}

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

  // Scoped Thumbnail Sync: Only syncs thumbnails for the documents of the selected class
  const handleSyncClassThumbnails = async () => {
    // Collect all documents belonging to the currently selected class tier
    const classDocuments = classifiedFiles.filter((f) => {
      if (educationLevel === "gov-exams") {
        return (
          f.educationLevel === "gov-exams" ||
          f.educationLevel === "general" ||
          f.educationLevel === "class-11" ||
          f.educationLevel === "class-12"
        );
      }
      return f.educationLevel === educationLevel || f.educationLevel === "general";
    });

    if (syncingThumbnails || classDocuments.length === 0) return;
    setSyncingThumbnails(true);
    const toastId = toast.loading(
      `Checking & syncing thumbnails for ${currentLevelMeta.label} (${classDocuments.length} docs)...`,
    );
    let syncedCount = 0;
    try {
      const { getThumbnailFromR2, downloadFromR2 } = await import("@/lib/r2");
      const { renderPageToJpegBlob } = await import("@/hooks/useThumbnail");
      const { base64ToBlob } = await import("@/lib/file-utils");
      const { uploadBlobAsThumbnailToR2 } = await import("@/hooks/useR2Thumbnail");
      const { getThumbnail, saveThumbnailBlob } = await import("@/lib/storage");

      for (let i = 0; i < classDocuments.length; i++) {
        const file = classDocuments[i];
        const r2CacheKey = `r2_thumb_${file.key}`;
        try {
          const localThumb = await getThumbnail(r2CacheKey);
          if (localThumb && localThumb !== "NO_THUMBNAIL") {
            continue; // Already cached locally in IndexedDB!
          }

          const check = await getThumbnailFromR2({ data: { fileKey: file.key } });
          if (!check.found) {
            toast.loading(
              `Generating thumbnail (${i + 1}/${classDocuments.length}): "${file.displayName || file.key}"...`,
              { id: toastId },
            );
            const res = await downloadFromR2({ data: { key: file.key } });
            const pdfBlob = base64ToBlob(res.base64Data, res.contentType);
            res.base64Data = "";
            const thumbBlob = await renderPageToJpegBlob(pdfBlob);
            await saveThumbnailBlob(r2CacheKey, thumbBlob);
            const ok = await uploadBlobAsThumbnailToR2(file.key, thumbBlob);
            if (ok) syncedCount++;
            await new Promise((resolve) => setTimeout(resolve, 50));
          } else {
            // Found on R2, save to IndexedDB locally
            if ("url" in check && check.url) {
              const blob = await fetch(check.url).then((r) => r.blob());
              await saveThumbnailBlob(r2CacheKey, blob);
            } else if ("base64Data" in check && check.base64Data) {
              const blob = base64ToBlob(check.base64Data, check.contentType || "image/jpeg");
              await saveThumbnailBlob(r2CacheKey, blob);
            }
          }
        } catch (err) {
          console.warn(`Failed syncing thumbnail for ${file.key}:`, err);
        }
      }

      if (syncedCount > 0) {
        toast.success(
          `Successfully saved ${syncedCount} missing thumbnails for ${currentLevelMeta.label}!`,
          { id: toastId },
        );
        void fetchFiles(true, true);
      } else {
        toast.success(`All ${currentLevelMeta.label} thumbnails are up to date!`, {
          id: toastId,
        });
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to sync thumbnails.", { id: toastId });
    } finally {
      setSyncingThumbnails(false);
    }
  };

  return (
    <SidebarLayout
      pageTitle="Global Library"
      topBarRight={
        <div className="flex items-center gap-2">
          {/* Education Level Switcher Pill Button */}
          <button
            onClick={() => setEducationModalOpen(true)}
            className="flex items-center gap-1.5 h-8 px-2.5 rounded-xl border border-primary/40 bg-primary/10 text-xs font-bold text-foreground transition-all hover:bg-primary/20 cursor-pointer shadow-sm"
            aria-label="Switch Education Level"
            title="Change Education Level"
          >
            <span>{currentLevelMeta.icon}</span>
            <span className="hidden xs:inline">{currentLevelMeta.shortLabel}</span>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </button>

          {isAdmin && (
            <button
              onClick={() => setUploadDialogOpen(true)}
              disabled={!user || loading || syncingThumbnails || !!importingKey || !!deletingKey}
              className="flex items-center gap-1.5 h-8 px-2.5 rounded-xl border border-border bg-surface text-xs font-semibold text-foreground transition-colors hover:bg-surface-2 disabled:opacity-50 cursor-pointer shadow-sm"
              aria-label="Upload PDF to R2"
              title="Upload PDF chapter to Cloudflare R2"
            >
              <Upload className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Upload</span>
            </button>
          )}

          {isAdmin && (
            <button
              onClick={() => void handleSyncClassThumbnails()}
              disabled={!user || loading || syncingThumbnails || !!importingKey || !!deletingKey}
              className="flex items-center gap-1.5 h-8 px-2.5 rounded-xl border border-border bg-surface text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-50 cursor-pointer"
              aria-label="Sync Thumbnails for active class"
              title={`Generate & store missing PDF thumbnails for ${currentLevelMeta.label}`}
            >
              <Layers
                className={`h-3.5 w-3.5 ${syncingThumbnails ? "animate-spin text-primary" : ""}`}
              />
              <span className="hidden sm:inline">Thumbnails</span>
            </button>
          )}

          <button
            onClick={() => void fetchFiles(false, true)}
            disabled={!user || loading || syncingThumbnails || !!importingKey || !!deletingKey}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-surface text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-50 cursor-pointer"
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
        <div className="mx-auto max-w-7xl p-3.5 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
          <h1 className="sr-only">Global Library — Curated Curriculum Chapters</h1>

          {errorMsg ? (
            <div className="rounded-3xl border border-destructive/40 bg-destructive/10 p-6 sm:p-8 text-center max-w-2xl mx-auto shadow-lg">
              <div className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-destructive">
                configuration error
              </div>
              <p className="mt-2 text-sm text-foreground/95">{errorMsg}</p>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                Ensure Cloudflare R2 credentials are populated in your environment variables.
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
            /* Main Split Layout: Left Vertical Category Heap (Desktop) & Right E-Book Grid */
            <div className="flex flex-col lg:flex-row items-start gap-6 lg:gap-8">
              {/* Left Column: Vertical Category Heap Sidebar (Desktop Only) */}
              <CategoryVerticalHeap
                categories={SUBJECT_CATEGORIES.map((c) => c.id)}
                activeCategory={activeCategory}
                onSelectCategory={setActiveCategory}
                categoryStats={categoryStats}
                totalCount={levelTotalCount}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                currentEducationLevel={educationLevel}
                onOpenEducationModal={() => setEducationModalOpen(true)}
                syncEnabled={syncEnabled}
              />

              {/* Right Column: Library Books Container */}
              <main className="flex-1 min-w-0 w-full space-y-4">
                {/* ──── Mobile View Header (Education Switcher + Search + 4 Category Pills) ──── */}
                <div className="lg:hidden space-y-3">
                  {/* Mobile Education Level Card */}
                  <div className="flex items-center justify-between rounded-2xl border border-primary/25 bg-gradient-to-r from-primary/15 via-surface/80 to-surface/60 p-3 shadow-sm">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-xl">{currentLevelMeta.icon}</span>
                      <div className="min-w-0">
                        <span className="block text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                          Class / Tier
                        </span>
                        <h4 className="text-xs font-bold text-foreground truncate">
                          {currentLevelMeta.label}
                        </h4>
                      </div>
                    </div>
                    <button
                      onClick={() => setEducationModalOpen(true)}
                      className="rounded-xl border border-border bg-surface-2 px-3 py-1.5 text-[11px] font-bold text-foreground hover:bg-surface transition-colors cursor-pointer"
                    >
                      Change
                    </button>
                  </div>

                  {/* Mobile Search Input */}
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search chapters..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full rounded-2xl border border-border bg-surface/70 py-2.5 pl-10 pr-9 text-xs text-foreground placeholder:text-muted-foreground shadow-sm backdrop-blur-md focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded-md cursor-pointer"
                        aria-label="Clear search"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Category Pills Marquee (Strictly the 4 categories, No All Documents) */}
                  <CategoryMarqueeRow
                    items={SUBJECT_CATEGORIES.map((cat) => ({
                      key: cat.id,
                      label: cat.label,
                      icon: cat.icon,
                      count: categoryStats[cat.id]?.count || 0,
                      active: activeCategory === cat.id,
                      onClick: () => setActiveCategory(cat.id),
                    }))}
                  />

                  {/* Section Title & Count Indicator */}
                  <div className="flex items-center justify-between px-0.5 pt-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">{activeCategoryMeta.icon}</span>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                        {activeCategoryMeta.label}
                      </h3>
                    </div>
                    <span className="text-[10px] font-mono font-bold text-muted-foreground bg-surface-2/80 border border-border/50 rounded-full px-2 py-0.5">
                      {filteredFiles.length} {filteredFiles.length === 1 ? "chapter" : "chapters"}
                    </span>
                  </div>
                </div>

                {/* E-Book Grid */}
                {filteredFiles.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-border/80 bg-surface/30 p-8 sm:p-12 text-center space-y-4">
                    <div className="mx-auto flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl bg-surface-2/70 text-2xl sm:text-3xl shadow-inner border border-border/60">
                      <FolderOpen className="h-7 w-7 sm:h-8 sm:w-8 text-muted-foreground" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm sm:text-base font-bold text-foreground">
                        No chapters found
                      </p>
                      <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
                        {searchQuery
                          ? `No chapters matching "${searchQuery}" in ${activeCategoryMeta.label} for ${currentLevelMeta.label}.`
                          : `There are currently no chapters in "${activeCategoryMeta.label}" for ${currentLevelMeta.label}.`}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                      {searchQuery && (
                        <button
                          onClick={() => setSearchQuery("")}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface-2 px-4 py-2 text-xs font-semibold text-foreground transition-all hover:bg-surface hover:border-border-strong active:scale-95 cursor-pointer"
                        >
                          <X className="h-3.5 w-3.5" />
                          Clear Search Filter
                        </button>
                      )}
                      <button
                        onClick={() => setEducationModalOpen(true)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-md shadow-primary/20 hover:opacity-95 active:scale-95 transition-all cursor-pointer"
                      >
                        <GraduationCap className="h-3.5 w-3.5" />
                        <span>Switch Class / Level</span>
                      </button>
                    </div>

                    {Object.keys(availableLevelsWithChapters).length > 0 && (
                      <div className="pt-4 border-t border-border/40 max-w-md mx-auto space-y-2">
                        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                          Chapters Available In Other Classes:
                        </span>
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          {Object.entries(availableLevelsWithChapters).map(([lvlId, count]) => {
                            const meta = getEducationLevelMeta(lvlId);
                            return (
                              <button
                                key={lvlId}
                                onClick={() => {
                                  setEducationLevel(lvlId as EducationLevel);
                                  saveEducationLevel(lvlId as EducationLevel);
                                }}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-bold text-foreground hover:bg-primary/20 hover:scale-[1.02] active:scale-95 transition-all cursor-pointer shadow-sm"
                              >
                                <span>{meta.icon}</span>
                                <span>{meta.label}</span>
                                <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-mono font-bold text-primary">
                                  {count} {count === 1 ? "doc" : "docs"}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-2 xl:grid-cols-3">
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

      {/* Education Level Selection / Switcher Modal */}
      <EducationLevelModal
        open={educationModalOpen}
        onOpenChange={(open) => {
          setEducationModalOpen(open);
          if (!open) setIsFirstTime(false);
        }}
        currentLevel={educationLevel}
        onSelectLevel={(level) => {
          setEducationLevel(level);
          setIsFirstTime(false);
          if (user) {
            void updateProfile({ educationLevel: level }).catch((err) =>
              console.warn("Failed to update education level in Firebase/JWT:", err),
            );
          }
        }}
        isFirstTime={isFirstTime}
      />

      {/* Direct R2 Upload Dialog for Admin */}
      <R2UploadDialog
        isMobile={isMobile}
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        uploadFile={uploadFile}
        onFileChange={setUploadFile}
        uploadCategory={uploadCategory}
        onCategoryChange={setUploadCategory}
        uploadEducationLevel={uploadEducationLevel}
        onEducationLevelChange={setUploadEducationLevel}
        uploadingDirect={uploadingDirect}
        onSubmit={(customFileName) => void handleDirectUpload(customFileName)}
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
                Sign in with your Google account to access, sync, and download shared curriculum
                chapters from the Global Library.
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
