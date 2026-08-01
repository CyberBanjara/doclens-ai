# Workspace Page

> **Route:** `/doc/$id`  
> **Source File:** `doc.$id.tsx`  
> **Key Components:** [[PdfViewer]], [[RightPanel]], [[PageWorkstation]]  
> **SEO Title:** `Anuwad — Document`

---

## Purpose

The **Workspace Page** is the core functional workstation of Anuwad. It implements a side-by-side workspace: the original PDF is rendered on the left, and interactive AI options (translations, custom prompts, explanations, summaries) and speech controls are hosted on the right.

---

## Layout Structure

Uses a 50/50 vertical split layout on desktop, stacking into a single column on mobile.

```
┌────────────────────────────────────────────────────────┐
│  Slim Header: ← Back | Title | Page [N/M] | Analyze    │
├──────────────────────────┬─────────────────────────────┤
│                          │                             │
│   PDF Viewer (50%)       │   Right Panel (50%)         │
│   - Page Render (Canvas) │   - AI Assistant Tab        │
│   - Selection Toolbar    │   - Raw Original Text Tab   │
│                          │                             │
└──────────────────────────┴─────────────────────────────┘
```

---

## UI Components & Interactive Elements

1. **Document Header Bar:**
   - **Back Button:** Navigates back to the [[Library Page]].
   - **Page Selector & Nav:** Centered navigation pill allowing users to jump directly to any page or navigate sequentially (Previous/Next).
   - **Analyze Button / Re-Extract Icon:** Initiates text extraction on the PDF pages using the [[PDF Extraction Pipeline]].
2. **PDF Viewer Canvas (Left):**
   - Renders PDF pages as high-resolution images overlaid with transparent text layers to support selections.
   - Uses [[LoadingLogo]] for branded loading states while pages render.
   - Component details: [[PdfViewer]].
3. **Floating Selection Toolbar:**
   - Appears contextually when text is highlighted in the PDF. Offers Copy, Translate, and Speak options.
   - Component details: [[Text Selection Toolbar]].
4. **Right Panel (Right):**
   - Contains two tabs: "AI Assistant" (the workstation) and "Original Text" (raw extracted text view).
   - Component details: [[RightPanel]].
5. **Page Workstation:**
   - Handles the actual translation execution via SSE streaming, sequential memory context, custom JSON parameter modifications, and TTS audio play controls.
   - Component details: [[PageWorkstation]].

---

## Technical Features & Performance Systems

- **Lazy Canvas Rendering & Eviction:** Only visible pages are drawn to canvas. When more than 5 canvases are rendered, the system evicts older canvases from GPU memory to prevent runtime crashes.
- **Background Auto-Translation:** Ingests the next 3 pages in advance to ensure instant transitions when reading. See [[Auto-Translate]].
- **Sentence-Level TTS Synced Highlighting:** Splices the AI results and guides playback by highlighting active speech blocks.
- **Robust Error Handling:** Granular `.catch()` and `try/catch` blocks for bookkeeping operations (`touchDoc`, `setLastOpened`, `updateDoc`). Storage failures are logged but don't block the reader from functioning.

---

## Relationships

- **Workflow:** Handles the [[PDF to Translation Workflow]] and the [[Translation to TTS Workflow]].

---

_Part of [[MOC — Pages]]_
