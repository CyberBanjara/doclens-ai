import type { TtsSource } from "@/context/TtsContext";

/**
 * Cross-component coordination bus. Several components without a direct
 * parent/child or context relationship (PdfViewer, PageWorkstation, RightPanel,
 * TtsContext) talk via these `window` CustomEvents instead of prop-drilling or
 * a global store. This module is the single typed source of truth for their
 * names and detail shapes — see documentation/Product/Architecture.md.
 */
export interface DocEventMap {
  /** A page's AI result finished generating and is ready to read aloud. */
  "doclens:page-ready": { docId: string; pageNumber: number; result: string };
  /** Request translation for a page (current page nav or continuous-play look-ahead). */
  "doclens:ensure-page-ready": { docId: string; pageNumber: number };
  /** User selected PDF text and chose "Translate". */
  "doclens:translate-selection": { docId: string; pageNumber: number; text: string };
  /** Scroll the PDF pane to a given page (e.g. clicking a workstation card). */
  "doclens:scroll-to-pdf": { pageNumber: number };
  /** Continuous-play playback finished the current page; advance to the next one. */
  "doclens:tts-next-page": { currentPage: number; source: TtsSource | null };
}

export function dispatchDocEvent<K extends keyof DocEventMap>(
  type: K,
  detail: DocEventMap[K],
): void {
  window.dispatchEvent(new CustomEvent(type, { detail }));
}

/** Subscribes to a doc event; returns an unsubscribe function for effect cleanup. */
export function listenDocEvent<K extends keyof DocEventMap>(
  type: K,
  handler: (detail: DocEventMap[K]) => void,
): () => void {
  const listener = (e: Event) => {
    const detail = (e as CustomEvent<DocEventMap[K]>).detail;
    if (detail !== undefined) handler(detail);
  };
  window.addEventListener(type, listener);
  return () => window.removeEventListener(type, listener);
}
