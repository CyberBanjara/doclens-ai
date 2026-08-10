import { useState } from "react";
import { FileText, HardDrive, Calendar, Trash2, Download, ExternalLink, Check } from "lucide-react";
import { formatBytes, formatDate, type ParsedR2File, type R2File } from "@/lib/file-utils";
import { getCategoryMeta } from "@/components/CategoryVerticalHeap";
import { useR2Thumbnail } from "@/hooks/useR2Thumbnail";

interface GlobalLibraryCardProps {
  file: ParsedR2File;
  localDocId?: string | null;
  importing: boolean;
  deleting: boolean;
  syncEnabled: boolean;
  onImport: (file: R2File) => void;
  onDelete: (file: R2File) => void;
  onOpenLocalDoc: (docId: string) => void;
}

export function GlobalLibraryCard({
  file,
  localDocId,
  importing,
  deleting,
  syncEnabled,
  onImport,
  onDelete,
  onOpenLocalDoc,
}: GlobalLibraryCardProps) {
  const catMeta = getCategoryMeta(file.category);
  const { thumbnailUrl, loading: thumbLoading } = useR2Thumbnail(file.key, localDocId);

  const [imgError, setImgError] = useState(false);

  const isImported = Boolean(localDocId);

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-border/80 bg-surface/60 backdrop-blur-xl shadow-md transition-all duration-300 hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-primary/10 hover:border-primary/40">
      {/* Playcard Top Thumbnail / Preview Header */}
      <div className="relative h-44 sm:h-48 w-full overflow-hidden bg-gradient-to-br from-surface-2/80 to-surface border-b border-border/50">
        {thumbnailUrl && !imgError ? (
          <div className="relative h-full w-full overflow-hidden bg-black/20">
            <img
              src={thumbnailUrl}
              alt={`Preview of ${file.displayName}`}
              onError={() => setImgError(true)}
              className="h-full w-full object-cover object-top opacity-95 transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          </div>
        ) : thumbLoading && localDocId ? (
          <div className="flex h-full w-full items-center justify-center bg-surface-2/40">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          /* Playcard Dynamic Artwork Cover */
          <div className={`relative h-full w-full bg-gradient-to-br ${catMeta.gradient} flex flex-col items-center justify-center p-4 text-center select-none`}>
            {/* Background Pattern Grid */}
            <div className="absolute inset-0 bg-grid opacity-30" />
            
            {/* Center Icon Artwork */}
            <div className="relative z-10 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface/70 backdrop-blur-md text-3xl shadow-lg border border-border/60 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-2">
              {catMeta.icon}
            </div>

            {/* Document Watermark Title */}
            <p className="relative z-10 mt-2.5 max-w-[180px] truncate text-[11px] font-medium text-foreground/70">
              {file.displayName}
            </p>
          </div>
        )}

        {/* Top Badges Overlay */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none z-10">
          {/* Category Tag */}
          <span className="flex items-center gap-1 rounded-full border border-border/60 bg-surface/80 backdrop-blur-md px-2.5 py-1 text-[10px] font-semibold text-foreground shadow-sm">
            <span>{catMeta.icon}</span>
            <span className="capitalize">{catMeta.label}</span>
          </span>

          {/* PDF Format Tag */}
          <span className="rounded-md border border-primary/30 bg-primary/20 backdrop-blur-md px-2 py-0.5 font-mono text-[10px] font-bold text-primary shadow-sm">
            PDF
          </span>
        </div>
      </div>

      {/* Playcard Body Content */}
      <div className="flex flex-1 flex-col p-4 space-y-3">
        <div>
          <h3
            className="line-clamp-2 text-xs sm:text-sm font-semibold text-foreground leading-snug group-hover:text-primary transition-colors"
            title={file.displayName}
          >
            {file.displayName}
          </h3>
        </div>

        {/* File Metadata */}
        <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
          <span className="flex items-center gap-1 font-medium">
            <HardDrive className="h-3 w-3 text-muted-foreground/70" />
            {formatBytes(file.size)}
          </span>
          <span className="flex items-center gap-1 font-medium">
            <Calendar className="h-3 w-3 text-muted-foreground/70" />
            {formatDate(file.lastModified)}
          </span>
        </div>

        {/* Playcard Footer Actions */}
        <div className="mt-auto border-t border-border/40 pt-3 flex items-center justify-between gap-2">
          {isImported && localDocId ? (
            <button
              onClick={() => onOpenLocalDoc(localDocId)}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 py-1.5 px-3 text-xs font-semibold text-emerald-400 transition-all hover:bg-emerald-500/20 active:scale-95 cursor-pointer"
            >
              <Check className="h-3.5 w-3.5" />
              <span>Open Document</span>
            </button>
          ) : (
            <button
              onClick={() => onImport(file)}
              disabled={importing || deleting}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-primary py-1.5 px-3 text-xs font-semibold text-primary-foreground shadow-sm shadow-primary/20 transition-all hover:opacity-95 active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {importing ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                  <span>Importing…</span>
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5" />
                  <span>Import</span>
                </>
              )}
            </button>
          )}

          {/* Delete Action (If Sync Enabled) */}
          {syncEnabled && (
            <button
              onClick={() => onDelete(file)}
              disabled={importing || deleting}
              className="rounded-xl border border-border/80 bg-surface/80 p-2 text-muted-foreground hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
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
