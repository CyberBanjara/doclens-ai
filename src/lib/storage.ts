import { openDB, type IDBPDatabase } from "idb";
import type { PageExtraction } from "./pdf";

const DB_NAME = "doclens";
const DB_VERSION = 3;
const STORE = "documents";
const META = "meta";

export type AiMode = "translate" | "summarize" | "explain" | "keypoints";

export interface AiResult {
  id: string; // ${mode}-${language}-${modelId} or timestamp
  mode: AiMode;
  language: string;
  modelId: string;
  modelLabel: string;
  content: string;
  createdAt: number;
  chunkCount: number;
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
  aiResults?: AiResult[];
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
  const all = (await d.getAll(STORE)) as DocRecord[];
  return all
    .filter((r) => r && r.fileName)
    .map((r) => ({
      id: r.id,
      fileName: r.fileName,
      fileSize: r.fileSize,
      pageCount: r.pageCount ?? r.pages?.length ?? 0,
      createdAt: r.createdAt ?? 0,
      lastOpenedAt: r.lastOpenedAt ?? 0,
      hasExtraction: !!r.pages?.length,
      aiResultCount: r.aiResults?.length ?? 0,
    }))
    .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
}

export async function getDoc(id: string): Promise<DocRecord | undefined> {
  const d = await db();
  return d.get(STORE, id) as Promise<DocRecord | undefined>;
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
  };
  await d.put(STORE, rec);
  await setLastOpened(id);
  return rec;
}

export async function updateDoc(id: string, patch: Partial<DocRecord>) {
  const d = await db();
  const existing = (await d.get(STORE, id)) as DocRecord | undefined;
  if (!existing) return;
  await d.put(STORE, { ...existing, ...patch });
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
  const d = await db();
  const existing = (await d.get(STORE, docId)) as DocRecord | undefined;
  if (!existing) return;
  const aiResults = [...(existing.aiResults ?? []).filter((r) => r.id !== result.id), result];
  await d.put(STORE, { ...existing, aiResults });
}

export async function deleteAiResult(docId: string, resultId: string) {
  const d = await db();
  const existing = (await d.get(STORE, docId)) as DocRecord | undefined;
  if (!existing) return;
  const aiResults = (existing.aiResults ?? []).filter((r) => r.id !== resultId);
  await d.put(STORE, { ...existing, aiResults });
}

const LAST_OPENED_KEY = "lastOpenedDocId";
export async function getLastOpened(): Promise<string | null> {
  const d = await db();
  return ((await d.get(META, LAST_OPENED_KEY)) as string | null) ?? null;
}
export async function setLastOpened(id: string | null) {
  const d = await db();
  if (id === null) await d.delete(META, LAST_OPENED_KEY);
  else await d.put(META, id, LAST_OPENED_KEY);
}
