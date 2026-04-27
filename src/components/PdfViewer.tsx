import { useCallback, useEffect, useRef, useState } from "react";
import { loadPdfDocument } from "@/lib/pdf";

interface Props {
  data: ArrayBuffer | null;
  /** Externally requested page (sync from right panel). */
  syncToPage?: number | null;
  /** Fired when the visible page changes due to user scroll. */
  onPageChange?: (page: number) => void;
  initialScrollTop?: number;
  onScroll?: (top: number) => void;
}

export function PdfViewer({
  data,
  syncToPage,
  onPageChange,
  initialScrollTop,
  onScroll,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageElsRef = useRef<HTMLDivElement[]>([]);
  const pdfRef = useRef<any>(null);
  const renderedScaleRef = useRef<number>(1);
  /** Lock to suppress page-change emit during programmatic sync. */
  const lockEmitUntilRef = useRef<number>(0);

  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.3);
  const [rendering, setRendering] = useState(false);
  const [pageInput, setPageInput] = useState("1");

  // Load PDF + initial render
  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    setRendering(true);
    pageElsRef.current = [];
    (async () => {
      const pdf = await loadPdfDocument(data);
      if (cancelled) return;
      pdfRef.current = pdf;
      setPageCount(pdf.numPages);
      await renderAll(scale);
      if (cancelled) return;
      if (initialScrollTop && scrollRef.current) {
        scrollRef.current.scrollTop = initialScrollTop;
      }
      setRendering(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Re-render on scale change
  useEffect(() => {
    if (!pdfRef.current || renderedScaleRef.current === scale) return;
    void renderAll(scale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale]);

  const renderAll = useCallback(async (s: number) => {
    const pdf = pdfRef.current;
    if (!pdf || !containerRef.current) return;
    setRendering(true);
    renderedScaleRef.current = s;
    containerRef.current.innerHTML = "";
    pageElsRef.current = [];
    const dpr = window.devicePixelRatio || 1;
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: s });
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;
      canvas.width = viewport.width * dpr;
      canvas.height = viewport.height * dpr;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      canvas.className = "rounded-md shadow-2xl shadow-black/40 ring-1 ring-border bg-white";
      ctx.scale(dpr, dpr);

      const wrapper = document.createElement("div");
      wrapper.className = "flex flex-col items-center gap-2";
      wrapper.dataset.pageNumber = String(i);
      const label = document.createElement("div");
      label.className = "font-mono text-[11px] text-muted-foreground tracking-wider uppercase";
      label.textContent = `Page ${i} / ${pdf.numPages}`;
      wrapper.appendChild(label);
      wrapper.appendChild(canvas);
      containerRef.current.appendChild(wrapper);
      pageElsRef.current.push(wrapper);
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    }
    setRendering(false);
  }, []);

  // Track which page is "current" based on scroll position
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let raf = 0;
    let scrollT: ReturnType<typeof setTimeout> | null = null;
    const compute = () => {
      const wrappers = pageElsRef.current;
      if (!wrappers.length) return;
      const scrollTop = el.scrollTop;
      const midpoint = scrollTop + el.clientHeight / 3;
      let active = 1;
      for (const w of wrappers) {
        if (w.offsetTop <= midpoint) active = parseInt(w.dataset.pageNumber ?? "1", 10);
        else break;
      }
      if (active !== currentPage) {
        setCurrentPage(active);
        setPageInput(String(active));
        if (Date.now() > lockEmitUntilRef.current) onPageChange?.(active);
      }
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
  }, [currentPage, onPageChange, onScroll]);

  // Respond to external sync requests
  useEffect(() => {
    if (!syncToPage || !scrollRef.current) return;
    const wrapper = pageElsRef.current[syncToPage - 1];
    if (!wrapper) return;
    lockEmitUntilRef.current = Date.now() + 500;
    scrollRef.current.scrollTo({ top: wrapper.offsetTop - 16, behavior: "smooth" });
    setCurrentPage(syncToPage);
    setPageInput(String(syncToPage));
  }, [syncToPage]);

  const goToPage = (n: number) => {
    if (!pageCount) return;
    const clamped = Math.max(1, Math.min(pageCount, n));
    const wrapper = pageElsRef.current[clamped - 1];
    if (!wrapper || !scrollRef.current) return;
    scrollRef.current.scrollTo({ top: wrapper.offsetTop - 16, behavior: "smooth" });
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

      {/* Scroll surface */}
      <div ref={scrollRef} className="relative flex-1 overflow-auto bg-grid p-6">
        <div ref={containerRef} className="flex flex-col items-center gap-6" />
        {rendering && pageCount === 0 && (
          <div className="absolute inset-0 flex items-center justify-center font-mono text-xs uppercase tracking-widest text-muted-foreground">
            rendering…
          </div>
        )}
      </div>
    </div>
  );
}
