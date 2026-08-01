import type * as PdfJs from "pdfjs-dist";
import { detectColumns, sortByColumns, type TextItem } from "./pdfLayout";
import { cleanExtractedText } from "./textCleaning";

let pdfjsPromise: Promise<typeof PdfJs> | null = null;
async function getPdfjs(): Promise<typeof PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const lib = await import("pdfjs-dist");
      const WorkerCtor = (await import("pdfjs-dist/build/pdf.worker.min.mjs?worker")).default;
      lib.GlobalWorkerOptions.workerPort = new WorkerCtor();
      return lib;
    })();
  }
  return pdfjsPromise;
}

/**
 * Common options for getDocument: enables CMap decoding for non-Latin scripts
 * (Hindi/Devanagari, CJK, Arabic, etc.) and standard font metrics.
 */
const PDF_LOAD_OPTIONS = {
  cMapUrl: "/pdf/cmaps/",
  cMapPacked: true,
  standardFontDataUrl: "/pdf/standard_fonts/",
  wasmUrl: "/pdf/wasm/",
  canvasMaxAreaInBytes: 64 * 1024 * 1024,
  useSystemFonts: true,
} as const;

export interface PageExtraction {
  pageNumber: number;
  text: string;
  items: TextItem[];
  columns: number;
  /** Ratio of garbage/PUA chars found before cleaning (0–1). High values suggest legacy font issues. */
  garbageRatio: number;
}

/** Loads a PDF document from raw bytes. Shared by extraction and OCR (see pdfOcr.ts). */
export async function loadDocFromSource(source: ArrayBuffer | Blob) {
  const pdfjsLib = await getPdfjs();
  const blob = source instanceof Blob ? source : new Blob([source], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  try {
    const pdf = await pdfjsLib.getDocument({ url, ...PDF_LOAD_OPTIONS }).promise;
    return pdf;
  } finally {
    // Once pdf.js has fetched the bytes it keeps its own internal copy.
    URL.revokeObjectURL(url);
  }
}

/** Concurrent page extraction. pdf.js is single-threaded inside the worker
 *  but `getPage` + `getTextContent` involve I/O round-trips — modest
 *  concurrency hides that latency without overloading the worker. */
const EXTRACTION_CONCURRENCY = 4;

export async function extractPdfPages(
  data: ArrayBuffer | Blob,
  onPage?: (page: PageExtraction, total: number) => void,
): Promise<PageExtraction[]> {
  const pdf = await loadDocFromSource(data);
  try {
    const total = pdf.numPages;
    const pages: PageExtraction[] = new Array(total);

    async function extractOne(pageNumber: number): Promise<PageExtraction> {
      const page = await pdf.getPage(pageNumber);
      try {
        const viewport = page.getViewport({ scale: 1 });
        const content = await page.getTextContent();
        const items: TextItem[] = [];
        for (const it of content.items as Record<string, unknown>[]) {
          if (!it || typeof it.str !== "string") continue;
          const tx = it.transform;
          if (!Array.isArray(tx)) continue;
          items.push({
            str: it.str,
            x: tx[4] as number,
            y: tx[5] as number,
            width: it.width as number,
            height: it.height as number,
          });
        }

        const columns = detectColumns(items, viewport.width);
        const sorted = sortByColumns(items, viewport.width, columns);

        let rawText = "";
        let lastY: number | null = null;
        for (const it of sorted) {
          if (lastY !== null && Math.abs(it.y - lastY) > 4) rawText += "\n";
          else if (rawText && !rawText.endsWith(" ") && !rawText.endsWith("\n")) rawText += " ";
          rawText += it.str;
          lastY = it.y;
        }
        rawText = rawText
          .replace(/[ \t]+\n/g, "\n")
          .replace(/\n{3,}/g, "\n\n")
          .trim();

        // Release the intermediate TextItem array references immediately
        items.length = 0;
        sorted.length = 0;

        const { text, garbageRatio } = cleanExtractedText(rawText);
        let finalText = text;
        let finalGarbageRatio = garbageRatio;

        // NOTE: We intentionally drop the per-item `items[]` from the returned
        // extraction — the caller stores only `{pageNumber, text, columns,
        // garbageRatio}`, and the live PdfViewer re-fetches its own text layer
        // directly. Keeping items here just allocated then immediately GC'd a
        // few MB per large page, and re-cleaning each item's `str` doubled the
        // regex work on data that was thrown away.
        return {
          pageNumber,
          text: finalText,
          items: [],
          columns,
          garbageRatio: finalGarbageRatio,
        };
      } finally {
        // Release the operator list / decoded fonts pdf.js caches per page so
        // a 500-page document doesn't keep all pages hot at once.
        try {
          page.cleanup();
        } catch {
          /* ignore */
        }
      }
    }

    // Process in concurrency-bounded waves, preserving page order in `pages[]`
    // and firing onPage in ascending order.
    let nextEmit = 1;
    const ready = new Map<number, PageExtraction>();
    for (let start = 1; start <= total; start += EXTRACTION_CONCURRENCY) {
      const batch = [];
      for (let i = 0; i < EXTRACTION_CONCURRENCY && start + i <= total; i++) {
        batch.push(extractOne(start + i));
      }
      const results = await Promise.all(batch);
      for (const r of results) {
        pages[r.pageNumber - 1] = r;
        ready.set(r.pageNumber, r);
      }
      while (ready.has(nextEmit)) {
        const r = ready.get(nextEmit)!;
        ready.delete(nextEmit);
        onPage?.(r, total);
        nextEmit++;
      }
    }
    return pages;
  } finally {
    try {
      await pdf.destroy();
    } catch {
      // ignore
    }
  }
}

export async function loadPdfDocument(data: ArrayBuffer | Blob) {
  return loadDocFromSource(data);
}

// Vite Hot Module Replacement (HMR) cleanup
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    try {
      if (pdfjsPromise) {
        pdfjsPromise
          .then((lib) => {
            try {
              lib.GlobalWorkerOptions.workerPort?.terminate();
            } catch {
              /* ignore */
            }
          })
          .catch(() => {});
      }
    } catch (e) {
      console.warn("[HMR] Failed to dispose workers:", e);
    }
  });
}
