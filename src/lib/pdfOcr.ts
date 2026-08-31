import { createWorker, type Worker } from "tesseract.js";
import { loadDocFromSource } from "./pdf";
import { detectColumns, sortByColumns, type TextItem } from "./pdfLayout";
import { cleanOcrText, checkTextQuality } from "./textCleaning";

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

export async function terminateOcrWorker(): Promise<void> {
  if (ocrWorkerPromise) {
    try {
      const worker = await ocrWorkerPromise;
      await worker.terminate();
    } catch { }
    ocrWorkerPromise = null;
  }
}

// Vite Hot Module Replacement (HMR) cleanup
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    try {
      void terminateOcrWorker();
    } catch (e) {
      console.warn("[HMR] Failed to dispose OCR worker:", e);
    }
  });
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

  try {
    await page.render({ canvasContext: ctx, viewport: viewport2 }).promise;

    // Run Tesseract OCR on the full canvas
    const result = await worker.recognize(canvas, {}, { blocks: true });
    const rawWords = (result.data as any)?.words || [];
    const words: any[] = [];
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

    // Detect columns dynamically if not forced by the caller
    let cols = columns;
    if (cols <= 1) {
      cols = detectColumns(items, origViewport.width, 8);
    }

    // Sort words respecting layout structure/columns
    const sorted = sortByColumns(items, origViewport.width, cols, 8);

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

    const cleaned = cleanOcrText(rawText);

    return cleaned;
  } finally {
    // Immediately release the large 2x canvas pixel memory
    canvas.width = 0;
    canvas.height = 0;
  }
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
      } catch { }
    }
  } finally {
    try {
      await pdf.destroy();
    } catch { }
  }
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
          } catch { }
        }
      }
    }
    return updatedPages;
  } finally {
    try {
      await pdf.destroy();
    } catch { }
    try {
      await terminateOcrWorker();
    } catch { }
  }
}
