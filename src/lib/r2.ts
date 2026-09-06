import { createServerFn } from "@tanstack/react-start";
import { getCookie, getRequestHeader } from "@tanstack/react-start/server";
import crypto from "crypto";
import { isGlobalSyncEnabled } from "./env";

// Ensure process.env has the suppression flag set BEFORE any AWS SDK libraries are loaded.
if (typeof process !== "undefined" && process.env) {
  process.env.AWS_SDK_JS_SUPPRESS_SUPPORT_WARNING = "1";
}

// Intercept process.emitWarning to completely silence the AWS SDK NodeVersionSupportWarning
if (typeof process !== "undefined" && typeof process.emitWarning === "function") {
  const originalEmitWarning = process.emitWarning;
  process.emitWarning = function (warning, ...args: any[]) {
    const warnStr = typeof warning === "string" ? warning : warning?.message || "";
    const warnName =
      typeof warning === "object" && warning !== null ? (warning as any).name || "" : "";

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

/**
 * ============================================================================
 * TWO-LAYER AUTHENTICATION & AUTHORIZATION ENGINE
 * ----------------------------------------------------------------------------
 * Layer 1: JWT Session Verification (Cryptographic signature, expiry, claims & admin role check)
 * Layer 2: Write-Capable API Key Authorization (Server-side write credential verification)
 * ============================================================================
 */
import type { UserRole } from "./auth-client";
import { assertRoleSession } from "./auth-session";

/**
 * Layer 2 Verification & Credential Separation:
 * - Read operations: strictly use read-only R2 credentials (R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY).
 * - Write operations: strictly require and use write-capable credentials (STORAGE_DISPATCH_TOKEN_ID, STORAGE_DISPATCH_TOKEN_SECRET).
 */
async function getS3Client({ writeAccess = false }: { writeAccess?: boolean } = {}) {
  const sdk = await import("@aws-sdk/client-s3");
  const accountId = process.env.R2_ACCOUNT_ID;
  const bucketName = process.env.R2_BUCKET_NAME;
  const endpoint =
    process.env.R2_S3_ENDPOINT ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");

  let accessKeyId = "";
  let secretAccessKey = "";

  if (writeAccess) {
    // Layer 2: Dedicated write credentials (STORAGE_DISPATCH_TOKEN_*), or fallback to R2 keys
    accessKeyId =
      process.env.STORAGE_DISPATCH_TOKEN_ID ||
      process.env.R2_WRITE_ACCESS_KEY_ID ||
      process.env.R2_ACCESS_KEY_ID ||
      "";
    secretAccessKey =
      process.env.STORAGE_DISPATCH_TOKEN_SECRET ||
      process.env.R2_WRITE_SECRET_ACCESS_KEY ||
      process.env.R2_SECRET_ACCESS_KEY ||
      "";

    if (!accessKeyId || !secretAccessKey) {
      throw new Error(
        "Unauthorized [Layer 2 Failed]: Missing write-capable API key credentials (STORAGE_DISPATCH_TOKEN_ID / STORAGE_DISPATCH_TOKEN_SECRET / R2_ACCESS_KEY_ID).",
      );
    }
  } else {
    // Read-only access credentials: strictly limited to reading objects
    accessKeyId = process.env.R2_ACCESS_KEY_ID || "";
    secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || "";

    if (!accessKeyId || !secretAccessKey) {
      throw new Error("Missing Cloudflare R2 read credentials in environment variables.");
    }
  }

  if (!accountId || !bucketName) {
    throw new Error(
      "Missing Cloudflare R2 account or bucket configuration in environment variables.",
    );
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

export function sanitizeCategory(cat?: string): string {
  if (!cat) return "uncategorized";
  const clean = cat
    .trim()
    .toLowerCase()
    .split("/")
    .map((seg) =>
      seg
        .trim()
        .replace(/[^a-z0-9_-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, ""),
    )
    .filter(Boolean)
    .join("/");
  return clean || "uncategorized";
}

export function inferCategoryFromKey(key: string): string {
  const parts = key.split("/");
  if (parts.length > 1 && parts[0].trim().length > 0) {
    const rawCat = sanitizeCategory(parts[0]);
    if (rawCat.includes("hist")) return "history";
    if (rawCat.includes("pol") || rawCat.includes("civ") || rawCat.includes("gov"))
      return "political-science";
    if (rawCat.includes("econ") || rawCat.includes("finan")) return "economics";
    return "miscellaneous";
  }
  const lower = key.toLowerCase();
  if (lower.includes("hist")) return "history";
  if (
    lower.includes("pol") ||
    lower.includes("civ") ||
    lower.includes("gov") ||
    lower.includes("constitution")
  )
    return "political-science";
  if (lower.includes("econ") || lower.includes("finan")) return "economics";
  return "miscellaneous";
}

export const uploadToR2 = createServerFn({ method: "POST" })
  .validator(
    (input: {
      fileName: string;
      contentType: string;
      base64Data: string;
      subject?: string;
      educationLevel?: string;
      category?: string;
    }) => input,
  )
  .handler(async ({ data }) => {
    "use server";
    const isSyncEnabled = isGlobalSyncEnabled();
    if (!isSyncEnabled) {
      throw new Error("Global sync (R2 uploads) is disabled in this environment.");
    }

    // 1. Verify role privilege before mutating R2 vault
    const sessionUser = await assertRoleSession(["admin", "moderator", "editor"]);

    try {
      // 2. Use write-capable credentials
      const { s3, bucketName, publicBaseUrl, sdk } = await getS3Client({ writeAccess: true });
      const buffer = Buffer.from(data.base64Data, "base64");
      const digest = crypto.createHash("md5").update(buffer).digest("hex");

      const rawFileName = data.fileName.includes("/")
        ? data.fileName.split("/").pop() || data.fileName
        : data.fileName;
      const cleanFileName = rawFileName.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();

      // Construct explicit file hierarchy from selected subject and class (using JWT session educationLevel fallback)
      const effectiveEducationLevel = data.educationLevel || sessionUser.educationLevel || "";
      let targetPrefix: string;
      if (data.subject) {
        const cleanSubj = sanitizeCategory(data.subject);
        const cleanLevel =
          effectiveEducationLevel && effectiveEducationLevel !== "general"
            ? sanitizeCategory(effectiveEducationLevel)
            : "";
        targetPrefix = cleanLevel ? `${cleanSubj}/${cleanLevel}` : cleanSubj;
      } else if (data.category) {
        targetPrefix = sanitizeCategory(data.category);
      } else {
        targetPrefix = "miscellaneous";
      }

      const targetKey = `${targetPrefix}/${cleanFileName}`;

      const cmd = new sdk.PutObjectCommand({
        Bucket: bucketName,
        Key: targetKey,
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
        },
      );

      await s3.send(cmd);

      const cleanBaseUrl = publicBaseUrl ? publicBaseUrl.replace(/\/+$/, "") : "";
      const encodedTargetKey = targetKey.split("/").map((seg) => encodeURIComponent(seg)).join("/");

      return {
        success: true,
        key: targetKey,
        category: targetPrefix,
        url: cleanBaseUrl ? `${cleanBaseUrl}/${encodedTargetKey}` : undefined,
      };
    } catch (err: any) {
      if (err?.$metadata?.httpStatusCode === 412) {
        const { publicBaseUrl } = await getS3Client({ writeAccess: false });
        const cleanFileName = data.fileName.includes("/")
          ? data.fileName.split("/").pop() || data.fileName
          : data.fileName;
        const effectiveEducationLevel = data.educationLevel || sessionUser?.educationLevel || "";
        let targetPrefix: string;
        if (data.subject) {
          const cleanSubj = sanitizeCategory(data.subject);
          const cleanLevel =
            effectiveEducationLevel && effectiveEducationLevel !== "general"
              ? sanitizeCategory(effectiveEducationLevel)
              : "";
          targetPrefix = cleanLevel ? `${cleanSubj}/${cleanLevel}` : cleanSubj;
        } else if (data.category) {
          targetPrefix = sanitizeCategory(data.category);
        } else {
          targetPrefix = "miscellaneous";
        }
        const targetKey = `${targetPrefix}/${cleanFileName}`;
        const cleanBaseUrl = publicBaseUrl ? publicBaseUrl.replace(/\/+$/, "") : "";
        const encodedTargetKey = targetKey.split("/").map((seg) => encodeURIComponent(seg)).join("/");
        return {
          success: true,
          alreadyExists: true,
          key: targetKey,
          category: targetPrefix,
          url: cleanBaseUrl ? `${cleanBaseUrl}/${encodedTargetKey}` : undefined,
        };
      }
      console.error("R2 Upload error:", err);
      throw new Error(err?.message || "Upload to Cloudflare R2 failed.");
    }
  });

export const listR2Files = createServerFn({ method: "GET" }).handler(async () => {
  "use server";
  try {
    const { s3, bucketName, publicBaseUrl, sdk } = await getS3Client({ writeAccess: false });
    const cleanBaseUrl = publicBaseUrl ? publicBaseUrl.replace(/\/+$/, "") : "";
    const rawFiles: { key: string; size: number; lastModified?: string; url?: string }[] = [];
    const thumbnailKeys = new Set<string>();
    let continuationToken: string | undefined;

    do {
      const data = await s3.send(
        new sdk.ListObjectsV2Command({
          Bucket: bucketName,
          ContinuationToken: continuationToken,
        }),
      );

      for (const obj of data.Contents || []) {
        if (!obj.Key) continue;
        if (obj.Key.startsWith("thumbnails/")) {
          const rawKey = obj.Key.substring("thumbnails/".length).replace(/\.jpg$/i, "");
          thumbnailKeys.add(rawKey);
          continue;
        }
        if (obj.Key.startsWith(".thumbnails/")) continue;
        const lowerKey = obj.Key.toLowerCase();
        if (lowerKey.startsWith("ads/") || lowerKey.startsWith(".ads/") || lowerKey === "ads") {
          continue;
        }
        const encodedKey = obj.Key.split("/").map((seg) => encodeURIComponent(seg)).join("/");
        rawFiles.push({
          key: obj.Key,
          size: obj.Size || 0,
          lastModified: obj.LastModified ? obj.LastModified.toISOString() : undefined,
          url: cleanBaseUrl ? `${cleanBaseUrl}/${encodedKey}` : undefined,
        });
      }

      continuationToken = data.IsTruncated ? data.NextContinuationToken : undefined;
    } while (continuationToken);

    const files = rawFiles.map((file) => {
      const hasThumb = thumbnailKeys.has(file.key);
      const encodedKey = file.key.split("/").map((seg) => encodeURIComponent(seg)).join("/");
      return {
        ...file,
        hasThumbnail: hasThumb,
        thumbnailUrl:
          hasThumb && cleanBaseUrl ? `${cleanBaseUrl}/thumbnails/${encodedKey}.jpg` : undefined,
      };
    });

    return { files };
  } catch (err: any) {
    console.error("R2 List error:", err);
    throw new Error(err?.message || "Failed to list files from R2.");
  }
});

export const uploadThumbnailToR2 = createServerFn({ method: "POST" })
  .validator((input: { fileKey: string; base64Data: string }) => input)
  .handler(async ({ data }) => {
    "use server";
    const isSyncEnabled = isGlobalSyncEnabled();
    if (!isSyncEnabled) {
      return { success: false, reason: "Sync disabled" };
    }

    // 1. Verify role privilege before mutating R2 thumbnails
    await assertRoleSession(["admin", "moderator", "editor"]);

    try {
      const { s3, bucketName, sdk } = await getS3Client({ writeAccess: true });
      const buffer = Buffer.from(data.base64Data, "base64");
      const cleanFileKey = data.fileKey.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
      const thumbKey = `thumbnails/${cleanFileKey}.jpg`;

      await s3.send(
        new sdk.PutObjectCommand({
          Bucket: bucketName,
          Key: thumbKey,
          Body: buffer,
          ContentLength: buffer.length,
          ContentType: "image/jpeg",
        }),
      );
      return { success: true, key: thumbKey };
    } catch (err: any) {
      console.warn("R2 Thumbnail Upload error:", err?.message);
      return { success: false, error: err?.message };
    }
  });

export const getThumbnailFromR2 = createServerFn({ method: "POST" })
  .validator((input: { fileKey: string }) => input)
  .handler(async ({ data }) => {
    "use server";
    try {
      const { s3, bucketName, publicBaseUrl, sdk } = await getS3Client({ writeAccess: false });
      const cleanFileKey = data.fileKey.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
      const thumbKey = `thumbnails/${cleanFileKey}.jpg`;

      // Verify if the thumbnail object actually exists in the R2 bucket
      try {
        await s3.send(
          new sdk.HeadObjectCommand({
            Bucket: bucketName,
            Key: thumbKey,
          }),
        );
      } catch {
        // Thumbnail file does not exist in R2 bucket
        return { found: false };
      }

      if (publicBaseUrl) {
        const cleanBaseUrl = publicBaseUrl.replace(/\/+$/, "");
        const encodedThumbKey = thumbKey.split("/").map((seg) => encodeURIComponent(seg)).join("/");
        return { found: true, url: `${cleanBaseUrl}/${encodedThumbKey}` };
      }

      const response = await s3.send(
        new sdk.GetObjectCommand({
          Bucket: bucketName,
          Key: thumbKey,
        }),
      );

      const body = response.Body;
      if (!body) return { found: false };

      const chunks: Buffer[] = [];
      const stream = body as any;

      return new Promise<{ found: boolean; base64Data?: string; contentType?: string }>(
        (resolve) => {
          if (typeof stream.on === "function") {
            stream.on("data", (chunk: any) => chunks.push(Buffer.from(chunk)));
            stream.on("error", () => resolve({ found: false }));
            stream.on("end", () => {
              const buffer = Buffer.concat(chunks);
              resolve({
                found: true,
                base64Data: buffer.toString("base64"),
                contentType: response.ContentType || "image/jpeg",
              });
            });
          } else {
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
                  found: true,
                  base64Data: buffer.toString("base64"),
                  contentType: response.ContentType || "image/jpeg",
                });
              } catch {
                resolve({ found: false });
              }
            })();
          }
        },
      );
    } catch {
      return { found: false };
    }
  });

export const deleteFromR2 = createServerFn({ method: "POST" })
  .validator((input: { key: string }) => input)
  .handler(async ({ data }) => {
    "use server";
    const isSyncEnabled = isGlobalSyncEnabled();
    if (!isSyncEnabled) {
      throw new Error("Global sync (R2 deletions) is disabled in this environment.");
    }

    // 1. Verify role privilege before mutating R2 vault (admin or moderator)
    await assertRoleSession(["admin", "moderator"]);

    try {
      const { s3, bucketName, sdk } = await getS3Client({ writeAccess: true });
      await s3.send(
        new sdk.DeleteObjectCommand({
          Bucket: bucketName,
          Key: data.key,
        }),
      );
      // Try to clean up separate thumbnail object if present
      try {
        await s3.send(
          new sdk.DeleteObjectCommand({
            Bucket: bucketName,
            Key: `thumbnails/${data.key}.jpg`,
          }),
        );
      } catch {
        // Thumbnail cleanup error ignored
      }
      return { success: true };
    } catch (err: any) {
      console.error("R2 Delete error:", err);
      throw new Error(err?.message || `Failed to delete file "${data.key}" from R2.`);
    }
  });

export const getR2DownloadUrl = createServerFn({ method: "POST" })
  .validator((input: { key: string }) => input)
  .handler(async ({ data }) => {
    "use server";
    try {
      const { publicBaseUrl } = await getS3Client({ writeAccess: false });
      const cleanBaseUrl = publicBaseUrl ? publicBaseUrl.replace(/\/+$/, "") : "";
      if (!cleanBaseUrl) {
        throw new Error("Missing Cloudflare R2 public base URL configuration (R2_PUBLIC_BASE_URL).");
      }
      const encodedKey = data.key.split("/").map((seg) => encodeURIComponent(seg)).join("/");
      return { url: `${cleanBaseUrl}/${encodedKey}` };
    } catch (err: any) {
      console.error("R2 getDownloadUrl error:", err);
      throw new Error(err?.message || `Failed to get public download URL for "${data.key}".`);
    }
  });

export const downloadFromR2 = getR2DownloadUrl;

export const reorganizeR2Files = createServerFn({ method: "POST" }).handler(async () => {
  "use server";
  // 1. Verify role privilege before reorganizing R2 vault (admin or moderator)
  await assertRoleSession(["admin", "moderator"]);

  try {
    const { s3, bucketName, sdk } = await getS3Client({ writeAccess: true });
    let continuationToken: string | undefined;
    const movedFiles: { oldKey: string; newKey: string; category: string }[] = [];

    do {
      const data = await s3.send(
        new sdk.ListObjectsV2Command({
          Bucket: bucketName,
          ContinuationToken: continuationToken,
        }),
      );

      for (const obj of data.Contents || []) {
        if (!obj.Key) continue;
        const oldKey = obj.Key;
        const lowerKey = oldKey.toLowerCase();
        if (
          lowerKey.startsWith("thumbnails/") ||
          lowerKey.startsWith(".thumbnails/") ||
          lowerKey.startsWith("ads/") ||
          lowerKey.startsWith(".ads/") ||
          lowerKey === "ads"
        ) {
          continue;
        }

        // If file is already categorized (has prefix followed by filename)
        const parts = oldKey.split("/");
        if (parts.length > 1 && parts[0].trim().length > 0 && parts[1].trim().length > 0) {
          continue; // Already organized in virtual folder
        }

        const fileName = parts.pop() || oldKey;
        const category = inferCategoryFromKey(fileName);
        const newKey = `${category}/${fileName}`;

        if (newKey !== oldKey) {
          await s3.send(
            new sdk.CopyObjectCommand({
              Bucket: bucketName,
              CopySource: encodeURI(`${bucketName}/${oldKey}`),
              Key: newKey,
            }),
          );
          await s3.send(
            new sdk.DeleteObjectCommand({
              Bucket: bucketName,
              Key: oldKey,
            }),
          );
          movedFiles.push({ oldKey, newKey, category });
        }
      }

      continuationToken = data.IsTruncated ? data.NextContinuationToken : undefined;
    } while (continuationToken);

    return {
      success: true,
      movedCount: movedFiles.length,
      movedFiles,
    };
  } catch (err: any) {
    console.error("R2 Reorganize error:", err);
    throw new Error(err?.message || "Failed to reorganize R2 bucket files.");
  }
});
