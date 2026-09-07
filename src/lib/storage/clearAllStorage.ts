import { closeDb } from "./idbUtils";
import { clearAllVoiceCache, closeVoiceDb, getCachedVoiceIds, isOpfsSupported } from "@/lib/voiceCache";
import { listDocs } from "./docs";

/** Known IndexedDB databases used by DocLens / Anuwad or related dependencies */
const KNOWN_IDB_DATABASES = [
  "doclens",
  "doclens-voice-cache",
  "keyval-store",
  "firebaseLocalStorageDb",
  "__dbnames",
];

/**
 * Safely and rapidly delete an IndexedDB database by name.
 */
function deleteIDBDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      resolve();
      return;
    }

    try {
      const request = window.indexedDB.deleteDatabase(name);
      let settled = false;

      const finish = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };

      request.onsuccess = () => finish();
      request.onerror = () => finish();
      request.onblocked = () => {
        // Continue without hanging even if blocked
        finish();
      };

      // 300ms fallback timeout in case the browser stalls
      setTimeout(finish, 300);
    } catch (e) {
      console.warn(`[Storage] Failed to delete IndexedDB "${name}":`, e);
      resolve();
    }
  });
}

/**
 * Close any active connections and delete all IndexedDB databases.
 */
export async function clearAllIndexedDB(): Promise<void> {
  // 1. Close all active database connections immediately
  await Promise.allSettled([
    closeDb().catch(() => {}),
    closeVoiceDb().catch(() => {}),
  ]);

  const dbNamesToDelete = new Set<string>(KNOWN_IDB_DATABASES);

  // 2. Query available databases if browser supports indexedDB.databases() (Chromium, Brave, Edge, newer Firefox)
  if (
    typeof window !== "undefined" &&
    window.indexedDB &&
    typeof window.indexedDB.databases === "function"
  ) {
    try {
      const dbs = await window.indexedDB.databases();
      for (const info of dbs) {
        if (info.name) {
          dbNamesToDelete.add(info.name);
        }
      }
    } catch (e) {
      console.warn("[Storage] indexedDB.databases() query failed:", e);
    }
  }

  // 3. Delete all discovered and known databases in parallel
  await Promise.allSettled(Array.from(dbNamesToDelete).map((name) => deleteIDBDatabase(name)));
}

/**
 * Rapidly clear all Origin Private File System (OPFS) files and directories.
 */
export async function clearAllOpfs(): Promise<void> {
  if (!isOpfsSupported()) return;

  const tasks: Promise<any>[] = [
    clearAllVoiceCache().catch(() => {}),
  ];

  if (
    typeof navigator !== "undefined" &&
    navigator.storage &&
    typeof navigator.storage.getDirectory === "function"
  ) {
    tasks.push(
      (async () => {
        try {
          const root = await navigator.storage.getDirectory();
          // Remove known folders immediately
          await root.removeEntry("piper", { recursive: true }).catch(() => {});

          // Remove all root directory entries
          const deletePromises: Promise<any>[] = [];
          if (typeof (root as any).entries === "function") {
            for await (const [name] of (root as any).entries()) {
              deletePromises.push(root.removeEntry(name, { recursive: true }).catch(() => {}));
            }
          } else if (typeof (root as any).keys === "function") {
            for await (const name of (root as any).keys()) {
              deletePromises.push(root.removeEntry(name, { recursive: true }).catch(() => {}));
            }
          } else if (Symbol.asyncIterator in root) {
            for await (const [name] of (root as any)) {
              deletePromises.push(root.removeEntry(name, { recursive: true }).catch(() => {}));
            }
          }
          await Promise.allSettled(deletePromises);
        } catch (e) {
          console.warn("[Storage] Failed to clear OPFS root directory:", e);
        }
      })(),
    );
  }

  await Promise.allSettled(tasks);
}

/**
 * Clear all Cache Storage API entries.
 */
export async function clearAllCaches(): Promise<void> {
  if (typeof window !== "undefined" && "caches" in window && window.caches) {
    try {
      const keys = await window.caches.keys();
      await Promise.all(keys.map((k) => window.caches.delete(k)));
    } catch (e) {
      console.warn("[Storage] Failed to clear CacheStorage:", e);
    }
  }
}

/**
 * Clear localStorage only.
 */
export function clearLocalStorage(): void {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.clear();
    }
  } catch (e) {
    console.warn("[Storage] Failed to clear localStorage:", e);
  }
}

/**
 * Clear sessionStorage only.
 */
export function clearSessionStorage(): void {
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      window.sessionStorage.clear();
    }
  } catch (e) {
    console.warn("[Storage] Failed to clear sessionStorage:", e);
  }
}

/**
 * Clear localStorage and sessionStorage.
 */
export function clearAllWebStorage(): void {
  clearLocalStorage();
  clearSessionStorage();
}

/**
 * Clear client-accessible cookies for the current domain.
 */
export function clearAllCookies(): void {
  try {
    if (typeof document !== "undefined" && document.cookie) {
      const cookies = document.cookie.split(";");
      const hostname = window.location.hostname;
      for (const cookie of cookies) {
        const eqPos = cookie.indexOf("=");
        const name = eqPos > -1 ? cookie.slice(0, eqPos).trim() : cookie.trim();
        if (name) {
          document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;`;
          document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=${hostname};`;
        }
      }
    }
  } catch (e) {
    console.warn("[Storage] Failed to clear cookies:", e);
  }
}

/**
 * Unregister any active Service Workers.
 */
export async function unregisterAllServiceWorkers(): Promise<void> {
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((r) => r.unregister()));
    } catch (e) {
      console.warn("[Storage] Failed to unregister service workers:", e);
    }
  }
}

export interface StorageClearOptions {
  documents?: boolean;
  voices?: boolean;
  cache?: boolean;
  settings?: boolean;
  session?: boolean;
}

/**
 * Granularly clear only the selected categories of data.
 */
export async function clearSelectedStorage(options: StorageClearOptions): Promise<void> {
  const tasks: Promise<any>[] = [];

  if (options.documents) {
    tasks.push(clearAllIndexedDB());
  }
  if (options.voices) {
    tasks.push(clearAllOpfs());
  }
  if (options.cache) {
    tasks.push(clearAllCaches(), unregisterAllServiceWorkers());
  }
  if (options.settings) {
    clearLocalStorage();
  }
  if (options.session) {
    clearSessionStorage();
    clearAllCookies();
  }

  await Promise.allSettled(tasks);
}

/**
 * Master function to clear ALL application data stored in the browser:
 * - IndexedDB (documents, OCR, translations, blobs, metadata)
 * - OPFS (Origin Private File System neural voice models & directories)
 * - Cache Storage (Service worker & offline assets)
 * - localStorage (API keys, preferences, UI themes, TTS settings)
 * - sessionStorage (temporary session state)
 * - Client cookies
 * - Service Workers
 */
export async function clearAllStorage(): Promise<void> {
  await Promise.allSettled([
    clearAllIndexedDB(),
    clearAllOpfs(),
    clearAllCaches(),
    unregisterAllServiceWorkers(),
  ]);

  clearAllWebStorage();
  clearAllCookies();
}

export interface StorageOverview {
  usageBytes: number;
  quotaBytes: number;
  docCount: number;
  voiceCount: number;
  isOpfs: boolean;
}

/**
 * Get current storage usage summary across storage mechanisms.
 */
export async function getStorageOverview(): Promise<StorageOverview> {
  let usageBytes = 0;
  let quotaBytes = 0;
  let docCount = 0;
  let voiceCount = 0;

  if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
    try {
      const est = await navigator.storage.estimate();
      usageBytes = est.usage ?? 0;
      quotaBytes = est.quota ?? 0;
    } catch (e) {
      console.warn("[Storage] Storage estimation failed:", e);
    }
  }

  try {
    const docs = await listDocs();
    docCount = docs.length;
  } catch {
    docCount = 0;
  }

  try {
    const voices = await getCachedVoiceIds();
    voiceCount = voices.length;
  } catch {
    voiceCount = 0;
  }

  return {
    usageBytes,
    quotaBytes,
    docCount,
    voiceCount,
    isOpfs: isOpfsSupported(),
  };
}
