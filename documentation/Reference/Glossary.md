# Glossary

> Every abbreviation and acronym actually used across the Anuwad codebase, grounded in `src/` — not aspirational terminology.

---

## Glossary of Terms

| Term / Abbreviation | Definition                                                                                                    | Core Reference            |
| -------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------- |
| **API**              | Application Programming Interface — used broadly (OpenRouter API, browser APIs, server functions).             | [[OpenRouter API]]        |
| **CSS**              | Cascading Style Sheets — Tailwind CSS 4 utility classes + theme custom properties in `src/lib/theme.ts`.        | [[Design System]]         |
| **DOM**              | Document Object Model — the app dispatches/listens for typed `doclens:*` `CustomEvent`s on the DOM.            | [[Architecture]]          |
| **Firebase / Firestore** | Google's app backend platform; used for Google Sign-In auth and storing user-submitted reviews.             | [[Authentication]]        |
| **IDB / IndexedDB**  | Browser-native database used as the app's primary local persistence layer for documents, pages, and voices.    | [[IndexedDB Storage]]     |
| **JSON**             | JavaScript Object Notation — used for AI request/response payloads, the pipeline inspector view, and exports.  | [[Export System]]         |
| **LLM**              | Large Language Model — the underlying AI models (GPT-4o, Claude, Gemini, Llama, etc.) routed via OpenRouter.    | [[AI Translation]]        |
| **OCR**              | Optical Character Recognition — Tesseract.js-powered fallback for scanned/image-only or garbled PDF pages.     | [[PDF Extraction Pipeline]] |
| **ONNX**             | Open Neural Network Exchange — the inference runtime (`onnxruntime-web`) that runs Piper's neural TTS models.  | [[Piper Neural TTS]]      |
| **OPFS**             | Origin Private File System — the primary (IndexedDB-fallback) browser storage tier for cached Piper voice files. | [[Voice Cache Layer]]     |
| **OpenRouter**       | Third-party API gateway that routes chat-completion requests to multiple LLM providers.                        | [[OpenRouter API]]        |
| **PDF**              | Portable Document Format — the core document type the app views, extracts, and translates.                     | [[PDF Viewer]]            |
| **Piper**            | Offline neural text-to-speech engine, run locally via ONNX/WASM (`@diffusionstudio/vits-web`).                 | [[Piper Neural TTS]]      |
| **R2**               | Cloudflare R2 — S3-compatible object storage backing the "Global Library" shared document vault.                | [[Global Library]]        |
| **SSE**              | Server-Sent Events — the streaming format used for live token-by-token AI translation output.                  | [[AI Translation]]        |
| **Supabase**         | Hosted Postgres backend used as a shared cloud cache for extracted text/translations across devices.            | [[Global Library]]        |
| **TTS**              | Text-to-Speech — technology converting written text into spoken audio (native browser or Piper neural voices). | [[Text-to-Speech]]        |
| **WASM**             | WebAssembly — binary format enabling near-native performance for PDF parsing, OCR, and neural TTS in-browser.  | [[Tech Stack]]             |

---

## Related

- [[What is Anuwad]] — Product overview.
- [[Architecture]] — System architecture and module dependency graph.
- [[00 — MOC — Project]] — Main project index.

---

_Part of [[00 — MOC — Project]]_
