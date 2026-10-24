import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Calendar,
  Flame,
  Award,
  BookOpen,
  Loader2,
  RefreshCw,
  Info,
  Sparkles,
  Layers,
  Clock,
  ChevronRight,
} from "lucide-react";
import { apiGetTranslationActivity, type UserActivityData, type UserActivityHeatmapItem } from "@/lib/auth-client";

interface ActivityHeatmapProps {
  userId: string;
  refreshTrigger?: number;
  onRefreshRequested?: () => void;
}

interface DayData {
  dateStr: string; // YYYY-MM-DD
  date: Date;
  dayOfWeek: number; // 0 = Sun, 6 = Sat
  count: number;
  books: Record<string, number>;
  level: 0 | 1 | 2 | 3 | 4;
  isFuture: boolean;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function ActivityHeatmap({ userId, refreshTrigger }: ActivityHeatmapProps) {
  const [activityData, setActivityData] = useState<UserActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hoveredDay, setHoveredDay] = useState<{
    day: DayData;
    x: number;
    y: number;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const loadActivity = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setIsRefreshing(true);

    try {
      const data = await apiGetTranslationActivity(365);
      if (data) {
        setActivityData(data);
      }
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (userId) {
      void loadActivity(false);
    }
  }, [userId, loadActivity]);

  // Re-fetch when parent triggers refresh
  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0 && userId) {
      void loadActivity(true);
    }
  }, [refreshTrigger, userId, loadActivity]);

  // Generate exact 52-week calendar matrix ending at current week's Saturday
  const { weeks, monthLabels, stats } = useMemo(() => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const todayStr = today.toISOString().split("T")[0];

    // Find end Saturday of current week
    const endSaturday = new Date(today);
    const currentDayOfWeek = endSaturday.getDay(); // 0 = Sun, 6 = Sat
    endSaturday.setDate(endSaturday.getDate() + (6 - currentDayOfWeek));

    // 52 weeks = 52 * 7 = 364 days back, starting on a Sunday
    const startSunday = new Date(endSaturday);
    startSunday.setDate(startSunday.getDate() - 52 * 7 + 1);

    const weeksArr: DayData[][] = [];
    let currentWeek: DayData[] = [];
    const months: Array<{ label: string; weekIndex: number }> = [];
    let lastMonth = -1;
    let lastWeekIdx = -5;

    let totalComputedPages = 0;
    let activeDaysCount = 0;
    let bestDayObj: { dateStr: string; count: number; books: Record<string, number> } | null = null;

    const cur = new Date(startSunday);
    let weekIdx = 0;

    while (cur <= endSaturday) {
      const dateStr = cur.toISOString().split("T")[0];
      const isFuture = dateStr > todayStr;
      const dayOfWeek = cur.getDay();

      // Detect month transitions on Sundays
      const monthNumber = cur.getMonth();
      if (dayOfWeek === 0 && monthNumber !== lastMonth) {
        // Enforce spacing between adjacent month labels to avoid visual overlap
        if (weekIdx - lastWeekIdx >= 2) {
          months.push({ label: MONTH_NAMES[monthNumber], weekIndex: weekIdx });
          lastMonth = monthNumber;
          lastWeekIdx = weekIdx;
        }
      }

      const item: UserActivityHeatmapItem | undefined = activityData?.daily_activity?.[dateStr];
      const count = isFuture ? 0 : (item?.count || 0);
      const books = item?.books || {};

      if (count > 0) {
        totalComputedPages += count;
        activeDaysCount += 1;
        if (!bestDayObj || count > bestDayObj.count) {
          bestDayObj = { dateStr, count, books };
        }
      }

      let level: 0 | 1 | 2 | 3 | 4 = 0;
      if (count >= 11) level = 4;
      else if (count >= 6) level = 3;
      else if (count >= 3) level = 2;
      else if (count >= 1) level = 1;

      currentWeek.push({
        dateStr,
        date: new Date(cur),
        dayOfWeek,
        count,
        books,
        level,
        isFuture,
      });

      if (currentWeek.length === 7) {
        weeksArr.push(currentWeek);
        currentWeek = [];
        weekIdx++;
      }

      cur.setDate(cur.getDate() + 1);
    }

    if (currentWeek.length > 0) {
      weeksArr.push(currentWeek);
    }

    // Compute streaks
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;

    const allDays = weeksArr.flat().filter((d) => !d.isFuture);
    for (let i = 0; i < allDays.length; i++) {
      if (allDays[i].count > 0) {
        tempStreak++;
        if (tempStreak > longestStreak) {
          longestStreak = tempStreak;
        }
      } else {
        tempStreak = 0;
      }
    }

    // Current streak (counting backwards from today)
    const reversed = [...allDays].reverse();
    for (const d of reversed) {
      if (d.count > 0) {
        currentStreak++;
      } else if (currentStreak > 0) {
        break;
      }
    }

    const totalPages = Math.max(activityData?.total_pages || 0, totalComputedPages);
    const activeDays = Math.max(activityData?.active_days || 0, activeDaysCount);

    return {
      weeks: weeksArr,
      monthLabels: months,
      stats: {
        totalPages,
        activeDays,
        currentStreak,
        longestStreak,
        bestDay: bestDayObj,
      },
    };
  }, [activityData]);

  // Hover handlers that calculate precise relative coordinates inside container
  const handleCellMouseEnter = (
    e: React.MouseEvent<SVGRectElement>,
    day: DayData,
  ) => {
    if (day.isFuture) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return;

    setHoveredDay({
      day,
      x: rect.left - containerRect.left + rect.width / 2,
      y: rect.top - containerRect.top,
    });
  };

  const handleCellMouseLeave = () => {
    setHoveredDay(null);
  };

  // SVG Dimension Constants
  const X_OFFSET = 34; // Left margin for day-of-week labels
  const COL_WIDTH = 15; // Width of each week column
  const CELL_SIZE = 11.5; // Size of each day square
  const CELL_RADIUS = 2.5; // Rounded corner radius
  const Y_OFFSET = 22; // Top margin for month labels
  const ROW_HEIGHT = 15; // Height of each day row
  const SVG_VIEWBOX_WIDTH = 824;
  const SVG_VIEWBOX_HEIGHT = 136;

  // Level-based SVG fill and stroke styling (GitHub-inspired emerald intensity)
  const getCellClasses = (level: 0 | 1 | 2 | 3 | 4, isFuture: boolean) => {
    if (isFuture) {
      return "opacity-0 pointer-events-none";
    }
    switch (level) {
      case 0:
        return "fill-surface-2/70 stroke-border/50 hover:stroke-emerald-400/60 hover:opacity-100 transition-colors duration-100 cursor-pointer";
      case 1:
        return "fill-emerald-500/35 stroke-emerald-500/50 hover:fill-emerald-500/50 hover:stroke-emerald-400 transition-colors duration-100 cursor-pointer";
      case 2:
        return "fill-emerald-500/65 stroke-emerald-500/80 hover:fill-emerald-500/80 hover:stroke-emerald-300 transition-colors duration-100 cursor-pointer";
      case 3:
        return "fill-emerald-500 stroke-emerald-400/90 hover:fill-emerald-400 hover:stroke-emerald-200 transition-colors duration-100 cursor-pointer";
      case 4:
        return "fill-emerald-400 stroke-emerald-200 hover:fill-emerald-300 hover:stroke-white transition-colors duration-100 cursor-pointer filter drop-shadow-[0_0_4px_rgba(52,211,153,0.45)]";
    }
  };

  const containerWidth = containerRef.current?.clientWidth || 800;
  const tooltipX = hoveredDay ? Math.max(120, Math.min(hoveredDay.x, containerWidth - 120)) : 0;

  return (
    <div
      ref={containerRef}
      className="relative rounded-2xl border border-border/80 bg-gradient-to-b from-card via-surface/90 to-card p-6 shadow-xl backdrop-blur-xl transition-all"
    >
      {/* 1. Header Bar: Title, Live Sync Badge & Refresh Button */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-5 border-b border-border/60">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30 shadow-sm">
            <Calendar className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h3 className="text-sm font-extrabold text-foreground tracking-tight sm:text-base">
                Translation Activity
              </h3>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-400 shadow-sm">
                <Sparkles className="h-3 w-3" />
                Past Year
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {stats.totalPages} pages translated across {stats.activeDays} active days
            </p>
          </div>
        </div>

        <button
          onClick={() => void loadActivity(true)}
          disabled={loading || isRefreshing}
          className="inline-flex items-center gap-2 self-start sm:self-auto rounded-xl border border-border/80 bg-secondary/70 px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-secondary hover:text-emerald-400 hover:border-emerald-500/40 transition-all shadow-sm active:scale-95 disabled:opacity-50"
          title="Sync activity history directly from Supabase"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-emerald-400" : ""}`} />
          <span>{isRefreshing ? "Syncing..." : "Sync Activity"}</span>
        </button>
      </div>

      {/* 2. Elevated 4-Stat Metric Row */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Total Translated Pages */}
        <div className="group relative overflow-hidden rounded-xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 via-surface to-card p-3.5 shadow-sm transition-all hover:border-emerald-500/40 hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Total Translated
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30">
              <BookOpen className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span
              id="user-profile-translated-pages-count"
              className="text-2xl sm:text-3xl font-black text-emerald-400 tabular-nums tracking-tight"
            >
              {stats.totalPages}
            </span>
            <span className="text-xs font-semibold text-emerald-400/80">pages</span>
          </div>
          <span className="text-[10px] text-muted-foreground/90 mt-0.5 block truncate">
            All-time translation count
          </span>
        </div>

        {/* Active Days */}
        <div className="group relative overflow-hidden rounded-xl border border-cyan-500/25 bg-gradient-to-br from-cyan-500/10 via-surface to-card p-3.5 shadow-sm transition-all hover:border-cyan-500/40 hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Active Days
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-400 ring-1 ring-cyan-500/30">
              <Calendar className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-black text-cyan-400 tabular-nums tracking-tight">
              {stats.activeDays}
            </span>
            <span className="text-xs font-semibold text-cyan-400/80">days</span>
          </div>
          <span className="text-[10px] text-muted-foreground/90 mt-0.5 block truncate">
            Days with translations
          </span>
        </div>

        {/* Current Streak */}
        <div className="group relative overflow-hidden rounded-xl border border-amber-500/25 bg-gradient-to-br from-amber-500/10 via-surface to-card p-3.5 shadow-sm transition-all hover:border-amber-500/40 hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Daily Streak
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30">
              <Flame className="h-3.5 w-3.5 text-amber-400" />
            </div>
          </div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-black text-amber-400 tabular-nums tracking-tight">
              {stats.currentStreak}
            </span>
            <span className="text-xs font-semibold text-amber-400/80">
              {stats.currentStreak === 1 ? "day" : "days"}
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground/90 mt-0.5 block truncate">
            Current continuous streak
          </span>
        </div>

        {/* Best Single Day */}
        <div className="group relative overflow-hidden rounded-xl border border-purple-500/25 bg-gradient-to-br from-purple-500/10 via-surface to-card p-3.5 shadow-sm transition-all hover:border-purple-500/40 hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Best Day
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/15 text-purple-400 ring-1 ring-purple-500/30">
              <Award className="h-3.5 w-3.5 text-purple-400" />
            </div>
          </div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-black text-purple-400 tabular-nums tracking-tight">
              {stats.bestDay ? stats.bestDay.count : 0}
            </span>
            <span className="text-xs font-semibold text-purple-400/80">pages</span>
          </div>
          <span className="text-[10px] text-muted-foreground/90 mt-0.5 block truncate">
            {stats.bestDay ? stats.bestDay.dateStr : "Peak single day"}
          </span>
        </div>
      </div>

      {/* 3. GitHub-Style SVG Calendar Matrix */}
      <div className="mt-6">
        {loading ? (
          <div className="flex h-36 w-full flex-col items-center justify-center gap-2.5 rounded-xl border border-border/50 bg-background/50">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
            <span className="text-xs font-medium text-muted-foreground">
              Loading translation history from Supabase...
            </span>
          </div>
        ) : (
          <div className="rounded-xl border border-border/60 bg-background/60 p-4 shadow-inner">
            <div className="w-full overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
              <svg
                ref={svgRef}
                viewBox={`0 0 ${SVG_VIEWBOX_WIDTH} ${SVG_VIEWBOX_HEIGHT}`}
                className="w-full min-w-[700px] h-auto overflow-visible select-none"
                preserveAspectRatio="xMidYMid meet"
              >
                {/* Month labels placed directly above each month's starting week column */}
                {monthLabels.map((m, idx) => {
                  const x = X_OFFSET + m.weekIndex * COL_WIDTH;
                  return (
                    <text
                      key={`month-${idx}`}
                      x={x}
                      y={13}
                      className="fill-muted-foreground text-[10px] font-semibold tracking-tight"
                    >
                      {m.label}
                    </text>
                  );
                })}

                {/* Day of week labels on the left gutter */}
                <text
                  x={24}
                  y={Y_OFFSET + 1 * ROW_HEIGHT + 9}
                  textAnchor="end"
                  className="fill-muted-foreground/75 text-[9px] font-semibold"
                >
                  Mon
                </text>
                <text
                  x={24}
                  y={Y_OFFSET + 3 * ROW_HEIGHT + 9}
                  textAnchor="end"
                  className="fill-muted-foreground/75 text-[9px] font-semibold"
                >
                  Wed
                </text>
                <text
                  x={24}
                  y={Y_OFFSET + 5 * ROW_HEIGHT + 9}
                  textAnchor="end"
                  className="fill-muted-foreground/75 text-[9px] font-semibold"
                >
                  Fri
                </text>

                {/* 52-Week Columns of Rectangles */}
                {weeks.map((week, wIdx) => {
                  const colX = X_OFFSET + wIdx * COL_WIDTH;
                  return (
                    <g key={`week-col-${wIdx}`}>
                      {week.map((day) => {
                        const cellY = Y_OFFSET + day.dayOfWeek * ROW_HEIGHT;
                        const cellClass = getCellClasses(day.level, day.isFuture);
                        return (
                          <rect
                            key={day.dateStr}
                            x={colX}
                            y={cellY}
                            width={CELL_SIZE}
                            height={CELL_SIZE}
                            rx={CELL_RADIUS}
                            ry={CELL_RADIUS}
                            strokeWidth={1}
                            className={cellClass}
                            onMouseEnter={(e) => handleCellMouseEnter(e, day)}
                            onMouseLeave={handleCellMouseLeave}
                            onClick={(e) => handleCellMouseEnter(e, day)}
                            data-date={day.dateStr}
                            data-count={day.count}
                          />
                        );
                      })}
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Heatmap Footer Legend & Guidance */}
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pt-3 border-t border-border/40 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground/90">
                <Info className="h-3.5 w-3.5 text-emerald-400" />
                Hover over any date square to inspect book-by-book translation breakdown.
              </span>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <span className="text-[11px] font-medium text-muted-foreground">Less</span>
                <div className="flex items-center gap-1">
                  <div
                    className="h-3 w-3 rounded-[2px] border border-border/50 bg-surface-2/70"
                    title="0 pages"
                  />
                  <div
                    className="h-3 w-3 rounded-[2px] border border-emerald-500/50 bg-emerald-500/35"
                    title="1–2 pages"
                  />
                  <div
                    className="h-3 w-3 rounded-[2px] border border-emerald-500/80 bg-emerald-500/65"
                    title="3–5 pages"
                  />
                  <div
                    className="h-3 w-3 rounded-[2px] border border-emerald-400/90 bg-emerald-500"
                    title="6–10 pages"
                  />
                  <div
                    className="h-3 w-3 rounded-[2px] border border-emerald-200 bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]"
                    title="11+ pages"
                  />
                </div>
                <span className="text-[11px] font-medium text-muted-foreground">More</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. Interactive Floating Tooltip */}
      {hoveredDay && (
        <div
          style={{
            left: `${tooltipX}px`,
            top: `${hoveredDay.y - 12}px`,
            transform: "translate(-50%, -100%)",
          }}
          className="pointer-events-none absolute z-50 min-w-[220px] max-w-[320px] rounded-xl border border-border/90 bg-popover/95 p-3.5 text-popover-foreground shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="flex items-center justify-between pb-2 border-b border-border/60">
            <span className="text-xs font-bold text-foreground">
              {hoveredDay.day.date.toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
            <span
              className={`inline-flex items-center rounded-lg px-2 py-0.5 text-[11px] font-bold ${
                hoveredDay.day.count > 0
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {hoveredDay.day.count} {hoveredDay.day.count === 1 ? "page" : "pages"}
            </span>
          </div>

          {hoveredDay.day.count > 0 ? (
            <div className="mt-2.5 space-y-1.5">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">
                Translated Books
              </span>
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {Object.entries(hoveredDay.day.books).map(([title, pages]) => (
                  <div
                    key={title}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-surface/60 px-2.5 py-1.5 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <BookOpen className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      <span className="truncate font-semibold text-foreground" title={title}>
                        {title}
                      </span>
                    </div>
                    <span className="shrink-0 text-emerald-400 font-extrabold tabular-nums text-xs">
                      {pages} {pages === 1 ? "page" : "pages"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground italic">
              No translation activity recorded on this date.
            </p>
          )}
        </div>
      )}

      {/* 5. Recent Translations Feed */}
      {activityData?.recent_activities && activityData.recent_activities.length > 0 && (
        <div className="mt-6 pt-5 border-t border-border/60">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-emerald-400" />
              Recent Translation Feed
            </h4>
            <span className="text-[11px] text-muted-foreground">
              Last {Math.min(activityData.recent_activities.length, 5)} translated pages
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {activityData.recent_activities.slice(0, 6).map((item, idx) => (
              <div
                key={`${item.bookTitle}-${item.pageNumber}-${idx}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-surface/40 p-2.5 text-xs transition-colors hover:bg-surface/70"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 shrink-0">
                    <BookOpen className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0">
                    <span className="truncate font-semibold text-foreground block" title={item.bookTitle}>
                      {item.bookTitle}
                    </span>
                    <span className="text-[10px] text-muted-foreground block">
                      Page {item.pageNumber} • {item.language}
                    </span>
                  </div>
                </div>

                <span className="shrink-0 text-[10px] font-mono text-muted-foreground/80">
                  {new Date(item.translatedAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
