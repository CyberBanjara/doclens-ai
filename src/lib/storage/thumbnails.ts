import { db, safePut, THUMBNAILS } from "./idbUtils";

export async function getThumbnail(docId: string): Promise<string | null> {
  const d = await db();
  const v = await d.get(THUMBNAILS, docId);
  if (!v) return null;
  // v2: stored as Blob (≈3× smaller, avoids large base64 string on the JS heap).
  if (v instanceof Blob) return URL.createObjectURL(v);
  // v1: legacy data-URL string or sentinel string ("NO_THUMBNAIL").
  return typeof v === "string" ? v : null;
}

/**
 * Save a thumbnail Blob directly to the database.
 */
export async function saveThumbnailBlob(docId: string, blob: Blob): Promise<void> {
  const d = await db();
  await safePut(d, THUMBNAILS, blob, docId);
}

/**
 * Save a thumbnail string URL (e.g. public CDN or data URL) directly to the database.
 */
export async function saveThumbnailUrl(docId: string, url: string): Promise<void> {
  const d = await db();
  await safePut(d, THUMBNAILS, url, docId);
}

/**
 * Record a negative cache sentinel so R2 is not repeatedly queried for missing thumbnails.
 */
export async function markThumbnailNotFound(docId: string): Promise<void> {
  const d = await db();
  await safePut(d, THUMBNAILS, "NO_THUMBNAIL", docId);
}

/**
 * Remove a thumbnail from local storage.
 */
export async function deleteThumbnail(docId: string): Promise<void> {
  const d = await db();
  await d.delete(THUMBNAILS, docId);
}
