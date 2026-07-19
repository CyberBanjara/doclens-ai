import type * as PdfJs from "pdfjs-dist";
import { createWorker, type Worker } from "tesseract.js";

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

/**
 * Regex matching Unicode Private Use Area (PUA) characters.
 * These appear as garbled glyphs when fonts lack proper ToUnicode mappings.
 * Ranges: BMP PUA (E000-F8FF), Supplementary PUA-A (F0000-FFFFD),
 *         Supplementary PUA-B (100000-10FFFD)
 */
const PUA_REGEX = /[\uE000-\uF8FF]|\uDB80[\uDC00-\uDFFD]|\uDBC0[\uDC00-\uDFFD]/g;

/**
 * Replacement char / surrogate / control char ranges (except normal whitespace).
 */
const GARBAGE_REGEX = /[\uFFFD\uFFFE\uFFFF]|[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

/**
 * Regex matching standard Unicode symbol and dingbat ranges (ZapfDingbats, Wingdings, Webdings).
 * When normal English text extracts as these symbols, it indicates a bad font map.
 */
const SYMBOL_FONT_CHARS = /[\u2600-\u27BF]|[\uD83C-\uD83F][\uDC00-\uDFFF]/g;

/**
 * Clean extracted text by stripping unmappable PUA glyphs and garbage characters.
 * Returns the cleaned string plus a ratio of how much was garbage (0–1).
 */
function cleanExtractedText(raw: string): { text: string; garbageRatio: number } {
  if (!raw) return { text: "", garbageRatio: 0 };

  const puaMatches = raw.match(PUA_REGEX);
  const garbageMatches = raw.match(GARBAGE_REGEX);
  const symbolMatches = raw.match(SYMBOL_FONT_CHARS);
  const totalGarbage =
    (puaMatches?.length ?? 0) + (garbageMatches?.length ?? 0) + (symbolMatches?.length ?? 0);
  const nonSpaceChars = raw.replace(/\s/g, "").length;
  const garbageRatio = nonSpaceChars > 0 ? totalGarbage / nonSpaceChars : 0;

  let cleaned = raw.replace(PUA_REGEX, "").replace(GARBAGE_REGEX, "");

  // Collapse whitespace artifacts left after stripping
  cleaned = cleaned
    .replace(/[ \t]{2,}/g, " ")
    .replace(/^ +| +$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { text: cleaned, garbageRatio };
}

export interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageExtraction {
  pageNumber: number;
  text: string;
  items: TextItem[];
  columns: number;
  /** Ratio of garbage/PUA chars found before cleaning (0–1). High values suggest legacy font issues. */
  garbageRatio: number;
}

/**
 * Detect columns by clustering text items along the X axis.
 * Returns column count (1-3 typical).
 */

function detectColumns(items: TextItem[], pageWidth: number, yTolerance = 4): number {
  if (items.length < 20) return 1;

  const segments = groupIntoSegments(items, yTolerance);
  if (segments.length < 5) return 1;

  // Group segments into horizontal rows (within tolerance)
  const sortedSegments = [...segments].sort((a, b) => b.y - a.y);
  const rows: TextSegment[][] = [];
  const rowYTolerance = yTolerance * 2;

  for (const seg of sortedSegments) {
    let placed = false;
    for (const row of rows) {
      if (Math.abs(row[0].y - seg.y) <= rowYTolerance) {
        row.push(seg);
        placed = true;
        break;
      }
    }
    if (!placed) {
      rows.push([seg]);
    }
  }

  // Count how many rows have 2 segments, and how many have 3 segments
  let rowsWith2 = 0;
  let rowsWith3Plus = 0;

  for (const row of rows) {
    if (row.length === 2) {
      rowsWith2++;
    } else if (row.length >= 3) {
      rowsWith3Plus++;
    }
  }

  const totalRows = rows.length;
  const multiSegmentRows = rowsWith2 + rowsWith3Plus;

  const result = (() => {
    // If we have very few multi-segment rows, it's a 1-column page
    if (multiSegmentRows < 3 && multiSegmentRows / totalRows < 0.1) {
      return 1;
    }

    // If we have at least 2 rows with 3 or more segments, it's a 3-column page
    if (rowsWith3Plus >= 2) {
      return 3;
    }

    return 2;
  })();

  return result;
}

interface TextSegment {
  items: TextItem[];
  minX: number;
  maxX: number;
  y: number;
}

/**
 * Group text items that are on the same vertical line (within a small tolerance)
 * and close to each other horizontally into single line segments.
 */
function groupIntoSegments(items: TextItem[], yTolerance = 4): TextSegment[] {
  if (items.length === 0) return [];

  // Sort items by Y descending (top to bottom), then by X ascending (left to right)
  const sortedItems = [...items].sort((a, b) => b.y - a.y || a.x - b.x);

  const rows: TextItem[][] = [];

  for (const item of sortedItems) {
    let placed = false;
    for (const row of rows) {
      if (Math.abs(row[0].y - item.y) <= yTolerance) {
        row.push(item);
        placed = true;
        break;
      }
    }
    if (!placed) {
      rows.push([item]);
    }
  }

  const segments: TextSegment[] = [];

  for (const row of rows) {
    // Sort items in row by X coordinate
    row.sort((a, b) => a.x - b.x);

    let currentSegment: TextItem[] = [row[0]];
    for (let i = 1; i < row.length; i++) {
      const prev = row[i - 1];
      const curr = row[i];
      const fontHeight = Math.max(prev.height, curr.height) || 10;
      const gapThreshold = fontHeight * 1.5; // Allow spacing up to 1.5x font size before breaking column

      const gap = curr.x - (prev.x + prev.width);
      if (gap > gapThreshold && gap > 12) {
        segments.push({
          items: currentSegment,
          minX: currentSegment[0].x,
          maxX:
            currentSegment[currentSegment.length - 1].x +
            currentSegment[currentSegment.length - 1].width,
          y: currentSegment[0].y,
        });
        currentSegment = [curr];
      } else {
        currentSegment.push(curr);
      }
    }
    segments.push({
      items: currentSegment,
      minX: currentSegment[0].x,
      maxX:
        currentSegment[currentSegment.length - 1].x +
        currentSegment[currentSegment.length - 1].width,
      y: currentSegment[0].y,
    });
  }

  return segments;
}

interface DividerPoint {
  x: number;
  y: number;
}

/**
 * Sort text items respecting detected columns: group into horizontal segments,
 * calculate dynamic column dividers based on adjacent segments, and assign segments
 * to their respective columns before sorting top→bottom.
 */
function sortByColumns(
  items: TextItem[],
  pageWidth: number,
  columns: number,
  yTolerance = 4,
): TextItem[] {
  if (columns <= 1) {
    return [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  }

  const segments = groupIntoSegments(items, yTolerance);

  // Group segments into horizontal rows to locate column dividers
  const sortedSegments = [...segments].sort((a, b) => b.y - a.y);
  const rows: TextSegment[][] = [];
  const rowYTolerance = yTolerance * 2; // pixels

  for (const seg of sortedSegments) {
    let placed = false;
    for (const row of rows) {
      if (Math.abs(row[0].y - seg.y) <= rowYTolerance) {
        row.push(seg);
        placed = true;
        break;
      }
    }
    if (!placed) {
      rows.push([seg]);
    }
  }

  // Collect divider points between columns
  // For columns = 2, we need 1 divider (between col 0 and 1)
  // For columns = 3, we need 2 dividers (between col 0/1 and col 1/2)
  const dividers1: DividerPoint[] = [];
  const dividers2: DividerPoint[] = [];

  for (const row of rows) {
    if (row.length >= 2) {
      row.sort((a, b) => a.minX - b.minX);
      dividers1.push({
        x: (row[0].maxX + row[1].minX) / 2,
        y: row[0].y,
      });
      if (row.length >= 3) {
        dividers2.push({
          x: (row[1].maxX + row[2].minX) / 2,
          y: row[1].y,
        });
      }
    }
  }

  // Helper to find the closest divider X coordinate at a given Y coordinate
  const getDividerX = (y: number, dividerPoints: DividerPoint[], defaultX: number): number => {
    if (dividerPoints.length === 0) return defaultX;

    // Get all divider points within a vertical window of 150px
    const windowSize = 150;
    const pointsInWindow = dividerPoints.filter((p) => Math.abs(p.y - y) <= windowSize);

    if (pointsInWindow.length === 0) {
      // Fallback to nearest neighbor if window is empty
      let closest = dividerPoints[0];
      let minDist = Math.abs(closest.y - y);
      for (let i = 1; i < dividerPoints.length; i++) {
        const dist = Math.abs(dividerPoints[i].y - y);
        if (dist < minDist) {
          minDist = dist;
          closest = dividerPoints[i];
        }
      }
      return closest.x;
    }

    // Sort the X coordinates of points in the window and take the median
    const xs = pointsInWindow.map((p) => p.x).sort((a, b) => a - b);
    const mid = Math.floor(xs.length / 2);
    if (xs.length % 2 === 0) {
      return (xs[mid - 1] + xs[mid]) / 2;
    } else {
      return xs[mid];
    }
  };

  const bands: TextSegment[][] = Array.from({ length: columns }, () => []);

  for (const segment of segments) {
    let col = 0;
    if (columns === 2) {
      const divX = getDividerX(segment.y, dividers1, pageWidth / 2);
      col = segment.minX < divX ? 0 : 1;
    } else if (columns === 3) {
      const divX1 = getDividerX(segment.y, dividers1, pageWidth / 3);
      const divX2 = getDividerX(segment.y, dividers2, (2 * pageWidth) / 3);
      if (segment.minX < divX1) {
        col = 0;
      } else if (segment.minX < divX2) {
        col = 1;
      } else {
        col = 2;
      }
    } else {
      // Fallback for more than 3 columns
      const bandWidth = pageWidth / columns;
      col = Math.min(columns - 1, Math.floor(segment.minX / bandWidth));
    }
    bands[col].push(segment);
  }

  const sortedItems: TextItem[] = [];
  for (const band of bands) {
    band.sort((a, b) => b.y - a.y);
    for (const segment of band) {
      // Sort items within each segment left-to-right
      segment.items.sort((a, b) => a.x - b.x);
      sortedItems.push(...segment.items);
    }
  }
  return sortedItems;
}

async function loadDocFromSource(source: ArrayBuffer | Blob) {
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

export function sortTextContent(textContent: unknown, pageWidth: number): unknown {
  if (!textContent || typeof textContent !== "object") return textContent;
  const tc = textContent as Record<string, unknown>;
  if (!Array.isArray(tc.items)) return textContent;

  const items = tc.items;
  const sortableItems: (TextItem & { index: number })[] = [];

  for (let i = 0; i < items.length; i++) {
    const it = items[i] as Record<string, unknown>;
    if (!it || typeof it.str !== "string") continue;
    const tx = it.transform;
    if (!Array.isArray(tx)) continue;
    sortableItems.push({
      str: it.str,
      x: tx[4] as number,
      y: tx[5] as number,
      width: it.width as number,
      height: it.height as number,
      index: i,
    });
  }

  const columns = detectColumns(sortableItems, pageWidth);
  const sortedItems = sortByColumns(sortableItems, pageWidth, columns);

  const newItems = sortedItems.map((s) => items[(s as unknown as { index: number }).index]);

  // Keep non-string items by appending them
  const sortedIndices = new Set(sortedItems.map((s) => (s as unknown as { index: number }).index));
  for (let i = 0; i < items.length; i++) {
    if (!sortedIndices.has(i)) {
      newItems.push(items[i]);
    }
  }

  return {
    ...tc,
    items: newItems,
  };
}

let ocrWorkerPromise: Promise<Worker> | null = null;

export async function getOcrWorker(): Promise<Worker> {
  if (typeof window === "undefined") throw new Error("OCR can only run in the browser.");
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = createWorker("eng", 1, {
      workerPath: "/tesseract/worker.min.js",
      langPath: "/tesseract/lang-data",
      corePath: "/tesseract",
      gzip: false,
      logger: (m) => console.log("[Tesseract Worker Log]:", m),
      errorHandler: (e) => console.error("[Tesseract Worker Error]:", e),
    });
  }
  return ocrWorkerPromise;
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
      if (ocrWorkerPromise) {
        ocrWorkerPromise
          .then((worker) => {
            try {
              worker.terminate();
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

function cropCanvas(
  sourceCanvas: HTMLCanvasElement,
  x: number,
  y: number,
  width: number,
  height: number,
): HTMLCanvasElement {
  const croppedCanvas = document.createElement("canvas");
  croppedCanvas.width = width;
  croppedCanvas.height = height;
  const ctx = croppedCanvas.getContext("2d");
  if (ctx) {
    ctx.drawImage(sourceCanvas, x, y, width, height, 0, 0, width, height);
  }
  return croppedCanvas;
}

function getColumnDividers(items: TextItem[], pageWidth: number, columnsCount: number): number[] {
  if (columnsCount <= 1 || items.length === 0) return [];

  const segments = groupIntoSegments(items);
  const sortedSegments = [...segments].sort((a, b) => b.y - a.y);
  const rows: TextSegment[][] = [];
  const rowYTolerance = 8;

  for (const seg of sortedSegments) {
    let placed = false;
    for (const row of rows) {
      if (Math.abs(row[0].y - seg.y) <= rowYTolerance) {
        row.push(seg);
        placed = true;
        break;
      }
    }
    if (!placed) {
      rows.push([seg]);
    }
  }

  const div1Xs: number[] = [];
  const div2Xs: number[] = [];

  for (const row of rows) {
    if (row.length >= 2) {
      row.sort((a, b) => a.minX - b.minX);
      div1Xs.push((row[0].maxX + row[1].minX) / 2);
      if (row.length >= 3) {
        div2Xs.push((row[1].maxX + row[2].minX) / 2);
      }
    }
  }

  const getMedian = (arr: number[], fallback: number) => {
    if (arr.length === 0) return fallback;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };

  const dividers: number[] = [];
  if (columnsCount >= 2) {
    dividers.push(getMedian(div1Xs, pageWidth / 2));
  }
  if (columnsCount >= 3) {
    dividers.push(getMedian(div2Xs, (2 * pageWidth) / 3));
  }

  return dividers;
}

export function isGarbageLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0) return false;

  const words = trimmed.split(/\s+/);
  let score = 0;
  let standaloneSymbolsCount = 0;
  let unusualShortWordsCount = 0;
  let noVowelWordsCount = 0;
  let mixedCaseWordsCount = 0;

  const vowelRegex = /[aeiouyAEIOUY]/;
  const letterRegex = /[a-zA-Z]/;
  const alphanumericRegex = /[a-zA-Z0-9]/;

  const commonShortWords = new Set([
    "a",
    "i",
    "o",
    "am",
    "an",
    "as",
    "at",
    "be",
    "by",
    "co",
    "do",
    "dr",
    "ex",
    "go",
    "he",
    "hi",
    "id",
    "if",
    "in",
    "is",
    "it",
    "me",
    "mr",
    "ms",
    "my",
    "no",
    "of",
    "oh",
    "ok",
    "on",
    "or",
    "so",
    "st",
    "to",
    "tv",
    "up",
    "us",
    "vs",
    "we",
    "ye",
  ]);

  for (const word of words) {
    // 1. Standalone symbols/punctuation
    if (!alphanumericRegex.test(word)) {
      standaloneSymbolsCount++;
      continue;
    }

    const cleanWord = word.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, "");
    if (cleanWord.length === 0) {
      standaloneSymbolsCount++;
      continue;
    }

    // 2. Unusual short words (length 1 or 2, excluding numbers)
    const isNumber = /^\d+$/.test(cleanWord);
    if (cleanWord.length <= 2 && !isNumber) {
      const lower = cleanWord.toLowerCase();
      if (!commonShortWords.has(lower)) {
        unusualShortWordsCount++;
      }
    }

    // 3. No-vowel words (length >= 2, excluding purely numeric)
    const hasLetters = letterRegex.test(cleanWord);
    if (cleanWord.length >= 2 && hasLetters) {
      const hasVowels = vowelRegex.test(cleanWord);
      if (!hasVowels) {
        noVowelWordsCount++;
      }
    }

    // 4. Mixed Casing (e.g. oS, eS, oF, aR)
    if (/[a-z][A-Z]/.test(cleanWord)) {
      mixedCaseWordsCount++;
    }
  }

  const totalWords = words.length;

  // Score Accumulation
  score += standaloneSymbolsCount * 1.5;
  score += unusualShortWordsCount * 1.5;
  score += noVowelWordsCount * 2.0;
  score += mixedCaseWordsCount * 1.5;

  // Triple consecutive letters (like SSS, eee)
  if (/([a-zA-Z])\1\1/i.test(trimmed)) {
    score += 2.0;
  }

  // Character-level non-alphanumeric ratio (excluding spaces)
  const nonSpaceChars = trimmed.replace(/\s/g, "");
  const specialChars = nonSpaceChars.replace(/[a-zA-Z0-9.,?!'"()]/g, "");
  const specialCharRatio =
    nonSpaceChars.length > 0 ? specialChars.length / nonSpaceChars.length : 0;
  if (specialCharRatio > 0.15) {
    score += specialCharRatio * 8;
  }

  // If the line consists of exactly 1 word and it is a single character that is non-alphanumeric, it is garbage
  if (totalWords === 1) {
    const singleWord = words[0];
    if (singleWord.length <= 2 && !alphanumericRegex.test(singleWord)) {
      return true;
    }
    const cleanWord = singleWord.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, "");
    if (cleanWord.length >= 2 && !/^\d+$/.test(cleanWord) && !vowelRegex.test(cleanWord)) {
      return true;
    }
  }

  return score >= 2.5;
}

export function cleanOcrText(text: string): string {
  if (!text) return "";
  const lines = text.split("\n");
  const cleanedLines = lines.filter((line) => !isGarbageLine(line));
  return cleanedLines.join("\n").trim();
}

export async function ocrPdfPage(page: any, columns = 1): Promise<string> {
  const worker = await getOcrWorker();

  // Render page to canvas at 2.0x scale for better OCR accuracy
  const viewport2 = page.getViewport({ scale: 2.0 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport2.width;
  canvas.height = viewport2.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create 2D canvas context");

  await page.render({ canvasContext: ctx, viewport: viewport2 }).promise;

  // Run Tesseract OCR on the full canvas
  console.log("[ocrPdfPage] Starting OCR on full canvas...");
  const result = await worker.recognize(canvas, {}, { blocks: true });
  console.log("[ocrPdfPage] OCR finished. result.data keys:", Object.keys(result.data || {}));
  console.log("[ocrPdfPage] result.data.text length:", result.data?.text?.length);
  const rawWords = (result.data as any)?.words || [];
  const words: any[] = [];
  console.log("[ocrPdfPage] blocks count:", (result.data as any)?.blocks?.length);
  if ((result.data as any)?.blocks?.length > 0) {
    const firstBlock = (result.data as any).blocks[0];
    console.log("[ocrPdfPage] first block keys:", Object.keys(firstBlock));
    console.log("[ocrPdfPage] first block paragraphs count:", firstBlock.paragraphs?.length);
    if (firstBlock.paragraphs?.length > 0) {
      console.log("[ocrPdfPage] first para keys:", Object.keys(firstBlock.paragraphs[0]));
      console.log("[ocrPdfPage] first para lines count:", firstBlock.paragraphs[0].lines?.length);
      if (firstBlock.paragraphs[0].lines?.length > 0) {
        console.log(
          "[ocrPdfPage] first line keys:",
          Object.keys(firstBlock.paragraphs[0].lines[0]),
        );
        console.log(
          "[ocrPdfPage] first line words count:",
          firstBlock.paragraphs[0].lines[0].words?.length,
        );
      }
    }
  }
  if (rawWords.length > 0) {
    words.push(...rawWords);
  } else {
    const blocks = (result.data as any)?.blocks || [];
    for (const block of blocks) {
      const paras = block.paragraphs || [];
      for (const para of paras) {
        const lines = para.lines || [];
        for (const line of lines) {
          const lineWords = line.words || [];
          for (const w of lineWords) {
            words.push(w);
          }
        }
      }
    }
  }
  console.log("[ocrPdfPage] Raw words found:", words.length);

  const origViewport = page.getViewport({ scale: 1.0 });
  const items: TextItem[] = [];

  for (const w of words) {
    if (typeof w.confidence === "number" && w.confidence < 60) {
      continue;
    }
    // Scale coordinates back to 1.0x and invert Y to match PDF.js orientation
    const x0 = w.bbox.x0 / 2.0;
    const x1 = w.bbox.x1 / 2.0;
    const y0 = w.bbox.y0 / 2.0;
    const y1 = w.bbox.y1 / 2.0;

    items.push({
      str: w.text || "",
      x: x0,
      y: origViewport.height - y1,
      width: x1 - x0,
      height: y1 - y0,
    });
  }
  console.log("[ocrPdfPage] Mapped high-confidence items:", items.length);

  // Detect columns dynamically if not forced by the caller
  let cols = columns;
  if (cols <= 1) {
    cols = detectColumns(items, origViewport.width, 8);
  }
  console.log("[ocrPdfPage] Detected columns:", cols);

  // Sort words respecting layout structure/columns
  const sorted = sortByColumns(items, origViewport.width, cols, 8);
  console.log("[ocrPdfPage] Sorted items:", sorted.length);

  // Reconstruct text layout-aware
  let rawText = "";
  let lastY: number | null = null;
  for (const it of sorted) {
    if (lastY !== null && Math.abs(it.y - lastY) > 8) {
      rawText += "\n";
    } else if (rawText && !rawText.endsWith(" ") && !rawText.endsWith("\n")) {
      rawText += " ";
    }
    rawText += it.str;
    lastY = it.y;
  }
  console.log("[ocrPdfPage] Reconstructed rawText length:", rawText.length);
  if (rawText.length > 0) {
    console.log("[ocrPdfPage] First 200 chars of rawText:", rawText.substring(0, 200));
  }

  const cleaned = cleanOcrText(rawText);
  console.log("[ocrPdfPage] Cleaned text length:", cleaned.length);
  if (cleaned.length > 0) {
    console.log("[ocrPdfPage] First 200 chars of cleaned:", cleaned.substring(0, 200));
  }

  return cleaned;
}

export async function ocrPageById(blob: Blob, pageNumber: number, columns = 1): Promise<string> {
  const pdf = await loadDocFromSource(blob);
  try {
    const page = await pdf.getPage(pageNumber);
    try {
      return await ocrPdfPage(page, columns);
    } finally {
      try {
        page.cleanup();
      } catch {}
    }
  } finally {
    try {
      await pdf.destroy();
    } catch {}
  }
}

export function checkTextQuality(text: string): {
  isGarbled: boolean;
  isScanned: boolean;
  symbolRatio: number;
} {
  if (!text || text.trim().length === 0) {
    return { isGarbled: false, isScanned: true, symbolRatio: 0 };
  }
  const symbolMatches = text.match(SYMBOL_FONT_CHARS);
  const puaMatches = text.match(PUA_REGEX);
  const garbageMatches = text.match(GARBAGE_REGEX);

  const totalGarbage =
    (symbolMatches?.length ?? 0) + (puaMatches?.length ?? 0) + (garbageMatches?.length ?? 0);
  const nonSpaceChars = text.replace(/\s/g, "").length;
  const symbolRatio = nonSpaceChars > 0 ? totalGarbage / nonSpaceChars : 0;

  return {
    isGarbled: symbolRatio > 0.05 || totalGarbage > 3,
    isScanned: text.trim().length < 20,
    symbolRatio,
  };
}

export async function runOcrOnGarbledPages(
  blob: Blob,
  pages: {
    pageNumber: number;
    text: string;
    columns: number;
    garbageRatio: number;
    ocrRun?: boolean;
  }[],
  onProgress: (pageNumber: number, total: number) => void,
  onPageOcrComplete?: (
    pageNumber: number,
    text: string,
    garbageRatio: number,
  ) => Promise<void> | void,
): Promise<
  { pageNumber: number; text: string; columns: number; garbageRatio: number; ocrRun?: boolean }[]
> {
  const pdf = await loadDocFromSource(blob);
  try {
    const total = pdf.numPages;
    const updatedPages = [...pages];

    for (let i = 0; i < updatedPages.length; i++) {
      const pageData = updatedPages[i];
      // Update progress callback so UI shows "OCR Processing: Page X of Y"
      onProgress(pageData.pageNumber, total);

      const quality = checkTextQuality(pageData.text);
      if (quality.isGarbled || quality.isScanned) {
        const page = await pdf.getPage(pageData.pageNumber);
        try {
          const ocrText = await ocrPdfPage(page, pageData.columns);
          if (ocrText && ocrText.trim().length > 0) {
            const newQuality = checkTextQuality(ocrText);
            updatedPages[i] = {
              ...pageData,
              text: ocrText,
              garbageRatio: newQuality.symbolRatio,
              ocrRun: true,
            };
            if (onPageOcrComplete) {
              await onPageOcrComplete(pageData.pageNumber, ocrText, newQuality.symbolRatio);
            }
          }
        } finally {
          try {
            page.cleanup();
          } catch {}
        }
      }
    }
    return updatedPages;
  } finally {
    try {
      await pdf.destroy();
    } catch {}
  }
}
