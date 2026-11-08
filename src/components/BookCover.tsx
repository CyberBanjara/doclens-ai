import { useState, type ReactNode } from "react";

interface BookCoverProps {
  title: string;
  thumbnailUrl?: string | null;
  loading?: boolean;
  /** Rendered when there's no thumbnail (stylised generated cover). */
  fallback: ReactNode;
  topLeft?: ReactNode;
  topRight?: ReactNode;
  /** Small line under the title in the reveal panel. */
  subtitle?: ReactNode;
  /** Primary action shown in the reveal panel. */
  action?: ReactNode;
}

/**
 * Visual-only full-bleed book cover. Wrap it in an element with the `book`
 * class (add `is-openable` to get the cover-opening hover, `is-busy` to pin
 * the reveal panel open).
 */
export function BookCover({
  title,
  thumbnailUrl,
  loading,
  fallback,
  topLeft,
  topRight,
  subtitle,
  action,
}: BookCoverProps) {
  const [imgError, setImgError] = useState(false);
  const showImg = Boolean(thumbnailUrl) && !imgError;

  return (
    <>
      <div className="book-lift">
        <div className="book-pages" aria-hidden>
          <div className="book-pages-lines" />
        </div>

        <div className="book-cover">
          {showImg ? (
            <img
              src={thumbnailUrl!}
              alt={`Cover of ${title}`}
              loading="lazy"
              draggable={false}
              onError={() => setImgError(true)}
            />
          ) : loading ? (
            <div className="flex h-full w-full items-center justify-center bg-surface-2/60">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : (
            fallback
          )}
          <div className="book-spine" aria-hidden />
          <div className="book-sheen" aria-hidden />

          {(topLeft || topRight) && (
            <div className="absolute inset-x-0 top-0 z-[5] flex items-start justify-between gap-2 p-2 pl-3.5">
              <div className="min-w-0">{topLeft}</div>
              <div className="shrink-0">{topRight}</div>
            </div>
          )}
        </div>
      </div>
      <div className="book-reveal">
        <div className="min-w-0">
          <h3
            className="line-clamp-2 text-[13px] font-bold leading-snug text-white drop-shadow"
            title={title}
          >
            {title}
          </h3>
          {subtitle && (
            <p className="mt-0.5 truncate text-[10.5px] font-medium text-white/65">{subtitle}</p>
          )}
        </div>
        {action}
      </div>
    </>
  );
}

/** Generated cover for documents without a thumbnail. */
export function GeneratedCover({
  title,
  gradient,
  icon,
}: {
  title: string;
  gradient?: string;
  icon: ReactNode;
}) {
  return (
    <div
      className={`relative flex h-full w-full flex-col justify-between bg-gradient-to-br ${
        gradient ?? "from-primary/40 via-surface-2 to-surface"
      } p-4 pl-6`}
    >
      <div className="absolute inset-0 bg-grid opacity-40" />
      <div className="relative mt-6 h-px w-10 bg-white/40" />
      <p className="relative line-clamp-4 font-serif text-sm font-semibold leading-snug text-foreground/90">
        {title}
      </p>
      <div className="relative flex items-center justify-between">
        <span className="text-2xl drop-shadow">{icon}</span>
        <span className="h-px w-8 bg-white/30" />
      </div>
    </div>
  );
}
