# PDF Viewer Feature

> Core visual engine rendering documents inside the workspace.

---

## Capabilities

- Renders PDF document pages asynchronously with **priority-based scheduling**.
- Implements a precise transparent text selection layer layered over structural canvases.
- Synchronizes selection parameters to trigger contextual action toolbars.

---

## Core Architecture & Memory Optimization

To process massive documents without running out of browser memory, the PDF viewer uses a multi-layered rendering pipeline:

### 1. Dimension Virtualization (Optimized)

On mount, loads only page 1 to measure a baseline aspect ratio and applies it uniformly to all page placeholders. This avoids eagerly parsing every page's font and page dictionaries into PDF.js worker memory — a critical fix for documents with 100+ pages where the old per-page `getPage()` loop caused memory spikes up to 1 GB.

### 2. Priority Render Queue

The renderer uses a serialized `processQueue` that enforces strict priority ordering:

1. **Active visible page** (highest priority) — the page currently centered in the viewport is always rendered first.
2. **Preemptive cancellation** — if a low-priority background page is mid-render when the user scrolls to a new page, its `RenderTask` is cancelled immediately via `RenderTask.cancel()`, freeing the rendering pipeline for the active page.
3. **Background pages** — only processed after the active page has fully rendered. Candidates are sorted by proximity to the active page (closest first).

### 3. Scroll-Based Active Page Tracking

A throttled `scroll` event handler using `requestAnimationFrame` continuously determines which page is closest to the viewport center, updating `activePage` in real-time. This works consistently on both mobile (touch scroll) and desktop (mouse wheel/keyboard).

### 4. GPU Eviction Queue

Limits concurrently rendered canvas layers to a maximum of 5. When a 6th page is rendered, the oldest canvas is cleared (via `canvas.width = 0; canvas.height = 0`) to free GPU bitmap memory. The eviction logic protects the active page — it is never evicted.

---

## Interactions & Sync

- **Selection Events:** Listens to `selectionchange` on the document to capture selections.
- **Bi-Directional Scrolling:** Listens to page selectors in the header, executing smooth scroll animations to align with the active page. Clicking a page updates the header selector.

---

## Relationships

- **Component:** [[PdfViewer]].
- **Dependencies:** [[PDF.js]].

---

_Part of [[MOC — Features]]_
