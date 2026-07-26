import { Link } from "@tanstack/react-router";
import { FileText, HardDrive, Trash2 } from "lucide-react";
import { useThumbnail } from "@/hooks/useThumbnail";
import { useIsMobile } from "@/hooks/use-mobile";
import type { DocSummary } from "@/lib/storage";

interface DocumentCardProps {
  doc: DocSummary;
  onDelete: (doc: DocSummary, e: React.MouseEvent) => void;
}

export function DocumentCard({ doc, onDelete }: DocumentCardProps) {
  const isMobile = useIsMobile();
  const { thumbnailUrl, loading } = useThumbnail(doc.id);

  return (
    <Link
      to="/doc/$id"
      params={{ id: doc.id }}
      search={doc.lastReadPage ? { page: doc.lastReadPage } : undefined}
      className="group glass-panel flex flex-col gap-3 rounded-[18px] p-3 transition-all duration-300 hover:bg-surface-2/40 border border-border"
    >
      {/* Thumbnail Area */}
      <div className="relative h-40 overflow-hidden rounded-xl border border-border bg-background/80 shadow-[3px_5px_30px_rgba(0,0,0,0.22)]">
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
            <span className="rounded-full border border-primary/30 bg-primary/25 px-2.5 py-0.5 text-[10px] font-bold text-primary">
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
            <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-[10px] font-bold tracking-tight text-accent">
              AI Processed
            </span>
          )}
          {doc.aiResultCount > 0 && (
            <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
              {doc.aiResultCount} Results
            </span>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-auto flex items-center justify-between border-t border-border/30 pt-3">
        <div className="flex gap-4">
          <div className="flex items-center gap-1 text-muted-foreground">
            <FileText className="h-3.5 w-3.5" />
            <span className="text-[11px] font-bold">{doc.pageCount || "—"} Pgs</span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <HardDrive className="h-3.5 w-3.5" />
            <span className="text-[11px] font-bold">
              {doc.fileSize >= 1024 * 1024
                ? `${(doc.fileSize / (1024 * 1024)).toFixed(1)} MB`
                : `${(doc.fileSize / 1024).toFixed(1)} KB`}
            </span>
          </div>
        </div>
        {/* Hover-reveal works on desktop; on touch devices there's no hover, so
            the delete affordance must stay visible there instead. */}
        <button
          onClick={(e) => onDelete(doc, e)}
          className={`rounded p-1 text-muted-foreground transition-all hover:text-destructive ${
            isMobile ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
          aria-label="Delete document"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </Link>
  );
}
