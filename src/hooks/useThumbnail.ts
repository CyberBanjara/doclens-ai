import { useEffect, useState } from "react";
import { getDocBlob, getThumbnail, saveThumbnail } from "@/lib/storage";

const THUMB_W = 200;
const THUMB_H = 260;

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

    (async () => {
      // 1. Check cache first
      try {
        const cached = await getThumbnail(docId);
        if (cached) {
          if (!cancelled) {
            setThumbnailUrl(cached);
            setLoading(false);
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

        const arrayBuffer = await blob.arrayBuffer();
        const pdfjsLib = await import("pdfjs-dist");

        // Ensure worker is configured
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
            "pdfjs-dist/build/pdf.worker.min.mjs",
            import.meta.url,
          ).toString();
        }

        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const page = await pdf.getPage(1);
        const naturalVp = page.getViewport({ scale: 1 });

        // Scale to fit within THUMB_W × THUMB_H, preserving aspect ratio
        const scaleX = THUMB_W / naturalVp.width;
        const scaleY = THUMB_H / naturalVp.height;
        const scale = Math.min(scaleX, scaleY);

        const vp = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(vp.width);
        canvas.height = Math.round(vp.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          if (!cancelled) setLoading(false);
          return;
        }

        await page.render({ canvasContext: ctx, viewport: vp, canvas } as any).promise;
        const dataUrl = canvas.toDataURL("image/png");

        if (cancelled) return;

        // 3. Cache and return
        setThumbnailUrl(dataUrl);
        setLoading(false);

        // Fire-and-forget cache write
        saveThumbnail(docId, dataUrl).catch(() => {});
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [docId]);

  return { thumbnailUrl, loading };
}
