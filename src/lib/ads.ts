import { createClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { getCookie, getRequestHeader } from "@tanstack/react-start/server";
import crypto from "crypto";
import type { UserRole } from "./auth-client";

export interface AdRecord {
  id: string;
  advertiser_name: string;
  advertiser_email: string;
  advertiser_company?: string | null;
  title: string;
  description?: string | null;
  image_url: string;
  target_url: string;
  package_name: string;
  duration_days: number;
  amount_paid: number;
  payment_status: "pending" | "paid" | "waived" | "failed";
  approval_status: "pending" | "approved" | "rejected";
  approved_at?: string | null;
  expires_at?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface AdPackage {
  id: string;
  name: string;
  durationDays: number;
  priceINR: number;
  badge?: string;
  description: string;
  features: string[];
}

export interface SlotAvailability {
  packageId: string;
  packageName: string;
  durationDays: number;
  priceINR: number;
  isOccupied: boolean;
  currentAdTitle?: string;
  currentAdCompany?: string;
  expiresAt?: string | null;
  nextAvailableAt: string;
  relativeTimeStr: string;
}

export const AD_PACKAGES: AdPackage[] = [
  {
    id: "slot-24h",
    name: "24 Hours Spotlight",
    durationDays: 1,
    priceINR: 1500,
    badge: "24 Hours",
    description: "Quick 24-hour flash placement for product launches and announcements.",
    features: [
      "24 hours of active featured placement",
      "Direct external link attribution",
      "Fast admin approval",
    ],
  },
  {
    id: "slot-7d",
    name: "7 Days Showcase",
    durationDays: 7,
    priceINR: 5000,
    badge: "7 Days (Popular)",
    description: "7 days of persistent featured placement across all reader instances.",
    features: [
      "7 days of active featured placement",
      "Direct external link attribution",
      "Top-tier engagement",
    ],
  },
  {
    id: "slot-30d",
    name: "30 Days Sponsorship",
    durationDays: 30,
    priceINR: 16000,
    badge: "30 Days (Best Value)",
    description: "Full monthly continuous sponsor placement across global traffic.",
    features: [
      "30 days of persistent placement",
      "Direct external link attribution",
      "Priority queue & support",
    ],
  },
];

export function computeSlotAvailabilities(activeAds: AdRecord[]): SlotAvailability[] {
  const now = Date.now();
  return AD_PACKAGES.map((pkg) => {
    const matchingAds = activeAds.filter(
      (a) =>
        a.approval_status === "approved" &&
        a.expires_at &&
        new Date(a.expires_at).getTime() > now &&
        (a.duration_days === pkg.durationDays || a.package_name.includes(`${pkg.durationDays}`)),
    );

    matchingAds.sort(
      (a, b) => new Date(b.expires_at!).getTime() - new Date(a.expires_at!).getTime(),
    );

    const activeAd = matchingAds[0];
    if (activeAd && activeAd.expires_at) {
      const expTime = new Date(activeAd.expires_at).getTime();
      const diffMs = expTime - now;
      const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      const hoursLeft = Math.ceil(diffMs / (1000 * 60 * 60));

      const relativeTimeStr = daysLeft > 1 ? `in ${daysLeft} days` : `in ${hoursLeft} hours`;

      return {
        packageId: pkg.id,
        packageName: pkg.name,
        durationDays: pkg.durationDays,
        priceINR: pkg.priceINR,
        isOccupied: true,
        currentAdTitle: activeAd.title,
        currentAdCompany: activeAd.advertiser_company || undefined,
        expiresAt: activeAd.expires_at,
        nextAvailableAt: activeAd.expires_at,
        relativeTimeStr,
      };
    }

    return {
      packageId: pkg.id,
      packageName: pkg.name,
      durationDays: pkg.durationDays,
      priceINR: pkg.priceINR,
      isOccupied: false,
      expiresAt: null,
      nextAvailableAt: new Date().toISOString(),
      relativeTimeStr: "Available immediately",
    };
  });
}

/**
 * Helper: Layer 1 JWT Session Authentication
 */
async function assertAdminRole(
  allowedRoles: UserRole[] = ["admin", "moderator", "editor"],
  tokenOrAuth?: string,
) {
  let token = tokenOrAuth;
  if (!token) {
    try {
      token = getCookie("session_token");
    } catch {
      // outside request context
    }
  }
  if (!token) {
    try {
      const header = getRequestHeader("authorization") || getRequestHeader("x-session-token");
      if (header) {
        token = header.startsWith("Bearer ") ? header.substring(7).trim() : header.trim();
      }
    } catch {
      // outside request context
    }
  }

  if (!token) {
    throw new Error("Unauthorized: Missing administrative session JWT.");
  }

  const { verifySessionJwt } = await import("../../server/lib/auth-server");
  const user = await verifySessionJwt(token);
  if (!user) {
    throw new Error("Unauthorized: Invalid or expired session token.");
  }

  if (!allowedRoles.includes(user.role)) {
    throw new Error(`Forbidden: Requires administrative role (current role: '${user.role}').`);
  }

  return user;
}

/**
 * Helper: Obtain Supabase client for reading/writing
 */
async function getSupabase({ writeAccess = false }: { writeAccess?: boolean } = {}) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  let key = "";

  if (writeAccess) {
    key =
      process.env.PIPELINE_CATALOG_SYNC_TOKEN ||
      process.env.SUPABASE_WRITE_KEY ||
      process.env.SUPABASE_SECRET_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      "";

    if (!key) {
      throw new Error("Missing write-capable Supabase key in server environment.");
    }
  } else {
    key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "";
  }

  if (!url || !key || url.includes("your-project.supabase.co")) {
    return null;
  }

  let wsTransport: any = undefined;
  if (typeof window === "undefined") {
    try {
      const wsModule = await import("ws");
      const ws = wsModule.default || wsModule;
      if (typeof globalThis.WebSocket === "undefined") {
        globalThis.WebSocket = ws as any;
      }
      wsTransport = ws;
    } catch {
      // ws polyfill ignore
    }
  }

  return createClient(url, key, {
    auth: { persistSession: false },
    ...(wsTransport ? { realtime: { transport: wsTransport } } : {}),
  });
}

/**
 * Helper: Obtain Cloudflare R2 client
 */
async function getR2Client({ writeAccess = false }: { writeAccess?: boolean } = {}) {
  const sdk = await import("@aws-sdk/client-s3");
  const accountId = process.env.R2_ACCOUNT_ID;
  const bucketName = process.env.R2_BUCKET_NAME;
  const endpoint =
    process.env.R2_S3_ENDPOINT ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");

  let accessKeyId = "";
  let secretAccessKey = "";

  if (writeAccess) {
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
  } else {
    accessKeyId = process.env.R2_ACCESS_KEY_ID || "";
    secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || "";
  }

  if (!accessKeyId || !secretAccessKey || !accountId || !bucketName) {
    throw new Error("Missing Cloudflare R2 credentials or configuration.");
  }

  return {
    s3: new sdk.S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    }),
    bucketName,
    publicBaseUrl: process.env.R2_PUBLIC_BASE_URL,
    sdk,
  };
}

/**
 * Public: Fetch active approved ads (expires_at > now())
 * Always fetches fresh data directly from Supabase to prevent stale/cached results on deletions
 */
export const fetchActiveAds = createServerFn({ method: "POST" })
  .validator((input?: { t?: number }) => input)
  .handler(async () => {
    "use server";
    try {
      const supabase = await getSupabase({ writeAccess: false });
      if (!supabase) {
        return { success: true, ads: [] as AdRecord[] };
      }

      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from("ads")
        .select("*")
        .eq("approval_status", "approved")
        .not("expires_at", "is", null)
        .gt("expires_at", nowIso)
        .order("created_at", { ascending: false });

      if (error) {
        console.warn("Error querying active ads:", error.message);
        return { success: false, ads: [] as AdRecord[], error: error.message };
      }

      return { success: true, ads: (data as AdRecord[]) || [] };
    } catch (err: any) {
      console.warn("Exception in fetchActiveAds:", err?.message || String(err));
      return { success: false, ads: [] as AdRecord[], error: err?.message || String(err) };
    }
  });

/**
 * Public: Upload ad creative image/icon to Cloudflare R2 in `ads/` folder
 */
export const uploadAdCreative = createServerFn({ method: "POST" })
  .validator((input: { fileName: string; contentType: string; base64Data: string }) => input)
  .handler(async ({ data }) => {
    "use server";
    try {
      const { s3, bucketName, publicBaseUrl, sdk } = await getR2Client({ writeAccess: true });

      // Clean & sanitize file name
      const extMatch = data.fileName.match(/\.([a-zA-Z0-9]+)$/);
      const ext = extMatch ? extMatch[1].toLowerCase() : "png";
      const cleanName = data.fileName
        .replace(/\.[^/.]+$/, "")
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "-")
        .replace(/-+/g, "-")
        .substring(0, 40);

      const uniqueKey = `ads/${Date.now()}-${cleanName}.${ext}`;
      const buffer = Buffer.from(data.base64Data, "base64");

      // Validate size (max 5MB)
      if (buffer.length > 5 * 1024 * 1024) {
        throw new Error("Creative image exceeds 5MB maximum limit.");
      }

      await s3.send(
        new sdk.PutObjectCommand({
          Bucket: bucketName,
          Key: uniqueKey,
          Body: buffer,
          ContentLength: buffer.length,
          ContentType: data.contentType || "image/png",
        }),
      );

      const publicUrl = publicBaseUrl
        ? `${publicBaseUrl.replace(/\/+$/, "")}/${uniqueKey}`
        : uniqueKey;

      return {
        success: true,
        key: uniqueKey,
        url: publicUrl,
      };
    } catch (err: any) {
      console.error("Ad creative upload failed:", err);
      throw new Error(err?.message || "Failed to upload creative asset to Cloudflare R2.");
    }
  });

/**
 * Public: Submit a new pending ad
 */
export const submitPendingAd = createServerFn({ method: "POST" })
  .validator(
    (input: {
      advertiserName: string;
      advertiserEmail: string;
      advertiserCompany?: string;
      title: string;
      description?: string;
      imageUrl: string;
      targetUrl: string;
      packageName: string;
      durationDays: number;
      amountPaid: number;
    }) => input,
  )
  .handler(async ({ data }) => {
    "use server";
    try {
      // Validate inputs
      if (!data.advertiserName?.trim()) throw new Error("Advertiser name is required.");
      if (!data.advertiserEmail?.trim() || !data.advertiserEmail.includes("@")) {
        throw new Error("A valid contact email is required.");
      }
      if (!data.title?.trim()) throw new Error("Ad headline/title is required.");
      if (!data.imageUrl?.trim()) throw new Error("Creative logo/banner image is required.");
      if (!data.targetUrl?.trim()) throw new Error("Target destination URL is required.");

      // Ensure targetUrl is properly formatted
      let finalTargetUrl = data.targetUrl.trim();
      if (!/^https?:\/\//i.test(finalTargetUrl)) {
        finalTargetUrl = `https://${finalTargetUrl}`;
      }

      const supabase = await getSupabase({ writeAccess: true });
      if (!supabase) {
        throw new Error("Supabase service is currently unavailable.");
      }

      const newRecord = {
        advertiser_name: data.advertiserName.trim(),
        advertiser_email: data.advertiserEmail.trim().toLowerCase(),
        advertiser_company: data.advertiserCompany?.trim() || null,
        title: data.title.trim(),
        description: data.description?.trim() || null,
        image_url: data.imageUrl.trim(),
        target_url: finalTargetUrl,
        package_name: data.packageName || "Startup Showcase (7 Days)",
        duration_days: Math.max(1, Number(data.durationDays) || 7),
        amount_paid: Number(data.amountPaid) || 5000,
        payment_status: "pending",
        approval_status: "pending",
        approved_at: null,
        expires_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data: inserted, error } = await supabase
        .from("ads")
        .insert(newRecord)
        .select("*")
        .single();

      if (error) {
        console.error("Failed to insert pending ad:", error);
        throw new Error(error.message || "Failed to save ad submission.");
      }

      return {
        success: true,
        ad: inserted as AdRecord,
      };
    } catch (err: any) {
      console.error("submitPendingAd error:", err);
      throw new Error(err?.message || "Failed to submit advertisement.");
    }
  });

/**
 * Admin: List all ads with status and metrics
 */
export const adminListAllAds = createServerFn({ method: "GET" }).handler(async () => {
  "use server";
  await assertAdminRole(["admin", "moderator", "editor"]);

  try {
    const supabase = await getSupabase({ writeAccess: true });
    if (!supabase) {
      throw new Error("Supabase is not configured.");
    }

    const { data, error } = await supabase
      .from("ads")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message || "Failed to list ads.");
    }

    const ads = (data as AdRecord[]) || [];
    const now = Date.now();

    const stats = {
      total: ads.length,
      pending: ads.filter((a) => a.approval_status === "pending").length,
      active: ads.filter(
        (a) =>
          a.approval_status === "approved" &&
          a.expires_at &&
          new Date(a.expires_at).getTime() > now,
      ).length,
      expired: ads.filter(
        (a) =>
          a.approval_status === "approved" &&
          a.expires_at &&
          new Date(a.expires_at).getTime() <= now,
      ).length,
      rejected: ads.filter((a) => a.approval_status === "rejected").length,
      totalRevenue: ads
        .filter((a) => a.payment_status === "paid" || a.approval_status === "approved")
        .reduce((sum, a) => sum + (Number(a.amount_paid) || 0), 0),
    };

    return {
      success: true,
      ads,
      stats,
    };
  } catch (err: any) {
    console.error("adminListAllAds error:", err);
    throw new Error(err?.message || "Failed to list ads.");
  }
});

/**
 * Admin: Approve a pending or existing ad
 * Sets approved_at = now() and expires_at = approved_at + duration_days
 */
export const adminApproveAd = createServerFn({ method: "POST" })
  .validator(
    (input: {
      id: string;
      customDurationDays?: number;
      paymentStatus?: "pending" | "paid" | "waived";
    }) => input,
  )
  .handler(async ({ data }) => {
    "use server";
    await assertAdminRole(["admin", "moderator"]);

    try {
      const supabase = await getSupabase({ writeAccess: true });
      if (!supabase) throw new Error("Supabase is not configured.");

      // Fetch current ad to get duration
      const { data: existing, error: fetchErr } = await supabase
        .from("ads")
        .select("*")
        .eq("id", data.id)
        .single();

      if (fetchErr || !existing) {
        throw new Error("Ad not found.");
      }

      const durationDays = data.customDurationDays || existing.duration_days || 7;
      const approvedAt = new Date();
      const expiresAt = new Date(approvedAt.getTime() + durationDays * 24 * 60 * 60 * 1000);

      const updatePayload = {
        approval_status: "approved",
        approved_at: approvedAt.toISOString(),
        expires_at: expiresAt.toISOString(),
        duration_days: durationDays,
        payment_status: data.paymentStatus || "paid",
        updated_at: new Date().toISOString(),
      };

      const { data: updated, error: updateErr } = await supabase
        .from("ads")
        .update(updatePayload)
        .eq("id", data.id)
        .select("*")
        .single();

      if (updateErr) {
        throw new Error(updateErr.message || "Failed to update ad status.");
      }

      return {
        success: true,
        ad: updated as AdRecord,
      };
    } catch (err: any) {
      console.error("adminApproveAd error:", err);
      throw new Error(err?.message || "Failed to approve ad.");
    }
  });

/**
 * Admin: Reject an ad submission
 */
export const adminRejectAd = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    "use server";
    await assertAdminRole(["admin", "moderator"]);

    try {
      const supabase = await getSupabase({ writeAccess: true });
      if (!supabase) throw new Error("Supabase is not configured.");

      const { data: updated, error } = await supabase
        .from("ads")
        .update({
          approval_status: "rejected",
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.id)
        .select("*")
        .single();

      if (error) {
        throw new Error(error.message || "Failed to reject ad.");
      }

      return {
        success: true,
        ad: updated as AdRecord,
      };
    } catch (err: any) {
      console.error("adminRejectAd error:", err);
      throw new Error(err?.message || "Failed to reject ad.");
    }
  });

/**
 * Admin: Delete an ad record
 */
export const adminDeleteAd = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    "use server";
    await assertAdminRole(["admin", "moderator"]);

    try {
      const supabase = await getSupabase({ writeAccess: true });
      if (!supabase) throw new Error("Supabase is not configured.");

      const { error } = await supabase.from("ads").delete().eq("id", data.id);

      if (error) {
        throw new Error(error.message || "Failed to delete ad.");
      }

      return { success: true, id: data.id };
    } catch (err: any) {
      console.error("adminDeleteAd error:", err);
      throw new Error(err?.message || "Failed to delete ad.");
    }
  });
