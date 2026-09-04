import { useEffect, useState } from "react";
import {
  getThumbnail,
  getDocBlob,
  saveThumbnailBlob,
  saveThumbnailUrl,
  markThumbnailNotFound,
} from "@/lib/storage";
import { getThumbnailFromR2, uploadThumbnailToR2 } from "@/lib/r2";
import { base64ToBlob } from "@/lib/file-utils";
import { renderPageToJpegBlob } from "@/hooks/useThumbnail";

/** Helper function to convert a Blob to base64 and upload to R2 thumbnail folder asynchronously */
export async function uploadBlobAsThumbnailToR2(fileKey: string, blob: Blob): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      if (result) {
        const base64 = result.split(",")[1];
        if (base64) {
          uploadThumbnailToR2({ data: { fileKey, base64Data: base64 } })
            .then((res) => resolve(res.success))
            .catch((err) => {
              console.warn(`Failed uploading thumbnail to R2 for ${fileKey}:`, err);
              resolve(false);
            });
          return;
        }
      }
      resolve(false);
    };
    reader.onerror = () => resolve(false);
    reader.readAsDataURL(blob);
  });
}

/**
 * React hook to retrieve and persistently cache a PDF thumbnail on the client side.
 * 1. Checks local IndexedDB cache (`r2_thumb_${fileKey}`) first for instant load (0 network calls).
 * 2. Uses embedded `initialThumbnailUrl` from document metadata if available (0 serverFn calls).
 * 3. Only makes a fallback `getThumbnailFromR2` request if thumbnail status is truly unknown.
 * 4. Persists the thumbnail directly to IndexedDB so future visits and reloads never query R2.
 */
export function useR2Thumbnail(
  fileKey: string,
  localDocId?: string | null,
  initialThumbnailUrl?: string,
  hasThumbnail?: boolean,
): {
  thumbnailUrl: string | null;
  loading: boolean;
} {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(initialThumbnailUrl || null);
  const [loading, setLoading] = useState(!initialThumbnailUrl);

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;

    (async () => {
      const r2CacheKey = `r2_thumb_${fileKey}`;

      // 1. Check local IndexedDB cache first for instant load (0 network calls)
      try {
        const localR2Thumb = await getThumbnail(r2CacheKey);
        if (localR2Thumb) {
          if (localR2Thumb === "NO_THUMBNAIL") {
            if (!cancelled) {
              setThumbnailUrl(null);
              setLoading(false);
            }
            return;
          }
          if (!cancelled) {
            if (localR2Thumb.startsWith("blob:")) {
              createdUrl = localR2Thumb;
            }
            setThumbnailUrl(localR2Thumb);
            setLoading(false);
          } else if (localR2Thumb.startsWith("blob:")) {
            URL.revokeObjectURL(localR2Thumb);
          }
          return;
        }
      } catch {}

      // 2. If thumbnail URL was already embedded in the cached R2 catalog, use it directly!
      if (initialThumbnailUrl) {
        if (!cancelled) {
          setThumbnailUrl(initialThumbnailUrl);
          setLoading(false);
        }
        // Save URL in IndexedDB and attempt to store blob locally for offline speed
        saveThumbnailUrl(r2CacheKey, initialThumbnailUrl).catch(() => {});
        fetch(initialThumbnailUrl)
          .then((res) => {
            if (!res.ok) throw new Error("Fetch failed");
            return res.blob();
          })
          .then((blob) => {
            saveThumbnailBlob(r2CacheKey, blob).catch(() => {});
          })
          .catch(() => {});
        return;
      }

      // 3. If R2 catalog explicitly reported that this file has NO thumbnail in R2
      if (hasThumbnail === false) {
        // If document is imported in local library, check local thumbnail
        if (localDocId) {
          try {
            const localCached = await getThumbnail(localDocId);
            if (localCached && localCached !== "NO_THUMBNAIL") {
              if (!cancelled) {
                if (localCached.startsWith("blob:")) {
                  createdUrl = localCached;
                }
                setThumbnailUrl(localCached);
                setLoading(false);
              } else if (localCached.startsWith("blob:")) {
                URL.revokeObjectURL(localCached);
              }
              return;
            }

            const localPdfBlob = await getDocBlob(localDocId);
            if (localPdfBlob) {
              const thumbBlob = await renderPageToJpegBlob(localPdfBlob);
              if (!cancelled) {
                const url = URL.createObjectURL(thumbBlob);
                createdUrl = url;
                setThumbnailUrl(url);
                setLoading(false);
              }
              saveThumbnailBlob(r2CacheKey, thumbBlob).catch(() => {});
              saveThumbnailBlob(localDocId, thumbBlob).catch(() => {});
              void uploadBlobAsThumbnailToR2(fileKey, thumbBlob);
              return;
            }
          } catch {}
        }

        // Record negative cache and finish cleanly with 0 network calls
        markThumbnailNotFound(r2CacheKey).catch(() => {});
        if (!cancelled) {
          setThumbnailUrl(null);
          setLoading(false);
        }
        return;
      }

      // 4. Fallback (only if hasThumbnail is undefined): Query Cloudflare R2
      setLoading(true);
      try {
        const r2Thumb = await getThumbnailFromR2({ data: { fileKey } });
        if (r2Thumb.found) {
          if ("url" in r2Thumb && r2Thumb.url) {
            if (!cancelled) {
              setThumbnailUrl(r2Thumb.url);
              setLoading(false);
            }
            saveThumbnailUrl(r2CacheKey, r2Thumb.url).catch(() => {});
            fetch(r2Thumb.url)
              .then((res) => {
                if (!res.ok) throw new Error("Fetch failed");
                return res.blob();
              })
              .then((blob) => {
                saveThumbnailBlob(r2CacheKey, blob).catch(() => {});
              })
              .catch(() => {});
            return;
          } else if ("base64Data" in r2Thumb && r2Thumb.base64Data) {
            const blob = base64ToBlob(r2Thumb.base64Data, r2Thumb.contentType || "image/jpeg");
            if (!cancelled) {
              const url = URL.createObjectURL(blob);
              createdUrl = url;
              setThumbnailUrl(url);
              setLoading(false);
              saveThumbnailBlob(r2CacheKey, blob).catch(() => {});
            }
            return;
          }
        }
      } catch (err) {
        console.warn(`Error fetching thumbnail from R2 for ${fileKey}:`, err);
      }

      // 5. If R2 doesn't have thumbnail, check if document is already saved locally in IndexedDB
      if (localDocId) {
        try {
          const localCached = await getThumbnail(localDocId);
          if (localCached && localCached !== "NO_THUMBNAIL") {
            if (!cancelled) {
              if (localCached.startsWith("blob:")) {
                createdUrl = localCached;
              }
              setThumbnailUrl(localCached);
              setLoading(false);
            } else if (localCached.startsWith("blob:")) {
              URL.revokeObjectURL(localCached);
            }

            if (localCached.startsWith("blob:")) {
              fetch(localCached)
                .then((res) => res.blob())
                .then((thumbBlob) => {
                  saveThumbnailBlob(r2CacheKey, thumbBlob).catch(() => {});
                  void uploadBlobAsThumbnailToR2(fileKey, thumbBlob);
                })
                .catch(() => {});
            }
            return;
          }

          const localPdfBlob = await getDocBlob(localDocId);
          if (localPdfBlob) {
            const thumbBlob = await renderPageToJpegBlob(localPdfBlob);
            if (!cancelled) {
              const url = URL.createObjectURL(thumbBlob);
              createdUrl = url;
              setThumbnailUrl(url);
              setLoading(false);
            }
            saveThumbnailBlob(r2CacheKey, thumbBlob).catch(() => {});
            saveThumbnailBlob(localDocId, thumbBlob).catch(() => {});
            void uploadBlobAsThumbnailToR2(fileKey, thumbBlob);
            return;
          }
        } catch {}
      }

      // 6. Record negative cache so R2 is not queried again
      markThumbnailNotFound(r2CacheKey).catch(() => {});
      if (!cancelled) {
        setThumbnailUrl(null);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [fileKey, localDocId, initialThumbnailUrl, hasThumbnail]);

  return { thumbnailUrl, loading };
}
