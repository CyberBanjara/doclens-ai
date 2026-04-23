import * as pdfjsLib from "pdfjs-dist";
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";

if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerPort = new PdfWorker();
}

export { pdfjsLib };

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

export async function extractPdfPages(
  data: ArrayBuffer,
  onPage?: (page: PageExtraction, total: number) => void,
): Promise<PageExtraction[]> {
  const pdf = await pdfjsLib.getDocument({ data: data.slice(0) }).promise;
  const pages: PageExtraction[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items: TextItem[] = content.items
      // @ts-expect-error pdfjs typing
      .filter((it) => typeof it.str === "string")
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

    // Rebuild text with line breaks based on Y deltas
    let text = "";
    let lastY: number | null = null;
    for (const it of sorted) {
      if (lastY !== null && Math.abs(it.y - lastY) > 4) text += "\n";
      else if (text && !text.endsWith(" ") && !text.endsWith("\n")) text += " ";
      text += it.str;
      lastY = it.y;
    }
    text = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

    const extraction: PageExtraction = { pageNumber, text, items: sorted, columns };
    pages.push(extraction);
    onPage?.(extraction, pdf.numPages);
  }
  return pages;
}

export async function loadPdfDocument(data: ArrayBuffer) {
  return pdfjsLib.getDocument({ data: data.slice(0) }).promise;
}
