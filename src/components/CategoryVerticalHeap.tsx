import { useMemo } from "react";
import { Search, X, Folder, Layers, CloudCheck, HardDrive } from "lucide-react";
import { formatBytes } from "@/lib/file-utils";

export interface CategoryMeta {
  key: string;
  label: string;
  icon: string;
  gradient: string;
  accentColor: string;
  borderAccent: string;
  badgeBg: string;
}

export const CATEGORY_META_MAP: Record<string, CategoryMeta> = {
  all: {
    key: "all",
    label: "All Documents",
    icon: "🌐",
    gradient: "from-blue-500/20 via-indigo-500/10 to-purple-500/20",
    accentColor: "text-blue-400",
    borderAccent: "border-blue-500/30",
    badgeBg: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  },
  history: {
    key: "history",
    label: "History",
    icon: "📜",
    gradient: "from-amber-500/20 via-orange-500/10 to-yellow-500/20",
    accentColor: "text-amber-400",
    borderAccent: "border-amber-500/30",
    badgeBg: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  },
  economics: {
    key: "economics",
    label: "Economics",
    icon: "📈",
    gradient: "from-emerald-500/20 via-teal-500/10 to-green-500/20",
    accentColor: "text-emerald-400",
    borderAccent: "border-emerald-500/30",
    badgeBg: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  },
  geography: {
    key: "geography",
    label: "Geography",
    icon: "🌍",
    gradient: "from-sky-500/20 via-cyan-500/10 to-blue-500/20",
    accentColor: "text-sky-400",
    borderAccent: "border-sky-500/30",
    badgeBg: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  },
  civics: {
    key: "civics",
    label: "Civics",
    icon: "🏛️",
    gradient: "from-purple-500/20 via-pink-500/10 to-violet-500/20",
    accentColor: "text-purple-400",
    borderAccent: "border-purple-500/30",
    badgeBg: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  },
  science: {
    key: "science",
    label: "Science",
    icon: "🔬",
    gradient: "from-cyan-500/20 via-blue-500/10 to-indigo-500/20",
    accentColor: "text-cyan-400",
    borderAccent: "border-cyan-500/30",
    badgeBg: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  },
  uncategorized: {
    key: "uncategorized",
    label: "Uncategorized",
    icon: "📂",
    gradient: "from-slate-500/20 via-gray-500/10 to-zinc-500/20",
    accentColor: "text-slate-400",
    borderAccent: "border-slate-500/30",
    badgeBg: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  },
};

export function getCategoryMeta(key: string): CategoryMeta {
  if (CATEGORY_META_MAP[key]) {
    return CATEGORY_META_MAP[key];
  }
  const capitalized = key.charAt(0).toUpperCase() + key.slice(1);
  return {
    key,
    label: capitalized,
    icon: "📁",
    gradient: "from-indigo-500/20 via-violet-500/10 to-purple-500/20",
    accentColor: "text-indigo-400",
    borderAccent: "border-indigo-500/30",
    badgeBg: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  };
}

interface CategoryVerticalHeapProps {
  categories: string[];
  activeCategory: string;
  onSelectCategory: (catKey: string) => void;
  categoryStats: Record<string, { count: number; totalSize: number }>;
  totalCount: number;
  totalSize: number;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  syncEnabled: boolean;
}

export function CategoryVerticalHeap({
  categories,
  activeCategory,
  onSelectCategory,
  categoryStats,
  totalCount,
  totalSize,
  searchQuery,
  onSearchChange,
  syncEnabled,
}: CategoryVerticalHeapProps) {
  const allCategories = useMemo(() => {
    return ["all", ...categories.filter((c) => c !== "all")];
  }, [categories]);

  return (
    <aside className="w-full lg:w-72 shrink-0 space-y-5">
      {/* Search Input Box */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search library..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full rounded-2xl border border-border bg-surface/60 py-2.5 pl-10 pr-9 text-xs text-foreground placeholder:text-muted-foreground shadow-sm backdrop-blur-md focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded-md"
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
            Categories
          </h3>
        </div>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-mono font-bold text-primary border border-primary/20">
          {allCategories.length - 1} folders
        </span>
      </div>

      {/* Vertical Heap Stack */}
      <div className="space-y-2 relative">
        {allCategories.map((catKey) => {
          const meta = getCategoryMeta(catKey);
          const count = catKey === "all" ? totalCount : categoryStats[catKey]?.count || 0;
          const isActive = activeCategory === catKey;

          return (
            <button
              key={catKey}
              onClick={() => onSelectCategory(catKey)}
              className={`group relative flex w-full items-center justify-between rounded-2xl p-3 text-left transition-all duration-300 ${
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
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base shadow-inner border ${meta.borderAccent} bg-gradient-to-br ${meta.gradient}`}
                >
                  {meta.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-xs font-semibold ${
                      isActive ? "text-foreground" : "text-foreground/80 group-hover:text-foreground"
                    }`}
                  >
                    {meta.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {count === 1 ? "1 document" : `${count} documents`}
                  </span>
                </div>
              </div>

              {/* Count Badge */}
              <span
                className={`ml-2 shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-mono font-semibold transition-colors ${
                  isActive
                    ? meta.badgeBg
                    : "border-border/60 bg-surface/60 text-muted-foreground group-hover:border-border group-hover:text-foreground"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Heap Footer Stats Panel */}
      <div className="rounded-2xl border border-border/80 bg-surface/50 p-4 backdrop-blur-md space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground font-medium">
            <HardDrive className="h-3.5 w-3.5 text-primary/70" />
            Total Library Storage
          </span>
          <span className="font-mono font-bold text-foreground">{formatBytes(totalSize)}</span>
        </div>

        <div className="flex items-center justify-between border-t border-border/40 pt-2.5 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground font-medium">
            <CloudCheck className="h-3.5 w-3.5 text-emerald-400" />
            Cloud Sync
          </span>
          <span
            className={`font-mono text-[10px] font-bold uppercase tracking-wider ${
              syncEnabled ? "text-emerald-400" : "text-amber-400"
            }`}
          >
            {syncEnabled ? "R2 Active" : "Read-only"}
          </span>
        </div>
      </div>
    </aside>
  );
}
