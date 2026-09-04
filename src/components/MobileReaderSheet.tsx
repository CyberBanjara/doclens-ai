import { useEffect, useRef, type ReactNode } from "react";
import { AnimatePresence, motion, useMotionValue, useTransform, animate } from "framer-motion";

interface MobileReaderSheetProps {
  mobileReaderOpen: boolean;
  onMobileReaderOpenChange?: (open: boolean) => void;
  tab: "ai" | "text";
  setTab: (tab: "ai" | "text") => void;
  analyzing: boolean;
  body: ReactNode;
  player: ReactNode;
  voiceDialog: ReactNode;
}

/** Draggable bottom-sheet reader used on mobile (AI Assistant / Original Text tabs + TTS player). */
export function MobileReaderSheet({
  mobileReaderOpen,
  onMobileReaderOpenChange,
  tab,
  setTab,
  analyzing,
  body,
  player,
  voiceDialog,
}: MobileReaderSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const y = useMotionValue(typeof window !== "undefined" ? window.innerHeight : 800);
  const backdropOpacity = useTransform(y, [0, 400], [1, 0]);

  // Sync open/closed state with Framer spring animation
  useEffect(() => {
    if (mobileReaderOpen) {
      void animate(y, 0, { type: "spring", stiffness: 380, damping: 36 });
    } else {
      void animate(y, window.innerHeight || 800, { type: "spring", stiffness: 380, damping: 36 });
    }
  }, [mobileReaderOpen, y]);

  // Attach non-passive touch listeners on the sheet to enable seamless drag-down
  // from anywhere inside the sheet (headers, cards, text at scrollTop=0, player)
  // and prevent unwanted mobile browser pull-to-refresh.
  useEffect(() => {
    const sheetEl = sheetRef.current;
    if (!sheetEl) return;

    let touchStartY = 0;
    let touchStartX = 0;
    let lastTouchY = 0;
    let lastTouchTime = 0;
    let velocity = 0;
    let isDragging = false;
    let scrollContainer: HTMLElement | null = null;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || !mobileReaderOpen) return;
      const touch = e.touches[0];
      touchStartY = touch.clientY;
      touchStartX = touch.clientX;
      lastTouchY = touch.clientY;
      lastTouchTime = Date.now();
      velocity = 0;
      isDragging = false;

      const target = e.target as HTMLElement | null;
      scrollContainer = target?.closest(
        ".overflow-auto, .overflow-y-auto, [data-scrollable]"
      ) as HTMLElement | null;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1 || !mobileReaderOpen) return;
      const touch = e.touches[0];
      const currentY = touch.clientY;
      const currentX = touch.clientX;
      const deltaY = currentY - touchStartY;
      const deltaX = currentX - touchStartX;

      const now = Date.now();
      const dt = now - lastTouchTime;
      if (dt > 0) {
        velocity = (currentY - lastTouchY) / dt;
      }
      lastTouchY = currentY;
      lastTouchTime = now;

      // Only handle if movement is primarily vertical
      if (Math.abs(deltaY) <= Math.abs(deltaX)) return;

      const currentScrollTop = scrollContainer ? scrollContainer.scrollTop : 0;

      if (!isDragging) {
        // If not in a scroll container (e.g. handle, tabs, toolbar, player, borders),
        // dragging down immediately starts sheet drag
        if (!scrollContainer && deltaY > 4) {
          isDragging = true;
          touchStartY = currentY;
        } else if (scrollContainer && currentScrollTop <= 0 && deltaY > 6) {
          // Inside scroll container, but at top and pulling downward
          isDragging = true;
          touchStartY = currentY;
        }
      }

      if (isDragging) {
        if (e.cancelable) {
          e.preventDefault(); // Prevents mobile browser pull-to-refresh
        }
        const currentDelta = currentY - touchStartY;
        if (currentDelta > 0) {
          y.set(currentDelta);
        } else {
          // Rubber-band resistance when pulling upward
          y.set(currentDelta * 0.15);
        }
      }
    };

    const onTouchEnd = () => {
      if (!isDragging) return;
      isDragging = false;
      const currentOffset = y.get();

      // Dismiss if dragged down > 100px or flicked down with velocity
      if (currentOffset > 100 || velocity > 0.45) {
        void animate(y, window.innerHeight || 800, {
          type: "spring",
          stiffness: 380,
          damping: 36,
        }).then(() => {
          onMobileReaderOpenChange?.(false);
        });
      } else {
        // Snap back up
        void animate(y, 0, {
          type: "spring",
          stiffness: 420,
          damping: 32,
        });
      }
    };

    sheetEl.addEventListener("touchstart", onTouchStart, { passive: true });
    sheetEl.addEventListener("touchmove", onTouchMove, { passive: false });
    sheetEl.addEventListener("touchend", onTouchEnd, { passive: true });
    sheetEl.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      sheetEl.removeEventListener("touchstart", onTouchStart);
      sheetEl.removeEventListener("touchmove", onTouchMove);
      sheetEl.removeEventListener("touchend", onTouchEnd);
      sheetEl.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [mobileReaderOpen, onMobileReaderOpenChange, y]);

  // Pointer drag fallback for mouse / desktop responsive emulator testing
  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || !mobileReaderOpen) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, input, select, textarea, a, [role='button']")) return;

    const scrollContainer = target.closest(".overflow-auto, .overflow-y-auto") as HTMLElement | null;
    if (scrollContainer && scrollContainer.scrollTop > 0) return;

    const startY = e.clientY;
    let lastY = startY;
    let lastTime = Date.now();
    let isDragging = false;

    const onPointerMove = (moveEvt: PointerEvent) => {
      const deltaY = moveEvt.clientY - startY;
      if (!isDragging && deltaY > 5) {
        isDragging = true;
      }
      if (isDragging) {
        lastY = moveEvt.clientY;
        lastTime = Date.now();
        if (deltaY > 0) {
          y.set(deltaY);
        } else {
          y.set(deltaY * 0.15);
        }
      }
    };

    const onPointerUp = (upEvt: PointerEvent) => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      if (isDragging) {
        const currentOffset = y.get();
        const velocity = (upEvt.clientY - lastY) / Math.max(1, Date.now() - lastTime);
        if (currentOffset > 100 || velocity > 0.45) {
          void animate(y, window.innerHeight || 800, {
            type: "spring",
            stiffness: 380,
            damping: 36,
          }).then(() => {
            onMobileReaderOpenChange?.(false);
          });
        } else {
          void animate(y, 0, {
            type: "spring",
            stiffness: 420,
            damping: 32,
          });
        }
      }
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  };

  return (
    <>
      <AnimatePresence>
        {mobileReaderOpen && (
          <motion.div
            key="reader-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ opacity: backdropOpacity }}
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => onMobileReaderOpenChange?.(false)}
          />
        )}
      </AnimatePresence>

      <motion.div
        ref={sheetRef}
        onPointerDown={handlePointerDown}
        style={{
          y,
          touchAction: "pan-y",
          overscrollBehavior: "none",
          overscrollBehaviorY: "none",
        }}
        className="fixed inset-x-0 bottom-0 z-50 flex h-[86dvh] flex-col rounded-t-3xl border border-border bg-surface shadow-2xl overscroll-none"
        aria-hidden={!mobileReaderOpen}
      >
        {/* Drag handle */}
        <div
          style={{ touchAction: "none" }}
          className="flex shrink-0 cursor-grab items-center justify-center pt-3 pb-1 active:cursor-grabbing"
        >
          <div className="h-1.5 w-10 rounded-full bg-border-strong" />
        </div>

        {/* ─── Segmented tab control ─── */}
        <div className="flex items-center gap-2 px-4 pb-3 pt-3">
          <div className="flex flex-1 rounded-full bg-surface-2/60 p-1">
            <button
              onClick={() => setTab("ai")}
              className={`flex-1 rounded-full py-1.5 text-[13px] font-medium transition-colors ${
                tab === "ai" ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              AI Assistant
            </button>
            <button
              onClick={() => setTab("text")}
              className={`flex-1 rounded-full py-1.5 text-[13px] font-medium transition-colors ${
                tab === "text" ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              Original Text
            </button>
          </div>
          {analyzing && (
            <span className="flex items-center gap-1.5 text-xs text-primary">
              <span className="inline-block h-3 w-3 rounded-full border-[1.5px] border-primary border-t-transparent spin-slow" />
            </span>
          )}
        </div>

        {body}

        {/* Always mounted when player is available, matching desktop behavior and playback flow */}
        {player && (
          <div className="border-t border-border bg-surface/40 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 shrink-0">
            {player}
          </div>
        )}
      </motion.div>

      {voiceDialog}
    </>
  );
}
