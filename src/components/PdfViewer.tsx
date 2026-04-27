import { useCallback, useEffect, useRef, useState } from "react";
import { loadPdfDocument } from "@/lib/pdf";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";

interface Props {
  data: ArrayBuffer | null;
}

/** Device pixel ratio for sharp rendering on HiDPI screens */
const DPR = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

/** CSS-pixel width to fit the panel. Actual canvas pixels = this × DPR. */
const TARGET_WIDTH = 800;

/** How many pages above/below viewport to keep rendered. */
const BUFFER = 2;

interface PageMeta {
  pageNumber: number;
  cssWidth: number;
  cssHeight: number;
  scale: number;
}

/**
 * PDF viewer that uses pdf.js `page.render()` to draw each page on a canvas.
 * This renders EVERYTHING: text, images, vector graphics, annotations —
 * exactly as the PDF was authored. Uses a virtualized approach: only pages
 * near the viewport are rendered; offscreen canvases are cleared to free memory.
 */
export function PdfViewer({ data }: Props) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [pageMetas, setPageMetas] = useState<PageMeta[]>([]);
  const [visibleRange, setVisibleRange] = useState<[number, number]>([0, 3]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const renderedPages = useRef<Set<number>>(new Set());
  const renderingPages = useRef<Set<number>>(new Set());

  // Load the PDF document and collect page dimensions
  useEffect(() => {
    if (!data) {
      setDoc(null);
      setPageMetas([]);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const pdfDoc = await loadPdfDocument(data);
        if (cancelled) return;
        setDoc(pdfDoc);

        // Collect page dimensions (fast — no rendering yet)
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
        }
        if (cancelled) return;
        setPageMetas(metas);
      } catch (err) {
        console.error("PdfViewer: failed to load document", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [data]);

  // Render a single page to its canvas
  const renderPage = useCallback(
    async (pageNumber: number) => {
      if (!doc) return;
      if (renderingPages.current.has(pageNumber)) return;
      if (renderedPages.current.has(pageNumber)) return;

      const canvas = canvasRefs.current.get(pageNumber);
      if (!canvas) return;

      const meta = pageMetas[pageNumber - 1];
      if (!meta) return;

      renderingPages.current.add(pageNumber);

      try {
        const page: PDFPageProxy = await doc.getPage(pageNumber);
        // Use higher resolution for sharp text/images on HiDPI
        const renderScale = meta.scale * DPR;
        const viewport = page.getViewport({ scale: renderScale });

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${meta.cssWidth}px`;
        canvas.style.height = `${meta.cssHeight}px`;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
        renderedPages.current.add(pageNumber);
      } catch (err) {
        // Don't log cancelled renders
        if (err instanceof Error && err.message.includes("cancelled")) return;
        console.error(`PdfViewer: render error for page ${pageNumber}`, err);
      } finally {
        renderingPages.current.delete(pageNumber);
      }
    },
    [doc, pageMetas],
  );

  // Clear an offscreen canvas to free memory
  const clearPage = useCallback((pageNumber: number) => {
    const canvas = canvasRefs.current.get(pageNumber);
    if (!canvas) return;
    canvas.width = 1;
    canvas.height = 1;
    renderedPages.current.delete(pageNumber);
  }, []);

  // Determine which pages are visible based on scroll position
  const updateVisibleRange = useCallback(() => {
    const container = scrollRef.current;
    if (!container || pageMetas.length === 0) return;

    const scrollTop = container.scrollTop;
    const viewportHeight = container.clientHeight;
    const scrollBottom = scrollTop + viewportHeight;

    let firstVisible = 0;
    let lastVisible = 0;
    let cumulativeTop = 0;

    for (let i = 0; i < pageMetas.length; i++) {
      const pageBottom = cumulativeTop + pageMetas[i].cssHeight + 12; // 12px gap
      if (pageBottom >= scrollTop) {
        firstVisible = i;
        break;
      }
      cumulativeTop += pageMetas[i].cssHeight + 12;
    }

    cumulativeTop = 0;
    for (let i = 0; i < pageMetas.length; i++) {
      cumulativeTop += pageMetas[i].cssHeight + 12;
      lastVisible = i;
      if (cumulativeTop >= scrollBottom) break;
    }

    const bufferedFirst = Math.max(0, firstVisible - BUFFER);
    const bufferedLast = Math.min(pageMetas.length - 1, lastVisible + BUFFER);

    setVisibleRange([bufferedFirst, bufferedLast]);
  }, [pageMetas]);

  // Track scroll to update visible range
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    updateVisibleRange();

    let rafId = 0;
    const handleScroll = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(updateVisibleRange);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", handleScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [updateVisibleRange]);

  // Render visible pages, clear offscreen pages
  useEffect(() => {
    const [first, last] = visibleRange;

    // Render pages in visible range
    for (let i = first; i <= last; i++) {
      const pn = pageMetas[i]?.pageNumber;
      if (pn) renderPage(pn);
    }

    // Clear pages outside visible range
    for (const pn of renderedPages.current) {
      const idx = pn - 1;
      if (idx < first || idx > last) {
        clearPage(pn);
      }
    }
  }, [visibleRange, pageMetas, renderPage, clearPage]);

  // Re-compute on resize
  useEffect(() => {
    const handleResize = () => updateVisibleRange();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [updateVisibleRange]);

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <div className="text-center">
          <div className="font-mono text-xs uppercase tracking-widest">no document loaded</div>
          <div className="mt-2 text-sm">Upload a PDF to begin</div>
        </div>
      </div>
    );
  }

  if (pageMetas.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          loading pdf…
        </div>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="h-full overflow-auto"
      style={{ background: "#404040" }}
    >
      <div className="flex flex-col items-center gap-3 py-4">
        {pageMetas.map((meta, idx) => {
          const inRange = idx >= visibleRange[0] && idx <= visibleRange[1];
          return (
            <div
              key={meta.pageNumber}
              style={{
                width: meta.cssWidth,
                height: meta.cssHeight,
                maxWidth: "100%",
              }}
              className="relative flex-shrink-0 shadow-lg"
            >
              <canvas
                ref={(el) => {
                  if (el) canvasRefs.current.set(meta.pageNumber, el);
                  else canvasRefs.current.delete(meta.pageNumber);
                }}
                style={{
                  width: meta.cssWidth,
                  height: meta.cssHeight,
                  maxWidth: "100%",
                  display: "block",
                  background: "#fff",
                }}
              />
              {/* Page number badge */}
              <div className="absolute bottom-2 right-2 rounded bg-black/60 px-2 py-0.5 font-mono text-[10px] text-white/80">
                {meta.pageNumber}
              </div>
              {/* Placeholder while not rendered */}
              {!inRange && (
                <div
                  className="absolute inset-0 flex items-center justify-center bg-white"
                  style={{ width: meta.cssWidth, height: meta.cssHeight, maxWidth: "100%" }}
                >
                  <span className="font-mono text-xs text-gray-400">
                    Page {meta.pageNumber}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
