import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "doclens-voice-cache";
const DB_VERSION = 1;
const STORE_NAME = "voice-files";

/**
 * Runtime-extensible path registry for Piper voice models.
 * Entries are added dynamically when the VITS catalog loads,
 * plus manually for voices from the rhasspy repository.
 */
export const PATH_MAP: Record<string, string> = {};

/**
 * Register a voice path into the runtime PATH_MAP.
 * Called dynamically as the Piper catalog loads.
 */
export function registerVoicePath(voiceId: string, onnxPath: string): void {
  PATH_MAP[voiceId] = onnxPath;
}

let isInitialized = false;
let originalFetch: typeof window.fetch | null = null;

// Registry to deduplicate concurrent downloads of the same file
export const activeModelFetches = new Map<string, Promise<Blob>>();

export function isOpfsSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.storage &&
    typeof navigator.storage.getDirectory === "function"
  );
}

export async function getDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    },
  });
}

export async function getCachedFile(filename: string): Promise<Blob | null> {
  // 1. Try OPFS first
  if (isOpfsSupported()) {
    try {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle("piper", { create: false });
      const fileHandle = await dir.getFileHandle(filename, { create: false });
      return await fileHandle.getFile();
    } catch (err) {
      // Ignored: Not found or blocked in OPFS
    }
  }

  // 2. Try IndexedDB fallback
  try {
    const db = await getDB();
    const data = await db.get(STORE_NAME, filename);
    if (data instanceof Blob) {
      return data;
    }
  } catch (err) {
    console.warn("[VoiceCache] Failed to read from IndexedDB:", err);
  }

  return null;
}

export async function saveCachedFile(filename: string, blob: Blob): Promise<void> {
  let savedToOpfs = false;

  // 1. Try OPFS
  if (isOpfsSupported()) {
    try {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle("piper", { create: true });
      const fileHandle = await dir.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      savedToOpfs = true;
    } catch (err) {
      console.warn("[VoiceCache] Failed to save to OPFS, falling back to IndexedDB:", err);
    }
  }

  // 2. Fall back to IndexedDB
  if (!savedToOpfs) {
    try {
      const db = await getDB();
      await db.put(STORE_NAME, blob, filename);
    } catch (err) {
      console.error("[VoiceCache] Failed to save to IndexedDB:", err);
    }
  }
}

export async function getCachedVoiceIds(): Promise<string[]> {
  const voiceIds = new Set<string>();

  // 1. Check OPFS
  if (isOpfsSupported()) {
    try {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle("piper", { create: false });
      for await (const name of (dir as any).keys()) {
        if (name.endsWith(".onnx")) {
          voiceIds.add(name.replace(".onnx", ""));
        }
      }
    } catch (err) {
      // Ignored: Directory doesn't exist
    }
  }

  // 2. Check IndexedDB
  try {
    const db = await getDB();
    const keys = await db.getAllKeys(STORE_NAME);
    for (const key of keys) {
      if (typeof key === "string" && key.endsWith(".onnx")) {
        voiceIds.add(key.replace(".onnx", ""));
      }
    }
  } catch (err) {
    console.error("[VoiceCache] Failed to list IndexedDB keys:", err);
  }

  return Array.from(voiceIds);
}

export async function deleteCachedVoice(voiceId: string): Promise<void> {
  const onnxFile = `${voiceId}.onnx`;
  const jsonFile = `${voiceId}.onnx.json`;

  // 1. Delete from OPFS
  if (isOpfsSupported()) {
    try {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle("piper", { create: false });
      await dir.removeEntry(onnxFile).catch(() => {});
      await dir.removeEntry(jsonFile).catch(() => {});
    } catch (err) {
      // Ignored
    }
  }

  // 2. Delete from IndexedDB
  try {
    const db = await getDB();
    await db.delete(STORE_NAME, onnxFile);
    await db.delete(STORE_NAME, jsonFile);
  } catch (err) {
    console.error("[VoiceCache] Failed to delete from IndexedDB:", err);
  }
}

export async function clearAllVoiceCache(): Promise<void> {
  // 1. Clear OPFS
  if (isOpfsSupported()) {
    try {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle("piper", { create: false });
      await (dir as any).remove({ recursive: true });
    } catch (err) {
      // Ignored
    }
  }

  // 2. Clear IndexedDB
  try {
    const db = await getDB();
    await db.clear(STORE_NAME);
  } catch (err) {
    console.error("[VoiceCache] Failed to clear IndexedDB:", err);
  }
}

// Downloads the file from network and saves it to cache, deduplicated
export async function fetchAndCache(
  filename: string,
  targetUrl: string,
  init?: RequestInit,
): Promise<Blob> {
  let promise = activeModelFetches.get(filename);
  if (!promise) {
    promise = (async () => {
      const fetchFn = originalFetch || window.fetch;
      const res = await fetchFn(targetUrl, init);
      if (!res.ok) {
        throw new Error(`Failed to fetch model file ${filename}: ${res.statusText}`);
      }
      const blob = await res.blob();
      await saveCachedFile(filename, blob);
      return blob;
    })();
    activeModelFetches.set(filename, promise);
    promise.finally(() => {
      activeModelFetches.delete(filename);
    });
  }
  return promise;
}

export function initVoiceCache() {
  if (typeof window === "undefined" || isInitialized) return;
  isInitialized = true;

  originalFetch = window.fetch;

  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : input instanceof Request ? input.url : "";

    // 1. Redirect diffusionstudio to rhasspy repository
    let targetUrl = url;
    if (url.includes("https://huggingface.co/diffusionstudio/piper-voices/resolve/main/")) {
      targetUrl = url.replace(
        "https://huggingface.co/diffusionstudio/piper-voices/resolve/main/",
        "https://huggingface.co/rhasspy/piper-voices/resolve/main/",
      );
    }

    // 2. Intercept downloads for Piper voice files
    const isPiperModel =
      targetUrl.includes("huggingface.co/diffusionstudio/piper-voices/resolve/main/") ||
      targetUrl.includes("huggingface.co/rhasspy/piper-voices/resolve/main/") ||
      targetUrl.includes("huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/");

    if (isPiperModel && (targetUrl.endsWith(".onnx") || targetUrl.endsWith(".json"))) {
      const filename = targetUrl.split("/").at(-1);
      if (filename) {
        // Try serving from cache
        const cachedBlob = await getCachedFile(filename);
        if (cachedBlob) {
          return new Response(cachedBlob, {
            status: 200,
            statusText: "OK",
            headers: {
              "Content-Type": targetUrl.endsWith(".json")
                ? "application/json"
                : "application/octet-stream",
              "Content-Length": String(cachedBlob.size),
            },
          });
        }

        // Cache MISS -> download, write to cache synchronously, then return Response
        try {
          const blob = await fetchAndCache(filename, targetUrl, init);
          return new Response(blob, {
            status: 200,
            statusText: "OK",
            headers: {
              "Content-Type": targetUrl.endsWith(".json")
                ? "application/json"
                : "application/octet-stream",
              "Content-Length": String(blob.size),
            },
          });
        } catch (err) {
          console.error(`[VoiceCache] Network request failed for ${filename}:`, err);
        }
      }
    }

    // Fall back to original fetch
    return originalFetch!(input, init);
  };
}

export async function downloadVoice(
  voiceId: string,
  onProgress?: (progress: number) => void,
): Promise<void> {
  const fetchFn = originalFetch || window.fetch;

  const onnxPath = PATH_MAP[voiceId];
  if (!onnxPath) {
    throw new Error(`Unknown voice ID: ${voiceId}`);
  }

  const baseUrl = "https://huggingface.co/rhasspy/piper-voices/resolve/main";

  const onnxUrl = `${baseUrl}/${onnxPath}`;
  const jsonUrl = `${onnxUrl}.json`;

  const onnxFilename = onnxUrl.split("/").at(-1)!;
  const jsonFilename = jsonUrl.split("/").at(-1)!;

  // 1. Download json configuration file
  const jsonRes = await fetchFn(jsonUrl);
  if (!jsonRes.ok) throw new Error(`Failed to download voice config file`);
  const jsonBlob = await jsonRes.blob();
  await saveCachedFile(jsonFilename, jsonBlob);

  // 2. Download/Cache ONNX model file with progress tracking
  let onnxPromise = activeModelFetches.get(onnxFilename);
  if (!onnxPromise) {
    onnxPromise = (async () => {
      const onnxRes = await fetchFn(onnxUrl);
      if (!onnxRes.ok) throw new Error(`Failed to download voice model file`);

      const reader = onnxRes.body?.getReader();
      const contentLength = +(onnxRes.headers.get("Content-Length") ?? 0);

      if (!reader) {
        const onnxBlob = await onnxRes.blob();
        await saveCachedFile(onnxFilename, onnxBlob);
        onProgress?.(100);
        return onnxBlob;
      }

      let receivedLength = 0;
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        receivedLength += value.length;
        if (contentLength > 0) {
          const pct = Math.round((receivedLength / contentLength) * 100);
          onProgress?.(pct);
        }
      }

      const onnxBlob = new Blob(chunks as any[], { type: "application/octet-stream" });
      await saveCachedFile(onnxFilename, onnxBlob);
      onProgress?.(100);
      return onnxBlob;
    })();

    activeModelFetches.set(onnxFilename, onnxPromise);
    onnxPromise.finally(() => {
      activeModelFetches.delete(onnxFilename);
    });
  } else {
    // Re-use active fetch promise
    await onnxPromise;
    onProgress?.(100);
  }

  await onnxPromise;
}
