import { listR2Files } from "@/lib/r2";
import { db, safePut, META } from "@/lib/storage/idbUtils";
import type { R2File } from "@/lib/file-utils";

export type { R2File };

/**
 * Persistent IndexedDB + in-memory cache for Cloudflare R2 files listing.
 *
 * Like the Local Library, the Global Library caches the list of available
 * documents in IndexedDB so subsequent page loads and navigations never make
 * unnecessary network calls to R2.
 * Fresh data is only fetched when forceRefresh is requested (e.g. user clicks Refresh).
 */

const META_KEY_R2_FILES = "cached_r2_files";
const META_KEY_R2_AT = "cached_r2_files_at";

let inMemoryFiles: R2File[] | null = null;
let inFlightRequest: Promise<{ files: R2File[] }> | null = null;

export async function getCachedR2Files(options?: {
  forceRefresh?: boolean;
}): Promise<{ files: R2File[] }> {
  const forceRefresh = options?.forceRefresh ?? false;

  // 1. If in-memory is already populated and not force-refreshing, return immediately
  if (!forceRefresh && inMemoryFiles !== null && inMemoryFiles.length > 0) {
    return { files: inMemoryFiles };
  }

  // 2. If not forceRefresh, check persistent IndexedDB META store before making any network call
  if (!forceRefresh) {
    try {
      const d = await db();
      const stored = (await d.get(META, META_KEY_R2_FILES)) as R2File[] | undefined;
      if (Array.isArray(stored) && stored.length > 0) {
        inMemoryFiles = stored;
        return { files: stored };
      }
    } catch (e) {
      console.warn("Failed reading R2 files cache from IndexedDB:", e);
    }
  }

  // 3. Deduplicate simultaneous in-flight network requests
  if (!forceRefresh && inFlightRequest) {
    return inFlightRequest;
  }

  const request = listR2Files()
    .then(async (res) => {
      const files = res.files || [];
      inMemoryFiles = files;
      try {
        const d = await db();
        await safePut(d, META, files, META_KEY_R2_FILES);
        await safePut(d, META, Date.now(), META_KEY_R2_AT);
      } catch (e) {
        console.warn("Failed persisting R2 files cache to IndexedDB:", e);
      }
      return { files };
    })
    .finally(() => {
      inFlightRequest = null;
    });

  inFlightRequest = request;
  return request;
}

/** Keep the cache in sync after a local mutation (e.g. upload or delete) without a network round-trip. */
export function setCachedR2Files(files: R2File[]) {
  inMemoryFiles = files;
  db()
    .then((d) => safePut(d, META, files, META_KEY_R2_FILES))
    .catch((e) => console.warn("Failed updating R2 files in IndexedDB:", e));
}

/** Clear R2 files from local cache */
export async function clearCachedR2Files() {
  inMemoryFiles = null;
  try {
    const d = await db();
    await d.delete(META, META_KEY_R2_FILES);
    await d.delete(META, META_KEY_R2_AT);
  } catch (e) {
    console.warn("Failed clearing R2 files from IndexedDB:", e);
  }
}
