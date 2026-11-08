import { useCallback, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { PageAiSummaryEntry } from "@/lib/storage";

interface PageSelectorProps {
  pageCount: number;
  activePage: number;
  aiSummary: Record<number, PageAiSummaryEntry>;
  onSelect: (page: number) => void;
}

/** Shared page-number grid used by the desktop popover and the mobile jump sheet. */
export function PageGrid({
  pageCount,
  activePage,
  aiSummary,
  onSelect,
  className = "",
}: PageSelectorProps & { className?: string }) {
  // Scroll the current page into view when the grid mounts.
  const activeRef = useCallback((el: HTMLButtonElement | null) => {
    // Only scroll the grid's own scroll container, never the page behind it.
    const scroller = el?.closest<HTMLElement>("[data-page-scroll]");
    if (!el || !scroller) return;
    requestAnimationFrame(() => {
      scroller.scrollTop = el.offsetTop - scroller.clientHeight / 2 + el.offsetHeight / 2;
    });
  }, []);

  return (
    <div className={`grid gap-1.5 ${className}`}>
      {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => {
        const isActive = n === activePage;
        const hasAi = aiSummary[n]?.status === "done";
        return (
          <button
            key={n}
            ref={isActive ? activeRef : undefined}
            onClick={() => onSelect(n)}
            aria-current={isActive ? "page" : undefined}
            aria-label={`Page ${n}${hasAi ? " (translated)" : ""}`}
            className={`relative flex items-center justify-center rounded-lg font-medium tabular-nums transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:scale-95 ${
              isActive
                ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30"
                : "bg-surface-2/50 text-foreground/85 hover:bg-surface-2 hover:text-foreground"
            }`}
          >
            {n}
            {hasAi && !isActive && (
              <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-primary" />
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Desktop page picker: compact trigger + popover grid of page tiles. */
export function PageSelector({ pageCount, activePage, aiSummary, onSelect }: PageSelectorProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="group flex h-8 items-center gap-1.5 rounded-lg bg-surface-2/60 px-3 text-xs tabular-nums transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 data-[state=open]:bg-surface-2"
          aria-label="Select page"
        >
          <span className="font-semibold text-foreground">{activePage}</span>
          <span className="text-muted-foreground">/ {pageCount}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        sideOffset={8}
        className="w-[18.5rem] rounded-2xl border-border/70 p-0 shadow-xl"
      >
        <div className="flex items-center justify-between px-3.5 pb-2 pt-3">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Jump to page
          </span>
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            translated
          </span>
        </div>
        <div
          data-page-scroll
          className="relative max-h-72 overflow-y-auto px-3 pb-3 [scrollbar-width:thin]"
        >
          <PageGrid
            pageCount={pageCount}
            activePage={activePage}
            aiSummary={aiSummary}
            onSelect={(n) => {
              onSelect(n);
              setOpen(false);
            }}
            className="grid-cols-5 [&>button]:h-9 [&>button]:text-xs"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
