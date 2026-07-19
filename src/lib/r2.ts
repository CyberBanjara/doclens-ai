import { createServerFn } from "@tanstack/react-start";
import crypto from "crypto";

// Ensure process.env has the suppression flag set BEFORE any AWS SDK libraries are loaded.
if (typeof process !== "undefined" && process.env) {
  process.env.AWS_SDK_JS_SUPPRESS_SUPPORT_WARNING = "1";
}

// Intercept process.emitWarning to completely silence the AWS SDK NodeVersionSupportWarning
if (typeof process !== "undefined" && typeof process.emitWarning === "function") {
  const originalEmitWarning = process.emitWarning;
  process.emitWarning = function (warning, ...args: any[]) {
    const warnStr = typeof warning === "string" ? warning : warning?.message || "";
    const warnName = typeof warning === "object" && warning !== null ? (warning as any).name || "" : "";

    if (
      warnStr.includes("NodeVersionSupportWarning") ||
      warnStr.includes("AWS SDK for JavaScript") ||
      warnName === "NodeVersionSupportWarning"
    ) {
      return;
    }
    return originalEmitWarning.call(process, warning, ...args);
  };
}

async function getS3Client() {
  const sdk = await import("@aws-sdk/client-s3");
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME;
  const endpoint =
    process.env.R2_S3_ENDPOINT ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    throw new Error("Missing Cloudflare R2 credentials in environment variables.");
  }

  return {
    s3: new sdk.S3Client({
      region: "auto",
      endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    }),
    bucketName,
    publicBaseUrl: process.env.R2_PUBLIC_BASE_URL,
    sdk,
  };
}

export const uploadToR2 = createServerFn({ method: "POST" })
  .validator((input: { fileName: string; contentType: string; base64Data: string }) => input)
  .handler(async ({ data }) => {
    "use server";
    const isSyncEnabled =
      process.env.ENABLE_GLOBAL_SYNC === "true" ||
      process.env.VITE_ENABLE_GLOBAL_SYNC === "true" ||
      (import.meta as any).env?.ENABLE_GLOBAL_SYNC === "true" ||
      (import.meta as any).env?.VITE_ENABLE_GLOBAL_SYNC === "true";
    if (!isSyncEnabled) {
      throw new Error("Global sync (R2 uploads) is disabled in this environment.");
    }
    try {
      const { s3, bucketName, publicBaseUrl, sdk } = await getS3Client();
      const buffer = Buffer.from(data.base64Data, "base64");
      const digest = crypto.createHash("md5").update(buffer).digest("hex");

      const cmd = new sdk.PutObjectCommand({
        Bucket: bucketName,
        Key: data.fileName,
        Body: buffer,
        ContentLength: buffer.length,
        ContentType: data.contentType || "application/octet-stream",
      });

      // Add MD5 validation middleware to match the reference implementation
      cmd.middlewareStack.add(
        (next) => async (args: any) => {
          args.request.headers["if-none-match"] = `"${digest}"`;
          return await next(args);
        },
        {
          step: "build",
          name: "addETag",
        }
      );

      await s3.send(cmd);

      return {
        success: true,
        key: data.fileName,
        url: publicBaseUrl ? `${publicBaseUrl}/${data.fileName}` : undefined,
      };
    } catch (err: any) {
      if (err?.$metadata?.httpStatusCode === 412) {
        const { publicBaseUrl } = await getS3Client();
        return {
          success: true,
          alreadyExists: true,
          key: data.fileName,
          url: publicBaseUrl ? `${publicBaseUrl}/${data.fileName}` : undefined,
        };
      }
      console.error("R2 Upload error:", err);
      throw new Error(err?.message || "Upload to Cloudflare R2 failed.");
    }
  });

export const listR2Files = createServerFn({ method: "GET" })
  .handler(async () => {
    "use server";
    try {
      const { s3, bucketName, publicBaseUrl, sdk } = await getS3Client();
      const files: { key: string; size: number; lastModified?: string; url?: string }[] = [];
      let continuationToken: string | undefined;

      do {
        const data = await s3.send(
          new sdk.ListObjectsV2Command({
            Bucket: bucketName,
            ContinuationToken: continuationToken,
          })
        );

        for (const obj of data.Contents || []) {
          if (!obj.Key) continue;
          files.push({
            key: obj.Key,
            size: obj.Size || 0,
            lastModified: obj.LastModified ? obj.LastModified.toISOString() : undefined,
            url: publicBaseUrl ? `${publicBaseUrl}/${obj.Key}` : undefined,
          });
        }

        continuationToken = data.IsTruncated ? data.NextContinuationToken : undefined;
      } while (continuationToken);

      return { files };
    } catch (err: any) {
      console.error("R2 List error:", err);
      throw new Error(err?.message || "Failed to list files from R2.");
    }
  });

export const deleteFromR2 = createServerFn({ method: "POST" })
  .validator((input: { key: string }) => input)
  .handler(async ({ data }) => {
    "use server";
    const isSyncEnabled =
      process.env.ENABLE_GLOBAL_SYNC === "true" ||
      process.env.VITE_ENABLE_GLOBAL_SYNC === "true" ||
      (import.meta as any).env?.ENABLE_GLOBAL_SYNC === "true" ||
      (import.meta as any).env?.VITE_ENABLE_GLOBAL_SYNC === "true";
    if (!isSyncEnabled) {
      throw new Error("Global sync (R2 deletions) is disabled in this environment.");
    }
    try {
      const { s3, bucketName, sdk } = await getS3Client();
      await s3.send(
        new sdk.DeleteObjectCommand({
          Bucket: bucketName,
          Key: data.key,
        })
      );
      return { success: true };
    } catch (err: any) {
      console.error("R2 Delete error:", err);
      throw new Error(err?.message || `Failed to delete file "${data.key}" from R2.`);
    }
  });

export const downloadFromR2 = createServerFn({ method: "POST" })
  .validator((input: { key: string }) => input)
  .handler(async ({ data }) => {
    "use server";
    try {
      const { s3, bucketName, sdk } = await getS3Client();
      const response = await s3.send(
        new sdk.GetObjectCommand({
          Bucket: bucketName,
          Key: data.key,
        })
      );

      const body = response.Body;
      if (!body) {
        throw new Error("File body is empty.");
      }

      const chunks: Buffer[] = [];
      const stream = body as any;

      return new Promise<{ base64Data: string; contentType: string }>((resolve, reject) => {
        if (typeof stream.on === "function") {
          stream.on("data", (chunk: any) => chunks.push(Buffer.from(chunk)));
          stream.on("error", (err: any) => reject(err));
          stream.on("end", () => {
            const buffer = Buffer.concat(chunks);
            resolve({
              base64Data: buffer.toString("base64"),
              contentType: response.ContentType || "application/pdf",
            });
          });
        } else {
          // Fallback for Web Stream environment
          void (async () => {
            try {
              const reader = stream.getReader();
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(Buffer.from(value));
              }
              const buffer = Buffer.concat(chunks);
              resolve({
                base64Data: buffer.toString("base64"),
                contentType: response.ContentType || "application/pdf",
              });
            } catch (e) {
              reject(e);
            }
          })();
        }
      });
    } catch (err: any) {
      console.error("R2 Download error:", err);
      throw new Error(err?.message || `Failed to download file "${data.key}" from R2.`);
    }
  });
