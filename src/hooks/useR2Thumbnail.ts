import { useEffect, useState } from "react";
import { getThumbnail, getDocBlob, saveThumbnailBlob } from "@/lib/storage";
import { getThumbnailFromR2, downloadFromR2, uploadThumbnailToR2 } from "@/lib/r2";
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
 * React hook to fetch a PDF thumbnail on the client side during Global Library listing.
 * 1. Checks local IndexedDB cache (`r2_thumb_${fileKey}`) first.
 * 2. Checks Cloudflare R2 thumbnail store (`thumbnails/${fileKey}.jpg`).
 * 3. If missing in R2 but document exists in local library, uses local thumbnail and syncs thumbnail to R2.
 * 4. Otherwise, gracefully leaves thumbnail null so the dynamic category artwork cover is displayed.
 */
export function useR2Thumbnail(
  fileKey: string,
  localDocId?: string | null,
): {
  thumbnailUrl: string | null;
  loading: boolean;
} {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;

    (async () => {
      setLoading(true);
      const r2CacheKey = `r2_thumb_${fileKey}`;

      // 1. Check local IndexedDB cache first for instant load and zero network/memory overhead
      try {
        const localR2Thumb = await getThumbnail(r2CacheKey);
        if (localR2Thumb) {
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

      // 2. Check Cloudflare R2 thumbnail store (`thumbnails/${fileKey}.jpg`)
      try {
        const r2Thumb = await getThumbnailFromR2({ data: { fileKey } });
        if (r2Thumb.found) {
          if ("url" in r2Thumb && r2Thumb.url) {
            if (!cancelled) {
              setThumbnailUrl(r2Thumb.url);
              setLoading(false);
            }
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

      // 3. If R2 doesn't have thumbnail, check if document is already saved locally in IndexedDB
      if (localDocId) {
        try {
          const localCached = await getThumbnail(localDocId);
          if (localCached) {
            if (!cancelled) {
              if (localCached.startsWith("blob:")) {
                createdUrl = localCached;
              }
              setThumbnailUrl(localCached);
              setLoading(false);
            } else if (localCached.startsWith("blob:")) {
              URL.revokeObjectURL(localCached);
            }

            // Sync thumbnail to R2 in the background using the cached blob
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
            void uploadBlobAsThumbnailToR2(fileKey, thumbBlob);
            return;
          }
        } catch {
          // Fallback to placeholder artwork
        }
      }

      // 4. If no thumbnail exists yet, finish loading so category artwork is displayed cleanly
      if (!cancelled) {
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [fileKey, localDocId]);

  return { thumbnailUrl, loading };
}
