import { useEffect, useState } from "react";
import { loadPdfDocument } from "@/lib/pdf";
import { getDocBlob } from "@/lib/storage";
import type { PDFDocumentProxy } from "pdfjs-dist";

export const TARGET_WIDTH = 800;

export interface PageMeta {
  pageNumber: number;
  cssWidth: number;
  cssHeight: number;
  scale: number;
}

/** Loads a document's PDF binary from IndexedDB and computes per-page layout metadata. */
export function usePdfDocument(docId: string) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [pageMetas, setPageMetas] = useState<PageMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load PDF on-demand from IndexedDB (as Blob → objectURL)
  useEffect(() => {
    let cancelled = false;
    let loadedDoc: PDFDocumentProxy | null = null;
    setLoading(true);
    setError(null);
    setDoc(null);
    setPageMetas([]);

    (async () => {
      try {
        const blob = await getDocBlob(docId);
        if (cancelled) return;
        if (!blob) {
          setError("PDF binary not found in storage.");
          setLoading(false);
          return;
        }

        const pdfDoc = await loadPdfDocument(blob);
        if (cancelled) {
          // Loaded after cancel — destroy immediately to prevent leak.
          pdfDoc.destroy();
          return;
        }
        loadedDoc = pdfDoc;
        setDoc(pdfDoc);

        const metas: PageMeta[] = [];
        for (let i = 1; i <= pdfDoc.numPages; i++) {
          const page = await pdfDoc.getPage(i);
          const vp = page.getViewport({ scale: 1 });
          const scale = TARGET_WIDTH / vp.width;
          metas.push({
            pageNumber: i,
            cssWidth: TARGET_WIDTH,
            cssHeight: Math.round(vp.height * scale),
            scale,
          });
          // Drop the temporary PageProxy reference — we'll fetch again at render time.
          page.cleanup();
        }
        if (cancelled) return;
        await pdfDoc.cleanup();
        if (cancelled) return;
        setPageMetas(metas);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error("PdfViewer: failed to load", err);
        setError("Failed to load PDF.");
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      // Destroy previous PDFDocumentProxy to free decoded fonts, CMap tables,
      // internal page caches, and operator lists (~200-500MB for large PDFs).
      if (loadedDoc) {
        loadedDoc.destroy();
        loadedDoc = null;
      }
    };
  }, [docId]);

  return { doc, pageMetas, loading, error };
}
