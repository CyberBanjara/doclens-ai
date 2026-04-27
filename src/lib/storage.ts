import { openDB, type IDBPDatabase } from "idb";
import type { PageExtraction } from "./pdf";

const DB_NAME = "doclens";
const DB_VERSION = 4;
const STORE = "documents";
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
  /** Snapshot of payload that produced `result` (for audit). */
  lastSentRequest?: Record<string, unknown> | null;
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

export interface DocRecord {
  id: string;
  fileName: string;
  fileSize: number;
  data: ArrayBuffer;
  pages: PageExtraction[] | null;
  pageCount: number;
  createdAt: number;
  lastOpenedAt: number;
  scrollTop?: number;
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
// Prevents race conditions when multiple operations try to read-modify-write
// the same document concurrently (e.g. parallel "Run All Pages").

const writeLocks = new Map<string, Promise<void>>();

async function withDocLock<T>(docId: string, fn: () => Promise<T>): Promise<T> {
  // Wait for any existing lock on this doc to resolve
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

/* ---------- Runtime record validation ---------- */
// Ensures records loaded from older DB versions have all required fields.

function normalizeDoc(raw: any): DocRecord | undefined {
  if (!raw || typeof raw !== "object" || !raw.id || !raw.fileName) return undefined;
  return {
    id: raw.id,
    fileName: raw.fileName,
    fileSize: raw.fileSize ?? 0,
    data: raw.data ?? new ArrayBuffer(0),
    pages: Array.isArray(raw.pages) ? raw.pages : null,
    pageCount: raw.pageCount ?? raw.pages?.length ?? 0,
    createdAt: raw.createdAt ?? 0,
    lastOpenedAt: raw.lastOpenedAt ?? 0,
    scrollTop: raw.scrollTop,
    aiResults: Array.isArray(raw.aiResults) ? raw.aiResults : [],
    pageAi: raw.pageAi && typeof raw.pageAi === "object" ? raw.pageAi : {},
  };
}

/* ---------- Database ---------- */

let dbPromise: Promise<IDBPDatabase> | null = null;
function db() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(d) {
        if (!d.objectStoreNames.contains(STORE)) {
          d.createObjectStore(STORE, { keyPath: "id" });
        }
        if (!d.objectStoreNames.contains(META)) {
          d.createObjectStore(META);
        }
      },
    });
  }
  return dbPromise;
}

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
  return normalizeDoc(raw);
}

export async function createDoc(file: File, data: ArrayBuffer): Promise<DocRecord> {
  const d = await db();
  const id = crypto.randomUUID();
  const now = Date.now();
  const rec: DocRecord = {
    id,
    fileName: file.name,
    fileSize: file.size,
    data,
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

export async function updateDoc(id: string, patch: Partial<DocRecord>) {
  return withDocLock(id, async () => {
    const d = await db();
    const existing = normalizeDoc(await d.get(STORE, id));
    if (!existing) return;
    await safePut(d, STORE, { ...existing, ...patch });
  });
}

export async function touchDoc(id: string, scrollTop?: number) {
  await updateDoc(id, { lastOpenedAt: Date.now(), ...(scrollTop !== undefined ? { scrollTop } : {}) });
  await setLastOpened(id);
}

export async function deleteDoc(id: string) {
  const d = await db();
  await d.delete(STORE, id);
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
    pageAi[pageNumber] = { ...prev, ...patch, pageNumber, updatedAt: Date.now() };
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
