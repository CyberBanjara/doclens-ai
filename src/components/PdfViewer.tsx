import { useCallback, useEffect, useRef, useState } from "react";
import { loadPdfDocument } from "@/lib/pdf";
import { getDocBlob } from "@/lib/storage";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";

interface Props {
  /** Document ID — binary is loaded on-demand from IndexedDB */
  docId: string;
}

const DPR = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
const TARGET_WIDTH = 800;
/** Max bitmaps kept simultaneously (current page ±2). */
const MAX_RENDERED = 5;

interface PageMeta {
  pageNumber: number;
  cssWidth: number;
  cssHeight: number;
  scale: number;
}

/**
 * PDF viewer with lazy canvas rendering driven by IntersectionObserver.
 * Bitmaps for off-screen pages are released (canvas.width/height = 0)
 * to free GPU memory. At most MAX_RENDERED canvases hold pixel data.
 */
export function PdfViewer({ docId }: Props) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [pageMetas, setPageMetas] = useState<PageMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const renderedPages = useRef<Set<number>>(new Set());
  const renderingPages = useRef<Set<number>>(new Set());
  const recentlyVisibleOrder = useRef<number[]>([]);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Load PDF on-demand from IndexedDB (as Blob → objectURL)
  useEffect(() => {
    let cancelled = false;
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
        if (cancelled) return;
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
        }
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
    };
  }, [docId]);

  /** Release bitmap memory: width=0 first frees GPU, then restore CSS dims. */
  const releasePage = useCallback((pageNumber: number) => {
    const canvas = canvasRefs.current.get(pageNumber);
    if (!canvas) return;
    canvas.width = 0;
    canvas.height = 0;
    renderedPages.current.delete(pageNumber);
  }, []);

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

        // Cap rendered set: drop oldest entries past MAX_RENDERED.
        const order = recentlyVisibleOrder.current;
        while (renderedPages.current.size > MAX_RENDERED) {
          const dropFrom = order.find((n) => renderedPages.current.has(n) && n !== pageNumber);
          if (dropFrom === undefined) break;
          releasePage(dropFrom);
          const idx = order.indexOf(dropFrom);
          if (idx !== -1) order.splice(idx, 1);
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes("cancelled")) return;
        console.error(`PdfViewer: render error page ${pageNumber}`, err);
      } finally {
        renderingPages.current.delete(pageNumber);
      }
    },
    [doc, pageMetas, releasePage],
  );

  // IntersectionObserver: render on enter, release on leave.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || pageMetas.length === 0) return;

    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const pn = Number((entry.target as HTMLElement).dataset.pageNumber);
          if (!Number.isFinite(pn) || pn <= 0) continue;
          if (entry.isIntersecting) {
            // Track LRU-style for cap eviction
            const order = recentlyVisibleOrder.current;
            const idx = order.indexOf(pn);
            if (idx !== -1) order.splice(idx, 1);
            order.push(pn);
            renderPage(pn);
          } else {
            // Outside viewport (and 200px buffer) → release bitmap
            releasePage(pn);
          }
        }
      },
      { root, rootMargin: "200px 0px", threshold: 0 },
    );
    observerRef.current = obs;

    canvasRefs.current.forEach((el) => obs.observe(el.parentElement ?? el));

    return () => {
      obs.disconnect();
      observerRef.current = null;
    };
  }, [pageMetas, renderPage, releasePage]);

  // Cleanup all bitmaps on unmount / doc change
  useEffect(() => {
    return () => {
      renderedPages.current.forEach((pn) => {
        const c = canvasRefs.current.get(pn);
        if (c) {
          c.width = 0;
          c.height = 0;
        }
      });
      renderedPages.current.clear();
      renderingPages.current.clear();
      recentlyVisibleOrder.current = [];
    };
  }, [docId]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          loading pdf…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <div className="text-center">
          <div className="font-mono text-xs uppercase tracking-widest text-destructive">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="h-full overflow-auto" style={{ background: "#404040" }}>
      <div className="flex flex-col items-center gap-3 py-4">
        {pageMetas.map((meta) => (
          <div
            key={meta.pageNumber}
            data-page-number={meta.pageNumber}
            ref={(el) => {
              if (el && observerRef.current) observerRef.current.observe(el);
            }}
            style={{ width: meta.cssWidth, height: meta.cssHeight, maxWidth: "100%" }}
            className="relative flex-shrink-0 shadow-lg"
          >
            <canvas
              data-page-number={meta.pageNumber}
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
            <div className="absolute bottom-2 right-2 rounded bg-black/60 px-2 py-0.5 font-mono text-[10px] text-white/80">
              {meta.pageNumber}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
