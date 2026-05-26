import { Link } from "@tanstack/react-router";
import { useThumbnail } from "@/hooks/useThumbnail";
import type { DocSummary } from "@/lib/storage";

interface DocumentCardProps {
  doc: DocSummary;
  onDelete: (doc: DocSummary, e: React.MouseEvent) => void;
}

export function DocumentCard({ doc, onDelete }: DocumentCardProps) {
  const { thumbnailUrl, loading } = useThumbnail(doc.id);

  return (
    <Link
      to="/doc/$id"
      params={{ id: doc.id }}
      className="group glass-panel flex flex-col gap-3 rounded-xl p-3 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_45px_rgba(0,0,0,0.22)]"
    >
      {/* Thumbnail Area */}
      <div className="relative h-40 overflow-hidden rounded-lg border border-border bg-background/80">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={`Preview of ${doc.fileName}`}
            className="h-full w-full object-cover opacity-60 transition-transform duration-500 group-hover:scale-105"
          />
        ) : loading ? (
          <div className="flex h-full w-full items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-primary/10 font-mono text-lg font-black text-primary ring-1 ring-primary/20">
              PDF
            </div>
          </div>
        )}
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
        {/* Status badges */}
        <div className="absolute right-2 top-2 flex flex-col gap-1 items-end">
          {doc.hasExtraction && (
            <span className="rounded-md border border-primary/30 bg-primary/20 px-2 py-0.5 text-[11px] font-semibold text-primary">
              Extracted
            </span>
          )}
        </div>
      </div>

      {/* Document Info */}
      <div className="space-y-1.5">
        <h4 className="truncate text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
          {doc.fileName}
        </h4>
        <div className="flex flex-wrap items-center gap-1.5">
          {doc.hasExtraction && (
            <span className="rounded bg-accent/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent">
              AI Processed
            </span>
          )}
          {doc.aiResultCount > 0 && (
            <span className="rounded bg-surface-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {doc.aiResultCount} Results
            </span>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-auto flex items-center justify-between border-t border-border/30 pt-3">
        <div className="flex gap-4">
          <div className="flex items-center gap-1 text-muted-foreground">
            <span className="text-xs">📄</span>
            <span className="text-[11px] font-bold">{doc.pageCount || "—"} Pgs</span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <span className="text-xs">💾</span>
            <span className="text-[11px] font-bold">
              {doc.fileSize >= 1024 * 1024
                ? `${(doc.fileSize / (1024 * 1024)).toFixed(1)} MB`
                : `${(doc.fileSize / 1024).toFixed(1)} KB`}
            </span>
          </div>
        </div>
        <button
          onClick={(e) => onDelete(doc, e)}
          className="rounded p-1 text-muted-foreground opacity-0 transition-all hover:text-destructive group-hover:opacity-100"
          aria-label="Delete document"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
          </svg>
        </button>
      </div>
    </Link>
  );
}
