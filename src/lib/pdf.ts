import type * as PdfJs from "pdfjs-dist";

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
 * Clean extracted text by stripping unmappable PUA glyphs and garbage characters.
 * Returns the cleaned string plus a ratio of how much was garbage (0–1).
 */
function cleanExtractedText(raw: string): { text: string; garbageRatio: number } {
  if (!raw) return { text: "", garbageRatio: 0 };

  const puaMatches = raw.match(PUA_REGEX);
  const garbageMatches = raw.match(GARBAGE_REGEX);
  const totalGarbage = (puaMatches?.length ?? 0) + (garbageMatches?.length ?? 0);
  const nonSpaceChars = raw.replace(/\s/g, "").length;
  const garbageRatio = nonSpaceChars > 0 ? totalGarbage / nonSpaceChars : 0;

  let cleaned = raw
    .replace(PUA_REGEX, "")
    .replace(GARBAGE_REGEX, "");

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
function detectColumns(items: TextItem[], pageWidth: number): number {
  if (items.length < 20) return 1;
  const xs = items.map((i) => i.x).sort((a, b) => a - b);
  // Simple heuristic: bucket into 10 vertical bands, look for bimodal/trimodal distribution
  const buckets = new Array(10).fill(0);
  for (const x of xs) {
    const idx = Math.min(9, Math.floor((x / pageWidth) * 10));
    buckets[idx]++;
  }
  // Find peaks separated by valleys
  const peaks: number[] = [];
  for (let i = 1; i < 9; i++) {
    if (buckets[i] > buckets[i - 1] && buckets[i] >= buckets[i + 1] && buckets[i] > items.length * 0.08) {
      peaks.push(i);
    }
  }
  if (buckets[0] > items.length * 0.08) peaks.unshift(0);
  return Math.max(1, Math.min(3, peaks.length || 1));
}

/**
 * Sort text items respecting detected columns: split by X bands, then top→bottom within each.
 */
function sortByColumns(items: TextItem[], pageWidth: number, columns: number): TextItem[] {
  if (columns <= 1) {
    return [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  }
  const bandWidth = pageWidth / columns;
  const bands: TextItem[][] = Array.from({ length: columns }, () => []);
  for (const item of items) {
    const band = Math.min(columns - 1, Math.floor(item.x / bandWidth));
    bands[band].push(item);
  }
  return bands.flatMap((band) =>
    band.sort((a, b) => b.y - a.y || a.x - b.x),
  );
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

export async function extractPdfPages(
  data: ArrayBuffer | Blob,
  onPage?: (page: PageExtraction, total: number) => void,
): Promise<PageExtraction[]> {
  const pdf = await loadDocFromSource(data);
  const pages: PageExtraction[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items: TextItem[] = content.items
      .filter((it: any) => typeof it.str === "string")
      .map((it: any) => {
        const tx = it.transform;
        return {
          str: it.str as string,
          x: tx[4] as number,
          y: tx[5] as number,
          width: it.width as number,
          height: it.height as number,
        };
      });
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
    rawText = rawText.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

    // Clean PUA / garbage characters from extracted text
    const { text, garbageRatio } = cleanExtractedText(rawText);

    if (garbageRatio > 0.3) {
      console.warn(
        `Page ${pageNumber}: ${Math.round(garbageRatio * 100)}% garbage chars detected — ` +
        `PDF likely uses legacy/non-Unicode fonts. Text may be incomplete.`,
      );
    }

    // Also clean individual items for downstream consumers
    const cleanedItems = sorted.map((it) => ({
      ...it,
      str: cleanExtractedText(it.str).text,
    }));

    const extraction: PageExtraction = {
      pageNumber,
      text,
      items: cleanedItems,
      columns,
      garbageRatio,
    };
    pages.push(extraction);
    onPage?.(extraction, pdf.numPages);
  }
  return pages;
}

export async function loadPdfDocument(data: ArrayBuffer | Blob) {
  return loadDocFromSource(data);
}
