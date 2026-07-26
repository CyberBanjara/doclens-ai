import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";

interface MobileTopBarProps {
  docName: string;
  activePage: number;
  pageCount: number;
  onOpenPageJump: () => void;
}

/** Translucent, permanently fixed immersive-reader header — stays visible at
 * all times regardless of scroll position, matching MobileBottomBar. */
export function MobileTopBar({ docName, activePage, pageCount, onOpenPageJump }: MobileTopBarProps) {
  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center gap-2 px-3 pb-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background/90 via-background/60 to-transparent backdrop-blur-md [mask-image:linear-gradient(to_bottom,black_60%,transparent)]" />

      <Link
        to="/"
        className="pointer-events-auto flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-surface/80 text-foreground shadow-sm backdrop-blur-md active:scale-95"
        aria-label="Back to Library"
      >
        <ChevronLeft className="h-5 w-5" />
      </Link>

      <h1 className="pointer-events-none min-w-0 flex-1 truncate text-center text-[13px] font-semibold text-foreground">
        {docName}
      </h1>

      {pageCount > 0 ? (
        <button
          onClick={onOpenPageJump}
          className="pointer-events-auto flex h-9 flex-shrink-0 items-center rounded-full bg-surface/80 px-3 text-xs font-medium tabular-nums text-foreground shadow-sm backdrop-blur-md active:scale-95"
        >
          {activePage} / {pageCount}
        </button>
      ) : (
        <div className="h-9 w-9 flex-shrink-0" />
      )}
    </header>
  );
}
