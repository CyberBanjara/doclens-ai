import { Trash2, Download, Check, BookOpen } from "lucide-react";
import { formatBytes, type R2File } from "@/lib/file-utils";
import { getSubjectCategoryMeta, type ClassifiedBook } from "@/lib/classification";
import { useR2Thumbnail } from "@/hooks/useR2Thumbnail";
import type { DocSummary } from "@/lib/storage";
import { BookCover, GeneratedCover } from "@/components/BookCover";

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
  const busy = importing || deleting;
  const lastPage = localDoc?.lastReadPage ?? 0;
  const hasProgress = lastPage > 1;

  const { thumbnailUrl, loading: thumbLoading } = useR2Thumbnail(
    file.key,
    activeDocId,
    file.thumbnailUrl,
    file.hasThumbnail,
  );

  // Clicking the cover opens an imported book; downloading stays an explicit
  // button press so a stray tap never starts a download.
  const openBook = () => {
    if (!busy && isImported && activeDocId) onOpenLocalDoc(activeDocId);
  };

  return (
    <div
      role={isImported ? "button" : undefined}
      tabIndex={isImported ? 0 : undefined}
      aria-label={
        isImported ? `${hasProgress ? "Continue reading" : "Read"} ${file.displayName}` : undefined
      }
      onClick={openBook}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openBook();
        }
      }}
      className={`book ${isImported ? "is-openable" : "cursor-default"} ${busy ? "is-busy" : ""}`}
    >
      <BookCover
        title={file.displayName}
        thumbnailUrl={thumbnailUrl}
        loading={thumbLoading && Boolean(activeDocId)}
        fallback={
          <GeneratedCover
            title={file.displayName}
            gradient={catMeta.gradient}
            icon={catMeta.icon}
          />
        }
        topLeft={
          isImported ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/30 bg-emerald-950/70 px-2 py-0.5 text-[10px] font-bold text-emerald-300 shadow-sm backdrop-blur-md">
              <Check className="h-3 w-3 stroke-[2.5]" />
              In Library
            </span>
          ) : null
        }
        topRight={
          <div className="flex items-center gap-1.5">
            <span className="book-hover-chip rounded-full border border-white/15 bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white/90 backdrop-blur-md">
              {formatBytes(file.size)}
            </span>
            {syncEnabled && onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(file);
                }}
                disabled={busy}
                className="book-hover-chip flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white/80 backdrop-blur-md transition-colors hover:border-red-400/50 hover:bg-red-500/80 hover:text-white disabled:opacity-50"
                title="Delete from R2"
                aria-label="Delete file from R2"
              >
                {deleting ? (
                  <span className="block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Trash2 className="h-3 w-3" />
                )}
              </button>
            )}
          </div>
        }
        subtitle={
          isImported
            ? hasProgress
              ? `Page ${lastPage}${localDoc?.pageCount ? ` of ${localDoc.pageCount}` : ""}`
              : "Ready to read"
            : catMeta.label
        }
        action={
          isImported ? (
            <span className="book-action is-read">
              <BookOpen className="h-3.5 w-3.5" />
              {hasProgress ? "Continue Reading" : "Read Book"}
            </span>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onImport(file);
              }}
              disabled={busy}
              className="book-action"
            >
              {importing ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Downloading…
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5" />
                  Download
                </>
              )}
            </button>
          )
        }
      />
    </div>
  );
}
