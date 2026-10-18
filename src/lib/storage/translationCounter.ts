import { db, safePut, META } from "./idbUtils";
import { listDocs } from "./docs";
import { dispatchDocEvent } from "@/lib/docEvents";

export interface LocalTranslationCounterRecord {
  totalTranslatedPages: number;
  pageKeys: string[];
  lastUpdated: number;
}

const META_KEY_TRANSLATION_COUNTER = "translation_counter";
const LOCAL_STORAGE_KEY = "doclens_total_translated_pages";
const LOCAL_STORAGE_KEYS = "doclens_translated_page_keys";

// In-memory cache for fast synchronous queries and fallback in SSR/test environments
let memoryCache: LocalTranslationCounterRecord | null = null;

function getLocalStorageCount(): number {
  if (typeof window === "undefined" || !window.localStorage) return 0;
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? parseInt(raw, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

function getLocalStorageKeys(): string[] {
  if (typeof window === "undefined" || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEYS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalStorage(record: LocalTranslationCounterRecord): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, String(record.totalTranslatedPages));
    window.localStorage.setItem(LOCAL_STORAGE_KEYS, JSON.stringify(record.pageKeys));
  } catch (e) {
    console.warn("Failed to persist translation counter to localStorage:", e);
  }
}

/**
 * Returns the current total translated pages synchronously if available, or 0.
 */
export function getLocalTranslationCounterSync(): number {
  if (memoryCache) {
    return memoryCache.totalTranslatedPages;
  }
  return getLocalStorageCount();
}

/**
 * Fetches the local translation counter from IndexedDB / localStorage.
 * If uninitialized or 0, it inspects existing documents in IndexedDB to seed
 * the count from previously completed translations.
 */
export async function getLocalTranslationCounter(userId?: string): Promise<number> {
  if (typeof window === "undefined") {
    return memoryCache?.totalTranslatedPages ?? 0;
  }

  try {
    const d = await db();
    const stored = (await d.get(META, META_KEY_TRANSLATION_COUNTER)) as
      | LocalTranslationCounterRecord
      | undefined;

    if (stored && typeof stored.totalTranslatedPages === "number") {
      memoryCache = stored;
      saveLocalStorage(stored);
      return stored.totalTranslatedPages;
    }

    // Check localStorage fallback
    const localTotal = getLocalStorageCount();
    const localKeys = getLocalStorageKeys();
    if (localTotal > 0) {
      const record: LocalTranslationCounterRecord = {
        totalTranslatedPages: localTotal,
        pageKeys: localKeys,
        lastUpdated: Date.now(),
      };
      memoryCache = record;
      await safePut(d, META, record, META_KEY_TRANSLATION_COUNTER).catch(() => {});
      return localTotal;
    }

    // Seed from existing documents in IndexedDB if any exist
    let seededCount = 0;
    try {
      const docs = await listDocs();
      for (const doc of docs) {
        seededCount += doc.aiResultCount ?? 0;
      }
    } catch {
      seededCount = 0;
    }

    const initialRecord: LocalTranslationCounterRecord = {
      totalTranslatedPages: seededCount,
      pageKeys: [],
      lastUpdated: Date.now(),
    };
    memoryCache = initialRecord;
    saveLocalStorage(initialRecord);
    await safePut(d, META, initialRecord, META_KEY_TRANSLATION_COUNTER).catch(() => {});
    return seededCount;
  } catch (err) {
    console.warn("Failed to load local translation counter from IndexedDB:", err);
    return getLocalStorageCount();
  }
}

/**
 * Atomically increments the local translation counter in IndexedDB and localStorage.
 * Deduplicates by pageKey: `${docId}:${pageNumber}:${language}` so retries and reload
 * never count twice.
 */
export async function recordLocalTranslation(params: {
  docId: string;
  pageNumber: number;
  language?: string;
  userId?: string;
}): Promise<{ totalTranslatedPages: number; alreadyCounted: boolean }> {
  const normLang = (params.language || "default").trim().toLowerCase();
  const pageKey = `${params.docId}:${params.pageNumber}:${normLang}`;

  let currentRecord: LocalTranslationCounterRecord;

  try {
    const d = await db();
    const stored = (await d.get(META, META_KEY_TRANSLATION_COUNTER)) as
      | LocalTranslationCounterRecord
      | undefined;

    if (stored && Array.isArray(stored.pageKeys)) {
      currentRecord = stored;
    } else {
      const localTotal = getLocalStorageCount();
      const localKeys = getLocalStorageKeys();
      currentRecord = {
        totalTranslatedPages: localTotal,
        pageKeys: localKeys,
        lastUpdated: Date.now(),
      };
    }

    // Deduplication check
    if (currentRecord.pageKeys.includes(pageKey)) {
      memoryCache = currentRecord;
      return {
        totalTranslatedPages: currentRecord.totalTranslatedPages,
        alreadyCounted: true,
      };
    }

    // Increment
    currentRecord.pageKeys.push(pageKey);
    currentRecord.totalTranslatedPages = (currentRecord.totalTranslatedPages ?? 0) + 1;
    currentRecord.lastUpdated = Date.now();

    // Persist to IndexedDB and localStorage
    await safePut(d, META, currentRecord, META_KEY_TRANSLATION_COUNTER);
    saveLocalStorage(currentRecord);
    memoryCache = currentRecord;

    return {
      totalTranslatedPages: currentRecord.totalTranslatedPages,
      alreadyCounted: false,
    };
  } catch (err) {
    console.warn("Failed to update IndexedDB translation counter, falling back to localStorage:", err);

    // Fallback using localStorage & memoryCache
    const keys = memoryCache ? memoryCache.pageKeys : getLocalStorageKeys();
    let total = memoryCache ? memoryCache.totalTranslatedPages : getLocalStorageCount();

    if (keys.includes(pageKey)) {
      return { totalTranslatedPages: total, alreadyCounted: true };
    }

    keys.push(pageKey);
    total += 1;
    const fallbackRecord: LocalTranslationCounterRecord = {
      totalTranslatedPages: total,
      pageKeys: keys,
      lastUpdated: Date.now(),
    };
    memoryCache = fallbackRecord;
    saveLocalStorage(fallbackRecord);

    return {
      totalTranslatedPages: total,
      alreadyCounted: false,
    };
  }
}

/**
 * Synchronizes local counter when a higher authoritative count is received from the server.
 */
export async function syncLocalTranslationCounter(serverTotal: number): Promise<void> {
  if (typeof serverTotal !== "number" || isNaN(serverTotal)) return;

  try {
    const current = getLocalTranslationCounterSync();
    if (serverTotal <= current) return;

    const d = await db();
    const stored = (await d.get(META, META_KEY_TRANSLATION_COUNTER)) as
      | LocalTranslationCounterRecord
      | undefined;

    const updated: LocalTranslationCounterRecord = {
      totalTranslatedPages: serverTotal,
      pageKeys: stored?.pageKeys || getLocalStorageKeys(),
      lastUpdated: Date.now(),
    };

    await safePut(d, META, updated, META_KEY_TRANSLATION_COUNTER).catch(() => {});
    saveLocalStorage(updated);
    memoryCache = updated;
  } catch (err) {
    console.warn("Failed to sync server counter to local storage:", err);
  }
}
