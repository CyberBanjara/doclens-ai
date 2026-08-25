import type { PageExtraction } from "../pdf";
import { db, safePut, withDocLock, normalizeDoc, pageKey, pageRange, PAGES, STORE } from "./idbUtils";
import { StorageError, type PageAi, type PageAiSummaryEntry, type PageDataRecord, type StoredPage } from "./types";
import { cleanAiText } from "../cleanAiText";

/** Persist freshly-extracted pages, splitting them into individual records. */
export async function writePages(id: string, pages: PageExtraction[] | StoredPage[]) {
  return withDocLock(id, async () => {
    const d = await db();
    const existing = normalizeDoc(await d.get(STORE, id));
    if (!existing) return;
    const tx = d.transaction(PAGES, "readwrite");
    try {
      // Drop any previous page records for this doc.
      let cur = await tx.store.openCursor(pageRange(id));
      while (cur) {
        await cur.delete();
        cur = await cur.continue();
      }
      for (const p of pages) {
        const rec: PageDataRecord = {
          key: pageKey(id, p.pageNumber),
          docId: id,
          pageNumber: p.pageNumber,
          text: (p as StoredPage).text ?? "",
          columns: (p as StoredPage).columns ?? 1,
          garbageRatio: (p as StoredPage).garbageRatio ?? 0,
          ocrRun: (p as any).ocrRun ?? false,
        };
        await tx.store.put(rec);
      }
      await tx.done;
    } catch (e) {
      if (e instanceof DOMException && (e.name === "QuotaExceededError" || e.code === 22)) {
        throw new StorageError(
          "Storage quota exceeded. Delete some documents to free space.",
          "QUOTA_EXCEEDED",
        );
      }
      throw new StorageError(
        `Failed to write pages: ${e instanceof Error ? e.message : "Unknown"}`,
        "WRITE_FAILED",
      );
    }
    await safePut(d, STORE, { ...existing, pageCount: pages.length });
  });
}

/** Read a single page's text and AI state. */
export async function getPageData(
  docId: string,
  pageNumber: number,
): Promise<PageDataRecord | undefined> {
  const d = await db();
  const v = await d.get(PAGES, pageKey(docId, pageNumber));
  return v as PageDataRecord | undefined;
}

/** Update a single page record's properties in IndexedDB. */
export async function updatePageData(
  docId: string,
  pageNumber: number,
  patch: Partial<Omit<PageDataRecord, "key" | "docId" | "pageNumber">>,
): Promise<void> {
  const d = await db();
  const key = pageKey(docId, pageNumber);
  const existing = await d.get(PAGES, key);
  if (!existing) return;
  const merged = { ...existing, ...patch };
  await d.put(PAGES, merged);
}

/** Read every page's text+AI for a doc. Heavy — use only for export. */
export async function getAllPages(docId: string): Promise<PageDataRecord[]> {
  const d = await db();
  const all = (await d.getAll(PAGES, pageRange(docId))) as PageDataRecord[];
  return all.sort((a, b) => a.pageNumber - b.pageNumber);
}

/** Lightweight per-page AI summary for headers/badges (no `result` text). */
export async function getPageAiSummary(docId: string): Promise<Record<number, PageAiSummaryEntry>> {
  const d = await db();
  const tx = d.transaction(PAGES, "readonly");
  const out: Record<number, PageAiSummaryEntry> = {};
  let cur = await tx.store.openCursor(pageRange(docId));
  while (cur) {
    const p = cur.value as PageDataRecord;
    if (p.pageAi) {
      out[p.pageNumber] = {
        status: p.pageAi.status,
        hasResult: !!p.pageAi.result,
        isCustom: p.pageAi.isCustom,
        settingsHash: p.pageAi.settingsHash,
        updatedAt: p.pageAi.updatedAt,
      };
    }
    cur = await cur.continue();
  }
  return out;
}

/** Merge a partial PageAi for a single page. Updates the cached doc-level done count. */
export async function upsertPageAi(docId: string, pageNumber: number, patch: Partial<PageAi>) {
  return withDocLock(docId, async () => {
    const d = await db();
    const existing = normalizeDoc(await d.get(STORE, docId));
    if (!existing) return;

    const key = pageKey(docId, pageNumber);
    const current = ((await d.get(PAGES, key)) as PageDataRecord | undefined) ?? {
      key,
      docId,
      pageNumber,
      text: "",
      columns: 1,
      garbageRatio: 0,
    };
    const prevAi: PageAi = current.pageAi ?? { pageNumber, status: "idle" };
    const { lastSentRequest: _drop, ...cleanPatch } = patch as any;
    if (typeof cleanPatch.result === "string") {
      cleanPatch.result = cleanAiText(cleanPatch.result);
    }
    const wasDone = prevAi.status === "done";
    const nextAi: PageAi = { ...prevAi, ...cleanPatch, pageNumber, updatedAt: Date.now() };
    const isDone = nextAi.status === "done";
    await safePut(d, PAGES, { ...current, pageAi: nextAi });

    // Maintain cached done-count
    let delta = 0;
    if (!wasDone && isDone) delta = 1;
    else if (wasDone && !isDone) delta = -1;
    if (delta !== 0) {
      const nextDone = Math.max(0, (existing.aiDoneCount ?? 0) + delta);
      await safePut(d, STORE, { ...existing, aiDoneCount: nextDone });
    }
  });
}
