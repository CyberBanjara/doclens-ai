import {
  S3Client,
  ListObjectsV2Command,
  CopyObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import dotenv from "dotenv";

dotenv.config();

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_BUCKET_NAME;
const endpoint =
  process.env.R2_S3_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");

if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
  console.error("Error: Missing Cloudflare R2 credentials in environment variables.");
  process.exit(1);
}

const s3 = new S3Client({
  region: "auto",
  endpoint,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

function sanitizeCategory(cat) {
  if (!cat) return "uncategorized";
  const clean = cat
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return clean || "uncategorized";
}

function inferCategoryFromKey(key) {
  const parts = key.split("/");
  if (parts.length > 1 && parts[0].trim().length > 0) {
    return sanitizeCategory(parts[0]);
  }
  const lower = key.toLowerCase();
  if (lower.includes("hist")) return "history";
  if (lower.includes("econ") || lower.includes("finan")) return "economics";
  if (lower.includes("geo")) return "geography";
  if (lower.includes("civ") || lower.includes("pol") || lower.includes("gov")) return "civics";
  if (
    lower.includes("sci") ||
    lower.includes("bio") ||
    lower.includes("chem") ||
    lower.includes("phys")
  )
    return "science";
  return "uncategorized";
}

async function main() {
  console.log("Starting Cloudflare R2 Virtual Folder Reorganization...");
  let continuationToken;
  let totalMoved = 0;

  do {
    const data = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        ContinuationToken: continuationToken,
      }),
    );

    for (const obj of data.Contents || []) {
      if (!obj.Key) continue;
      const oldKey = obj.Key;
      const parts = oldKey.split("/");

      if (parts.length > 1 && parts[0].trim().length > 0 && parts[1].trim().length > 0) {
        console.log(`[SKIP] Already categorized: ${oldKey}`);
        continue;
      }

      const fileName = parts.pop() || oldKey;
      const category = inferCategoryFromKey(fileName);
      const newKey = `${category}/${fileName}`;

      if (newKey !== oldKey) {
        console.log(`[MOVE] Moving "${oldKey}" -> "${newKey}"`);
        await s3.send(
          new CopyObjectCommand({
            Bucket: bucketName,
            CopySource: encodeURI(`${bucketName}/${oldKey}`),
            Key: newKey,
          }),
        );
        await s3.send(
          new DeleteObjectCommand({
            Bucket: bucketName,
            Key: oldKey,
          }),
        );
        totalMoved++;
      }
    }

    continuationToken = data.IsTruncated ? data.NextContinuationToken : undefined;
  } while (continuationToken);

  console.log(`\n✅ Reorganization complete! Moved ${totalMoved} files to category prefixes.`);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
