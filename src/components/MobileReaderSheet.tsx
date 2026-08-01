import type { ReactNode } from "react";
import { AnimatePresence, motion, useDragControls } from "framer-motion";

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
  const dragControls = useDragControls();

  return (
    <>
      <AnimatePresence>
        {mobileReaderOpen && (
          <motion.div
            key="reader-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => onMobileReaderOpenChange?.(false)}
          />
        )}
      </AnimatePresence>

      <motion.div
        initial={false}
        animate={{ y: mobileReaderOpen ? 0 : "100%" }}
        transition={{ type: "spring", stiffness: 380, damping: 38 }}
        drag="y"
        dragListener={false}
        dragControls={dragControls}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.55}
        onDragEnd={(_e, info) => {
          if (info.offset.y > 120 || info.velocity.y > 500) onMobileReaderOpenChange?.(false);
        }}
        className="fixed inset-x-0 bottom-0 z-50 flex h-[86dvh] flex-col rounded-t-3xl border border-border bg-surface shadow-2xl"
        aria-hidden={!mobileReaderOpen}
      >
        {/* Drag surface confined to this handle (dragListener=false above) —
            the content below (TtsPlayer, PageWorkstation, HighlightableText)
            stays free of Framer's pointer/hit-testing machinery and native
            touch scrolling, instead of the whole sheet (incl. all its
            buttons and text) being a drag target with touch-action:none. */}
        <div
          onPointerDown={(e) => dragControls.start(e)}
          style={{ touchAction: "none" }}
          className="flex shrink-0 justify-center pt-3 pb-1"
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
