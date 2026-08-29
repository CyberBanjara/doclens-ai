import { useEffect, useRef } from "react";

export interface CategoryMarqueeItem {
  key: string;
  label: string;
  icon?: string;
  count: number;
  active: boolean;
  onClick: () => void;
}

interface CategoryMarqueeRowProps {
  items: CategoryMarqueeItem[];
  speed?: number; // pixels per frame for slow continuous drift
}

/**
 * Slow, continuously auto-scrolling category row for the mobile Global Library.
 * Moves slowly in the leftward direction like a modern e-book app discovery carousel.
 * The list is repeated so the loop wraps seamlessly, and auto-scroll pauses
 * while the user is actively touching/dragging so manual swipes and taps still work.
 */
export function CategoryMarqueeRow({ items, speed = 0.4 }: CategoryMarqueeRowProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  const resumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Repeat items 3 times for a seamless wrapping loop
  const repeatedItems = items.length > 0 ? [...items, ...items, ...items] : [];

  useEffect(() => {
    const el = containerRef.current;
    if (!el || items.length === 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frameId: number;
    let pos = el.scrollLeft;

    const step = () => {
      if (!pausedRef.current) {
        const setWidth = el.scrollWidth / 3;
        if (setWidth > 0) {
          pos += speed;
          if (pos >= setWidth) {
            pos -= setWidth;
          }
          el.scrollLeft = pos;
        }
      } else {
        // Stay in sync with any manual drag by user
        pos = el.scrollLeft;
      }
      frameId = requestAnimationFrame(step);
    };

    frameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameId);
  }, [items.length, speed]);

  const pause = () => {
    pausedRef.current = true;
    if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current);
  };

  const scheduleResume = () => {
    if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current);
    resumeTimeoutRef.current = setTimeout(() => {
      if (containerRef.current) {
        const setWidth = containerRef.current.scrollWidth / 3;
        if (setWidth > 0) {
          let current = containerRef.current.scrollLeft;
          while (current >= setWidth) current -= setWidth;
          while (current < 0) current += setWidth;
          containerRef.current.scrollLeft = current;
        }
      }
      pausedRef.current = false;
    }, 1800);
  };

  if (items.length === 0) return null;

  return (
    <div className="relative -mx-3.5 px-3.5 overflow-hidden">
      {/* Left/Right subtle gradient fade masks */}
      <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-4 bg-gradient-to-r from-background to-transparent z-10" />
      <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-4 bg-gradient-to-l from-background to-transparent z-10" />

      <div
        ref={containerRef}
        onPointerDown={pause}
        onPointerUp={scheduleResume}
        onPointerLeave={scheduleResume}
        onTouchStart={pause}
        onTouchEnd={scheduleResume}
        className="flex gap-2 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden select-none"
      >
        {repeatedItems.map((item, idx) => (
          <button
            key={`${item.key}-${idx}`}
            onClick={item.onClick}
            className={`flex-shrink-0 flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 cursor-pointer ${
              item.active
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/25 scale-[1.02]"
                : "bg-surface/85 text-foreground hover:bg-surface-2 hover:text-foreground border border-border/80 shadow-sm backdrop-blur-sm active:scale-95"
            }`}
          >
            {item.icon && <span className="text-sm">{item.icon}</span>}
            <span>{item.label}</span>
            <span
              className={`ml-0.5 rounded-full px-1.5 py-0.2 text-[9px] font-mono font-bold ${
                item.active
                  ? "bg-primary-foreground/20 text-primary-foreground"
                  : "bg-surface-2 text-muted-foreground"
              }`}
            >
              {item.count}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
