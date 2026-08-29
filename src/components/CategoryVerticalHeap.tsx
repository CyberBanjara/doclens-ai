import { useMemo } from "react";
import { Search, X, Layers, ExternalLink } from "lucide-react";

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
  totalSize?: number;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  syncEnabled?: boolean;
}

export function CategoryVerticalHeap({
  categories,
  activeCategory,
  onSelectCategory,
  categoryStats,
  totalCount,
  searchQuery,
  onSearchChange,
}: CategoryVerticalHeapProps) {
  const allCategories = useMemo(() => {
    return ["all", ...categories.filter((c) => c !== "all")];
  }, [categories]);

  return (
    <aside className="hidden lg:block w-72 shrink-0 space-y-5">
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
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base shadow-inner border ${meta.borderAccent} bg-gradient-to-br ${meta.gradient}`}
                >
                  {meta.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-xs font-semibold ${
                      isActive
                        ? "text-foreground"
                        : "text-foreground/80 group-hover:text-foreground"
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

      {/* Request a Book Community CTA */}
      <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-surface/50 p-4 backdrop-blur-md space-y-3 transition-all duration-300 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5">
        {/* Subtle decorative background glow */}
        <div className="pointer-events-none absolute -right-6 -bottom-6 h-20 w-20 rounded-full bg-primary/10 blur-xl" />

        <div className="relative z-10 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary border border-primary/25 shadow-inner">
              <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.75-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .37z" />
              </svg>
            </div>
            <div>
              <h4 className="text-xs font-bold text-foreground">Request a Book</h4>
              <span className="text-[10px] text-muted-foreground font-medium">
                Telegram Community
              </span>
            </div>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            Can’t find the book you’re looking for? Request it from our Telegram community.
          </p>

          <a
            href="https://t.me/cyber_banjara"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full rounded-xl bg-primary py-2.5 px-3 text-xs font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-all hover:opacity-95 hover:shadow-lg hover:shadow-primary/30 active:scale-[0.98] cursor-pointer group/btn"
          >
            <span>Request a Book</span>
            <ExternalLink className="h-3.5 w-3.5 opacity-80 transition-transform group-hover/btn:translate-x-0.5" />
          </a>
        </div>
      </div>
    </aside>
  );
}
