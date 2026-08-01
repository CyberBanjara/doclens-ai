import { useEffect, useRef } from "react";

export interface CategoryMarqueeItem {
  key: string;
  label: string;
  icon?: string;
  active: boolean;
  onClick: () => void;
}

/**
 * Slow, continuously auto-scrolling category row for the mobile Global Library.
 * The list is duplicated so the loop can wrap seamlessly, and auto-scroll pauses
 * while the user is actively touching/dragging so manual swipes and taps still work.
 */
export function CategoryMarqueeRow({ items }: { items: CategoryMarqueeItem[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  const resumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const speed = 0.35; // px/frame — slow, continuous drift
    let frameId: number;
    // Track position as a float ourselves: reading `el.scrollLeft` back rounds to
    // an integer each frame, so accumulating via `el.scrollLeft += speed` would
    // never progress past 0 for a sub-1px-per-frame speed.
    let pos = el.scrollLeft;

    const step = () => {
      if (!pausedRef.current) {
        const halfWidth = el.scrollWidth / 2;
        pos += speed;
        if (halfWidth > 0 && pos >= halfWidth) {
          pos -= halfWidth;
        }
        el.scrollLeft = pos;
      } else {
        // Stay in sync with any manual scrolling the user did while paused.
        pos = el.scrollLeft;
      }
      frameId = requestAnimationFrame(step);
    };
    frameId = requestAnimationFrame(step);

    return () => cancelAnimationFrame(frameId);
  }, []);

  const pause = () => {
    pausedRef.current = true;
    if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current);
  };
  const scheduleResume = () => {
    if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current);
    resumeTimeoutRef.current = setTimeout(() => {
      pausedRef.current = false;
    }, 2000);
  };

  return (
    <div
      ref={containerRef}
      onPointerDown={pause}
      onPointerUp={scheduleResume}
      onPointerLeave={scheduleResume}
      onTouchStart={pause}
      onTouchEnd={scheduleResume}
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {[...items, ...items].map((item, idx) => (
        <button
          key={`${item.key}-${idx}`}
          onClick={item.onClick}
          className={`flex-shrink-0 rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
            item.active
              ? "bg-primary text-primary-foreground"
              : "bg-surface-2 text-muted-foreground"
          }`}
        >
          {item.icon ? `${item.icon} ` : ""}
          {item.label}
        </button>
      ))}
    </div>
  );
}
