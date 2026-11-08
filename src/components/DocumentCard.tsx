import { Link } from "@tanstack/react-router";
import { BookOpen, Trash2 } from "lucide-react";
import { useThumbnail } from "@/hooks/useThumbnail";
import type { DocSummary } from "@/lib/storage";
import { BookCover, GeneratedCover } from "@/components/BookCover";

interface DocumentCardProps {
  doc: DocSummary;
  onDelete: (doc: DocSummary, e: React.MouseEvent) => void;
}

const displayTitle = (fileName: string) => fileName.replace(/\.pdf$/i, "");

export function DocumentCard({ doc, onDelete }: DocumentCardProps) {
  const { thumbnailUrl, loading } = useThumbnail(doc.id);
  const title = displayTitle(doc.fileName);
  const hasProgress = (doc.lastReadPage ?? 0) > 1;

  return (
    <Link
      to="/doc/$id"
      params={{ id: doc.id }}
      search={doc.lastReadPage ? { page: doc.lastReadPage } : undefined}
      aria-label={`${hasProgress ? "Continue reading" : "Read"} ${title}`}
      className="book is-openable block"
    >
      <BookCover
        title={title}
        thumbnailUrl={thumbnailUrl}
        loading={loading}
        fallback={<GeneratedCover title={title} icon="📄" />}
        topRight={
          <button
            onClick={(e) => onDelete(doc, e)}
            className="book-hover-chip flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white/80 backdrop-blur-md transition-colors hover:border-red-400/50 hover:bg-red-500/80 hover:text-white"
            aria-label="Delete document"
            title="Delete document"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        }
        subtitle={
          hasProgress
            ? `Page ${doc.lastReadPage}${doc.pageCount ? ` of ${doc.pageCount}` : ""}`
            : doc.pageCount
              ? `${doc.pageCount} pages`
              : undefined
        }
        action={
          <span className="book-action is-read">
            <BookOpen className="h-3.5 w-3.5" />
            {hasProgress ? "Continue Reading" : "Read Book"}
          </span>
        }
      />
    </Link>
  );
}
