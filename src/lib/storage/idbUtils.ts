import { openDB, type IDBPDatabase } from "idb";
import { StorageError, type PageAi, type PageDataRecord, type DocRecord } from "./types";

/** Generate a UUID v4 — works in non-secure contexts (LAN IP over HTTP). */
export function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback using crypto.getRandomValues (available in all modern browsers)
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => {
    const n = Number(c);
    return (n ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (n / 4)))).toString(16);
  });
}

export const DB_NAME = "doclens";
export const DB_VERSION = 8;
export const STORE = "documents";
export const BLOBS = "blobs";
export const META = "meta";
export const PAGES = "pageData";
export const VOICE_PACKS = "voicePacks";
export const THUMBNAILS = "thumbnails";

/* ---------- Write mutex ---------- */

const writeLocks = new Map<string, Promise<void>>();

export async function withDocLock<T>(docId: string, fn: () => Promise<T>): Promise<T> {
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

export async function safePut(d: IDBPDatabase, store: string, value: unknown, key?: IDBValidKey) {
  try {
    if (key !== undefined) {
      await d.put(store, value, key);
    } else {
      await d.put(store, value);
    }
  } catch (e: unknown) {
    if (e instanceof DOMException && (e.name === "QuotaExceededError" || e.code === 22)) {
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

export function pageKey(docId: string, n: number): string {
  return `${docId}:${String(n).padStart(6, "0")}`;
}

export function pageRange(docId: string): IDBKeyRange {
  return IDBKeyRange.bound(`${docId}:`, `${docId}:￿`);
}

/* ---------- Runtime record validation ---------- */

export function normalizeDoc(raw: any): DocRecord | undefined {
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
    lastReadPage: typeof raw.lastReadPage === "number" ? raw.lastReadPage : undefined,
    isScannedPdf: typeof raw.isScannedPdf === "boolean" ? raw.isScannedPdf : undefined,
  };
}

/* ---------- Database ---------- */

let dbPromise: Promise<IDBPDatabase> | null = null;
export function db() {
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
        if (!d.objectStoreNames.contains(VOICE_PACKS)) {
          d.createObjectStore(VOICE_PACKS, { keyPath: "voiceId" });
        }
        if (!d.objectStoreNames.contains(THUMBNAILS)) {
          d.createObjectStore(THUMBNAILS);
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

/** Close active database connection so indexedDB.deleteDatabase is not blocked. */
export async function closeDb(): Promise<void> {
  if (dbPromise) {
    try {
      const d = await dbPromise;
      d.close();
    } catch {
      // ignore
    }
    dbPromise = null;
  }
}

