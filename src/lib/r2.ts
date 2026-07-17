import { createServerFn } from "@tanstack/react-start";

/**
 * Server-only client for Cloudflare R2 (accessed via its S3-compatible API), used as
 * the durable primary store for uploaded PDF bytes. The local database (IndexedDB,
 * see storage.ts) remains the source of truth for metadata, extracted text, and AI
 * results, and also caches the blob locally for fast offline reads.
 */
async function getR2Client() {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  if (!accountId || !accessKeyId || !secretAccessKey) return null;

  const { S3Client } = await import("@aws-sdk/client-s3");
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function getBucket(): string {
  return process.env.R2_BUCKET_NAME?.trim() || "doclens-documents";
}

function objectKey(docId: string): string {
  return `documents/${docId}.pdf`;
}

export function isR2Configured(): boolean {
  return !!(
    process.env.R2_ACCOUNT_ID?.trim() &&
    process.env.R2_ACCESS_KEY_ID?.trim() &&
    process.env.R2_SECRET_ACCESS_KEY?.trim()
  );
}

export const checkR2Configured = createServerFn({ method: "GET" }).handler(async () => {
  "use server";
  return { configured: isR2Configured() };
});

export const uploadDocToR2 = createServerFn({ method: "POST" })
  .validator((input: { docId: string; base64: string }) => input)
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    "use server";
    const client = await getR2Client();
    if (!client) return { ok: false, error: "R2 is not configured on the server." };

    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    try {
      await client.send(
        new PutObjectCommand({
          Bucket: getBucket(),
          Key: objectKey(data.docId),
          Body: Buffer.from(data.base64, "base64"),
          ContentType: "application/pdf",
        }),
      );
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Upload failed." };
    }
  });

/** Streams the object straight through as a raw Response so the caller can read
 *  `response.body` without buffering the whole PDF into a JSON payload. */
export const downloadDocFromR2 = createServerFn({ method: "POST" })
  .validator((input: { docId: string }) => input)
  .handler(async ({ data }): Promise<Response> => {
    "use server";
    const client = await getR2Client();
    if (!client) {
      return new Response(JSON.stringify({ error: "R2 is not configured on the server." }), {
        status: 501,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    try {
      const result = await client.send(
        new GetObjectCommand({ Bucket: getBucket(), Key: objectKey(data.docId) }),
      );
      const body = result.Body as { transformToWebStream?: () => ReadableStream } | undefined;
      const stream = body?.transformToWebStream?.();
      if (!stream) return new Response(null, { status: 404 });
      return new Response(stream, {
        status: 200,
        headers: { "Content-Type": "application/pdf" },
      });
    } catch (e) {
      const status =
        (e as { $metadata?: { httpStatusCode?: number }; name?: string })?.name === "NoSuchKey"
          ? 404
          : 502;
      return new Response(null, { status });
    }
  });

export const deleteDocFromR2 = createServerFn({ method: "POST" })
  .validator((input: { docId: string }) => input)
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    "use server";
    const client = await getR2Client();
    if (!client) return { ok: false };

    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    try {
      await client.send(
        new DeleteObjectCommand({ Bucket: getBucket(), Key: objectKey(data.docId) }),
      );
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });
