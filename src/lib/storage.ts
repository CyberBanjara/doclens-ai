import { openDB, type IDBPDatabase } from "idb";
import type { PageExtraction } from "./pdf";
import DBWorker from "./storage.worker?worker";
import * as Comlink from "comlink";
import { uploadDocToR2, downloadDocFromR2, deleteDocFromR2 } from "./r2";

/** Converts bytes to base64 in chunks to avoid call-stack overflow on large PDFs. */
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Generate a UUID v4 — works in non-secure contexts (LAN IP over HTTP). */
function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => {
    const n = Number(c);
    return (n ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (n / 4)))).toString(16);
  });
}

const DB_NAME = "doclens";
const DB_VERSION = 8;
const STORE = "documents";
const BLOBS = "blobs";
const META = "meta";
const PAGES = "pageData";
const THUMBNAILS = "thumbnails";

export type AiMode = "translate" | "explain";
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

export interface PageDataRecord {
  key: string;
  docId: string;
  pageNumber: number;
  text: string;
  columns: number;
  garbageRatio: number;
  pageAi?: PageAi;
  ocrRun?: boolean;
}

export interface PageAiSummaryEntry {
  status: PageStatus;
  hasResult: boolean;
  isCustom?: boolean;
  settingsHash?: string;
  updatedAt?: number;
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

export interface DocRecord {
  id: string;
  fileName: string;
  fileSize: number;
  pages: StoredPage[] | null;
  pageCount: number;
  createdAt: number;
  lastOpenedAt: number;
  aiResults?: AiResult[];
  pageAi?: Record<number, PageAi>;
  aiDoneCount?: number;
  lastReadPage?: number;
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
  lastReadPage?: number;
}

export class StorageError extends Error {
  constructor(
    message: string,
    public readonly code: "QUOTA_EXCEEDED" | "WRITE_FAILED" | "NOT_FOUND",
  ) {
    super(message);
    this.name = "StorageError";
  }
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

export function isOpfsSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.storage &&
    typeof navigator.storage.getDirectory === "function"
  );
}

function pageKey(docId: string, n: number): string {
  return `${docId}:${String(n).padStart(6, "0")}`;
}

function pageRange(docId: string): IDBKeyRange {
  return IDBKeyRange.bound(`${docId}:`, `${docId}:\uffff`);
}

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
    lastReadPage: typeof raw.lastReadPage === "number" ? raw.lastReadPage : undefined,
  };
}

// ----------------------------------------------------
// Storage Backend Interface
// ----------------------------------------------------
export interface StorageBackend {
  listDocs(): Promise<DocSummary[]>;
  getDoc(id: string): Promise<DocRecord | undefined>;
  getDocBlob(id: string): Promise<Blob | null>;
  /** Writes a blob directly into local blob storage, bypassing document-record creation.
   *  Used to re-cache a blob fetched from R2 after a local cache miss. */
  cacheDocBlob(id: string, blob: Blob): Promise<void>;
  createDoc(file: File, data: ArrayBuffer | Blob): Promise<DocRecord>;
  updateDoc(id: string, patch: Partial<DocRecord>): Promise<void>;
  writePages(id: string, pages: PageExtraction[] | StoredPage[]): Promise<void>;
  getPageData(docId: string, pageNumber: number): Promise<PageDataRecord | undefined>;
  updatePageData(
    docId: string,
    pageNumber: number,
    patch: Partial<Omit<PageDataRecord, "key" | "docId" | "pageNumber">>,
  ): Promise<void>;
  getAllPages(docId: string): Promise<PageDataRecord[]>;
  getPageAiSummary(docId: string): Promise<Record<number, PageAiSummaryEntry>>;
  getPageMetas(docId: string): Promise<{ pageNumber: number; columns: number; garbageRatio: number }[]>;
  deleteDoc(id: string): Promise<void>;
  appendAiResult(docId: string, result: AiResult): Promise<void>;
  deleteAiResult(docId: string, resultId: string): Promise<void>;
  upsertPageAi(docId: string, pageNumber: number, patch: Partial<PageAi>): Promise<void>;
  getLastOpened(): Promise<string | null>;
  setLastOpened(id: string | null): Promise<void>;
  clearAllAiResults(): Promise<void>;
  getThumbnail(docId: string): Promise<string | null>;
  saveThumbnailBlob(docId: string, blob: Blob): Promise<void>;
}

// ----------------------------------------------------
// SQLite WASM + OPFS Storage Backend
// ----------------------------------------------------
class SqliteOpfsBackend implements StorageBackend {
  private worker!: Worker;
  private api: any;

  async init(): Promise<void> {
    this.worker = new DBWorker();
    this.api = Comlink.wrap(this.worker);
    await this.api.init();
  }

  async listDocs(): Promise<DocSummary[]> {
    return this.api.listDocs();
  }

  async getDoc(id: string): Promise<DocRecord | undefined> {
    return this.api.getDoc(id);
  }

  async getDocBlob(id: string): Promise<Blob | null> {
    const bytes: Uint8Array | null = await this.api.getDocBlob(id);
    if (!bytes) return null;
    return new Blob([bytes], { type: "application/pdf" });
  }

  async cacheDocBlob(id: string, blob: Blob): Promise<void> {
    const buffer = await blob.arrayBuffer();
    await this.api.cacheDocBlob(id, new Uint8Array(buffer));
  }

  async createDoc(file: File, data: ArrayBuffer | Blob): Promise<DocRecord> {
    const id = uuid();
    const now = Date.now();
    const arrayBuffer = data instanceof Blob ? await data.arrayBuffer() : data;
    const bytes = new Uint8Array(arrayBuffer);

    await this.api.createDoc(
      {
        id,
        fileName: file.name,
        fileSize: file.size,
        createdAt: now,
        lastOpenedAt: now,
      },
      bytes,
    );

    return {
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
  }

  async updateDoc(id: string, patch: Partial<DocRecord>): Promise<void> {
    await this.api.updateDoc(id, patch);
  }

  async writePages(id: string, pages: PageExtraction[] | StoredPage[]): Promise<void> {
    await this.api.writePages(id, pages);
  }

  async getPageData(docId: string, pageNumber: number): Promise<PageDataRecord | undefined> {
    return this.api.getPageData(docId, pageNumber);
  }

  async updatePageData(
    docId: string,
    pageNumber: number,
    patch: Partial<Omit<PageDataRecord, "key" | "docId" | "pageNumber">>,
  ): Promise<void> {
    await this.api.updatePageData(docId, pageNumber, patch);
  }

  async getAllPages(docId: string): Promise<PageDataRecord[]> {
    return this.api.getAllPages(docId);
  }

  async getPageAiSummary(docId: string): Promise<Record<number, PageAiSummaryEntry>> {
    return this.api.getPageAiSummary(docId);
  }

  async getPageMetas(docId: string): Promise<{ pageNumber: number; columns: number; garbageRatio: number }[]> {
    return this.api.getPageMetas(docId);
  }

  async deleteDoc(id: string): Promise<void> {
    await this.api.deleteDoc(id);
  }

  async appendAiResult(docId: string, result: AiResult): Promise<void> {
    await this.api.appendAiResult(docId, result);
  }

  async deleteAiResult(docId: string, resultId: string): Promise<void> {
    await this.api.deleteAiResult(docId, resultId);
  }

  async upsertPageAi(docId: string, pageNumber: number, patch: Partial<PageAi>): Promise<void> {
    await this.api.upsertPageAi(docId, pageNumber, patch);
  }

  async getLastOpened(): Promise<string | null> {
    return this.api.getLastOpened();
  }

  async setLastOpened(id: string | null): Promise<void> {
    await this.api.setLastOpened(id);
  }

  async clearAllAiResults(): Promise<void> {
    await this.api.clearAllAiResults();
  }

  async getThumbnail(docId: string): Promise<string | null> {
    const data = await this.api.getThumbnail(docId);
    if (!data) return null;
    if (data instanceof Uint8Array) {
      const blob = new Blob([data]);
      return URL.createObjectURL(blob);
    }
    return data; // returns dataurl string
  }

  async saveThumbnailBlob(docId: string, blob: Blob): Promise<void> {
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    await this.api.saveThumbnailBlob(docId, bytes);
  }
}

// ----------------------------------------------------
// Legacy IndexedDB Backend (Fallback)
// ----------------------------------------------------
class IndexedDbBackend implements StorageBackend {
  private dbPromise: Promise<IDBPDatabase> | null = null;
  private writeLocks = new Map<string, Promise<void>>();

  private async getDb(): Promise<IDBPDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = openDB(DB_NAME, DB_VERSION, {
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
    return this.dbPromise;
  }

  private async withDocLock<T>(docId: string, fn: () => Promise<T>): Promise<T> {
    while (this.writeLocks.has(docId)) {
      await this.writeLocks.get(docId);
    }
    let resolve!: () => void;
    const lockPromise = new Promise<void>((r) => {
      resolve = r;
    });
    this.writeLocks.set(docId, lockPromise);
    try {
      return await fn();
    } finally {
      this.writeLocks.delete(docId);
      resolve();
    }
  }

  private async safePut(d: IDBPDatabase, store: string, value: unknown, key?: IDBValidKey) {
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

  async listDocs(): Promise<DocSummary[]> {
    const d = await this.getDb();
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
      }))
      .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
  }

  async getDoc(id: string): Promise<DocRecord | undefined> {
    const d = await this.getDb();
    const raw = await d.get(STORE, id);
    if (!raw) return undefined;
    return normalizeDoc(raw);
  }

  async getDocBlob(id: string): Promise<Blob | null> {
    const d = await this.getDb();
    const v = await d.get(BLOBS, id);
    if (v instanceof Blob) return v;
    if (v instanceof ArrayBuffer) return new Blob([v], { type: "application/pdf" });
    const raw = await d.get(STORE, id);
    if (raw?.data instanceof ArrayBuffer && raw.data.byteLength > 0) {
      return new Blob([raw.data], { type: "application/pdf" });
    }
    return null;
  }

  async cacheDocBlob(id: string, blob: Blob): Promise<void> {
    const d = await this.getDb();
    await this.safePut(d, BLOBS, blob, id);
  }

  async createDoc(file: File, data: ArrayBuffer | Blob): Promise<DocRecord> {
    const d = await this.getDb();
    const id = uuid();
    const now = Date.now();
    const blob =
      data instanceof Blob ? data : new Blob([data], { type: file.type || "application/pdf" });
    await this.safePut(d, BLOBS, blob, id);
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
    await this.safePut(d, STORE, rec);
    await this.setLastOpened(id);
    return rec;
  }

  async updateDoc(id: string, patch: Partial<DocRecord>): Promise<void> {
    return this.withDocLock(id, async () => {
      const d = await this.getDb();
      const existing = normalizeDoc(await d.get(STORE, id));
      if (!existing) return;
      const merged: any = { ...existing, ...patch };
      delete merged.pages;
      delete merged.pageAi;
      await this.safePut(d, STORE, merged);
    });
  }

  async writePages(id: string, pages: PageExtraction[] | StoredPage[]): Promise<void> {
    return this.withDocLock(id, async () => {
      const d = await this.getDb();
      const existing = normalizeDoc(await d.get(STORE, id));
      if (!existing) return;
      const tx = d.transaction(PAGES, "readwrite");
      try {
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
      await this.safePut(d, STORE, { ...existing, pageCount: pages.length });
    });
  }

  async getPageData(docId: string, pageNumber: number): Promise<PageDataRecord | undefined> {
    const d = await this.getDb();
    const v = await d.get(PAGES, pageKey(docId, pageNumber));
    return v as PageDataRecord | undefined;
  }

  async updatePageData(
    docId: string,
    pageNumber: number,
    patch: Partial<Omit<PageDataRecord, "key" | "docId" | "pageNumber">>,
  ): Promise<void> {
    const d = await this.getDb();
    const key = pageKey(docId, pageNumber);
    const existing = await d.get(PAGES, key);
    if (!existing) return;
    const merged = { ...existing, ...patch };
    await d.put(PAGES, merged);
  }

  async getAllPages(docId: string): Promise<PageDataRecord[]> {
    const d = await this.getDb();
    const all = (await d.getAll(PAGES, pageRange(docId))) as PageDataRecord[];
    return all.sort((a, b) => a.pageNumber - b.pageNumber);
  }

  async getPageAiSummary(docId: string): Promise<Record<number, PageAiSummaryEntry>> {
    const d = await this.getDb();
    const all = (await d.getAll(PAGES, pageRange(docId))) as PageDataRecord[];
    const out: Record<number, PageAiSummaryEntry> = {};
    for (const p of all) {
      if (p.pageAi) {
        out[p.pageNumber] = {
          status: p.pageAi.status,
          hasResult: !!p.pageAi.result,
          isCustom: p.pageAi.isCustom,
          settingsHash: p.pageAi.settingsHash,
          updatedAt: p.pageAi.updatedAt,
        };
      }
    }
    all.length = 0;
    return out;
  }

  async getPageMetas(
    docId: string,
  ): Promise<{ pageNumber: number; columns: number; garbageRatio: number }[]> {
    const d = await this.getDb();
    const all = (await d.getAll(PAGES, pageRange(docId))) as PageDataRecord[];
    return all
      .map((p) => ({ pageNumber: p.pageNumber, columns: p.columns, garbageRatio: p.garbageRatio }))
      .sort((a, b) => a.pageNumber - b.pageNumber);
  }

  async deleteDoc(id: string): Promise<void> {
    const d = await this.getDb();
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
    const last = await this.getLastOpened();
    if (last === id) await this.setLastOpened(null);
  }

  async appendAiResult(docId: string, result: AiResult): Promise<void> {
    return this.withDocLock(docId, async () => {
      const d = await this.getDb();
      const existing = normalizeDoc(await d.get(STORE, docId));
      if (!existing) return;
      const aiResults = [...(existing.aiResults ?? []).filter((r) => r.id !== result.id), result];
      await this.safePut(d, STORE, { ...existing, aiResults });
    });
  }

  async deleteAiResult(docId: string, resultId: string): Promise<void> {
    return this.withDocLock(docId, async () => {
      const d = await this.getDb();
      const existing = normalizeDoc(await d.get(STORE, docId));
      if (!existing) return;
      const aiResults = (existing.aiResults ?? []).filter((r) => r.id !== resultId);
      await this.safePut(d, STORE, { ...existing, aiResults });
    });
  }

  async upsertPageAi(docId: string, pageNumber: number, patch: Partial<PageAi>): Promise<void> {
    return this.withDocLock(docId, async () => {
      const d = await this.getDb();
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
      await this.safePut(d, PAGES, { ...current, pageAi: nextAi });

      let delta = 0;
      if (!wasDone && isDone) delta = 1;
      else if (wasDone && !isDone) delta = -1;
      if (delta !== 0) {
        const nextDone = Math.max(0, (existing.aiDoneCount ?? 0) + delta);
        await this.safePut(d, STORE, { ...existing, aiDoneCount: nextDone });
      }
    });
  }

  async getLastOpened(): Promise<string | null> {
    const d = await this.getDb();
    return ((await d.get(META, "lastOpenedDocId")) as string | null) ?? null;
  }

  async setLastOpened(id: string | null): Promise<void> {
    const d = await this.getDb();
    if (id === null) await d.delete(META, "lastOpenedDocId");
    else await this.safePut(d, META, id, "lastOpenedDocId");
  }

  async clearAllAiResults(): Promise<void> {
    const d = await this.getDb();
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

  async getThumbnail(docId: string): Promise<string | null> {
    const d = await this.getDb();
    const v = await d.get(THUMBNAILS, docId);
    if (!v) return null;
    if (v instanceof Blob) return URL.createObjectURL(v);
    return typeof v === "string" ? v : null;
  }

  async saveThumbnailBlob(docId: string, blob: Blob): Promise<void> {
    const d = await this.getDb();
    await this.safePut(d, THUMBNAILS, blob, docId);
  }
}

// ----------------------------------------------------
// Unified Storage Manager Interface / Dispatcher
// ----------------------------------------------------
let backendPromise: Promise<StorageBackend> | null = null;

async function getBackend(): Promise<StorageBackend> {
  if (!backendPromise) {
    backendPromise = (async () => {
      if (isOpfsSupported()) {
        try {
          const sqliteBackend = new SqliteOpfsBackend();
          await sqliteBackend.init();
          console.log("[Storage] Using high-performance SQLite WASM + OPFS backend.");
          return sqliteBackend;
        } catch (err) {
          console.warn("[Storage] Failed to initialize SQLite OPFS backend. Falling back to IndexedDB:", err);
        }
      } else {
        console.log("[Storage] OPFS not supported by browser. Falling back to IndexedDB.");
      }
      return new IndexedDbBackend();
    })();
  }
  return backendPromise;
}

// Exported public API delegation
export async function listDocs(): Promise<DocSummary[]> {
  const backend = await getBackend();
  return backend.listDocs();
}

export async function getDoc(id: string): Promise<DocRecord | undefined> {
  const backend = await getBackend();
  return backend.getDoc(id);
}

export async function getDocBlob(id: string): Promise<Blob | null> {
  const backend = await getBackend();
  const local = await backend.getDocBlob(id);
  if (local) return local;

  // Local cache miss (e.g. browser storage was cleared) — fall back to the
  // durable copy in R2 and re-cache it locally for next time.
  try {
    const response = await downloadDocFromR2({ data: { docId: id } });
    if (!response.ok || !response.body) return null;
    const blob = await response.blob();
    await backend.cacheDocBlob(id, blob);
    return blob;
  } catch {
    return null;
  }
}

export async function getDocBinary(id: string): Promise<ArrayBuffer | null> {
  const blob = await getDocBlob(id);
  if (!blob) return null;
  return await blob.arrayBuffer();
}

export async function createDoc(file: File, data: ArrayBuffer | Blob): Promise<DocRecord> {
  const backend = await getBackend();
  const doc = await backend.createDoc(file, data);

  // Persist the durable primary copy to R2. Runs in the background — a slow or
  // failed upload must not block the user from opening their newly added document.
  const arrayBuffer = data instanceof Blob ? await data.arrayBuffer() : data;
  uploadDocToR2({ data: { docId: doc.id, base64: bytesToBase64(new Uint8Array(arrayBuffer)) } }).catch(
    (e) => {
      console.warn("[Storage] Failed to back up document to R2:", e);
    },
  );

  return doc;
}

export async function updateDoc(id: string, patch: Partial<DocRecord>): Promise<void> {
  const backend = await getBackend();
  return backend.updateDoc(id, patch);
}

export async function writePages(id: string, pages: PageExtraction[] | StoredPage[]): Promise<void> {
  const backend = await getBackend();
  return backend.writePages(id, pages);
}

export async function getPageData(docId: string, pageNumber: number): Promise<PageDataRecord | undefined> {
  const backend = await getBackend();
  return backend.getPageData(docId, pageNumber);
}

export async function updatePageData(
  docId: string,
  pageNumber: number,
  patch: Partial<Omit<PageDataRecord, "key" | "docId" | "pageNumber">>,
): Promise<void> {
  const backend = await getBackend();
  return backend.updatePageData(docId, pageNumber, patch);
}

export async function getAllPages(docId: string): Promise<PageDataRecord[]> {
  const backend = await getBackend();
  return backend.getAllPages(docId);
}

export async function getPageAiSummary(docId: string): Promise<Record<number, PageAiSummaryEntry>> {
  const backend = await getBackend();
  return backend.getPageAiSummary(docId);
}

export async function getPageMetas(
  docId: string,
): Promise<{ pageNumber: number; columns: number; garbageRatio: number }[]> {
  const backend = await getBackend();
  return backend.getPageMetas(docId);
}

export async function touchDoc(id: string): Promise<void> {
  const backend = await getBackend();
  await backend.touchDoc?.(id) || await backend.updateDoc(id, { lastOpenedAt: Date.now() });
  await backend.setLastOpened(id);
}

export async function deleteDoc(id: string): Promise<void> {
  const backend = await getBackend();
  await backend.deleteDoc(id);
  deleteDocFromR2({ data: { docId: id } }).catch((e) => {
    console.warn("[Storage] Failed to delete document from R2:", e);
  });
}

export async function appendAiResult(docId: string, result: AiResult): Promise<void> {
  const backend = await getBackend();
  return backend.appendAiResult(docId, result);
}

export async function deleteAiResult(docId: string, resultId: string): Promise<void> {
  const backend = await getBackend();
  return backend.deleteAiResult(docId, resultId);
}

export async function upsertPageAi(docId: string, pageNumber: number, patch: Partial<PageAi>): Promise<void> {
  const backend = await getBackend();
  return backend.upsertPageAi(docId, pageNumber, patch);
}

export async function getLastOpened(): Promise<string | null> {
  const backend = await getBackend();
  return backend.getLastOpened();
}

export async function setLastOpened(id: string | null): Promise<void> {
  const backend = await getBackend();
  return backend.setLastOpened(id);
}

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
  const backend = await getBackend();
  return backend.clearAllAiResults();
}

export async function getThumbnail(docId: string): Promise<string | null> {
  const backend = await getBackend();
  return backend.getThumbnail(docId);
}

export async function saveThumbnailBlob(docId: string, blob: Blob): Promise<void> {
  const backend = await getBackend();
  return backend.saveThumbnailBlob(docId, blob);
}

export async function saveThumbnail(docId: string, dataUrl: string): Promise<void> {
  const backend = await getBackend();
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    await backend.saveThumbnailBlob(docId, blob);
  } catch {
    // Fall back to direct saving to DB if fetch fails (e.g. data URL not fetchable or fallback required)
    // For SQLite, this might fall back to saveThumbnailBlob with the dataUrl string itself
    if (backend instanceof SqliteOpfsBackend) {
      await (backend as any).api.saveThumbnailBlob(docId, dataUrl);
    } else {
      const d = await (backend as any).getDb();
      await (backend as any).safePut(d, THUMBNAILS, dataUrl, docId);
    }
  }
}
