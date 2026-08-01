# Library Page

> **Route:** `/` (index)  
> **Source File:** `index.tsx`  
> **Layout:** [[SidebarLayout]]  
> **SEO Title:** `Anuwad — Document Library`

---

## Purpose

The **Library Page** is the application's central entry point. It serves as the dashboard where users can upload new PDFs, view their collection of stored documents, check AI processing status, and delete records.

---

## Layout Structure

The layout utilizes a two-column setup where the left column is the fixed-width [[SidebarLayout]] navigation panel and the right column is a scrollable container with a responsive layout grid.

```
┌──────────┬───────────────────────────────────────────┐
│  Sidebar │  Top Bar: "Library" | Doc Count | API     │
│          ├───────────────────────────────────────────┤
│  Logo    │  Scrollable Content                       │
│  📁 Lib  │  - Hero Title: "Intelligence Library"     │
│  🌐 Glob │  - API Key Warning Banner (Conditional)   │
│  🎨 Appr │  - Ingestion Dropzone                     │
│  ⚙ Gen   │  - Grid Toolbar (Recent Documents)        │
│          │  - Document Grid (Cards / Empty state)    │
└──────────┴───────────────────────────────────────────┘
```

---

## UI Components & Interactive Elements

1. **Top Bar Header:**
   - **Page Title:** "Library" (`text-primary`)
   - **Document Count Badge:** Shows the total number of documents in local storage (e.g., "3 documents").
   - **API Key Status Badge:** Displays the connectivity status to OpenRouter (`connected` / `env key missing` / `server key invalid`). Clicking it opens the [[ApiKeyModal]].
2. **Conditional API Key Banner:**
   - Appears when the API key is not valid. Prompting the user to check their API key to proceed with AI features.
3. **Upload Dropzone:**
   - Large dashed-border area supporting drag-and-drop or click-to-browse file loading. Enforces PDF-only and a 50MB maximum size limit.
   - Component details: [[Dropzone]]
4. **Recent Documents Grid:**
   - Visual collection of stored files. Shows a thumbnail, file title, page count, and status badges.
   - Component details: [[DocumentCard]]
5. **Delete Confirmation Dialog:**
   - Triggered when deleting a document card. Ensures users do not accidentally delete files and their associated AI translation cache.

---

## Technical Features & State Management

- **Session Continuity (Cold Launch Auto-Restore):** Checks `sessionStorage` on mount. If a document was open during the last session, the page automatically redirects the user back to that document in the [[Workspace Page]] to preserve context.
- **Async Storage:** Documents are retrieved from [[IndexedDB Storage]] using React state.
- **Responsive Navigation:** On mobile, [[SidebarLayout]] renders a persistent bottom `MobileTabBar` plus a floating "+" upload button instead of a sidebar/drawer.

---

## Relationships

- **Workflow:** Ingests documents and hands them to the [[PDF to Translation Workflow]].
- **Key Component:** [[DocumentCard]], [[Dropzone]].

---

_Part of [[MOC — Pages]]_
