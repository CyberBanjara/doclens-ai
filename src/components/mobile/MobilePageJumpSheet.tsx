import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { PageGrid } from "@/components/PageSelector";
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
          <DrawerDescription>
            {pageCount} pages total &middot; blue dot = translated
          </DrawerDescription>
        </DrawerHeader>
        <div data-page-scroll className="relative overflow-y-auto px-5 pb-8 pt-1">
          <PageGrid
            pageCount={pageCount}
            activePage={activePage}
            aiSummary={aiSummary}
            onSelect={(n) => {
              onJump(n);
              onOpenChange(false);
            }}
            className="grid-cols-5 gap-2 min-[400px]:grid-cols-6 [&>button]:h-11 [&>button]:rounded-xl [&>button]:text-sm"
          />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
