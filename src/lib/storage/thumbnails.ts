import { db, safePut, THUMBNAILS } from "./idbUtils";

export async function getThumbnail(docId: string): Promise<string | null> {
  const d = await db();
  const v = await d.get(THUMBNAILS, docId);
  if (!v) return null;
  // v2: stored as Blob (≈3× smaller, avoids large base64 string on the JS heap).
  if (v instanceof Blob) return URL.createObjectURL(v);
  // v1: legacy data-URL string.
  return typeof v === "string" ? v : null;
}

/**
 * Save a thumbnail Blob directly to the database.
 */
export async function saveThumbnailBlob(docId: string, blob: Blob): Promise<void> {
  const d = await db();
  await safePut(d, THUMBNAILS, blob, docId);
}
