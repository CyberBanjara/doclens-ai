# Anuwad — Memory & Storage Audit

> Comprehensive analysis of all large-data storage hotspots in memory and browser storage.

## Summary

The codebase is already well-optimized in several areas (per-page IDB records, lazy PDF rendering with MAX_RENDERED cap, Piper audio cache eviction). The following findings are ranked by **impact severity** from critical → minor.

---

## 🔴 Critical

### 1. Thumbnails stored as full data-URL strings in IndexedDB

**Files:** [saveThumbnail](file:///home/sanskar/Downloads/doclens-ai/src/lib/storage.ts#L660-L663), [useThumbnail](file:///home/sanskar/Downloads/doclens-ai/src/hooks/useThumbnail.ts#L79-L97)

**Problem:** `canvas.toDataURL("image/png")` produces a Base64 PNG string (~30-80 KB per thumbnail). These are stored verbatim as strings in the `thumbnails` IDB store. Base64 encoding inflates size by ~33%. On the library page, every document thumbnail is held in React state as a string, and the same string lives in IDB.

**Impact:** For 50 documents ≈ 2-4 MB of IDB wasted on Base64 overhead alone. Each string also lives in the JS heap while the library page is mounted.

**Optimization:**

- Store as a `Blob` (PNG or preferably JPEG) in IDB instead of a data-URL string — eliminates the 33% Base64 overhead.
- Use `URL.createObjectURL(blob)` to display thumbnails, and revoke on unmount.
- Switch to `canvas.toDataURL("image/jpeg", 0.7)` or `canvas.toBlob("image/jpeg", 0.7)` — JPEG at 70% quality is ~5× smaller for photo-like PDF pages.

---

### 2. ONNX voice models remain as Blob URLs in memory indefinitely

**Files:** [LocalVoiceProvider](file:///home/sanskar/Downloads/doclens-ai/src/lib/neural-tts/piper-engine.ts#L260-L296)

**Problem:** When a voice is first used, the full ONNX model (`20-60 MB ArrayBuffer`) is read from IDB, wrapped in a `Blob`, and turned into a `Blob URL`. This URL is cached in `LocalVoiceProvider.cache` **forever** (until `destroyEngine()` or `evict()`). The Blob itself pins the ArrayBuffer in browser memory.

**Impact:** Each loaded voice holds 20-60 MB of browser memory. If 2 voices are used across sessions without page navigation, that's 40-120 MB pinned.

**Optimization:**

- Add LRU eviction to `LocalVoiceProvider.cache` (max 1 voice at a time, since only 1 is ever actively generating).
- Revoke and clear Blob URLs for voices that aren't currently generating, re-loading from IDB on the next request (IDB read is ~100ms for 60MB, negligible vs. inference time).

---

### 3. PDF binary blobs in IndexedDB (by design, but no compression)

**Files:** [createDoc](file:///home/sanskar/Downloads/doclens-ai/src/lib/storage.ts#L371-L392)

**Problem:** The raw PDF file is stored as-is in the `blobs` IDB store. PDFs are already compressed, so re-compression isn't helpful. However, there's no size validation or warning before storage.

**Impact:** A 200 MB PDF fills 200 MB of IDB quota. No user feedback until `QuotaExceededError`.

**Optimization:**

- Add a soft size-limit check (~100 MB) with a user confirmation dialog before storing very large PDFs.
- Consider offering an option to "discard binary after extraction" for users who only need translations (PDF viewer would show a "re-upload to view" message).
- Display per-document storage breakdown in the library view so users can identify space hogs.

---

## 🟠 High

### 4. `getAllPages()` materializes every page's text + AI result into memory

**Files:** [getAllPages](file:///home/sanskar/Downloads/doclens-ai/src/lib/storage.ts#L453-L458), [exportAsMarkdown](file:///home/sanskar/Downloads/doclens-ai/src/components/RightPanel.tsx#L32-L47), [exportAsJson](file:///home/sanskar/Downloads/doclens-ai/src/components/RightPanel.tsx#L49-L72)

**Problem:** The export functions call `getAllPages(docId)` which reads **all** `PageDataRecord` entries for a document into a single array. For a 500-page document with AI results, each page might have 2-5 KB of text + 2-5 KB of AI result = ~5 MB total in one allocation.

**Impact:** Temporary spike of ~5-25 MB during export. For very large documents, this could cause jank or OOM on low-memory devices.

**Optimization:**

- Stream the export using an IDB cursor: iterate page-by-page, appending to a `ReadableStream` or `Blob[]`, then combine at the end. This keeps peak memory to one page at a time.
- The function already has a "Heavy — use only for export" comment acknowledging this.

---

### 5. `getPageAiSummary()` reads all page records just to extract status — ✅ RESOLVED

**Files:** [getPageAiSummary](file:///home/sanskar/Desktop/doclens-ai/src/lib/storage/pages.ts#L80-L100)

**Problem:** This function previously called `d.getAll(PAGES, pageRange(docId))` which loaded **every** `PageDataRecord` (including the full `text` and `pageAi.result` fields) just to extract the lightweight `{ status, hasResult }` summary.

**Resolution (commit `fee4076`):** Replaced `getAll()` with an IDB cursor (`openCursor()`) that iterates page-by-page and extracts only the `pageAi` status fields. This avoids materializing all records simultaneously and keeps peak memory to one record at a time.

**Status:** ✅ Resolved. No further action needed.

---

### 6. `pdf.ts` extraction holds all pages in memory simultaneously

**Files:** [extractPdfPages](file:///home/sanskar/Downloads/doclens-ai/src/lib/pdf.ts#L139-L201)

**Problem:** The extraction loop pushes every `PageExtraction` (including `items: TextItem[]`) into the `pages` array. For a 200-page document, the `items` arrays alone can be several MB. The caller in `doc.$id.tsx` then also accumulates a `collected[]` array.

**Impact:** Double-allocation of all page data in memory during extraction (~2-10 MB for large docs).

**Optimization:**

- The `items` array is never used after extraction (only `text`, `columns`, and `garbageRatio` are stored). Set `items: []` in the return value or make it optional.
- Actually, `toPageExtraction()` in `storage.ts` already sets `items: []` — but the extraction still creates and holds the full arrays in memory during the loop. Consider clearing `items` after building the text.

---

## 🟡 Medium

### 7. Piper audio buffer cache is unbounded per session

**Files:** [PiperReader.cache](file:///home/sanskar/Downloads/doclens-ai/src/lib/piper-reader.ts#L81-L295)

**Problem:** The `PiperReader` class caches `AudioBuffer` objects keyed by `voiceId:text`. MAX_CACHE_ENTRIES is set to 5, which is reasonable. However, `AudioBuffer` objects hold decoded PCM data (22050 Hz mono × duration) in memory. A 10-second chunk ≈ 22050 × 10 × 4 bytes = **880 KB** per entry.

**Impact:** 5 × 880 KB ≈ **4.4 MB** peak. Acceptable, but worth noting. The cache is properly cleared on `destroy()`.

**Status:** ✅ Already well-managed. No action needed unless users report memory issues during long TTS sessions.

---

### 8. Voice catalog JSON cached in module-level variable

**Files:** [catalogCache](file:///home/sanskar/Downloads/doclens-ai/src/lib/neural-tts/piper-engine.ts#L49-L154)

**Problem:** The full Piper voice catalog (~900+ entries with nested `files` objects) is cached as `catalogCache` at module scope. Each entry carries a `files` record with MD5 digests and sizes.

**Impact:** ~200-500 KB of JS heap. Never freed unless `invalidateCatalog()` is called.

**Optimization:**

- After initial processing, strip the `files` field from cached entries (only needed during install). Store a minimal `{ key, name, language, quality, installed, sizeBytes }` shape.
- Adds `invalidateCatalog()` on route change away from voice settings.

---

### 9. `streamBufs` state accumulates full AI responses during batch translation

**Files:** [PageWorkstation state](file:///home/sanskar/Downloads/doclens-ai/src/components/PageWorkstation.tsx#L136)

**Problem:** During batch translation, `streamBufs` holds the full streaming text for each actively-running page. The flusher writes snapshots every 150ms. Since batch runs pages sequentially, only 1 key is active at a time — but old keys aren't cleaned until the `finally` block.

**Impact:** Low (~2-5 KB per active page). Already properly cleaned up.

**Status:** ✅ Acceptable.

---

### 10. Page selector renders all `<option>` elements

**Files:** [doc.$id.tsx](file:///home/sanskar/Downloads/doclens-ai/src/routes/doc.$id.tsx#L224-L226)

**Problem:** `Array.from({ length: pageCount }, (_, i) => i + 1).map(...)` creates a `<option>` DOM node for every page. For a 500-page document, that's 500 DOM nodes in a `<select>`.

**Impact:** Minor — native `<select>` handles large option lists efficiently. Only matters for 1000+ page documents.

**Optimization (optional):**

- Replace with a number input (`<input type="number">`) for documents with >100 pages.

---

### 11. localStorage key sprawl

**Files:** [openrouter.ts](file:///home/sanskar/Downloads/doclens-ai/src/lib/openrouter.ts), [tts.ts](file:///home/sanskar/Downloads/doclens-ai/src/lib/tts.ts), [PageWorkstation.tsx](file:///home/sanskar/Downloads/doclens-ai/src/components/PageWorkstation.tsx#L148)

**Problem:** Per-document keys like `doclens.autoTranslate.${docId}` and `doclens.explain.setup.${docId}` accumulate over time. If a user works with 100 documents, that's 200+ localStorage keys that are never cleaned up when documents are deleted.

**Impact:** Minimal storage impact (< 10 KB total), but dirty.

**Optimization:**

- In `deleteDoc()`, also remove related localStorage keys:
  ```ts
  localStorage.removeItem(`doclens.autoTranslate.${id}`);
  localStorage.removeItem(`doclens.explain.setup.${id}`);
  ```

---

## 🟢 Already Optimized ✅

### PDF Viewer canvas management

- `MAX_RENDERED = 5` limits active canvases.
- `releasePage()` zeros canvas dimensions to free bitmap memory.
- `PDFDocumentProxy.destroy()` is called on unmount and route change.
- Text layer innerHTML is cleared on release.
- **Priority render queue (commit `d840a98`):** Active visible page always renders first; background renders are preemptively cancelled when the user navigates.

### PDF layout measurement optimization

- **Baseline aspect ratio (commit `fee4076`):** `usePdfDocument` now measures only page 1 to derive aspect ratio, applying it uniformly to all placeholders. The old per-page `getPage()` loop was loading all font/page dictionaries into PDF.js worker memory, causing spikes up to 1 GB on large documents.

### Thumbnail rendering throttle

- **Concurrency limiter (commit `fee4076`):** `useThumbnail.ts` limits concurrent thumbnail renders to `MAX_CONCURRENT_THUMBNAILS = 2` via an async semaphore. Each render now properly cleans up page proxies and destroys the PDF document instance in nested `try/finally` blocks, preventing leaked bitmap memory.

### Per-page IDB storage (v6 migration)

- Pages are stored individually in the `pageData` store, not as a giant array on the document record.
- `getPageData()` loads a single page on demand.

### getPageAiSummary cursor optimization

- **IDB cursor (commit `fee4076`):** Replaced `getAll()` with `openCursor()` to avoid materializing all page records when only AI status summaries are needed.

### Piper engine lifecycle

- `destroyEngine()` revokes all Blob URLs, disposes the WASM engine, and closes AudioContext.
- Called on unmount from `PageWorkstation`.

### PDF.js worker

- Using a dedicated web worker via `?worker` import.
- `URL.revokeObjectURL()` called after document loading.

### Write mutex

- `writeLocks` Map prevents concurrent IDB write corruption.

---

## Priority Ranking

| #   | Finding                       | Severity    | Effort | Impact                                 | Status  |
| --- | ----------------------------- | ----------- | ------ | -------------------------------------- | ------- |
| 1   | Thumbnails as data URLs       | 🔴 Critical | Low    | ~33% IDB savings + heap reduction      | Open    |
| 2   | ONNX Blob URLs unbounded      | 🔴 Critical | Low    | 20-120 MB memory savings               | Open    |
| 5   | `getPageAiSummary` full scan  | 🟠 High     | Medium | Faster doc open, less transient memory | ✅ Done |
| 6   | Extraction holds all items    | 🟠 High     | Low    | 2-10 MB peak reduction                 | Open    |
| 3   | No PDF size warning           | 🟠 High     | Low    | Better UX for large files              | Open    |
| 4   | Export materializes all pages | 🟠 High     | Medium | Prevents OOM on large exports          | Open    |
| 8   | Voice catalog retains `files` | 🟡 Medium   | Low    | ~200 KB savings                        | Open    |
| 11  | localStorage key cleanup      | 🟡 Medium   | Low    | Cleanliness                            | Open    |
| 10  | Page select DOM bloat         | 🟢 Minor    | Low    | Minor DOM savings                      | Open    |
| —   | PDF layout per-page parsing   | 🔴 Critical | Low    | ~1 GB peak memory reduction            | ✅ Done |
| —   | Thumbnail concurrency leak    | 🟠 High     | Low    | Prevents parallel bitmap explosions    | ✅ Done |
