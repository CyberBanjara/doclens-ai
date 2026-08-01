# Global Library Feature

> An optional, shared document vault backed by Cloudflare R2, plus cross-device extraction/translation caching via Supabase.
> **Source:** `src/lib/r2.ts`, `src/lib/r2-cache.ts`, `src/lib/supabase.ts`, `src/lib/sync.ts`, `src/routes/global-library.tsx`

---

## Capabilities

- **Shared vault (R2):** Browse, upload, import into the local library, delete, and "reorganize" PDFs stored in a Cloudflare R2 bucket at `/global-library`.
- **Category virtual folders:** Files are organized by a category prefix in their object key (e.g. history, economics, geography, civics, science, custom) rather than real folders.
- **Cross-device extraction cache (Supabase):** Extracted text and translations can sync to/from a shared Supabase table (`pdf_extractions`) so re-opening the same document on another device skips redundant extraction/translation.
- **Feature flag gated:** The entire feature is opt-in via an `ENABLE_GLOBAL_SYNC` (or `VITE_ENABLE_GLOBAL_SYNC`) environment variable, checked independently in `r2.ts`, `supabase.ts`, and `sync.ts`.

---

## Architecture

- **`src/lib/r2.ts`** — TanStack Start server functions (`createServerFn`) wrapping the AWS S3 SDK against R2: `uploadToR2`, `listR2Files`, `deleteFromR2`, `downloadFromR2`, `reorganizeR2Files` (re-keys flat/legacy object keys into category-prefixed ones), plus `sanitizeCategory()`/`inferCategoryFromKey()` helpers.
- **`src/lib/r2-cache.ts`** — an in-memory, module-scoped 10-minute TTL cache around `listR2Files()` so browsing the Global Library page repeatedly doesn't re-list the bucket every time.
- **`src/lib/supabase.ts`** — server functions `fetchSupabaseExtraction`/`saveSupabaseExtraction` reading/writing the shared `pdf_extractions` cache table.
- **`src/lib/sync.ts`** — `syncFromSupabase()`/`syncToSupabase()` reconcile a local document's per-page data (`pageData` in [[IndexedDB Storage]]) against the Supabase copy; `getSyncConfig()` exposes whether the flag is on to client code.
- **`src/routes/global-library.tsx`** — the `/global-library` page: fetch/list/import/upload/delete UI, category stats and filtering, and a mobile auto-scrolling category chip row.

---

## Relationships

- **Pages:** `/global-library` route.
- **Feature powered:** [[Document Management]] (imported documents land in the local library the same way an uploaded PDF does).

---

_Part of [[MOC — Features]]_
