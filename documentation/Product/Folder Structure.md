# Folder Structure

> Annotated map of the repository.

---

## Root

```
doclens-ai/
├── src/                          # Application source (see below)
├── public/                       # Static assets served as-is
│   ├── pdf/                        # pdf.js worker/WASM assets
│   ├── tesseract/                  # Tesseract.js OCR worker + WASM core builds
│   ├── voices.json                 # Piper voice catalog manifest
│   └── light_13746323.png          # App logo
├── documentation/                 # This Obsidian knowledge base
├── scripts/
│   └── reorganize-r2.mjs           # CLI wrapper for the `reorganizeR2Files` server function
├── dist/                          # Production build output (gitignored)
├── .agents/                       # Claude Code skills configuration (not app code)
├── supabase_schema.sql            # Reference SQL schema for the Supabase `pdf_extractions` table
├── sample.pdf                     # Test fixture PDF
├── DESIGN.md                      # Design-token specification (colors, type scale)
├── components.json                # shadcn/ui codegen config
├── vite.config.ts                 # Vite + TanStack Start + Tailwind + Nitro plugin config
├── nitro.config.ts                # Nitro server runtime config
├── wrangler.jsonc                 # Cloudflare Workers config (alternate deploy path)
├── eslint.config.js               # ESLint (flat config) + Prettier integration
├── tsconfig.json                  # TypeScript config (path alias `@/` → `src/`)
├── .env.example                   # Template for required environment variables
└── package.json
```

---

## `src/`

```
src/
├── components/
│   ├── *.tsx                  # Top-level components — see below for the largest ones
│   ├── settings/                # Settings-page section components (one per glass-panel card)
│   ├── mobile/                  # Mobile-only chrome (MobileTabBar, MobileBottomBar, sheets, mini player)
│   └── ui/                      # shadcn/ui primitives (button, dialog, popover, drawer, ...)
├── context/
│   ├── AuthContext.tsx          # Firebase auth session
│   └── TtsContext.tsx           # TTS playback engine/state machine (native + neural)
├── hooks/
│   ├── use-mobile.tsx            # Responsive breakpoint hook
│   ├── useThumbnail.ts           # Per-document thumbnail loader
│   ├── usePdfDocument.ts         # PDF load + per-page layout metadata (used by PdfViewer)
│   ├── useTextSelectionToolbar.ts # PDF text-selection → copy/translate toolbar state
│   ├── usePageTranslation.ts     # Per-page AI run/cancel engine (used by PageWorkstation)
│   └── useAiTabAutoPlay.ts       # AI-tab translate-ahead + auto-read orchestration
├── lib/                         # Framework-agnostic logic — see [[Architecture]] for the dependency graph
│   ├── openrouter.ts             # AI provider integration: keys, models, payload building, SSE streaming
│   ├── pdf.ts                    # PDF.js document loader + concurrent page extraction (core orchestrator)
│   ├── pdfLayout.ts              # Column-detection geometry (pure, used by pdf.ts and pdfOcr.ts)
│   ├── textCleaning.ts           # PUA/garbage stripping, OCR text cleanup, text-quality scoring
│   ├── pdfOcr.ts                 # Tesseract.js OCR fallback pipeline
│   ├── storage/                  # IndexedDB (idb) repository, split by concern — see below
│   ├── tts.ts                    # Sentence splitting, browser voice listing
│   ├── ttsEngine.ts              # ONNX session cache, corrupted-model recovery, voice-setup flags
│   ├── theme.ts                  # Theme definitions + CSS custom property application
│   ├── voiceCache.ts             # OPFS/IndexedDB Piper voice model cache
│   ├── voiceLanguageMap.ts       # UI language ↔ BCP-47/voice catalog mapping
│   ├── network.ts                # Offline detection, friendly error messages
│   ├── firebase.ts               # Firebase app/auth/Firestore client
│   ├── r2.ts / r2-cache.ts       # Cloudflare R2 server functions + listing cache
│   ├── supabase.ts / sync.ts     # Shared extraction cache + IndexedDB sync (locked writes)
│   ├── env.ts                    # `isGlobalSyncEnabled()` feature-flag check
│   ├── docEvents.ts              # Typed dispatch/listen wrappers for the cross-component custom-event bus
│   ├── pageAi.ts                 # Shared page-settings helpers (`effective`, `hashFor`, `summarize`)
│   ├── export.ts                 # Markdown/JSON document export
│   ├── file-utils.ts             # Byte/date formatting + R2 key parsing (Global Library)
│   ├── uploadCategories.ts       # Shared R2 upload category list
│   └── utils.ts                  # `cn()` Tailwind class-merge helper
├── routes/                      # TanStack Router file-based routes
│   ├── __root.tsx                 # Root layout, providers, preloader, SEO meta
│   ├── index.tsx                  # `/` — Library page
│   ├── doc.$id.tsx                # `/doc/:id` — Workspace/reader page
│   ├── global-library.tsx         # `/global-library` — shared R2 vault (opt-in)
│   ├── settings.tsx               # `/settings` — AI defaults, API key, voice cache
│   └── settings_.appearance.tsx   # `/settings/appearance` — theme picker
├── router.tsx                  # Router instance + error component
├── routeTree.gen.ts             # Auto-generated by TanStack Router — do not hand-edit
└── styles.css                   # Tailwind entrypoint + theme custom properties
```

### `src/lib/storage/`

Split by concern; `index.ts` re-exports everything so `from "@/lib/storage"` keeps working unchanged:

- `types.ts` — `DocRecord`, `PageAi`, `PageDataRecord`, etc. + `computeSettingsHash()`
- `idbUtils.ts` — `db()`, `withDocLock()`, `safePut()`, `pageKey()`/`pageRange()`, schema migration
- `docs.ts` — document CRUD (`listDocs`, `getDoc`, `createDoc`, `deleteDoc`, ...)
- `pages.ts` — per-page read/write (`getPageData`, `writePages`, `upsertPageAi`, ...)
- `thumbnails.ts` — thumbnail cache

### Largest `src/components/*.tsx`

- `PageWorkstation.tsx` / `PageCard.tsx` — per-page AI pipeline card (translate-ahead engine lives in `hooks/usePageTranslation.ts`)
- `PdfViewer.tsx` / `SelectionToolbar.tsx` — virtualized PDF canvas + text-layer rendering
- `RightPanel.tsx` / `MobileReaderSheet.tsx` / `ExtractedPageRow.tsx` / `ExportMenu.tsx` — reader side panel (AI tab, Original Text tab, export, mobile sheet)
- `CategoryMarqueeRow.tsx` / `R2UploadDialog.tsx` / `DeleteFileDialog.tsx` — Global Library page pieces

---

## Related

- [[Architecture]] — System architecture and module dependency graph.
- [[Dependencies]] — Every package dependency, grouped by concern.
- [[Development Guidelines]] — Local setup and coding conventions.

---

_Part of [[MOC — Product]]_
