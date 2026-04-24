import { openDB, type IDBPDatabase } from "idb";
import type { PageExtraction } from "./pdf";

const DB_NAME = "doclens";
const STORE = "documents";

interface StoredDoc {
  id: "current";
  fileName: string;
  fileSize: number;
  data: ArrayBuffer;
  pages: PageExtraction[] | null;
  modelId: string;
  updatedAt: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;
function db() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

export async function saveDoc(doc: Omit<StoredDoc, "id" | "updatedAt">) {
  const d = await db();
  await d.put(STORE, { ...doc, id: "current", updatedAt: Date.now() } satisfies StoredDoc);
}

export async function loadDoc(): Promise<StoredDoc | undefined> {
  const d = await db();
  return d.get(STORE, "current") as Promise<StoredDoc | undefined>;
}

export async function clearDoc() {
  const d = await db();
  await d.delete(STORE, "current");
}
