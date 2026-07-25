import { BookOpen, MoreHorizontal } from "lucide-react";
import { MobileMiniPlayer } from "@/components/mobile/MobileMiniPlayer";

interface MobileBottomBarProps {
  onOpenReader: () => void;
  onOpenOverflow: () => void;
}

/** Floating glass control pill — the entire "chrome" a reader sees at rest.
 * Permanently fixed to the bottom of the viewport: unlike the top bar, this
 * never hides on scroll, since it's the primary playback control surface. */
export function MobileBottomBar({ onOpenReader, onOpenOverflow }: MobileBottomBarProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-border/60 bg-surface/85 p-1.5 shadow-xl backdrop-blur-xl">
        <MobileMiniPlayer onOpenReader={onOpenReader} />

        <button
          onClick={onOpenReader}
          className="flex h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-foreground transition-colors active:scale-95"
        >
          <BookOpen className="h-4 w-4" />
          Read
        </button>

        <button
          onClick={onOpenOverflow}
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-foreground/80 transition-colors active:scale-95"
          aria-label="More actions"
        >
          <MoreHorizontal className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
