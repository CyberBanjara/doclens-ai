import { useMemo } from "react";
import { Search, X, Layers, ChevronRight } from "lucide-react";
import {
  SUBJECT_CATEGORIES,
  getSubjectCategoryMeta,
  getEducationLevelMeta,
  type EducationLevel,
  type SubjectCategory,
} from "@/lib/classification";

export { getSubjectCategoryMeta as getCategoryMeta };

interface CategoryVerticalHeapProps {
  categories: string[];
  activeCategory: SubjectCategory | string;
  onSelectCategory: (catKey: SubjectCategory) => void;
  categoryStats: Record<string, { count: number; totalSize: number }>;
  totalCount: number;
  totalSize?: number;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  currentEducationLevel: EducationLevel;
  onOpenEducationModal: () => void;
  syncEnabled?: boolean;
}

export function CategoryVerticalHeap({
  activeCategory,
  onSelectCategory,
  categoryStats,
  searchQuery,
  onSearchChange,
  currentEducationLevel,
  onOpenEducationModal,
}: CategoryVerticalHeapProps) {
  const currentLevelMeta = useMemo(() => {
    return getEducationLevelMeta(currentEducationLevel);
  }, [currentEducationLevel]);

  const visibleCategories = useMemo(() => {
    return SUBJECT_CATEGORIES.filter((cat) => (categoryStats[cat.id]?.count || 0) > 0);
  }, [categoryStats]);

  return (
    <aside className="hidden lg:block w-72 shrink-0 space-y-5">
      {/* Education Level Selector Card */}
      <div className="relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-surface/60 to-surface/40 p-3.5 backdrop-blur-md shadow-sm transition-all hover:border-primary/40">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-primary border border-primary/30 shadow-inner text-base">
              {currentLevelMeta.icon}
            </div>
            <div className="min-w-0 flex-1">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Class / Tier
              </span>
              <h4 className="text-xs font-extrabold text-foreground truncate">
                {currentLevelMeta.label}
              </h4>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenEducationModal}
            className="flex items-center gap-1 rounded-xl bg-surface-2/90 border border-border px-2.5 py-1.5 text-[11px] font-bold text-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all cursor-pointer shadow-sm group"
            title="Switch education category"
          >
            <span>Change</span>
            <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      </div>

      {/* Search Input Box */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search chapters..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full rounded-2xl border border-border bg-surface/60 py-2.5 pl-10 pr-9 text-xs text-foreground placeholder:text-muted-foreground shadow-sm backdrop-blur-md focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded-md cursor-pointer"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Heap Header */}
      <div className="flex items-center justify-between px-1 pt-1">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Subjects
          </h3>
        </div>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-mono font-bold text-primary border border-primary/20">
          {visibleCategories.length} {visibleCategories.length === 1 ? "category" : "categories"}
        </span>
      </div>

      {/* Vertical Heap Stack (Dynamically only subjects with > 0 chapters) */}
      <div className="space-y-2 relative">
        {visibleCategories.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/70 p-4 text-center text-xs text-muted-foreground">
            No subjects found for this class
          </div>
        ) : (
          visibleCategories.map((cat) => {
            const count = categoryStats[cat.id]?.count || 0;
            const isActive = activeCategory === cat.id;

            return (
              <button
                key={cat.id}
                onClick={() => onSelectCategory(cat.id)}
                className={`group relative flex w-full items-center justify-between rounded-2xl p-3 text-left transition-all duration-300 cursor-pointer ${
                  isActive
                    ? "border border-primary/40 bg-surface-2/80 shadow-md shadow-primary/5 text-foreground ring-1 ring-primary/20 translate-x-1"
                    : "border border-border/60 bg-surface/40 text-muted-foreground hover:border-border hover:bg-surface-2/40 hover:text-foreground hover:translate-x-1"
                }`}
              >
                {/* Active Left Pill Bar */}
                {isActive && (
                  <div className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full bg-primary shadow-sm" />
                )}

                <div className="flex items-center gap-3 min-w-0 pl-1">
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base shadow-inner border ${cat.borderAccent} bg-gradient-to-br ${cat.gradient}`}
                  >
                    {cat.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span
                      className={`block truncate text-xs font-semibold ${
                        isActive
                          ? "text-foreground"
                          : "text-foreground/80 group-hover:text-foreground"
                      }`}
                    >
                      {cat.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {count === 1 ? "1 chapter" : `${count} chapters`}
                    </span>
                  </div>
                </div>

                {/* Count Badge */}
                <span
                  className={`ml-2 shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-mono font-semibold transition-colors ${
                    isActive
                      ? cat.badgeBg
                      : "border-border/60 bg-surface/60 text-muted-foreground group-hover:border-border group-hover:text-foreground"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
