# PDF Viewer Feature

> Core visual engine rendering documents inside the workspace.

---

## Capabilities

- Renders PDF document pages asynchronously.
- Implements a precise transparent text selection layer layered over structural canvases.
- Synchronizes selection parameters to trigger contextual action toolbars.

---

## Core Architecture & Memory Optimization

To process massive documents without running out of browser memory, the PDF viewer uses an active **lazy rendering system**:

1. **Dimension Virtualization:** Loads PDF layout parameters on mount, creating virtual page placeholders.
2. **IntersectionObserver Rendering:** Only draws canvas elements when a page enters the viewport bounds (+200px margin).
3. **GPU Eviction Queue:** Limits concurrently rendered canvas layers to a maximum of 5. When a 6th page is rendered, the oldest canvas is cleared to free system memory.

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
