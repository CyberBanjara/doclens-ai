import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFPageProxy, PageViewport } from "pdfjs-dist";
import { LoadingLogo } from "@/components/LoadingLogo";
import { useIsMobile } from "@/hooks/use-mobile";
import { listenDocEvent } from "@/lib/docEvents";
import { usePdfDocument, TARGET_WIDTH } from "@/hooks/usePdfDocument";
import { useTextSelectionToolbar } from "@/hooks/useTextSelectionToolbar";
import { SelectionToolbar } from "@/components/SelectionToolbar";

interface Props {
  /** Document ID — binary is loaded on-demand from IndexedDB */
  docId: string;
  activePage: number;
  setActivePage: (p: number) => void;
}

const DPR = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;
/** Max bitmaps kept simultaneously (current page ±1). */
const MAX_RENDERED = 3;

/**
 * PDF viewer with lazy canvas + text-layer rendering driven by IntersectionObserver.
 * Bitmaps for off-screen pages are released (canvas.width/height = 0) and
 * page.cleanup() is called to free the internal operator list. At most
 * MAX_RENDERED canvases hold pixel data.
 *
 * The native pdf.js TextLayer overlays the canvas so users can select,
 * copy, translate (via "doclens:translate-selection" event), or speak text.
 * Scanned/image-only pages get no text spans — toolbar simply never appears.
 */
export function PdfViewer({ docId, activePage, setActivePage }: Props) {
  const isMobile = useIsMobile();
  const { doc, pageMetas, loading, error } = usePdfDocument(docId);
  /** Pages whose canvas has finished rendering — drives the per-page loading overlay. */
  const [loadedPageNumbers, setLoadedPageNumbers] = useState<Set<number>>(new Set());
  // Reset per-page loaded tracking whenever the document changes (mirrors usePdfDocument's own reset).
  useEffect(() => {
    setLoadedPageNumbers(new Set());
  }, [docId]);

  /** Ratio of actually-available page width to TARGET_WIDTH; drives the text-layer
   *  scale transform so selectable spans (positioned in raw TARGET_WIDTH-space px by
   *  pdf.js) stay aligned with the canvas image once it's shrunk to fit narrow
   *  viewports. The canvas/container themselves need no such transform — CSS
   *  aspect-ratio keeps their box proportional to the page at any width. */
  const [displayScale, setDisplayScale] = useState(1);
  const pagesColumnRef = useRef<HTMLDivElement>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const textLayerRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const visiblePages = useRef<Set<number>>(new Set());
  const renderedPages = useRef<Set<number>>(new Set());
  const renderingPages = useRef<Set<number>>(new Set());
  const recentlyVisibleOrder = useRef<number[]>([]);
  const observerRef = useRef<IntersectionObserver | null>(null);

  /** Release bitmap memory + clear text layer for an off-screen page. */
  const releasePage = useCallback((pageNumber: number) => {
    if (renderingPages.current.has(pageNumber)) return;

    const canvas = canvasRefs.current.get(pageNumber);
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
      canvas.style.display = "none";
    }
    const tl = textLayerRefs.current.get(pageNumber);
    if (tl) tl.innerHTML = "";
    renderedPages.current.delete(pageNumber);
    setLoadedPageNumbers((prev) => {
      if (!prev.has(pageNumber)) return prev;
      const next = new Set(prev);
      next.delete(pageNumber);
      return next;
    });
    // Note: We intentionally do NOT call doc.getPage(n).cleanup() here.
    // That call re-fetches the page proxy into pdf.js's internal cache,
    // counterproductively increasing memory. doc.destroy() on unmount
    // handles full cleanup.
  }, []);

  const renderPage = useCallback(
    async (pageNumber: number) => {
      if (!doc) return;
      if (renderingPages.current.has(pageNumber)) return;
      if (renderedPages.current.has(pageNumber)) return;

      const canvas = canvasRefs.current.get(pageNumber);
      const textLayer = textLayerRefs.current.get(pageNumber);
      if (!canvas) return;
      const meta = pageMetas[pageNumber - 1];
      if (!meta) return;

      renderingPages.current.add(pageNumber);
      let page: PDFPageProxy | null = null;
      try {
        page = await doc.getPage(pageNumber);
        const renderScale = meta.scale * DPR;
        const viewport: PageViewport = page.getViewport({ scale: renderScale });
        const cssViewport = page.getViewport({ scale: meta.scale });

        canvas.width = Math.max(1, Math.ceil(viewport.width));
        canvas.height = Math.max(1, Math.ceil(viewport.height));
        // 100% of the container, which is itself clamped to the page's true
        // aspect ratio via CSS — keeps the bitmap from being stretched when
        // the container is narrower than TARGET_WIDTH (e.g. mobile).
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        canvas.style.display = "block";

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        await page.render({ canvasContext: ctx, viewport, canvas } as never).promise;

        // Render selectable text layer aligned to the css viewport
        if (textLayer) {
          textLayer.innerHTML = "";
          textLayer.style.width = `${meta.cssWidth}px`;
          textLayer.style.height = `${meta.cssHeight}px`;
          // Required by pdf.js stylesheet to size text spans correctly
          textLayer.style.setProperty("--scale-factor", String(meta.scale));
          try {
            const pdfjs = await import("pdfjs-dist");
            const textContent = await page.getTextContent();
            const tl = new pdfjs.TextLayer({
              textContentSource: textContent,
              container: textLayer,
              viewport: cssViewport,
            });
            await tl.render();
          } catch (e) {
            // Scanned / image-only pages: silently leave the text layer empty.
            console.debug("TextLayer render skipped", e);
          }
        }

        renderedPages.current.add(pageNumber);
        setLoadedPageNumbers((prev) => new Set(prev).add(pageNumber));

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
        if (page) {
          try {
            page.cleanup();
          } catch (e) {
            console.debug("Page cleanup failed", e);
          }
        }
        renderingPages.current.delete(pageNumber);
        if (renderingPages.current.size === 0) {
          doc.cleanup().catch(() => {});
        }
        if (!visiblePages.current.has(pageNumber)) {
          releasePage(pageNumber);
        }
      }
    },
    [doc, pageMetas, releasePage],
  );

  // Track available page width so the text layer can be scaled to match the
  // aspect-ratio-clamped canvas on viewports narrower than TARGET_WIDTH.
  useEffect(() => {
    const el = pagesColumnRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setDisplayScale(Math.min(1, width / TARGET_WIDTH));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
            visiblePages.current.add(pn);
            const order = recentlyVisibleOrder.current;
            const idx = order.indexOf(pn);
            if (idx !== -1) order.splice(idx, 1);
            order.push(pn);
            renderPage(pn);
          } else {
            visiblePages.current.delete(pn);
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

  // Cleanup all bitmaps + destroy PDF document on unmount / doc change
  useEffect(() => {
    return () => {
      renderedPages.current.forEach((pn) => {
        const c = canvasRefs.current.get(pn);
        if (c) {
          c.width = 0;
          c.height = 0;
        }
        const tl = textLayerRefs.current.get(pn);
        if (tl) tl.innerHTML = "";
      });
      renderedPages.current.clear();
      visiblePages.current.clear();
      renderingPages.current.clear();
      recentlyVisibleOrder.current = [];
      // Destroy the PDFDocumentProxy to release all native memory
      // (decoded fonts, CMap tables, page caches, operator lists).
      // The load effect cleanup also handles this, but this is a safety net
      // for cases where the doc was set in state before the effect re-ran.
      if (doc) {
        try {
          doc.cleanup();
        } catch {}
        doc.destroy();
      }
    };
  }, [doc, docId]);

  // Scroll to corresponding page when activePage changes from outside (e.g. right-side panel)
  useEffect(() => {
    if (activePage > 0 && !loading) {
      // Use requestAnimationFrame/setTimeout to ensure elements are fully mounted
      const timer = setTimeout(() => {
        const pageEl = scrollRef.current?.querySelector(`[data-page-number="${activePage}"]`);
        if (pageEl) {
          const rect = pageEl.getBoundingClientRect();
          const rootRect = scrollRef.current?.getBoundingClientRect();
          if (rootRect) {
            const isVisible =
              rect.top >= rootRect.top - 100 && rect.bottom <= rootRect.bottom + 100;
            if (!isVisible) {
              pageEl.scrollIntoView({ behavior: "smooth", block: "start" });
            }
          }
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [activePage, loading]);

  // Also support scroll-to-pdf event on right-side click (even if activePage hasn't changed)
  useEffect(() => {
    return listenDocEvent("doclens:scroll-to-pdf", (d) => {
      if (d.pageNumber && d.pageNumber > 0) {
        const pageEl = scrollRef.current?.querySelector(`[data-page-number="${d.pageNumber}"]`);
        if (pageEl) {
          pageEl.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    });
  }, []);

  const { selection, handleCopy, handleTranslate } = useTextSelectionToolbar(docId, scrollRef);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center pdf-viewer-bg">
        <LoadingLogo size={96} label="Loading PDF…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <div className="text-center">
          <div className="font-mono text-xs uppercase tracking-widest text-destructive">
            {error}
          </div>
        </div>
      </div>
    );
  }

  const handlePageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;

    const target = e.target as HTMLElement | null;
    if (!target) return;

    const pageDiv = target.closest("[data-page-number]");
    if (pageDiv) {
      const pageNumber = parseInt(pageDiv.getAttribute("data-page-number") || "", 10);
      if (!isNaN(pageNumber) && pageNumber > 0) {
        setActivePage(pageNumber);
      }
    }
  };

  return (
    <>
      <div ref={scrollRef} className="relative h-full overflow-auto pdf-viewer-bg">
        <div
          ref={pagesColumnRef}
          className={`flex flex-col items-center gap-4 ${isMobile ? "py-4 px-0" : "py-6 px-4"}`}
          onClick={handlePageClick}
        >
          {pageMetas.map((meta) => (
            <div
              key={meta.pageNumber}
              data-page-number={meta.pageNumber}
              ref={(el) => {
                if (el && observerRef.current) observerRef.current.observe(el);
              }}
              style={{
                width: meta.cssWidth,
                maxWidth: "100%",
                aspectRatio: `${meta.cssWidth} / ${meta.cssHeight}`,
              }}
              className={`relative flex-shrink-0 pdf-page-container ${activePage === meta.pageNumber ? "pdf-page-active" : ""}`}
            >
              {!loadedPageNumbers.has(meta.pageNumber) && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface">
                  <LoadingLogo size={64} />
                </div>
              )}
              <canvas
                data-page-number={meta.pageNumber}
                ref={(el) => {
                  if (el) canvasRefs.current.set(meta.pageNumber, el);
                  else canvasRefs.current.delete(meta.pageNumber);
                }}
                style={{
                  width: "100%",
                  height: "100%",
                  display: "block",
                  background: "#fff",
                }}
              />
              <div
                data-text-layer
                data-page-number={meta.pageNumber}
                ref={(el) => {
                  if (el) textLayerRefs.current.set(meta.pageNumber, el);
                  else textLayerRefs.current.delete(meta.pageNumber);
                }}
                className="textLayer absolute inset-0"
                style={{
                  width: meta.cssWidth,
                  height: meta.cssHeight,
                  transform: `scale(${displayScale})`,
                  transformOrigin: "top left",
                  opacity: 1,
                  lineHeight: 1,
                }}
              />
              {/* Redundant with MobileTopBar's floating page indicator on mobile */}
              {!isMobile && <div className="pdf-page-badge">{meta.pageNumber}</div>}
            </div>
          ))}
        </div>

        {/* Floating selection toolbar */}
        {selection && (
          <SelectionToolbar
            selection={selection}
            isMobile={isMobile}
            onCopy={handleCopy}
            onTranslate={handleTranslate}
          />
        )}
      </div>
    </>
  );
}
