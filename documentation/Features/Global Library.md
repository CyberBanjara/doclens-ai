# Global Library Feature

> An offline-first, locally-cached shared document vault backed by Cloudflare R2, plus cross-device extraction/translation caching via Supabase.
> **Source:** `src/lib/r2.ts`, `src/lib/r2-cache.ts`, `src/hooks/useR2Thumbnail.ts`, `src/lib/storage/thumbnails.ts`, `src/lib/supabase.ts`, `src/lib/sync.ts`, `src/routes/global-library.tsx`

---

## Capabilities

- **Local-First Shared Vault (R2):** Browse, upload, import into the local library, delete, and organize PDFs stored in Cloudflare R2.
- **Persistent Client-Side Caching (IndexedDB):** The Global Library behaves just like the Local Library — catalog metadata and document thumbnails are stored persistently in IndexedDB (`META` and `THUMBNAILS` stores). On page loads and navigations, the entire library renders in sub-milliseconds without querying R2.
- **Single-Pass Thumbnail Discovery:** `listR2Files` discovers all thumbnails in a single S3 listing pass and embeds `thumbnailUrl` and `hasThumbnail: boolean` directly into each document's metadata, eliminating per-card lookup serverFn requests.
- **Persistent Thumbnail Blob/URL Caching:** Remote thumbnail images are saved locally as Blobs in IndexedDB (`r2_thumb_${fileKey}`). Missing thumbnails are recorded with negative cache sentinels (`NO_THUMBNAIL`) to prevent redundant 404 queries.
- **On-Demand Cloud Refresh:** R2 is only queried over the network on first launch (empty cache) or when the user explicitly clicks the **Refresh** button (`forceRefresh: true`).
- **Category Virtual Folders & Education Tiers:** Files are organized into 4 standardized curriculum categories (`history`, `political-science`, `economics`, `miscellaneous`) across educational tiers (`class-6` through `class-12`, `gov-exams`, `hobby-reading`).
- **Cross-Device Translation Cache (Supabase):** Translations sync to/from dedicated Supabase language tables (`translations_hindi`, `translations_telugu`, etc.) with language availability tracked in `book_languages` so opening the same document on another device skips redundant translation.
- **Feature Flag Gated:** The entire feature is opt-in via `ENABLE_GLOBAL_SYNC` (or `VITE_ENABLE_GLOBAL_SYNC`) environment variable.

---

## Architecture & Data Flow

```
┌──────────────────────────────────────────────────────────┐
│                   Global Library Page                    │
└────────────────────────────┬─────────────────────────────┘
                             │
            ┌────────────────┴────────────────┐
            │                                 │
     (First-time or                     (Subsequent views)
     Force Refresh)                           │
            │                                 ▼
            ▼                       ┌───────────────────┐
┌───────────────────────┐           │   IndexedDB META  │
│  listR2Files (Server) │           │ (cached_r2_files) │
│ - Single S3 list pass │           └─────────┬─────────┘
│ - Embeds thumbnailUrls│                     │
└───────────┬───────────┘                     │ Instant render
            │                                 ▼
            ├──────────────────────►┌───────────────────┐
            │ Persists catalog      │ GlobalLibraryCard │
            ▼                       └─────────┬─────────┘
┌───────────────────────┐                     │
│  useR2Thumbnail Hook  │◄────────────────────┘
│ - Checks IndexedDB    │
│ - Uses embedded URL   │
│ - Saves Blob locally  │
└───────────────────────┘
```

- **`src/lib/r2.ts`** — TanStack Start server functions (`createServerFn`) wrapping AWS S3 SDK against R2: `listR2Files` (with embedded thumbnail discovery), `uploadToR2`, `uploadThumbnailToR2`, `getThumbnailFromR2`, `getR2DownloadUrl`, `deleteFromR2`, and `reorganizeR2Files`.
- **`src/lib/r2-cache.ts`** — Persistent IndexedDB + in-memory cache for `listR2Files()` metadata (`cached_r2_files` & `cached_r2_files_at`). Only reaches out to R2 on empty cache or explicit `forceRefresh: true`.
- **`src/hooks/useR2Thumbnail.ts`** — Client-side thumbnail hook with IndexedDB Blob persistence, negative cache sentinels, and zero serverFn overhead when thumbnail URLs are embedded.
- **`src/lib/storage/thumbnails.ts`** — IndexedDB `THUMBNAILS` store helpers: `getThumbnail()`, `saveThumbnailBlob()`, `saveThumbnailUrl()`, `markThumbnailNotFound()`, and `deleteThumbnail()`.
- **`src/routes/global-library.tsx`** — Global Library UI: vertical subject category heap, class/tier switcher modal, search, direct R2 upload for admins, scoped thumbnail generation, and on-demand refresh.

---

## Relationships

- **Pages:** `/global-library` route.
- **Feature powered:** [[Document Management]] (imported documents land in the local library seamlessly).
- **Storage:** [[IndexedDB Storage]] (`META` and `THUMBNAILS` stores).

---

_Part of [[MOC — Features]]_
