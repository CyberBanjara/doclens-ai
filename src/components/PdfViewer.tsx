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
 * PDF viewer with prioritized lazy canvas + text-layer rendering.
 *
 * GUARANTEE: The currently visible page (activePage) ALWAYS has absolute highest
 * priority and is rendered immediately before any other page (e.g. page 99, 101).
 * Background preloading of other intersecting pages only proceeds after the
 * active page has finished rendering.
 */
export function PdfViewer({ docId, activePage, setActivePage }: Props) {
  const isMobile = useIsMobile();
  const { doc, pageMetas, loading, error } = usePdfDocument(docId);
  /** Pages whose canvas has finished rendering — drives the per-page loading overlay. */
  const [loadedPageNumbers, setLoadedPageNumbers] = useState<Set<number>>(new Set());

  // Reset per-page loaded tracking whenever the document changes.
  useEffect(() => {
    setLoadedPageNumbers(new Set());
  }, [docId]);

  /** Ratio of actually-available page width to TARGET_WIDTH */
  const [displayScale, setDisplayScale] = useState(1);
  const pagesColumnRef = useRef<HTMLDivElement>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const textLayerRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const activePageRef = useRef(activePage);
  const visiblePages = useRef<Set<number>>(new Set());
  const renderedPages = useRef<Set<number>>(new Set());
  const renderingPage = useRef<number | null>(null);
  const queuedPagesRef = useRef<Set<number>>(new Set());
  const recentlyVisibleOrder = useRef<number[]>([]);
  const isProcessingQueueRef = useRef<boolean>(false);
  const isProgrammaticScrollRef = useRef<boolean>(false);
  const programmaticScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  /** Currently executing render task reference so low-priority renders can be cancelled */
  const activeRenderTaskRef = useRef<{
    pageNumber: number;
    isHighPriority: boolean;
    cancel: () => void;
  } | null>(null);

  /** Release bitmap memory + clear text layer for an off-screen page. */
  const releasePage = useCallback((pageNumber: number) => {
    if (renderingPage.current === pageNumber) return;

    const canvas = canvasRefs.current.get(pageNumber);
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
      canvas.style.display = "none";
    }
    const tl = textLayerRefs.current.get(pageNumber);
    if (tl) tl.innerHTML = "";
    renderedPages.current.delete(pageNumber);
    queuedPagesRef.current.delete(pageNumber);
    setLoadedPageNumbers((prev) => {
      if (!prev.has(pageNumber)) return prev;
      const next = new Set(prev);
      next.delete(pageNumber);
      return next;
    });
  }, []);

  /** Direct render execution for a single page */
  const executePageRender = useCallback(
    async (pageNumber: number, isHighPriority: boolean) => {
      if (!doc) return;
      if (renderedPages.current.has(pageNumber)) return;

      const canvas = canvasRefs.current.get(pageNumber);
      const textLayer = textLayerRefs.current.get(pageNumber);
      if (!canvas) return;
      const meta = pageMetas[pageNumber - 1];
      if (!meta) return;

      renderingPage.current = pageNumber;
      let page: PDFPageProxy | null = null;
      let cancelled = false;

      try {
        page = await doc.getPage(pageNumber);
        const renderScale = meta.scale * DPR;
        const viewport: PageViewport = page.getViewport({ scale: renderScale });
        const cssViewport = page.getViewport({ scale: meta.scale });

        canvas.width = Math.max(1, Math.ceil(viewport.width));
        canvas.height = Math.max(1, Math.ceil(viewport.height));
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        canvas.style.display = "block";

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const renderTask = page.render({ canvasContext: ctx, viewport, canvas } as never);
        activeRenderTaskRef.current = {
          pageNumber,
          isHighPriority,
          cancel: () => {
            cancelled = true;
            try {
              renderTask.cancel();
            } catch {}
          },
        };

        await renderTask.promise;

        // Render selectable text layer aligned to the css viewport
        if (textLayer && !cancelled) {
          textLayer.innerHTML = "";
          textLayer.style.width = `${meta.cssWidth}px`;
          textLayer.style.height = `${meta.cssHeight}px`;
          textLayer.style.setProperty("--scale-factor", String(meta.scale));
          try {
            const pdfjs = await import("pdfjs-dist");
            const textContent = await page.getTextContent();
            if (!cancelled) {
              const tl = new pdfjs.TextLayer({
                textContentSource: textContent,
                container: textLayer,
                viewport: cssViewport,
              });
              await tl.render();
            }
          } catch (e) {
            console.debug("TextLayer render skipped", e);
          }
        }

        if (!cancelled) {
          renderedPages.current.add(pageNumber);
          setLoadedPageNumbers((prev) => new Set(prev).add(pageNumber));

          // Cap rendered set: drop oldest entries past MAX_RENDERED (except activePage and current page)
          const currentActive = activePageRef.current;
          const order = recentlyVisibleOrder.current;
          while (renderedPages.current.size > MAX_RENDERED) {
            const dropFrom = order.find(
              (n) => renderedPages.current.has(n) && n !== currentActive && n !== pageNumber,
            );
            if (dropFrom === undefined) break;
            releasePage(dropFrom);
            const idx = order.indexOf(dropFrom);
            if (idx !== -1) order.splice(idx, 1);
          }
        }
      } catch (err: any) {
        if (err?.name === "RenderingCancelledException" || err?.message?.includes("cancelled")) {
          if (canvas) {
            canvas.width = 0;
            canvas.height = 0;
            canvas.style.display = "none";
          }
        } else {
          console.error(`PdfViewer: render error page ${pageNumber}`, err);
        }
      } finally {
        if (page) {
          try {
            page.cleanup();
          } catch (e) {
            console.debug("Page cleanup failed", e);
          }
        }
        activeRenderTaskRef.current = null;
        renderingPage.current = null;

        if (!visiblePages.current.has(pageNumber) && pageNumber !== activePageRef.current) {
          releasePage(pageNumber);
        }
      }
    },
    [doc, pageMetas, releasePage],
  );

  /** Process the rendering queue strictly prioritizing the currently visible activePage */
  const processQueue = useCallback(async () => {
    if (!doc || pageMetas.length === 0) return;
    if (isProcessingQueueRef.current) return;
    isProcessingQueueRef.current = true;

    try {
      while (true) {
        const currentActive = activePageRef.current;
        const activeNeedsRender =
          currentActive > 0 &&
          currentActive <= pageMetas.length &&
          !renderedPages.current.has(currentActive);

        let targetPage: number | null = null;
        let isHighPriority = false;

        if (activeNeedsRender) {
          // ACTIVE VISIBLE PAGE HAS HIGHEST PRIORITY!
          targetPage = currentActive;
          isHighPriority = true;

          // If a low-priority render is currently in-flight, cancel it immediately
          if (activeRenderTaskRef.current && !activeRenderTaskRef.current.isHighPriority) {
            try {
              activeRenderTaskRef.current.cancel();
            } catch {}
            // Stop and let the cancelled task clean up
            break;
          }

          // If currently rendering something else (e.g. previous active page), wait for it
          if (renderingPage.current !== null && renderingPage.current !== targetPage) {
            break;
          }
        } else {
          // If the active page is still in progress or not rendered, DO NOT process background pages!
          if (currentActive > 0 && !renderedPages.current.has(currentActive)) {
            break;
          }

          // If a render is already running, wait
          if (renderingPage.current !== null) {
            break;
          }

          // Active page is ready! Now we can process queued background / preload pages.
          const candidates = Array.from(queuedPagesRef.current).filter(
            (pn) => !renderedPages.current.has(pn) && visiblePages.current.has(pn),
          );

          if (candidates.length === 0) {
            break;
          }

          // Sort candidates by proximity to currentActive (closest pages first)
          candidates.sort((a, b) => Math.abs(a - currentActive) - Math.abs(b - currentActive));
          targetPage = candidates[0];
          isHighPriority = false;
        }

        if (targetPage === null || renderedPages.current.has(targetPage)) {
          if (targetPage !== null) queuedPagesRef.current.delete(targetPage);
          break;
        }

        queuedPagesRef.current.delete(targetPage);
        await executePageRender(targetPage, isHighPriority);
      }
    } finally {
      isProcessingQueueRef.current = false;
      if (doc && renderingPage.current === null) {
        const currentActive = activePageRef.current;
        const hasPendingWork =
          (!renderedPages.current.has(currentActive) && currentActive > 0) ||
          Array.from(queuedPagesRef.current).some(
            (pn) => !renderedPages.current.has(pn) && visiblePages.current.has(pn),
          );
        if (hasPendingWork) {
          setTimeout(() => {
            void processQueue();
          }, 0);
        } else {
          doc.cleanup().catch(() => {});
        }
      }
    }
  }, [doc, pageMetas, executePageRender]);

  /** Request a page render with priority indication */
  const requestRender = useCallback(
    (pageNumber: number, isHighPriority: boolean) => {
      if (renderedPages.current.has(pageNumber)) return;

      if (isHighPriority) {
        // If a low-priority task is currently rendering, cancel it immediately
        if (activeRenderTaskRef.current && !activeRenderTaskRef.current.isHighPriority) {
          try {
            activeRenderTaskRef.current.cancel();
          } catch {}
        }
      } else {
        queuedPagesRef.current.add(pageNumber);
      }
      void processQueue();
    },
    [processQueue],
  );

  // Keep activePageRef synchronized and trigger immediate high-priority render on page change
  useEffect(() => {
    activePageRef.current = activePage;
    if (activePage > 0) {
      const order = recentlyVisibleOrder.current;
      const idx = order.indexOf(activePage);
      if (idx !== -1) order.splice(idx, 1);
      order.push(activePage);

      if (!loading && doc) {
        requestRender(activePage, true);
      }
    }
  }, [activePage, loading, doc, requestRender]);

  // Track available page width so the text layer can be scaled
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

  // IntersectionObserver: track visible pages and queue renders
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

            const isCurrentActive = pn === activePageRef.current;
            requestRender(pn, isCurrentActive);
          } else {
            visiblePages.current.delete(pn);
            queuedPagesRef.current.delete(pn);
            if (
              activeRenderTaskRef.current?.pageNumber === pn &&
              !activeRenderTaskRef.current.isHighPriority
            ) {
              try {
                activeRenderTaskRef.current.cancel();
              } catch {}
            }
            if (pn !== activePageRef.current) {
              releasePage(pn);
            }
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
  }, [pageMetas, requestRender, releasePage]);

  // Viewport scroll listener: track active page as user scrolls (both mobile and desktop)
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;

    let rafId: number | null = null;
    const handleScroll = () => {
      if (isProgrammaticScrollRef.current) return;
      if (rafId !== null) cancelAnimationFrame(rafId);

      rafId = requestAnimationFrame(() => {
        if (!scrollRef.current || isProgrammaticScrollRef.current) return;
        const rootRect = scrollRef.current.getBoundingClientRect();
        const rootCenterY = rootRect.top + rootRect.height / 2;

        let closestPage = -1;
        let minDistance = Infinity;

        canvasRefs.current.forEach((canvas, pn) => {
          const container = canvas.parentElement ?? canvas;
          const rect = container.getBoundingClientRect();
          if (rect.bottom > rootRect.top && rect.top < rootRect.bottom) {
            const pageCenterY = rect.top + rect.height / 2;
            const dist = Math.abs(pageCenterY - rootCenterY);
            if (dist < minDistance) {
              minDistance = dist;
              closestPage = pn;
            }
          }
        });

        if (closestPage > 0 && closestPage !== activePageRef.current) {
          setActivePage(closestPage);
        }
      });
    };

    root.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      root.removeEventListener("scroll", handleScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [setActivePage]);

  // Scroll to corresponding page when activePage changes from outside (e.g. right-side panel, jump sheet)
  useEffect(() => {
    if (activePage > 0 && !loading) {
      isProgrammaticScrollRef.current = true;
      if (programmaticScrollTimeoutRef.current) {
        clearTimeout(programmaticScrollTimeoutRef.current);
      }

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
        programmaticScrollTimeoutRef.current = setTimeout(() => {
          isProgrammaticScrollRef.current = false;
        }, 400);
      }, 30);

      return () => {
        clearTimeout(timer);
        if (programmaticScrollTimeoutRef.current) {
          clearTimeout(programmaticScrollTimeoutRef.current);
        }
      };
    }
  }, [activePage, loading]);

  // Also support scroll-to-pdf event on right-side click
  useEffect(() => {
    return listenDocEvent("doclens:scroll-to-pdf", (d) => {
      if (d.pageNumber && d.pageNumber > 0) {
        isProgrammaticScrollRef.current = true;
        if (programmaticScrollTimeoutRef.current) {
          clearTimeout(programmaticScrollTimeoutRef.current);
        }
        const pageEl = scrollRef.current?.querySelector(`[data-page-number="${d.pageNumber}"]`);
        if (pageEl) {
          pageEl.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        programmaticScrollTimeoutRef.current = setTimeout(() => {
          isProgrammaticScrollRef.current = false;
        }, 400);
      }
    });
  }, []);

  // Cleanup all bitmaps + destroy PDF document on unmount / doc change
  useEffect(() => {
    return () => {
      if (programmaticScrollTimeoutRef.current) {
        clearTimeout(programmaticScrollTimeoutRef.current);
      }
      if (activeRenderTaskRef.current) {
        try {
          activeRenderTaskRef.current.cancel();
        } catch {}
        activeRenderTaskRef.current = null;
      }
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
      queuedPagesRef.current.clear();
      renderingPage.current = null;
      recentlyVisibleOrder.current = [];
      if (doc) {
        try {
          doc.cleanup();
        } catch {}
        doc.destroy();
      }
    };
  }, [doc, docId]);

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
