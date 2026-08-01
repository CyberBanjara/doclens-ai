import type { SelectionInfo } from "@/hooks/useTextSelectionToolbar";

interface SelectionToolbarProps {
  selection: SelectionInfo;
  isMobile: boolean;
  onCopy: () => void;
  onTranslate: () => void;
}

/** Floating Copy/Translate toolbar shown above an active PDF text selection. */
export function SelectionToolbar({ selection, isMobile, onCopy, onTranslate }: SelectionToolbarProps) {
  return (
    <div
      className="absolute z-30 -translate-x-1/2 -translate-y-full"
      style={{ left: selection.x, top: selection.y - 8 }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className={isMobile ? "selection-toolbar selection-toolbar-mobile" : "selection-toolbar"}>
        <button onClick={onCopy} title="Copy">
          📋
        </button>
        <button onClick={onTranslate} className="primary-action" title="Translate">
          🌐
        </button>
      </div>
    </div>
  );
}
