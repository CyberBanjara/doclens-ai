# Dependencies

> Every `package.json` dependency, grouped by concern. Source of truth: `package.json`.

---

## PDF & OCR

| Package | Purpose |
| -------- | -------- |
| `pdfjs-dist` | PDF parsing, canvas rendering, and text-layer extraction ([[PDF.js]]) |
| `tesseract.js` | Client-side OCR fallback for scanned/garbled pages |

## AI / Translation

| Package | Purpose |
| -------- | -------- |
| *(none — OpenRouter is accessed via plain `fetch`/SSE, not an SDK)* | See [[OpenRouter API]] |

## Text-to-Speech

| Package | Purpose |
| -------- | -------- |
| `@diffusionstudio/vits-web` | Piper neural TTS model runner |
| `onnxruntime-web` | ONNX inference runtime powering Piper voices (WASM) |

## Storage & Backend Integration

| Package | Purpose |
| -------- | -------- |
| `idb` | Promise-based IndexedDB wrapper — the core local persistence layer |
| `@aws-sdk/client-s3` | S3-compatible client used against Cloudflare R2 (Global Library) |
| `@supabase/supabase-js` | Client for the shared Supabase extraction/translation cache |
| `firebase` | Firebase Auth (Google Sign-In) + Firestore (reviews) + Analytics |
| `ws` | Server-side WebSocket polyfill required by the Supabase SDK under Node |

## Routing & App Framework

| Package | Purpose |
| -------- | -------- |
| `@tanstack/react-router` | File-based routing, URL-synced state |
| `@tanstack/react-start` | Server functions (`createServerFn`), SSR app shell |
| `react`, `react-dom` | UI framework (v19) |
| `vite-tsconfig-paths` | Resolves the `@/` path alias from `tsconfig.json` in Vite |
| `nitro` | Server runtime powering the deployed server functions |

## UI & Styling

| Package | Purpose |
| -------- | -------- |
| `tailwindcss` | Utility-first CSS (v4) |
| `tailwind-merge`, `clsx` | Combined in `cn()` (`src/lib/utils.ts`) for conditional class merging |
| `class-variance-authority` | Variant-based component styling (shadcn/ui pattern) |
| `@radix-ui/react-alert-dialog`, `@radix-ui/react-dialog`, `@radix-ui/react-popover`, `@radix-ui/react-slot` | Accessible unstyled primitives underlying `src/components/ui/*` (shadcn/ui) |
| `vaul` | Drawer/bottom-sheet primitive (mobile sheets) |
| `framer-motion` | Animations (preloader, transitions) |
| `lucide-react` | Icon set |
| `sonner` | Toast notifications |
| `tw-animate-css` | Tailwind animation utility classes |

## Observability

| Package | Purpose |
| -------- | -------- |
| `@vercel/analytics` | Page-view analytics on Vercel |
| `@vercel/speed-insights` | Web vitals / performance monitoring |

## Build Tooling (dev dependencies)

| Package | Purpose |
| -------- | -------- |
| `vite`, `@vitejs/plugin-react` | Dev server + production bundling |
| `typescript`, `typescript-eslint` | Type checking + TS-aware linting |
| `eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `eslint-plugin-prettier`, `eslint-config-prettier` | Linting, React Hooks rules, Prettier integration |
| `prettier` | Code formatting |
| `@lovable.dev/vite-tanstack-config` | Shared Vite/TanStack config preset |
| `@types/*` | TypeScript type definitions for React, Node, `ws` |

---

## Notably absent

A few libraries that might be assumed present are **not** dependencies of this project — don't reach for them without adding them first: form libraries (React Hook Form, Formik), schema validators (Zod, Yup), state managers (Redux, Zustand), a data-fetching layer (React Query, SWR), or a virtualization library (TanStack Virtual, react-window). Where similar needs exist, the codebase currently hand-rolls them (e.g. `IntersectionObserver`-based lazy rendering in [[PdfViewer]] instead of a virtualization library).

---

## Related

- [[Architecture]] — How these pieces fit together.
- [[Tech Stack]] — Framework-level summary.

---

_Part of [[MOC — Product]]_
