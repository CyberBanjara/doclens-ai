import {
  db,
  safePut,
  uuid,
  withDocLock,
  normalizeDoc,
  pageRange,
  STORE,
  BLOBS,
  META,
  PAGES,
  THUMBNAILS,
} from "./idbUtils";
import type { DocRecord, DocSummary } from "./types";

export async function listDocs(): Promise<DocSummary[]> {
  const d = await db();
  const all = (await d.getAll(STORE)) as unknown[];
  return all
    .map(normalizeDoc)
    .filter((r): r is DocRecord => !!r)
    .map((r) => ({
      id: r.id,
      fileName: r.fileName,
      fileSize: r.fileSize,
      pageCount: r.pageCount ?? 0,
      createdAt: r.createdAt ?? 0,
      lastOpenedAt: r.lastOpenedAt ?? 0,
      hasExtraction: (r.pageCount ?? 0) > 0,
      aiResultCount: (r.aiResults?.length ?? 0) + (r.aiDoneCount ?? 0),
      lastReadPage: r.lastReadPage,
      isScannedPdf: r.isScannedPdf,
      bookId: r.bookId || r.fileName,
      selectedLanguage: r.selectedLanguage,
      hasChosenLanguage: r.hasChosenLanguage ?? false,
    }))
    .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
}

export async function getDoc(id: string): Promise<DocRecord | undefined> {
  const d = await db();
  const raw = await d.get(STORE, id);
  if (!raw) return undefined;
  return normalizeDoc(raw);
}

/** Load PDF binary as a Blob (cheaper than ArrayBuffer for pdf.js). */
export async function getDocBlob(id: string): Promise<Blob | null> {
  const d = await db();
  const v = await d.get(BLOBS, id);
  if (v instanceof Blob) return v;
  if (v instanceof ArrayBuffer) return new Blob([v], { type: "application/pdf" });
  // legacy: still embedded?
  const raw = await d.get(STORE, id);
  if (raw?.data instanceof ArrayBuffer && raw.data.byteLength > 0) {
    return new Blob([raw.data], { type: "application/pdf" });
  }
  return null;
}

export async function createDoc(
  file: File,
  data: ArrayBuffer | Blob,
  customBookId?: string,
): Promise<DocRecord> {
  const d = await db();
  const id = uuid();
  const now = Date.now();
  // Prefer storing as Blob so we don't pin a separate ArrayBuffer in memory later.
  const blob =
    data instanceof Blob ? data : new Blob([data], { type: file.type || "application/pdf" });
  await safePut(d, BLOBS, blob, id);
  const rec: DocRecord = {
    id,
    fileName: file.name,
    fileSize: file.size,
    pages: null,
    pageCount: 0,
    createdAt: now,
    lastOpenedAt: now,
    aiResults: [],
    aiDoneCount: 0,
    bookId: customBookId || file.name,
    hasChosenLanguage: false,
  };
  await safePut(d, STORE, rec);
  await setLastOpened(id);
  return rec;
}

/** Patch top-level metadata. Pages[] is no longer accepted here — use writePages. */
export async function updateDoc(id: string, patch: Partial<DocRecord>) {
  return withDocLock(id, async () => {
    const d = await db();
    const existing = normalizeDoc(await d.get(STORE, id));
    if (!existing) return;
    const merged: any = { ...existing, ...patch };
    delete merged.pages;
    delete merged.pageAi;
    await safePut(d, STORE, merged);
  });
}

export async function touchDoc(id: string) {
  await updateDoc(id, { lastOpenedAt: Date.now() });
  await setLastOpened(id);
}

export async function deleteDoc(id: string) {
  const d = await db();
  await d.delete(STORE, id);
  try {
    await d.delete(BLOBS, id);
  } catch {
    /* ignore */
  }
  try {
    await d.delete(THUMBNAILS, id);
  } catch {
    /* ignore */
  }
  // Remove all per-page records.
  try {
    const tx = d.transaction(PAGES, "readwrite");
    let cur = await tx.store.openCursor(pageRange(id));
    while (cur) {
      await cur.delete();
      cur = await cur.continue();
    }
    await tx.done;
  } catch {
    /* ignore */
  }
  const last = await getLastOpened();
  if (last === id) await setLastOpened(null);
}

const LAST_OPENED_KEY = "lastOpenedDocId";
export async function getLastOpened(): Promise<string | null> {
  const d = await db();
  return ((await d.get(META, LAST_OPENED_KEY)) as string | null) ?? null;
}
export async function setLastOpened(id: string | null) {
  const d = await db();
  if (id === null) await d.delete(META, LAST_OPENED_KEY);
  else await safePut(d, META, id, LAST_OPENED_KEY);
}

/* ---------- IDB quota estimate ---------- */

export async function estimateStorage(): Promise<{ usage: number; quota: number } | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
  try {
    const e = await navigator.storage.estimate();
    return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
  } catch {
    return null;
  }
}

export async function clearAllAiResults(): Promise<void> {
  const d = await db();

  // 1. Reset pageAi in PAGES store
  const txPage = d.transaction(PAGES, "readwrite");
  let cursorPage = await txPage.store.openCursor();
  while (cursorPage) {
    const val = cursorPage.value;
    if (val.pageAi) {
      delete val.pageAi;
      await cursorPage.update(val);
    }
    cursorPage = await cursorPage.continue();
  }
  await txPage.done;

  // 2. Reset aiDoneCount in documents store
  const txDoc = d.transaction(STORE, "readwrite");
  let cursorDoc = await txDoc.store.openCursor();
  while (cursorDoc) {
    const val = cursorDoc.value;
    if (val.aiDoneCount !== 0) {
      val.aiDoneCount = 0;
      await cursorDoc.update(val);
    }
    cursorDoc = await cursorDoc.continue();
  }
  await txDoc.done;
}
