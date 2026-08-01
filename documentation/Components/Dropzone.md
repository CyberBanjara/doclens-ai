# Dropzone Component

> **File:** `src/components/Dropzone.tsx`  
> **Type:** Drag and Drop File Input

---

## Purpose

Provides a drag-and-drop file ingestion area. It validates file uploads, checks format specifications, and triggers downstream document processing.

---

## UI Elements & States

Two variants, both sharing the same drag/drop + validation logic:

1. **Default (full hero, `compact={false}`):**
   - Dashed-border box with a grid background pattern and upload icon; hover/drag-over highlights the border and a soft radial glow.
   - Text: "Drop a PDF here, or click to browse" / "Up to 50.0 MB · stays on your device".
2. **Compact (`compact={true}`):**
   - Slim `h-14` horizontal bar ("Add a PDF · or drop it here") — used once the library already has documents, so returning users aren't shown a large empty-state prompt every time.

**Validation (in `handle()`):** rejects non-PDF files, rejects files over 50 MB, warns (but still accepts) files over 25 MB, and rejects empty files — each with a `sonner` toast.

---

## Properties & Callbacks

- **`onFile` ((file: File) => void):** Called with the validated File once it passes type/size checks.
- **`compact` (boolean, optional):** Renders the slim horizontal bar variant instead of the full hero box.

---

## Relationships

- **Used In:** [[Library Page]].
- **Feature powered:** [[Document Management]].

---

_Part of [[MOC — Components]]_
