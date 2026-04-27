import { openDB, type IDBPDatabase } from "idb";
import type { PageExtraction } from "./pdf";

const DB_NAME = "doclens";
const DB_VERSION = 5;
const STORE = "documents";
const BLOBS = "blobs";
const META = "meta";

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

/** Per-page AI overrides. Any unset field falls back to the global setting. */
export interface PageOverrides {
  mode?: AiMode;
  language?: string;
  modelId?: string;
  style?: string;
  temperature?: number;
  memory?: boolean;
}

/** Lean page text — only what's needed after extraction. */
export interface StoredPage {
  pageNumber: number;
  text: string;
  columns: number;
  garbageRatio?: number;
}

/** Per-page AI state stored in IndexedDB. */
export interface PageAi {
  pageNumber: number;
  status: PageStatus;
  /** Custom (user-edited) request payload. If set, sent verbatim. */
  customRequest?: Record<string, unknown> | null;
  /** Marks customRequest as user-modified — auto-regen is suppressed. */
  isCustom?: boolean;
  /** Last AI text result for this page. */
  result?: string;
  error?: string;
  overrides?: PageOverrides;
  /** Hash of effective settings used to produce `result`. Skip-on-rerun key. */
  settingsHash?: string;
  updatedAt?: number;
}

/** Stable hash of the settings tuple that controls AI output. */
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
 * Document record — lightweight metadata + text only.
 * PDF binary is stored separately in the "blobs" store and loaded on-demand.
 */
export interface DocRecord {
  id: string;
  fileName: string;
  fileSize: number;
  pages: StoredPage[] | null;
  pageCount: number;
  createdAt: number;
  lastOpenedAt: number;
  /** Legacy whole-document AI results — kept so old docs don't lose data. */
  aiResults?: AiResult[];
  /** Per-page AI state, keyed by pageNumber. */
  pageAi?: Record<number, PageAi>;
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

/* ---------- Lean page conversion ---------- */
// Strip heavy TextItem[] arrays — only store {pageNumber, text, columns}

function toLeanPages(pages: PageExtraction[]): StoredPage[] {
  return pages.map((p) => ({
    pageNumber: p.pageNumber,
    text: p.text,
    columns: p.columns,
    garbageRatio: p.garbageRatio,
  }));
}

/** Convert StoredPage back to PageExtraction (items=[] since we stripped them) */
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

  // Strip legacy `data` field if migrating from v4
  const pages = Array.isArray(raw.pages)
    ? raw.pages.map((p: any) => ({
        pageNumber: p.pageNumber ?? 0,
        text: p.text ?? "",
        columns: p.columns ?? 1,
        garbageRatio: p.garbageRatio ?? 0,
      }))
    : null;

  // Strip lastSentRequest from pageAi to save space
  let pageAi: Record<number, PageAi> = {};
  if (raw.pageAi && typeof raw.pageAi === "object") {
    for (const [k, v] of Object.entries(raw.pageAi) as [string, any][]) {
      const { lastSentRequest: _, ...rest } = v;
      pageAi[Number(k)] = rest;
    }
  }

  return {
    id: raw.id,
    fileName: raw.fileName,
    fileSize: raw.fileSize ?? 0,
    pages,
    pageCount: raw.pageCount ?? pages?.length ?? 0,
    createdAt: raw.createdAt ?? 0,
    lastOpenedAt: raw.lastOpenedAt ?? 0,
    aiResults: Array.isArray(raw.aiResults) ? raw.aiResults : [],
    pageAi,
  };
}

/* ---------- Database ---------- */

let dbPromise: Promise<IDBPDatabase> | null = null;
function db() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(d, oldVersion) {
        if (!d.objectStoreNames.contains(STORE)) {
          d.createObjectStore(STORE, { keyPath: "id" });
        }
        if (!d.objectStoreNames.contains(META)) {
          d.createObjectStore(META);
        }
        // v5: separate blob store for PDF binaries
        if (!d.objectStoreNames.contains(BLOBS)) {
          d.createObjectStore(BLOBS);
        }
        // Migrate v4→v5: move `data` from docs to blobs store
        // This happens in the versionchange transaction automatically.
        // We'll do lazy migration in getDoc/getDocBinary instead since
        // we can't do async reads in upgrade.
      },
    });
  }
  return dbPromise;
}

/* ---------- Lazy v4→v5 migration ---------- */
// Old records have `data` embedded in the doc. On first access we:
// 1. Move binary to blobs store
// 2. Strip `data` + `items[]` from doc record

async function migrateIfNeeded(d: IDBPDatabase, raw: any): Promise<void> {
  if (!raw || !raw.id) return;
  if (!raw.data || !(raw.data instanceof ArrayBuffer) || raw.data.byteLength === 0) return;

  // Move binary to blobs store
  try {
    await safePut(d, BLOBS, raw.data, raw.id);
  } catch {
    // If quota exceeded, keep embedded — don't lose data
    return;
  }

  // Strip data + items from doc
  const lean = { ...raw, data: undefined };
  if (Array.isArray(lean.pages)) {
    lean.pages = lean.pages.map((p: any) => ({
      pageNumber: p.pageNumber,
      text: p.text,
      columns: p.columns,
      garbageRatio: p.garbageRatio ?? 0,
    }));
  }
  // Strip lastSentRequest from pageAi
  if (lean.pageAi && typeof lean.pageAi === "object") {
    for (const k of Object.keys(lean.pageAi)) {
      delete lean.pageAi[k].lastSentRequest;
    }
  }
  delete lean.data;
  delete lean.scrollTop;
  await safePut(d, STORE, lean);
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
      pageCount: r.pageCount ?? r.pages?.length ?? 0,
      createdAt: r.createdAt ?? 0,
      lastOpenedAt: r.lastOpenedAt ?? 0,
      hasExtraction: !!r.pages?.length,
      aiResultCount:
        (r.aiResults?.length ?? 0) +
        Object.values(r.pageAi ?? {}).filter((p) => p.status === "done").length,
    }))
    .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
}

export async function getDoc(id: string): Promise<DocRecord | undefined> {
  const d = await db();
  const raw = await d.get(STORE, id);
  if (!raw) return undefined;
  // Lazy migration: move embedded binary to separate store
  await migrateIfNeeded(d, raw);
  return normalizeDoc(raw);
}

/**
 * Load PDF binary on-demand from the blobs store.
 * Returns null if no binary is stored (e.g. deleted or never saved).
 */
export async function getDocBinary(id: string): Promise<ArrayBuffer | null> {
  const d = await db();
  // Try new blobs store first
  const blob = await d.get(BLOBS, id);
  if (blob instanceof ArrayBuffer) return blob;
  // Fallback: check if still embedded in legacy doc
  const raw = await d.get(STORE, id);
  if (raw?.data instanceof ArrayBuffer && raw.data.byteLength > 0) {
    return raw.data;
  }
  return null;
}

export async function createDoc(file: File, data: ArrayBuffer): Promise<DocRecord> {
  const d = await db();
  const id = crypto.randomUUID();
  const now = Date.now();

  // Store binary in separate blobs store
  await safePut(d, BLOBS, data, id);

  // Store lean metadata (no binary, no items)
  const rec: DocRecord = {
    id,
    fileName: file.name,
    fileSize: file.size,
    pages: null,
    pageCount: 0,
    createdAt: now,
    lastOpenedAt: now,
    aiResults: [],
    pageAi: {},
  };
  await safePut(d, STORE, rec);
  await setLastOpened(id);
  return rec;
}

export async function updateDoc(id: string, patch: Partial<DocRecord & { pages: PageExtraction[] | StoredPage[] | null }>) {
  return withDocLock(id, async () => {
    const d = await db();
    const existing = normalizeDoc(await d.get(STORE, id));
    if (!existing) return;

    // If pages are being updated, strip items to lean format
    let leanPatch: any = { ...patch };
    if (leanPatch.pages && Array.isArray(leanPatch.pages)) {
      leanPatch.pages = leanPatch.pages.map((p: any) => ({
        pageNumber: p.pageNumber,
        text: p.text,
        columns: p.columns ?? 1,
        garbageRatio: p.garbageRatio ?? 0,
      }));
    }
    await safePut(d, STORE, { ...existing, ...leanPatch });
  });
}

export async function touchDoc(id: string) {
  await updateDoc(id, { lastOpenedAt: Date.now() });
  await setLastOpened(id);
}

export async function deleteDoc(id: string) {
  const d = await db();
  await d.delete(STORE, id);
  // Also delete the blob
  try { await d.delete(BLOBS, id); } catch { /* ignore */ }
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

/** Merge a partial PageAi for a single page. Fast path used during streaming. */
export async function upsertPageAi(docId: string, pageNumber: number, patch: Partial<PageAi>) {
  return withDocLock(docId, async () => {
    const d = await db();
    const existing = normalizeDoc(await d.get(STORE, docId));
    if (!existing) return;
    const pageAi = { ...(existing.pageAi ?? {}) };
    const prev = pageAi[pageNumber] ?? { pageNumber, status: "idle" as PageStatus };
    // Strip lastSentRequest — don't persist it
    const { lastSentRequest: _, ...cleanPatch } = patch as any;
    pageAi[pageNumber] = { ...prev, ...cleanPatch, pageNumber, updatedAt: Date.now() };
    await safePut(d, STORE, { ...existing, pageAi });
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
