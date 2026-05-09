import { openDB, type IDBPDatabase } from "idb";
import type { PageExtraction } from "./pdf";

const DB_NAME = "doclens";
const DB_VERSION = 6;
const STORE = "documents";
const BLOBS = "blobs";
const META = "meta";
const PAGES = "pageData";

export type AiMode = "translate" | "summarize" | "explain" | "keypoints";
export type PageStatus = "idle" | "ready" | "running" | "done" | "error";

export interface AiResult {
  id: string;
  mode: AiMode;
  language: string;
  modelId: string;
  modelLabel: string;
  content: string;
  createdAt: number;
  chunkCount: number;
}

export interface PageOverrides {
  mode?: AiMode;
  language?: string;
  modelId?: string;
  style?: string;
  temperature?: number;
  memory?: boolean;
}

export interface StoredPage {
  pageNumber: number;
  text: string;
  columns: number;
  garbageRatio?: number;
}

export interface PageAi {
  pageNumber: number;
  status: PageStatus;
  customRequest?: Record<string, unknown> | null;
  isCustom?: boolean;
  result?: string;
  error?: string;
  overrides?: PageOverrides;
  settingsHash?: string;
  updatedAt?: number;
}

/** Per-page data record stored independently for memory-friendly lazy loading. */
export interface PageDataRecord {
  key: string;
  docId: string;
  pageNumber: number;
  text: string;
  columns: number;
  garbageRatio: number;
  pageAi?: PageAi;
}

/** Lightweight summary of AI state across pages — used for headers/badges only. */
export interface PageAiSummaryEntry {
  status: PageStatus;
  hasResult: boolean;
  isCustom?: boolean;
  settingsHash?: string;
}

export function computeSettingsHash(input: {
  modelId: string;
  mode: string;
  language: string;
  style: string;
  temperature: number;
  memory: boolean;
}): string {
  return [
    input.modelId,
    input.mode,
    input.language,
    input.style,
    input.temperature.toFixed(3),
    input.memory ? "1" : "0",
  ].join("|");
}

/**
 * Document metadata only. Page text and AI state are stored separately
 * in the `pageData` store (keyed by `${id}:${nnnnnn}`).
 */
export interface DocRecord {
  id: string;
  fileName: string;
  fileSize: number;
  pages: StoredPage[] | null; // legacy — always null after v6 migration
  pageCount: number;
  createdAt: number;
  lastOpenedAt: number;
  aiResults?: AiResult[];
  /** @deprecated kept on the type for back-compat; not loaded into memory after v6. */
  pageAi?: Record<number, PageAi>;
  /** Cached count of pages with status === "done". */
  aiDoneCount?: number;
}

export interface DocSummary {
  id: string;
  fileName: string;
  fileSize: number;
  pageCount: number;
  createdAt: number;
  lastOpenedAt: number;
  hasExtraction: boolean;
  aiResultCount: number;
}

/* ---------- Storage Error ---------- */

export class StorageError extends Error {
  constructor(
    message: string,
    public readonly code: "QUOTA_EXCEEDED" | "WRITE_FAILED" | "NOT_FOUND",
  ) {
    super(message);
    this.name = "StorageError";
  }
}

/* ---------- Write mutex ---------- */

const writeLocks = new Map<string, Promise<void>>();

async function withDocLock<T>(docId: string, fn: () => Promise<T>): Promise<T> {
  while (writeLocks.has(docId)) {
    await writeLocks.get(docId);
  }
  let resolve!: () => void;
  const lockPromise = new Promise<void>((r) => {
    resolve = r;
  });
  writeLocks.set(docId, lockPromise);
  try {
    return await fn();
  } finally {
    writeLocks.delete(docId);
    resolve();
  }
}

/* ---------- Safe IndexedDB write ---------- */

async function safePut(d: IDBPDatabase, store: string, value: unknown, key?: IDBValidKey) {
  try {
    if (key !== undefined) {
      await d.put(store, value, key);
    } else {
      await d.put(store, value);
    }
  } catch (e: unknown) {
    if (
      e instanceof DOMException &&
      (e.name === "QuotaExceededError" || e.code === 22)
    ) {
      throw new StorageError(
        "Storage quota exceeded. Delete some documents to free space.",
        "QUOTA_EXCEEDED",
      );
    }
    throw new StorageError(
      `Failed to write to storage: ${e instanceof Error ? e.message : "Unknown error"}`,
      "WRITE_FAILED",
    );
  }
}

/* ---------- Page key helpers ---------- */

function pageKey(docId: string, n: number): string {
  return `${docId}:${String(n).padStart(6, "0")}`;
}

function pageRange(docId: string): IDBKeyRange {
  return IDBKeyRange.bound(`${docId}:`, `${docId}:\uffff`);
}

export function toPageExtraction(sp: StoredPage): PageExtraction {
  return {
    pageNumber: sp.pageNumber,
    text: sp.text,
    columns: sp.columns,
    items: [],
    garbageRatio: sp.garbageRatio ?? 0,
  };
}

/* ---------- Runtime record validation ---------- */

function normalizeDoc(raw: any): DocRecord | undefined {
  if (!raw || typeof raw !== "object" || !raw.id || !raw.fileName) return undefined;
  return {
    id: raw.id,
    fileName: raw.fileName,
    fileSize: raw.fileSize ?? 0,
    pages: null,
    pageCount: raw.pageCount ?? 0,
    createdAt: raw.createdAt ?? 0,
    lastOpenedAt: raw.lastOpenedAt ?? 0,
    aiResults: Array.isArray(raw.aiResults) ? raw.aiResults : [],
    aiDoneCount: typeof raw.aiDoneCount === "number" ? raw.aiDoneCount : 0,
  };
}

/* ---------- Database ---------- */

let dbPromise: Promise<IDBPDatabase> | null = null;
function db() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(d, oldVersion, _newVersion, tx) {
        if (!d.objectStoreNames.contains(STORE)) {
          d.createObjectStore(STORE, { keyPath: "id" });
        }
        if (!d.objectStoreNames.contains(META)) {
          d.createObjectStore(META);
        }
        if (!d.objectStoreNames.contains(BLOBS)) {
          d.createObjectStore(BLOBS);
        }
        if (!d.objectStoreNames.contains(PAGES)) {
          d.createObjectStore(PAGES, { keyPath: "key" });
        }

        // v5→v6: split embedded pages[] and pageAi map into per-page records.
        if (oldVersion > 0 && oldVersion < 6) {
          (async () => {
            const docsStore = tx.objectStore(STORE);
            const pagesStore = tx.objectStore(PAGES);
            let cursor = await docsStore.openCursor();
            while (cursor) {
              const doc: any = cursor.value;
              const list: any[] = Array.isArray(doc.pages) ? doc.pages : [];
              const aiMap: Record<string, any> = doc.pageAi ?? {};
              let done = 0;
              for (const p of list) {
                const ai = aiMap[p.pageNumber];
                if (ai?.status === "done") done++;
                const rec: PageDataRecord = {
                  key: pageKey(doc.id, p.pageNumber),
                  docId: doc.id,
                  pageNumber: p.pageNumber,
                  text: p.text ?? "",
                  columns: p.columns ?? 1,
                  garbageRatio: p.garbageRatio ?? 0,
                  pageAi: ai
                    ? (() => {
                        const { lastSentRequest: _, ...rest } = ai;
                        return { ...rest, pageNumber: p.pageNumber } as PageAi;
                      })()
                    : undefined,
                };
                pagesStore.put(rec);
              }
              // Pages-less AI entries (rare): persist with empty text.
              for (const [k, v] of Object.entries(aiMap)) {
                const n = Number(k);
                if (!list.some((p) => p.pageNumber === n)) {
                  const { lastSentRequest: _, ...rest } = v as any;
                  pagesStore.put({
                    key: pageKey(doc.id, n),
                    docId: doc.id,
                    pageNumber: n,
                    text: "",
                    columns: 1,
                    garbageRatio: 0,
                    pageAi: { ...rest, pageNumber: n } as PageAi,
                  } as PageDataRecord);
                }
              }
              const lean: any = { ...doc };
              delete lean.pages;
              delete lean.pageAi;
              delete lean.data;
              delete lean.scrollTop;
              lean.aiDoneCount = done;
              lean.pageCount = doc.pageCount ?? list.length ?? 0;
              docsStore.put(lean);
              cursor = await cursor.continue();
            }
          })().catch((e) => {
            console.error("v6 migration failed", e);
          });
        }
      },
    });
  }
  return dbPromise;
}

/* ---------- Public API ---------- */

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

/** @deprecated prefer getDocBlob — kept for callers that still need ArrayBuffer (extraction). */
export async function getDocBinary(id: string): Promise<ArrayBuffer | null> {
  const blob = await getDocBlob(id);
  if (!blob) return null;
  return await blob.arrayBuffer();
}

export async function createDoc(file: File, data: ArrayBuffer | Blob): Promise<DocRecord> {
  const d = await db();
  const id = crypto.randomUUID();
  const now = Date.now();
  // Prefer storing as Blob so we don't pin a separate ArrayBuffer in memory later.
  const blob = data instanceof Blob ? data : new Blob([data], { type: file.type || "application/pdf" });
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
        };
        await tx.store.put(rec);
      }
      await tx.done;
    } catch (e) {
      if (e instanceof DOMException && (e.name === "QuotaExceededError" || e.code === 22)) {
        throw new StorageError("Storage quota exceeded. Delete some documents to free space.", "QUOTA_EXCEEDED");
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
export async function getPageData(docId: string, pageNumber: number): Promise<PageDataRecord | undefined> {
  const d = await db();
  const v = await d.get(PAGES, pageKey(docId, pageNumber));
  return v as PageDataRecord | undefined;
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
  const all = (await d.getAll(PAGES, pageRange(docId))) as PageDataRecord[];
  const out: Record<number, PageAiSummaryEntry> = {};
  for (const p of all) {
    if (p.pageAi) {
      out[p.pageNumber] = {
        status: p.pageAi.status,
        hasResult: !!p.pageAi.result,
        isCustom: p.pageAi.isCustom,
        settingsHash: p.pageAi.settingsHash,
      };
    }
  }
  return out;
}

/** Lightweight metadata for every page (no text, no AI). Used for virtualization headers. */
export async function getPageMetas(
  docId: string,
): Promise<{ pageNumber: number; columns: number; garbageRatio: number }[]> {
  const d = await db();
  const all = (await d.getAll(PAGES, pageRange(docId))) as PageDataRecord[];
  return all
    .map((p) => ({ pageNumber: p.pageNumber, columns: p.columns, garbageRatio: p.garbageRatio }))
    .sort((a, b) => a.pageNumber - b.pageNumber);
}

export async function touchDoc(id: string) {
  await updateDoc(id, { lastOpenedAt: Date.now() });
  await setLastOpened(id);
}

export async function deleteDoc(id: string) {
  const d = await db();
  await d.delete(STORE, id);
  try { await d.delete(BLOBS, id); } catch { /* ignore */ }
  // Remove all per-page records.
  try {
    const tx = d.transaction(PAGES, "readwrite");
    let cur = await tx.store.openCursor(pageRange(id));
    while (cur) { await cur.delete(); cur = await cur.continue(); }
    await tx.done;
  } catch { /* ignore */ }
  const last = await getLastOpened();
  if (last === id) await setLastOpened(null);
}

export async function appendAiResult(docId: string, result: AiResult) {
  return withDocLock(docId, async () => {
    const d = await db();
    const existing = normalizeDoc(await d.get(STORE, docId));
    if (!existing) return;
    const aiResults = [...(existing.aiResults ?? []).filter((r) => r.id !== result.id), result];
    await safePut(d, STORE, { ...existing, aiResults });
  });
}

export async function deleteAiResult(docId: string, resultId: string) {
  return withDocLock(docId, async () => {
    const d = await db();
    const existing = normalizeDoc(await d.get(STORE, docId));
    if (!existing) return;
    const aiResults = (existing.aiResults ?? []).filter((r) => r.id !== resultId);
    await safePut(d, STORE, { ...existing, aiResults });
  });
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
