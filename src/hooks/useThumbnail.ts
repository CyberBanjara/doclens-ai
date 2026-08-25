import { useEffect, useState } from "react";
import { loadPdfDocument } from "@/lib/pdf";
import { getDocBlob, getThumbnail, saveThumbnailBlob } from "@/lib/storage";

const THUMB_W = 400;
const THUMB_H = 520;

// Concurrency limiter for thumbnail rendering to prevent simultaneous PDF.js parsing memory explosions
const MAX_CONCURRENT_THUMBNAILS = 2;
let runningThumbnails = 0;
const thumbnailQueue: Array<() => void> = [];

function acquireThumbnailSlot(): Promise<void> {
  if (runningThumbnails < MAX_CONCURRENT_THUMBNAILS) {
    runningThumbnails++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    thumbnailQueue.push(() => {
      runningThumbnails++;
      resolve();
    });
  });
}

function releaseThumbnailSlot(): void {
  runningThumbnails--;
  if (thumbnailQueue.length > 0) {
    const next = thumbnailQueue.shift();
    if (next) next();
  }
}

export async function renderPageToJpegBlob(pdfBlob: Blob): Promise<Blob> {
  await acquireThumbnailSlot();
  try {
    const pdf = await loadPdfDocument(pdfBlob);
    try {
      const page = await pdf.getPage(1);
      try {
        const naturalVp = page.getViewport({ scale: 1 });

        // Scale to fit within THUMB_W × THUMB_H, preserving aspect ratio
        const scaleX = THUMB_W / naturalVp.width;
        const scaleY = THUMB_H / naturalVp.height;
        const scale = Math.min(scaleX, scaleY);

        const vp = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.ceil(vp.width));
        canvas.height = Math.max(1, Math.ceil(vp.height));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          throw new Error("Could not get 2D context");
        }

        await page.render({ canvasContext: ctx, viewport: vp, canvas } as any).promise;

        return await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (b) => {
              // Immediately release canvas bitmap memory
              canvas.width = 0;
              canvas.height = 0;
              if (b) resolve(b);
              else reject(new Error("Canvas to blob conversion failed"));
            },
            "image/jpeg",
            0.92,
          );
        });
      } finally {
        try {
          page.cleanup();
        } catch {}
      }
    } finally {
      try {
        await pdf.destroy();
      } catch {}
    }
  } finally {
    releaseThumbnailSlot();
  }
}

/**
 * React hook that returns a cached PDF thumbnail (page-1 preview) for a document.
 * If no cached thumbnail exists, it renders one from the stored PDF blob using pdf.js
 * and persists the result in IndexedDB for future use.
 *
 * Approach adapted from pdf_thumbnail_generator.html demo.
 */
export function useThumbnail(docId: string): {
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
      // 1. Check cache first
      try {
        const cached = await getThumbnail(docId);
        if (cached) {
          if (!cancelled) {
            if (cached.startsWith("blob:")) {
              createdUrl = cached;
            }
            setThumbnailUrl(cached);
            setLoading(false);
          } else {
            if (cached.startsWith("blob:")) {
              URL.revokeObjectURL(cached);
            }
          }
          return;
        }
      } catch {
        // cache miss, continue
      }

      // 2. Generate from PDF blob
      try {
        const blob = await getDocBlob(docId);
        if (!blob || cancelled) {
          if (!cancelled) setLoading(false);
          return;
        }

        const thumbBlob = await renderPageToJpegBlob(blob);
        if (cancelled) return;

        const url = URL.createObjectURL(thumbBlob);
        createdUrl = url;

        setThumbnailUrl(url);
        setLoading(false);

        // Fire-and-forget cache write
        saveThumbnailBlob(docId, thumbBlob).catch(() => {});
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [docId]);

  return { thumbnailUrl, loading };
}
