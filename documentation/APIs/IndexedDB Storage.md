# IndexedDB Storage

> **Category:** Browser Native Database
> **W3C Standard:** [IndexedDB API](https://www.w3.org/TR/IndexedDatabase-2/)
> **Source:** `src/lib/storage.ts`, `src/lib/voiceCache.ts`

---

## Purpose

**IndexedDB** is a local database built into the browser. Anuwad uses it to store documents, metadata, cached AI results, and (as a fallback) downloaded neural voice models.

---

## Database Schemas

### 1. Main App Database (`doclens`, version 8)

Managed via the `idb` wrapper library. Object stores (`src/lib/storage.ts`):

| Store        | Key Path                   | Contents                                                                 |
| ------------ | -------------------------- | ------------------------------------------------------------------------ |
| `documents`  | `id`                       | `DocRecord` — filename, page count, timestamps, last-read page           |
| `blobs`      | (external key)             | Raw PDF file binary data (`Blob`)                                        |
| `pageData`   | `key` (`docId:pageNumber`) | Per-page extracted text + `PageAi` (AI mode/result/status/settings hash) |
| `voicePacks` | `voiceId`                  | Metadata for downloaded neural voice packs                               |
| `thumbnails` | (external key)             | Generated first-page thumbnails (`Blob`)                                 |
| `meta`       | (external key)             | Misc key-value entries (e.g. last-opened document id)                    |

A version-8 migration (v5→v6) split what used to be an embedded `pages[]` + `pageAi` array on the document record into the standalone `pageData` store, keyed per page — this is why `getPageData`/`updatePageData` operate per-page rather than rewriting a whole document record.

All writes go through a `withDocLock(docId, fn)` mutex (`src/lib/storage.ts`) to serialize concurrent writers (translation streaming, Supabase sync, etc.) against the same document.

### 2. Neural Voice Cache (`doclens-voice-cache`)

- `voice-files` (keyed by filename): caches downloaded Piper voice `.onnx`/`.json` files for offline neural TTS. Used as the fallback tier when the [[Voice Cache Layer]]'s primary OPFS storage is unavailable.

---

## Diagnostics & Management

- **Storage Statistics:** `estimateStorage()` in `src/lib/storage.ts` wraps `navigator.storage.estimate()`.
- **Cache Clearing:** `clearAllAiResults()` exists in `src/lib/storage.ts` to wipe cached `pageData` AI results, but is not currently wired to any reachable UI control.

---

## Relationships

- **Feature powered:** [[Document Management]], [[Piper Neural TTS]].

---

_Part of [[MOC — APIs]]_
