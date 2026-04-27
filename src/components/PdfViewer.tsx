import { useCallback, useEffect, useRef, useState } from "react";
import { loadPdfDocument } from "@/lib/pdf";

/**
 * Number of pages to render ahead/behind the viewport.
 * Only rendered pages have active canvases — all others show placeholders.
 */
const BUFFER_PAGES = 2;

interface Props {
  data: ArrayBuffer | null;
  /** Externally requested page (sync from right panel). */
  syncToPage?: number | null;
  /** Fired when the visible page changes due to user scroll. */
  onPageChange?: (page: number) => void;
  initialScrollTop?: number;
  onScroll?: (top: number) => void;
}

interface PageMeta {
  width: number;
  height: number;
}

export function PdfViewer({
  data,
  syncToPage,
  onPageChange,
  initialScrollTop,
  onScroll,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<any>(null);
  const canvasMapRef = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const renderedSetRef = useRef<Set<number>>(new Set());
  /** Lock to suppress page-change emit during programmatic sync. */
  const lockEmitUntilRef = useRef<number>(0);
  /** Ref to hold page dimensions (scale=1). */
  const pageMetasRef = useRef<PageMeta[]>([]);

  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.3);
  const [rendering, setRendering] = useState(false);
  const [pageInput, setPageInput] = useState("1");
  const [loaded, setLoaded] = useState(false);

  // Load PDF metadata only (no canvas rendering yet)
  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    setRendering(true);
    setLoaded(false);
    renderedSetRef.current.clear();
    canvasMapRef.current.clear();
    (async () => {
      const pdf = await loadPdfDocument(data);
      if (cancelled) return;
      pdfRef.current = pdf;
      setPageCount(pdf.numPages);

      // Collect page dimensions at scale=1
      const metas: PageMeta[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 1 });
        metas.push({ width: vp.width, height: vp.height });
      }
      if (cancelled) return;
      pageMetasRef.current = metas;
      setLoaded(true);
      setRendering(false);

      // Restore scroll position after layout paints
      requestAnimationFrame(() => {
        if (cancelled) return;
        if (initialScrollTop && scrollRef.current) {
          scrollRef.current.scrollTop = initialScrollTop;
        }
        // Trigger initial visible-page render
        renderVisible(scale);
      });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Re-render visible pages when scale changes
  useEffect(() => {
    if (!loaded) return;
    // Clear all rendered canvases so they re-render at new scale
    renderedSetRef.current.clear();
    canvasMapRef.current.forEach((canvas) => {
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    });
    canvasMapRef.current.clear();
    renderVisible(scale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale, loaded]);

  /** Render only pages near the viewport. */
  const renderVisible = useCallback(async (s: number) => {
    const pdf = pdfRef.current;
    const el = scrollRef.current;
    if (!pdf || !el) return;

    const viewTop = el.scrollTop;
    const viewBottom = viewTop + el.clientHeight;

    // Determine which pages are within the viewport + buffer
    const pagesToRender: number[] = [];
    let accY = 24; // initial padding
    const gap = 24;

    for (let i = 0; i < pageMetasRef.current.length; i++) {
      const meta = pageMetasRef.current[i];
      const pageH = meta.height * s + 40; // 40 for label + margin
      const pageTop = accY;
      const pageBottom = accY + pageH;

      const pageNum = i + 1;

      // Check if within viewport + buffer zone
      if (pageBottom >= viewTop - BUFFER_PAGES * pageH && pageTop <= viewBottom + BUFFER_PAGES * pageH) {
        pagesToRender.push(pageNum);
      }

      accY = pageBottom + gap;
    }

    // Render each visible page that isn't already rendered
    const dpr = window.devicePixelRatio || 1;
    for (const pageNum of pagesToRender) {
      if (renderedSetRef.current.has(pageNum)) continue;
      renderedSetRef.current.add(pageNum);

      const canvas = canvasMapRef.current.get(pageNum);
      if (!canvas) continue;

      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: s });

      canvas.width = viewport.width * dpr;
      canvas.height = viewport.height * dpr;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.scale(dpr, dpr);

      try {
        await page.render({ canvasContext: ctx, viewport }).promise;
      } catch {
        // Page render aborted (e.g., user changed scale rapidly)
      }
    }

    // Reclaim offscreen canvases to save memory
    for (const rendered of renderedSetRef.current) {
      if (!pagesToRender.includes(rendered)) {
        renderedSetRef.current.delete(rendered);
        const canvas = canvasMapRef.current.get(rendered);
        if (canvas) {
          const ctx = canvas.getContext("2d");
          if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
          canvas.width = 1;
          canvas.height = 1;
        }
      }
    }
  }, []);

  // Track which page is "current" based on scroll position + trigger lazy render
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !loaded) return;
    let raf = 0;
    let scrollT: ReturnType<typeof setTimeout> | null = null;
    const compute = () => {
      const scrollTop = el.scrollTop;
      const midpoint = scrollTop + el.clientHeight / 3;
      let accY = 24;
      const gap = 24;
      let active = 1;

      for (let i = 0; i < pageMetasRef.current.length; i++) {
        const meta = pageMetasRef.current[i];
        const pageH = meta.height * scale + 40;
        if (accY <= midpoint) active = i + 1;
        accY += pageH + gap;
      }

      if (active !== currentPage) {
        setCurrentPage(active);
        setPageInput(String(active));
        if (Date.now() > lockEmitUntilRef.current) onPageChange?.(active);
      }

      // Trigger lazy rendering of newly visible pages
      renderVisible(scale);
    };
    const handler = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(compute);
      if (scrollT) clearTimeout(scrollT);
      scrollT = setTimeout(() => onScroll?.(el.scrollTop), 400);
    };
    el.addEventListener("scroll", handler, { passive: true });
    return () => {
      el.removeEventListener("scroll", handler);
      if (raf) cancelAnimationFrame(raf);
      if (scrollT) clearTimeout(scrollT);
    };
  }, [currentPage, onPageChange, onScroll, scale, loaded, renderVisible]);

  // Respond to external sync requests
  useEffect(() => {
    if (!syncToPage || !scrollRef.current || !loaded) return;
    const targetTop = getPageTop(syncToPage - 1, scale);
    lockEmitUntilRef.current = Date.now() + 500;
    scrollRef.current.scrollTo({ top: Math.max(0, targetTop - 16), behavior: "smooth" });
    setCurrentPage(syncToPage);
    setPageInput(String(syncToPage));
  }, [syncToPage, scale, loaded]);

  /** Calculate Y offset for a page index. */
  function getPageTop(pageIndex: number, s: number): number {
    let accY = 24;
    const gap = 24;
    for (let i = 0; i < pageIndex && i < pageMetasRef.current.length; i++) {
      const meta = pageMetasRef.current[i];
      accY += meta.height * s + 40 + gap;
    }
    return accY;
  }

  const goToPage = (n: number) => {
    if (!pageCount) return;
    const clamped = Math.max(1, Math.min(pageCount, n));
    const targetTop = getPageTop(clamped - 1, scale);
    if (!scrollRef.current) return;
    scrollRef.current.scrollTo({ top: Math.max(0, targetTop - 16), behavior: "smooth" });
    setCurrentPage(clamped);
    setPageInput(String(clamped));
  };

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

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-3 py-1.5 font-mono text-[11px]">
        <button
          onClick={() => goToPage(currentPage - 1)}
          disabled={currentPage <= 1}
          className="rounded border border-border bg-background px-2 py-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
          aria-label="Previous page"
        >‹</button>
        <input
          value={pageInput}
          onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const n = parseInt(pageInput, 10);
              if (Number.isFinite(n)) goToPage(n);
            }
          }}
          onBlur={() => {
            const n = parseInt(pageInput, 10);
            if (Number.isFinite(n)) goToPage(n);
            else setPageInput(String(currentPage));
          }}
          className="w-10 rounded border border-border bg-background px-1.5 py-0.5 text-center outline-none focus:border-primary"
        />
        <span className="text-muted-foreground">/ {pageCount || "—"}</span>
        <button
          onClick={() => goToPage(currentPage + 1)}
          disabled={currentPage >= pageCount}
          className="rounded border border-border bg-background px-2 py-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
          aria-label="Next page"
        >›</button>

        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setScale((s) => Math.max(0.5, +(s - 0.2).toFixed(2)))}
            className="rounded border border-border bg-background px-2 py-0.5 text-muted-foreground hover:text-foreground"
            aria-label="Zoom out"
          >−</button>
          <span className="w-12 text-center text-muted-foreground">{Math.round(scale * 100)}%</span>
          <button
            onClick={() => setScale((s) => Math.min(3, +(s + 0.2).toFixed(2)))}
            className="rounded border border-border bg-background px-2 py-0.5 text-muted-foreground hover:text-foreground"
            aria-label="Zoom in"
          >+</button>
          <button
            onClick={() => setScale(1.3)}
            className="ml-1 rounded border border-border bg-background px-2 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >reset</button>
        </div>
      </div>

      {/* Scroll surface with virtualized pages */}
      <div ref={scrollRef} className="relative flex-1 overflow-auto bg-grid p-6">
        <div className="flex flex-col items-center gap-6">
          {loaded && pageMetasRef.current.map((meta, i) => {
            const pageNum = i + 1;
            const w = meta.width * scale;
            const h = meta.height * scale;
            return (
              <div key={pageNum} className="flex flex-col items-center gap-2" data-page-number={pageNum}>
                <div className="font-mono text-[11px] text-muted-foreground tracking-wider uppercase">
                  Page {pageNum} / {pageCount}
                </div>
                <canvas
                  ref={(el) => {
                    if (el) canvasMapRef.current.set(pageNum, el);
                    else canvasMapRef.current.delete(pageNum);
                  }}
                  style={{ width: `${w}px`, height: `${h}px` }}
                  className="rounded-md shadow-2xl shadow-black/40 ring-1 ring-border bg-white"
                />
              </div>
            );
          })}
        </div>
        {rendering && pageCount === 0 && (
          <div className="absolute inset-0 flex items-center justify-center font-mono text-xs uppercase tracking-widest text-muted-foreground">
            rendering…
          </div>
        )}
      </div>
    </div>
  );
}
