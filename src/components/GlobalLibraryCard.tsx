import { useState } from "react";
import { Trash2, Download, Check, BookOpen, Sparkles } from "lucide-react";
import { formatBytes, type R2File } from "@/lib/file-utils";
import { getSubjectCategoryMeta, type ClassifiedBook } from "@/lib/classification";
import { useR2Thumbnail } from "@/hooks/useR2Thumbnail";
import type { DocSummary } from "@/lib/storage";

interface GlobalLibraryCardProps {
  file: ClassifiedBook;
  localDoc?: DocSummary | null;
  localDocId?: string | null;
  importing: boolean;
  deleting: boolean;
  syncEnabled: boolean;
  onImport: (file: R2File) => void;
  onDelete?: (file: R2File) => void;
  onOpenLocalDoc: (docId: string) => void;
}

export function GlobalLibraryCard({
  file,
  localDoc,
  localDocId,
  importing,
  deleting,
  syncEnabled,
  onImport,
  onDelete,
  onOpenLocalDoc,
}: GlobalLibraryCardProps) {
  const catMeta = getSubjectCategoryMeta(file.category);
  const activeDocId = localDoc?.id || localDocId;
  const isImported = Boolean(activeDocId);

  const { thumbnailUrl, loading: thumbLoading } = useR2Thumbnail(
    file.key,
    activeDocId,
    file.thumbnailUrl,
    file.hasThumbnail,
  );

  const [imgError, setImgError] = useState(false);

  const handleCardClick = () => {
    if (isImported && activeDocId && !importing && !deleting) {
      onOpenLocalDoc(activeDocId);
    }
  };

  return (
    <div
      onClick={handleCardClick}
      className={`group relative flex flex-col overflow-hidden rounded-2xl border backdrop-blur-xl transition-all duration-300 ${
        isImported
          ? "border-emerald-500/40 bg-surface/85 shadow-lg shadow-emerald-500/5 ring-1 ring-emerald-500/25 hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-emerald-500/15 hover:border-emerald-500/70 cursor-pointer"
          : "border-border/80 bg-surface/60 shadow-md hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-primary/10 hover:border-primary/40"
      }`}
    >
      {/* E-Book Top Thumbnail / 3D Book Cover Header */}
      <div className="relative h-44 sm:h-52 md:h-56 w-full overflow-hidden bg-gradient-to-br from-surface-2/80 to-surface border-b border-border/50 select-none">
        {/* Book Spine 3D Depth Shadow Effect */}
        <div className="pointer-events-none absolute left-0 inset-y-0 w-3 sm:w-4 bg-gradient-to-r from-black/45 via-black/20 to-transparent z-20" />
        {/* Right Page Edge Sheen */}
        <div className="pointer-events-none absolute right-0 inset-y-0 w-px bg-white/15 z-20" />

        {thumbnailUrl && !imgError ? (
          <div className="relative h-full w-full overflow-hidden bg-black/20">
            <img
              src={thumbnailUrl}
              alt={`Cover of ${file.displayName}`}
              onError={() => setImgError(true)}
              className="h-full w-full object-cover object-top opacity-95 transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />
          </div>
        ) : thumbLoading && activeDocId ? (
          <div className="flex h-full w-full items-center justify-center bg-surface-2/40">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          /* E-Book Stylized Dynamic Artwork Cover */
          <div
            className={`relative h-full w-full bg-gradient-to-br ${catMeta.gradient} flex flex-col items-center justify-center p-3 sm:p-4 text-center`}
          >
            {/* Background Pattern Grid */}
            <div className="absolute inset-0 bg-grid opacity-30" />

            {/* Center Icon Badge */}
            <div className="relative z-10 flex h-12 w-12 sm:h-16 sm:w-16 items-center justify-center rounded-2xl bg-surface/70 backdrop-blur-md text-2xl sm:text-3xl shadow-lg border border-border/60 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-2">
              {catMeta.icon}
            </div>

            {/* Document Title Watermark */}
            <p className="relative z-10 mt-2 max-w-[140px] sm:max-w-[180px] truncate text-[10px] sm:text-[11px] font-medium text-foreground/70">
              {file.displayName}
            </p>
          </div>
        )}

        {/* Top Left "In Library" Badge if already downloaded */}
        {isImported ? (
          <div className="absolute top-2.5 left-2.5 z-20 pointer-events-none">
            <span className="flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-950/85 backdrop-blur-md px-2 py-0.5 text-[10px] font-bold text-emerald-300 shadow-md">
              <Check className="h-3 w-3 text-emerald-400 stroke-[2.5]" />
              <span>In Library</span>
            </span>
          </div>
        ) : null}

        {/* Top Right File Size Pill */}
        <div className="absolute top-2.5 right-2.5 z-20 pointer-events-none">
          <span className="flex items-center rounded-full border border-white/20 bg-black/60 backdrop-blur-md px-2 py-0.5 text-[10px] font-medium text-white/90 shadow-sm">
            {formatBytes(file.size)}
          </span>
        </div>

        {/* Hover Action Overlay for Imported Books (Playcard Quick-Open) */}
        {isImported && activeDocId && (
          <div className="absolute inset-0 z-20 hidden sm:flex items-center justify-center bg-black/45 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <div className="flex items-center gap-2 rounded-full bg-emerald-500 hover:bg-emerald-400 px-4 py-2 text-xs font-bold text-white shadow-xl shadow-emerald-950/60 transform translate-y-2 group-hover:translate-y-0 transition-transform duration-200">
              <BookOpen className="h-3.5 w-3.5" />
              <span>
                {localDoc?.lastReadPage && localDoc.lastReadPage > 1
                  ? `Resume p. ${localDoc.lastReadPage}`
                  : "Read Now"}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Book Card Body Content */}
      <div className="flex flex-1 flex-col p-3.5 sm:p-4 justify-between space-y-3">
        <div className="space-y-1.5">
          <h3
            className={`line-clamp-2 text-xs sm:text-sm font-bold leading-snug transition-colors h-8 sm:h-9 ${
              isImported
                ? "text-foreground group-hover:text-emerald-400"
                : "text-foreground group-hover:text-primary"
            }`}
            title={file.displayName}
          >
            {file.displayName}
          </h3>

          {/* Local Document Status / Reading Progress if available */}
          {isImported && (
            <div className="flex items-center gap-1.5 text-[10px] font-medium text-emerald-400/90 min-h-[16px]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
              <span className="truncate">
                {localDoc?.lastReadPage && localDoc.lastReadPage > 1
                  ? `Reading: Page ${localDoc.lastReadPage}${localDoc.pageCount ? ` of ${localDoc.pageCount}` : ""}`
                  : localDoc?.aiResultCount && localDoc.aiResultCount > 0
                    ? `${localDoc.aiResultCount} cached ${localDoc.aiResultCount === 1 ? "translation" : "translations"}`
                    : "Saved in Local Library"}
              </span>
            </div>
          )}
        </div>

        {/* E-Book Footer Actions */}
        <div className="mt-auto border-t border-border/40 pt-2.5 flex items-center justify-between gap-1.5 sm:gap-2">
          {isImported && activeDocId ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenLocalDoc(activeDocId);
              }}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 py-2 sm:py-1.5 px-2.5 sm:px-3 text-xs font-bold text-emerald-300 transition-all hover:bg-emerald-500 hover:text-white active:scale-95 cursor-pointer shadow-sm shadow-emerald-500/10"
            >
              <BookOpen className="h-3.5 w-3.5" />
              <span>
                {localDoc?.lastReadPage && localDoc.lastReadPage > 1
                  ? `Resume (p. ${localDoc.lastReadPage})`
                  : "Read Book"}
              </span>
            </button>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onImport(file);
              }}
              disabled={importing || deleting}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-primary py-2 sm:py-1.5 px-2.5 sm:px-3 text-xs font-semibold text-primary-foreground shadow-sm shadow-primary/20 transition-all hover:opacity-95 active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {importing ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                  <span className="hidden sm:inline">Importing…</span>
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5" />
                  <span>Get Book</span>
                </>
              )}
            </button>
          )}

          {/* Delete Action (If Sync Enabled & Authorized) */}
          {syncEnabled && onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(file);
              }}
              disabled={importing || deleting}
              className="rounded-xl border border-border/80 bg-surface/80 p-2 text-muted-foreground hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive transition-all active:scale-95 disabled:opacity-50 cursor-pointer shrink-0"
              title="Delete from R2"
              aria-label="Delete file from R2"
            >
              {deleting ? (
                <span className="block h-3.5 w-3.5 animate-spin rounded-full border-2 border-destructive border-t-transparent" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
