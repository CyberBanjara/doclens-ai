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
 * 1. Checks Cloudflare R2 thumbnail store (`thumbnails/${fileKey}.jpg`).
 * 2. If missing in R2, checks local IndexedDB blob/thumbnail and uploads to R2 immediately.
 * 3. Fallback: Downloads PDF from R2, renders first page on client, displays thumbnail, and uploads to R2.
 */
export function useR2Thumbnail(fileKey: string, localDocId?: string | null): {
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

      // 1. Check Cloudflare R2 thumbnail store (`thumbnails/${fileKey}.jpg`)
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

      // 2. R2 does NOT have the thumbnail stored yet.
      // Check local IndexedDB blob/thumbnail if file is imported locally.
      if (localDocId) {
        try {
          const localCached = await getThumbnail(localDocId);
          if (localCached && localCached.startsWith("blob:")) {
            const res = await fetch(localCached);
            const thumbBlob = await res.blob();
            if (!cancelled) {
              setThumbnailUrl(localCached);
              setLoading(false);
            }
            // Upload to R2 thumbnail folder so R2 permanently has thumbnails/${fileKey}.jpg
            void uploadBlobAsThumbnailToR2(fileKey, thumbBlob);
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
          // Fallback to downloading R2 PDF
        }
      }

      // 3. Fallback: Download PDF from R2, render page 1 on client, display, and upload to R2!
      try {
        const res = await downloadFromR2({ data: { key: fileKey } });
        if (cancelled) return;

        const pdfBlob = base64ToBlob(res.base64Data, res.contentType);
        const thumbBlob = await renderPageToJpegBlob(pdfBlob);
        if (cancelled) return;

        const url = URL.createObjectURL(thumbBlob);
        createdUrl = url;

        setThumbnailUrl(url);
        setLoading(false);

        // Save locally and upload thumbnail to R2 thumbnail folder so R2 retains it permanently
        saveThumbnailBlob(r2CacheKey, thumbBlob).catch(() => {});
        void uploadBlobAsThumbnailToR2(fileKey, thumbBlob);
      } catch (e) {
        console.error(`Failed generating thumbnail from R2 PDF for ${fileKey}:`, e);
        if (!cancelled) setLoading(false);
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
