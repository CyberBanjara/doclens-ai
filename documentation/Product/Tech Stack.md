# Tech Stack

> Frameworks, libraries, and architectural patterns powering Anuwad.

---

## Core Framework

| Layer            | Technology                       | Purpose                                                                                                    |
| ----------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **UI Framework**  | React 19                         | Component rendering                                                                                          |
| **Routing/App**   | TanStack Router + TanStack Start | File-based routing, URL-synced state, server functions (`createServerFn`)                                    |
| **Styling**       | Tailwind CSS 4                   | Utility-first CSS with custom theme tokens                                                                    |
| **Bundler**       | Vite 7                           | Dev server and production builds                                                                              |
| **Deployment**    | Vercel (via Nitro)               | Primary deploy target; `wrangler.jsonc` exists as an alternate Cloudflare Workers path, not the primary one   |

---

## Key Dependencies

| Library                                                                  | Purpose                                                | Used By                                     |
| -------------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------- |
| [[PDF.js]] (`pdfjs-dist`)                                                | PDF rendering, text extraction, text layer                | [[PdfViewer]], [[PDF Extraction Pipeline]]  |
| `tesseract.js`                                                           | OCR fallback for scanned/garbled PDF pages                 | [[PDF Extraction Pipeline]]                  |
| [[OpenRouter API]]                                                       | LLM model routing — GPT-4o, Claude, Gemini, Llama          | [[AI Translation]], [[PageWorkstation]]     |
| [[Piper WASM Engine]] (`@diffusionstudio/vits-web`, `onnxruntime-web`)   | Offline neural TTS via ONNX/WebAssembly                    | [[Piper Neural TTS]], [[Text-to-Speech]]    |
| [[Web Speech API]]                                                       | Browser-native speech synthesis fallback                   | [[Text-to-Speech]]                          |
| [[IndexedDB Storage]] (`idb`)                                            | Document and AI result persistence                         | [[Document Management]], all pages           |
| `firebase`                                                               | Google Sign-In auth + Firestore review storage              | [[Authentication]]                           |
| `@supabase/supabase-js`                                                  | Shared cloud cache for extracted text/translations          | [[Global Library]]                           |
| `@aws-sdk/client-s3`                                                     | S3-compatible client for Cloudflare R2 object storage        | [[Global Library]]                           |
| Sonner                                                                   | Toast notification system                                  | All pages                                    |
| Radix UI primitives                                                      | Dialog, AlertDialog, Popover, Drawer building blocks         | [[ApiKeyModal]], [[ExplainSetupDialog]]      |

---

## Data Storage Architecture

| Store                     | Technology            | Contents                                                          |
| --------------------------- | ------------------------ | --------------------------------------------------------------------- |
| **Documents + AI results**  | IndexedDB               | PDF binaries, extracted text, AI translations, settings hashes       |
| **User preferences**        | localStorage             | Language, model, mode, style, temperature, TTS/voice selections      |
| **Session state**           | sessionStorage           | Cold-launch flag                                                      |
| **Neural voice models**     | OPFS / IndexedDB         | Piper ONNX model files (20–60 MB each) via voice cache layer         |
| **Shared cloud cache**      | Supabase (Postgres)      | Extracted text + translations, optional cross-device sync            |
| **Shared document vault**   | Cloudflare R2            | Uploaded PDFs for the optional Global Library feature                 |
| **URL state**               | Query params             | Active page number (`?page=N`)                                        |

---

## Architecture Pattern

```
Browser (Client)
├── React SPA (Vite)
│   ├── TanStack Router (file-based routes)
│   ├── PDF.js + tesseract.js (rendering, text extraction, OCR fallback)
│   ├── Piper/ONNX WASM (neural TTS engine)
│   ├── Firebase Auth SDK (Google Sign-In)
│   ├── IndexedDB (document + model storage)
│   └── Voice Cache Layer (OPFS primary, IDB fallback)
│
└── Server Functions (TanStack Start `createServerFn`, deployed on Vercel/Nitro)
    ├── OpenRouter API proxy (SSE streaming, API key never exposed to client)
    ├── Cloudflare R2 upload/list/delete (Global Library)
    └── Supabase read/write (shared extraction cache)
```

See [[Architecture]] for the full module dependency graph.

---

## Related

- [[What is Anuwad]] — Product context
- [[Design System]] — Visual implementation
- [[Architecture]] — System architecture and module dependency graph
- [[Dependencies]] — Every package dependency, grouped by concern
- [[MOC — APIs]] — External service integrations
- [[MOC — Pipelines]] — Data flow architecture
- [[MOC — Components]] — UI component inventory

---

_Part of [[MOC — Product]]_
