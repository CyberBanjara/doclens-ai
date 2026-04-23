import { openDB, type IDBPDatabase } from "idb";
import type { PageExtraction } from "./pdf";

const DB_NAME = "doclens";
const DB_VERSION = 2;
const DOCS = "docs";
const SETTINGS = "settings";

export interface DocRecord {
  id: string;
  name: string;
  size: number;
  data: ArrayBuffer;
  pages: PageExtraction[] | null;
  createdAt: number;
  updatedAt: number;
}

export interface DocSummary {
  id: string;
  name: string;
  size: number;
  pages: number | null;
  createdAt: number;
  updatedAt: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;
function db() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          // legacy single-doc store; ignore
        }
        if (!db.objectStoreNames.contains(DOCS)) {
          db.createObjectStore(DOCS, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(SETTINGS)) {
          db.createObjectStore(SETTINGS);
        }
        // drop legacy "documents" store if present
        if (db.objectStoreNames.contains("documents")) {
          db.deleteObjectStore("documents");
        }
      },
    });
  }
  return dbPromise;
}

export function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function toSummary(d: DocRecord): DocSummary {
  return {
    id: d.id,
    name: d.name,
    size: d.size,
    pages: d.pages?.length ?? null,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

export async function listDocs(): Promise<DocSummary[]> {
  const d = await db();
  const all = (await d.getAll(DOCS)) as DocRecord[];
  return all
    .map(toSummary)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getDoc(id: string): Promise<DocRecord | undefined> {
  const d = await db();
  return d.get(DOCS, id) as Promise<DocRecord | undefined>;
}

export async function createDoc(
  name: string,
  size: number,
  data: ArrayBuffer,
): Promise<DocRecord> {
  const now = Date.now();
  const rec: DocRecord = {
    id: newId(),
    name,
    size,
    data,
    pages: null,
    createdAt: now,
    updatedAt: now,
  };
  const d = await db();
  await d.put(DOCS, rec);
  return rec;
}

export async function updateDoc(
  id: string,
  patch: Partial<Omit<DocRecord, "id" | "createdAt">>,
) {
  const d = await db();
  const existing = (await d.get(DOCS, id)) as DocRecord | undefined;
  if (!existing) return;
  const updated: DocRecord = { ...existing, ...patch, updatedAt: Date.now() };
  await d.put(DOCS, updated);
  return updated;
}

export async function renameDoc(id: string, name: string) {
  return updateDoc(id, { name });
}

export async function deleteDoc(id: string) {
  const d = await db();
  await d.delete(DOCS, id);
}

// ---------- Settings ----------
const KEY_OPENROUTER = "openrouter_api_key";
const KEY_LAST_MODEL = "last_model_id";

export async function getSetting<T = string>(key: string): Promise<T | undefined> {
  const d = await db();
  return d.get(SETTINGS, key) as Promise<T | undefined>;
}
export async function setSetting(key: string, value: unknown) {
  const d = await db();
  await d.put(SETTINGS, value, key);
}

export const settingsKeys = {
  openrouterApiKey: KEY_OPENROUTER,
  lastModelId: KEY_LAST_MODEL,
};
