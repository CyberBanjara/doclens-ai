import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import type { PageAiSummaryEntry } from "@/lib/storage";

interface MobilePageJumpSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pageCount: number;
  activePage: number;
  aiSummary: Record<number, PageAiSummaryEntry>;
  onJump: (page: number) => void;
}

/** Touch-friendly replacement for the desktop `<select>` page-jump dropdown. */
export function MobilePageJumpSheet({
  open,
  onOpenChange,
  pageCount,
  activePage,
  aiSummary,
  onJump,
}: MobilePageJumpSheetProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Jump to page</DrawerTitle>
          <DrawerDescription>{pageCount} pages total &middot; blue dot = translated</DrawerDescription>
        </DrawerHeader>
        <div className="grid grid-cols-6 gap-2 overflow-y-auto px-6 pb-8 pt-1">
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => {
            const isActive = n === activePage;
            const hasAi = aiSummary[n]?.status === "done";
            return (
              <button
                key={n}
                onClick={() => {
                  onJump(n);
                  onOpenChange(false);
                }}
                className={`relative flex h-11 items-center justify-center rounded-xl text-sm font-medium tabular-nums transition-colors active:scale-95 ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface-2/60 text-foreground hover:bg-surface-2"
                }`}
              >
                {n}
                {hasAi && !isActive && (
                  <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
                )}
              </button>
            );
          })}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
