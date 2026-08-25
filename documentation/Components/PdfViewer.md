# PdfViewer Component

> **File:** `src/components/PdfViewer.tsx`  
> **Type:** Scrollable Document Renderer

---

## Purpose

Handles parsing, visual canvas generation, transparent text overlay layering, page synchronization, and tracks selection highlights to trigger contextual action menus. Implements a **priority-based render queue** ensuring the currently visible page always renders first, with preemptive cancellation of background tasks.

---

## UI Structure & Elements

1. **Scrollable Page Canvas Grid:**
   - Stack of canvases rendered dynamically at width scales targeting 800px. Active pages display a green accent border on the left.
   - Page number badges float relative to the bottom center of each page card.
2. **Transparent Selection Overlay Layer:**
   - Positioned over page canvases. Contains transparent text elements matching PDF text layout nodes to support cursor highlighting.
3. **Floating Contextual Toolbar:**
   - Positioned dynamically above selection coordinates. Offers Copy, Translate, and Speak actions. See [[Text Selection Toolbar]].
4. **Loading States:**
   - Uses the [[LoadingLogo]] component for both the initial document loading state and individual canvas overlay placeholders while pages render.

---

## State & Performance Management

- **Priority Render Queue (`processQueue`):** A serialized async loop that strictly prioritizes the `activePage`. If a low-priority background render is in-flight when the active page changes, it is cancelled immediately via `RenderTask.cancel()` (preemptive cancellation). Background pages are only processed after the active page is fully rendered, sorted by proximity to the active page.
- **`activePageRef` + RAF Scroll Sync:** A throttled `scroll` event handler using `requestAnimationFrame` determines which page is closest to the viewport center, updating `activePage` in real-time for both mobile and desktop.
- **`activeRenderTaskRef`:** Tracks the currently in-flight render task (page number, priority flag, cancel callback), enabling instant preemption when the user navigates.
- **Lazy Rendering Intersection Observer:** Listens to page visibility. Keeps at most 5 canvas maps active in memory. Evicts older canvases as new pages are scrolled into view, but protects the active page from eviction.
- **`activePage` Synchronization:** Updates query parameters in the URL to sync the active page across panels.
- **`doclens:scroll-to-pdf` listener:** Listens to custom scroll events sent from the right panel.
- **GPU Memory Release:** Off-screen canvases are released via `canvas.width = 0; canvas.height = 0` to free GPU bitmap memory, rather than `page.cleanup()` which avoids re-triggering expensive PDF.js worker caches.

---

## Relationships

- **Used In:** [[Workspace Page]].
- **Feature powered:** [[PDF Viewer]], [[Text Selection Toolbar]].
- **APIs:** [[PDF.js]].
- **Components:** [[LoadingLogo]].

---

_Part of [[MOC — Components]]_
