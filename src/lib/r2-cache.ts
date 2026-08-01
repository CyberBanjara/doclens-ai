import { listR2Files } from "@/lib/r2";

/**
 * In-memory (module-scoped) cache for the R2 `listObjects` metadata response.
 *
 * Only reachable from client-side code paths (event handlers / effects), so this
 * state never gets populated during SSR and never leaks across users/requests.
 * A plain module-level variable naturally survives SPA (client-side router)
 * navigations but is wiped on a full browser refresh, since the JS module is
 * re-evaluated from scratch — which is exactly the invalidation behavior wanted.
 */

interface R2File {
  key: string;
  size: number;
  lastModified?: string;
  url?: string;
}

const CACHE_TTL_MS = 10 * 60 * 1000;

let cachedFiles: R2File[] | null = null;
let cachedAt = 0;
let inFlightRequest: Promise<{ files: R2File[] }> | null = null;

export async function getCachedR2Files(options?: {
  forceRefresh?: boolean;
}): Promise<{ files: R2File[] }> {
  const forceRefresh = options?.forceRefresh ?? false;
  const isFresh = cachedFiles !== null && Date.now() - cachedAt < CACHE_TTL_MS;

  if (!forceRefresh && isFresh) {
    return { files: cachedFiles! };
  }

  if (!forceRefresh && inFlightRequest) {
    return inFlightRequest;
  }

  const request = listR2Files()
    .then((res) => {
      cachedFiles = res.files || [];
      cachedAt = Date.now();
      return { files: cachedFiles };
    })
    .finally(() => {
      inFlightRequest = null;
    });

  inFlightRequest = request;
  return request;
}

/** Keep the cache in sync after a local mutation (e.g. delete) without a network round-trip. */
export function setCachedR2Files(files: R2File[]) {
  cachedFiles = files;
  cachedAt = Date.now();
}
