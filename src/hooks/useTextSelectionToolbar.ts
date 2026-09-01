import { useCallback, useEffect, useState } from "react";
import { dispatchDocEvent } from "@/lib/docEvents";
import { convertLegacyHindiIfNeeded } from "@/lib/devanagari";

export interface SelectionInfo {
  pageNumber: number;
  text: string;
  x: number; // viewport coords
  y: number;
}

/**
 * Tracks the current text selection inside a PDF text layer (identified by a
 * `[data-text-layer]` ancestor within `scrollRef`) and exposes copy/translate
 * actions for the floating selection toolbar.
 */
export function useTextSelectionToolbar(
  docId: string,
  scrollRef: React.RefObject<HTMLDivElement | null>,
) {
  const [selection, setSelection] = useState<SelectionInfo | null>(null);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const onSelChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        setSelection(null);
        return;
      }
      const rawText = sel.toString().trim();
      if (!rawText) {
        setSelection(null);
        return;
      }
      const text = convertLegacyHindiIfNeeded(rawText);
      // Verify selection lives inside one of our text layers
      const anchor = sel.anchorNode as Node | null;
      if (!anchor) {
        setSelection(null);
        return;
      }
      const el = (anchor.nodeType === 1 ? anchor : anchor.parentElement) as HTMLElement | null;
      const tlEl = el?.closest<HTMLElement>("[data-text-layer]");
      if (!tlEl) {
        setSelection(null);
        return;
      }
      const pn = Number(tlEl.dataset.pageNumber);
      if (!Number.isFinite(pn)) {
        setSelection(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const rootRect = root.getBoundingClientRect();
      setSelection({
        pageNumber: pn,
        text,
        x: rect.left + rect.width / 2 - rootRect.left + root.scrollLeft,
        y: rect.top - rootRect.top + root.scrollTop,
      });
    };
    document.addEventListener("selectionchange", onSelChange);
    return () => document.removeEventListener("selectionchange", onSelChange);
  }, [scrollRef]);

  const handleCopy = useCallback(async () => {
    if (!selection) return;
    try {
      await navigator.clipboard.writeText(selection.text);
    } catch {
      // ignore
    }
  }, [selection]);

  const handleTranslate = useCallback(() => {
    if (!selection) return;
    dispatchDocEvent("doclens:translate-selection", {
      docId,
      pageNumber: selection.pageNumber,
      text: selection.text,
    });
  }, [selection, docId]);

  return { selection, handleCopy, handleTranslate };
}
