# LoadingLogo Component

> **File:** `src/components/LoadingLogo.tsx`  
> **Type:** Branded Loading Indicator

---

## Purpose

A reusable animated loading spinner featuring the Anuwad brand identity. Replaces generic spinners throughout the application with a cohesive branded experience during loading states.

---

## Visual Design

- Displays the Anuwad logo with a pulsing animation.
- Uses CSS keyframe animations defined in `src/styles.css` for smooth, performant pulsing effects.
- Configurable size and optional label text.

---

## Usage Locations

- **[[PdfViewer]]:** Displayed as a loading state while PDF pages are being rendered to canvas, and as individual canvas overlays during page rendering.
- **[[PageWorkstation]]:** Shown as a placeholder while page content is being processed or loaded.

---

## Relationships

- **Used In:** [[PdfViewer]], [[PageWorkstation]], [[Workspace Page]].
- **Styling:** `src/styles.css` (pulsing animation keyframes).

---

_Part of [[MOC — Components]]_
