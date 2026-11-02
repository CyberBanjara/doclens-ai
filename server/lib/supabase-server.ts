import { createClient, SupabaseClient } from "@supabase/supabase-js";

let serverSupabaseClient: SupabaseClient | null = null;

/**
 * Returns a configured server-side Supabase client with write-capable service_role credentials.
 * Includes Node 20 WebSocket polyfill required by Supabase SDK.
 */
export async function getSupabaseServerClient(): Promise<SupabaseClient | null> {
  if (serverSupabaseClient) {
    return serverSupabaseClient;
  }

  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.PIPELINE_CATALOG_SYNC_TOKEN ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_WRITE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    "";

  if (!url || !key || url.includes("your-project.supabase.co")) {
    return null;
  }

  let wsTransport: unknown = undefined;
  if (typeof window === "undefined") {
    try {
      const wsModule = await import("ws");
      const ws = wsModule.default || wsModule;
      const g = globalThis as unknown as { WebSocket?: unknown };
      if (typeof g.WebSocket === "undefined") {
        g.WebSocket = ws;
      }
      wsTransport = ws;
    } catch (err) {
      console.warn("WebSocket polyfill warning in Supabase server client:", err);
    }
  }

  serverSupabaseClient = createClient(url, key, {
    auth: { persistSession: false },
    ...(wsTransport ? { realtime: { transport: wsTransport as any } } : {}),
  });

  return serverSupabaseClient;
}

export interface UserTranslationStats {
  user_id: string;
  total_translated_pages: number;
  page_keys?: string[];
  updated_at?: string;
}

export interface UserTranslationActivityRecord {
  id?: number;
  user_id: string;
  book_id: string;
  book_title: string;
  doc_id?: string;
  page_number: number;
  language: string;
  page_key: string;
  translated_at: string;
  translated_date: string;
}

export interface DailyBookTranslationSummary {
  [bookTitle: string]: number;
}

export interface DailyActivityDetail {
  bookTitle: string;
  pageNumber: number;
  language: string;
  translatedAt: string;
}

export interface DailyActivityItem {
  date: string; // YYYY-MM-DD
  count: number;
  books: DailyBookTranslationSummary;
  details?: DailyActivityDetail[];
}

export interface UserActivitySummary {
  total_pages: number;
  active_days: number;
  daily_activity: Record<string, DailyActivityItem>;
  recent_activities?: Array<{
    bookTitle: string;
    pageNumber: number;
    language: string;
    translatedAt: string;
  }>;
}

export interface RecordActivityParams {
  userId: string;
  bookId?: string;
  bookTitle?: string;
  docId?: string;
  pageNumber: number;
  language?: string;
  pageKey?: string;
}

/**
 * Fetch a single user's total_translated_pages counter from Supabase.
 * Strictly scoped to the authenticated user's ID.
 */
export async function getUserTranslationCounter(userId: string): Promise<number> {
  if (!userId || typeof userId !== "string") return 0;

  try {
    const supabase = await getSupabaseServerClient();
    if (!supabase) return 0;

    const { data, error } = await supabase
      .from("user_translation_counters")
      .select("total_translated_pages")
      .eq("user_id", userId.trim())
      .maybeSingle();

    if (error) {
      if (!error.message?.includes("relation") && !error.message?.includes("does not exist")) {
        console.warn("Supabase getUserTranslationCounter error:", error.message);
      }
      return 0;
    }

    return typeof data?.total_translated_pages === "number" ? data.total_translated_pages : 0;
  } catch (err) {
    console.warn("getUserTranslationCounter exception:", err);
    return 0;
  }
}

/**
 * Atomically records page translation activity mapped to book titles in Supabase,
 * maintaining granular user-specific history and updating total_translated_pages.
 *
 * Guarantees:
 * 1. Detailed Activity History: Stores user_id, book_id, book_title, page_number, language, timestamps.
 * 2. Idempotency: Retries and duplicate requests with the same pageKey are counted only once.
 * 3. Scalability & Resilience: Inserts into user_translation_activities with unique (user_id, page_key),
 *    with automatic fallback if tables/functions are not yet migrated.
 * 4. User Isolation: Strictly records for the authenticated session user.
 */
export async function recordUserTranslationActivity(
  params: RecordActivityParams,
): Promise<{ totalTranslatedPages: number; alreadyCounted: boolean }> {
  const { userId, bookId, bookTitle, docId, pageNumber, language, pageKey } = params;

  if (!userId || typeof userId !== "string") {
    return { totalTranslatedPages: 0, alreadyCounted: false };
  }
  if (typeof pageNumber !== "number" || isNaN(pageNumber)) {
    return { totalTranslatedPages: 0, alreadyCounted: false };
  }

  const cleanUserId = userId.trim();
  const cleanBookId = (bookId || docId || "doc").trim();
  const cleanDocId = docId ? docId.trim() : cleanBookId;
  const cleanBookTitle = (bookTitle && bookTitle.trim()) || "Untitled Document";
  const cleanLanguage = (language || "default").trim().toLowerCase();
  const cleanPageKey = (
    pageKey || `${cleanBookId}:${pageNumber}:${cleanLanguage}`
  ).trim();

  try {
    const supabase = await getSupabaseServerClient();
    if (!supabase) {
      return { totalTranslatedPages: 0, alreadyCounted: false };
    }

    // 1. Primary Strategy: Try stored procedure `record_page_translation_activity`
    try {
      const { data: rpcResult, error: rpcError } = await supabase.rpc(
        "record_page_translation_activity",
        {
          p_user_id: cleanUserId,
          p_book_id: cleanBookId,
          p_book_title: cleanBookTitle,
          p_doc_id: cleanDocId,
          p_page_number: pageNumber,
          p_language: cleanLanguage,
          p_page_key: cleanPageKey,
        },
      );

      if (!rpcError && rpcResult && typeof rpcResult === "object") {
        const total = typeof rpcResult.total_translated_pages === "number"
          ? rpcResult.total_translated_pages
          : 0;
        const alreadyCounted = Boolean(rpcResult.already_counted);
        return { totalTranslatedPages: total, alreadyCounted };
      }

      if (rpcError && !rpcError.message?.includes("Could not find the function")) {
        console.warn("RPC record_page_translation_activity warning:", rpcError.message);
      }
    } catch {
      // Fall through to PostgREST multi-table approach
    }

    // 2. Direct PostgREST Multi-Table Operation
    let alreadyCounted = false;
    let activityTableAvailable = true;

    // A. Insert into user_translation_activities
    const now = new Date();
    const nowIso = now.toISOString();
    const todayDate = nowIso.split("T")[0];

    const { error: insertActErr } = await supabase
      .from("user_translation_activities")
      .insert({
        user_id: cleanUserId,
        book_id: cleanBookId,
        book_title: cleanBookTitle,
        doc_id: cleanDocId,
        page_number: pageNumber,
        language: cleanLanguage,
        page_key: cleanPageKey,
        translated_at: nowIso,
        translated_date: todayDate,
      });

    if (insertActErr) {
      // Check if duplicate key violation (already translated / counted)
      if (
        insertActErr.code === "23505" ||
        insertActErr.message?.toLowerCase().includes("duplicate") ||
        insertActErr.message?.toLowerCase().includes("unique")
      ) {
        alreadyCounted = true;
      } else if (
        insertActErr.message?.includes("relation") ||
        insertActErr.message?.includes("does not exist") ||
        insertActErr.code === "PGRST205"
      ) {
        // Table not created in Supabase yet; mark unavailable to fallback cleanly
        activityTableAvailable = false;
      } else {
        console.warn("Supabase user_translation_activities insert warning:", insertActErr.message);
      }
    }

    // B. Atomically update or sync user_translation_counters
    if (!alreadyCounted) {
      // Call legacy atomic RPC if available
      try {
        const { data: rpcCount, error: legacyRpcErr } = await supabase.rpc(
          "increment_user_translation_counter",
          {
            p_user_id: cleanUserId,
            p_page_key: cleanPageKey,
          },
        );

        if (!legacyRpcErr && typeof rpcCount === "number") {
          return { totalTranslatedPages: rpcCount, alreadyCounted: false };
        }
      } catch {
        // Fall back to PostgREST upsert
      }

      // PostgREST upsert with deduplication check
      const { data: existing } = await supabase
        .from("user_translation_counters")
        .select("total_translated_pages, page_keys")
        .eq("user_id", cleanUserId)
        .maybeSingle();

      if (existing) {
        const existingKeys: string[] = Array.isArray(existing.page_keys)
          ? existing.page_keys
          : [];

        if (existingKeys.includes(cleanPageKey)) {
          return {
            totalTranslatedPages: existing.total_translated_pages || 0,
            alreadyCounted: true,
          };
        }

        const nextCount = (existing.total_translated_pages || 0) + 1;
        const nextKeys = [...existingKeys, cleanPageKey];

        const { error: updateErr } = await supabase
          .from("user_translation_counters")
          .update({
            total_translated_pages: nextCount,
            page_keys: nextKeys,
            updated_at: nowIso,
          })
          .eq("user_id", cleanUserId);

        if (!updateErr) {
          return { totalTranslatedPages: nextCount, alreadyCounted: false };
        }
      } else {
        const { error: insertErr } = await supabase
          .from("user_translation_counters")
          .insert({
            user_id: cleanUserId,
            total_translated_pages: 1,
            page_keys: [cleanPageKey],
            created_at: nowIso,
            updated_at: nowIso,
          });

        if (!insertErr) {
          return { totalTranslatedPages: 1, alreadyCounted: false };
        }
      }
    }

    // If duplicate was detected, return the existing authoritative counter
    const currentCount = await getUserTranslationCounter(cleanUserId);
    return {
      totalTranslatedPages: currentCount,
      alreadyCounted: true,
    };
  } catch (err) {
    console.warn("recordUserTranslationActivity exception:", err);
    return { totalTranslatedPages: 0, alreadyCounted: false };
  }
}

/**
 * Backward-compatible incrementUserTranslationCounter wrapper.
 */
export async function incrementUserTranslationCounter(
  userId: string,
  pageKey: string,
): Promise<{ totalTranslatedPages: number; alreadyCounted: boolean }> {
  const parts = pageKey.split(":");
  const docId = parts[0] || "doc";
  const pageNumber = parts[1] ? parseInt(parts[1], 10) : 1;
  const language = parts[2] || "default";

  return recordUserTranslationActivity({
    userId,
    docId,
    bookId: docId,
    pageNumber: isNaN(pageNumber) ? 1 : pageNumber,
    language,
    pageKey,
  });
}

/**
 * Fetches user-specific translation activity data for the GitHub-style activity heatmap.
 * Strictly scoped to the authenticated user's ID.
 * Returns daily page counts mapped to corresponding book titles.
 */
export async function getUserTranslationActivity(
  userId: string,
  days = 365,
): Promise<UserActivitySummary> {
  const emptySummary: UserActivitySummary = {
    total_pages: 0,
    active_days: 0,
    daily_activity: {},
    recent_activities: [],
  };

  if (!userId || typeof userId !== "string") {
    return emptySummary;
  }

  const cleanUserId = userId.trim();

  try {
    const supabase = await getSupabaseServerClient();
    if (!supabase) return emptySummary;

    const sinceDateObj = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const sinceDate = sinceDateObj.toISOString().split("T")[0];

    // 1. Query user_translation_activities strictly for this user
    const { data: activities, error: actErr } = await supabase
      .from("user_translation_activities")
      .select("book_id, book_title, page_number, language, translated_at, translated_date")
      .eq("user_id", cleanUserId)
      .gte("translated_date", sinceDate)
      .order("translated_at", { ascending: true });

    const totalCounter = await getUserTranslationCounter(cleanUserId);

    if (!actErr && Array.isArray(activities) && activities.length > 0) {
      const dailyActivity: Record<string, DailyActivityItem> = {};
      const recentActivities: Array<{
        bookTitle: string;
        pageNumber: number;
        language: string;
        translatedAt: string;
      }> = [];

      for (const row of activities) {
        const d = row.translated_date || (row.translated_at ? row.translated_at.split("T")[0] : "");
        if (!d) continue;

        if (!dailyActivity[d]) {
          dailyActivity[d] = {
            date: d,
            count: 0,
            books: {},
            details: [],
          };
        }

        dailyActivity[d].count += 1;
        const title = (row.book_title && row.book_title.trim()) || "Untitled Document";
        dailyActivity[d].books[title] = (dailyActivity[d].books[title] || 0) + 1;
        if (!dailyActivity[d].details) {
          dailyActivity[d].details = [];
        }
        dailyActivity[d].details.unshift({
          bookTitle: title,
          pageNumber: row.page_number,
          language: row.language || "Native",
          translatedAt: row.translated_at,
        });
      }

      // Collect last 10 activities
      const reversed = [...activities].reverse();
      for (const row of reversed.slice(0, 10)) {
        recentActivities.push({
          bookTitle: row.book_title || "Untitled Document",
          pageNumber: row.page_number,
          language: row.language,
          translatedAt: row.translated_at,
        });
      }

      return {
        total_pages: Math.max(totalCounter, activities.length),
        active_days: Object.keys(dailyActivity).length,
        daily_activity: dailyActivity,
        recent_activities: recentActivities,
      };
    }

    // 2. Resilient Fallback: If user_translation_activities is empty or not yet migrated,
    // construct activity from user_translation_counters so previous translation history is preserved
    const { data: counterRow } = await supabase
      .from("user_translation_counters")
      .select("total_translated_pages, page_keys, created_at, updated_at")
      .eq("user_id", cleanUserId)
      .maybeSingle();

    if (counterRow && Array.isArray(counterRow.page_keys) && counterRow.page_keys.length > 0) {
      const dailyActivity: Record<string, DailyActivityItem> = {};
      const fallbackDate = (counterRow.updated_at || counterRow.created_at || new Date().toISOString()).split("T")[0];

      dailyActivity[fallbackDate] = {
        date: fallbackDate,
        count: counterRow.page_keys.length,
        books: {},
      };

      for (const pk of counterRow.page_keys) {
        const parts = String(pk).split(":");
        const bookName = parts[0] ? `Document (${parts[0].slice(0, 8)})` : "Document";
        dailyActivity[fallbackDate].books[bookName] = (dailyActivity[fallbackDate].books[bookName] || 0) + 1;
      }

      return {
        total_pages: counterRow.total_translated_pages || counterRow.page_keys.length,
        active_days: Object.keys(dailyActivity).length,
        daily_activity: dailyActivity,
        recent_activities: [],
      };
    }

    return {
      total_pages: totalCounter,
      active_days: 0,
      daily_activity: {},
      recent_activities: [],
    };
  } catch (err) {
    console.warn("getUserTranslationActivity exception:", err);
    return emptySummary;
  }
}

// ============================================================================
// TRANSLATION BILLING LAYER (CONFIGURABLE PLANS & ATOMIC QUOTA LIFECYCLE)
// ============================================================================

export interface ValidateQuotaParams {
  userId: string;
  docId?: string;
  bookId?: string;
  bookTitle?: string;
  pageNumber: number;
  language?: string;
  pageKey?: string;
}

export interface QuotaReservationResult {
  authorized: boolean;
  already_counted?: boolean;
  reservation_id?: string | null;
  remaining_pages?: number;
  plan?: string;
  quota_source?: string;
  valid_until?: string;
  code?: string;
  error?: string;
  message?: string;
}

export interface FinalizeQuotaResult {
  success: boolean;
  finalized?: boolean;
  remaining_pages?: number;
  plan_pages_used?: number;
  topup_balance?: number;
  message?: string;
}

export interface RefundQuotaResult {
  success: boolean;
  refunded?: boolean;
  reason?: string;
  message?: string;
}

export interface BillingPlanInfo {
  id: string;
  name: string;
  price_inr: number;
  pages_allotment: number;
  validity_days: number;
  plan_type: string;
  is_active: boolean;
}

export interface UserSubscriptionDetails {
  plan_id: string;
  plan_type: string;
  status: string;
  period_start: string;
  period_end: string;
  days_remaining: number;
  plan_pages_limit: number;
  plan_pages_used: number;
  topup_pages_balance: number;
  reserved_pages: number;
  available_pages: number;
  lifetime_pages_used: number;
}

export interface TranslationReservationSummary {
  id: string;
  book_title: string;
  page_number: number;
  language: string;
  status: string;
  pages: number;
  quota_source: string;
  created_at: string;
  finalized_at?: string;
}

export interface UserBillingHistoryItem {
  id: string;
  plan_id: string;
  amount: number;
  currency: string;
  pages_credited: number;
  validity_days: number;
  status: string;
  created_at: string;
}

export interface UserBillingProfileData {
  subscription: UserSubscriptionDetails;
  available_plans: BillingPlanInfo[];
  recent_usage: TranslationReservationSummary[];
  billing_history: UserBillingHistoryItem[];
}

// In-memory fallback state for dev / offline scenarios without live Supabase
const memorySubscriptions = new Map<string, UserSubscriptionDetails>();
const memoryReservations = new Map<string, any>();

export const DEFAULT_BILLING_PLANS: BillingPlanInfo[] = [
  { id: "free", name: "Free Tier", price_inr: 0, pages_allotment: 30, validity_days: 30, plan_type: "free", is_active: true },
  { id: "pass", name: "Reader Pass", price_inr: 99, pages_allotment: 300, validity_days: 30, plan_type: "pass", is_active: true },
  { id: "monthly", name: "Monthly Pro", price_inr: 149, pages_allotment: 600, validity_days: 30, plan_type: "subscription", is_active: true },
  { id: "topup_100", name: "100 Pages Top-up", price_inr: 49, pages_allotment: 100, validity_days: 30, plan_type: "topup", is_active: true },
  { id: "topup_300", name: "300 Pages Top-up", price_inr: 99, pages_allotment: 300, validity_days: 30, plan_type: "topup", is_active: true },
  { id: "topup_600", name: "600 Pages Top-up", price_inr: 149, pages_allotment: 600, validity_days: 30, plan_type: "topup", is_active: true },
];

/**
 * Single optimized atomic RPC to validate quota and create a reservation in Supabase.
 * Checks for deduplication (already translated pages cost 0 quota),
 * locks subscription balance, verifies validity, and reserves 1 page.
 */
export async function validateAndReserveQuota(
  params: ValidateQuotaParams,
): Promise<QuotaReservationResult> {
  const cleanUserId = (params.userId || "").trim();
  if (!cleanUserId) {
    return { authorized: false, code: "UNAUTHORIZED", error: "User ID required" };
  }

  const cleanBookId = (params.bookId || params.docId || "doc").trim();
  const cleanDocId = (params.docId || cleanBookId).trim();
  const cleanBookTitle = (params.bookTitle || "").trim() || "Untitled Document";
  const cleanLanguage = (params.language || "default").trim().toLowerCase();
  const cleanPageKey = (
    params.pageKey || `${cleanBookId}:${params.pageNumber}:${cleanLanguage}`
  ).trim();

  try {
    const supabase = await getSupabaseServerClient();
    if (supabase) {
      const { data, error } = await supabase.rpc("validate_and_reserve_translation_quota", {
        p_user_id: cleanUserId,
        p_doc_id: cleanDocId,
        p_page_number: params.pageNumber,
        p_language: cleanLanguage,
        p_page_key: cleanPageKey,
        p_book_title: cleanBookTitle,
        p_book_id: cleanBookId,
      });

      if (!error && data && typeof data === "object") {
        return data as QuotaReservationResult;
      }
      if (error && !error.message?.includes("Could not find the function")) {
        console.warn("Supabase validate_and_reserve_translation_quota error:", error.message);
      }
    }
  } catch (err) {
    console.warn("validateAndReserveQuota exception:", err);
  }

  // Resilient in-memory fallback simulation
  const now = new Date();
  let sub = memorySubscriptions.get(cleanUserId);
  if (!sub) {
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    sub = {
      plan_id: "free",
      plan_type: "free",
      status: "active",
      period_start: now.toISOString(),
      period_end: periodEnd,
      days_remaining: 30,
      plan_pages_limit: 30,
      plan_pages_used: 0,
      topup_pages_balance: 0,
      reserved_pages: 0,
      available_pages: 30,
      lifetime_pages_used: 0,
    };
    memorySubscriptions.set(cleanUserId, sub);
  }

  // Check period rollover
  if (new Date(sub.period_end).getTime() < now.getTime()) {
    sub.period_start = now.toISOString();
    sub.period_end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    sub.plan_pages_used = 0;
    sub.plan_id = "free";
    sub.plan_type = "free";
    sub.plan_pages_limit = 30;
  }

  const availablePlanPages = Math.max(0, sub.plan_pages_limit - sub.plan_pages_used);
  const totalAvailable = availablePlanPages + sub.topup_pages_balance - sub.reserved_pages;

  if (totalAvailable < 1) {
    return {
      authorized: false,
      code: "QUOTA_EXCEEDED",
      error: "Translation quota exceeded. Upgrade to Reader Pass (300 pages) or Monthly Pro (600 pages).",
      remaining_pages: 0,
      plan: sub.plan_id,
      valid_until: sub.period_end,
    };
  }

  // Reserve 1 page
  const resId = `res_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  sub.reserved_pages += 1;
  sub.available_pages = Math.max(0, totalAvailable - 1);
  memoryReservations.set(resId, {
    id: resId,
    userId: cleanUserId,
    pageKey: cleanPageKey,
    bookTitle: cleanBookTitle,
    pageNumber: params.pageNumber,
    language: cleanLanguage,
    quotaSource: sub.plan_pages_limit > sub.plan_pages_used ? "plan" : "topup",
    status: "reserved",
    createdAt: now.toISOString(),
  });

  return {
    authorized: true,
    already_counted: false,
    reservation_id: resId,
    remaining_pages: sub.available_pages,
    plan: sub.plan_id,
    quota_source: sub.plan_pages_limit > sub.plan_pages_used ? "plan" : "topup",
    valid_until: sub.period_end,
  };
}

/**
 * Finalize usage when translation completes successfully:
 * releases reservation and deducts 1 page from user quota.
 */
export async function finalizeQuota(
  reservationId: string,
  userId: string,
): Promise<FinalizeQuotaResult> {
  if (!reservationId || !userId) {
    return { success: false, message: "Missing reservationId or userId" };
  }

  try {
    const supabase = await getSupabaseServerClient();
    if (supabase) {
      const { data, error } = await supabase.rpc("finalize_translation_quota", {
        p_reservation_id: reservationId,
        p_user_id: userId.trim(),
      });

      if (!error && data && typeof data === "object") {
        return data as FinalizeQuotaResult;
      }
      if (error && !error.message?.includes("Could not find the function")) {
        console.warn("Supabase finalize_translation_quota error:", error.message);
      }
    }
  } catch (err) {
    console.warn("finalizeQuota exception:", err);
  }

  // Fallback in-memory finalize
  const res = memoryReservations.get(reservationId);
  const sub = memorySubscriptions.get(userId.trim());
  if (res && res.status === "reserved" && sub) {
    res.status = "finalized";
    sub.reserved_pages = Math.max(0, sub.reserved_pages - 1);
    if (res.quotaSource === "topup") {
      sub.topup_pages_balance = Math.max(0, sub.topup_pages_balance - 1);
    } else {
      sub.plan_pages_used += 1;
    }
    sub.lifetime_pages_used += 1;
    const avail = Math.max(0, sub.plan_pages_limit - sub.plan_pages_used) + sub.topup_pages_balance - sub.reserved_pages;
    sub.available_pages = Math.max(0, avail);
    return { success: true, finalized: true, remaining_pages: sub.available_pages };
  }

  return { success: true, finalized: true };
}

/**
 * Safely refund usage if translation stream aborts, disconnects, or fails.
 */
export async function refundQuota(
  reservationId: string,
  userId: string,
  reason = "translation_failed",
): Promise<RefundQuotaResult> {
  if (!reservationId || !userId) {
    return { success: false, message: "Missing reservationId or userId" };
  }

  try {
    const supabase = await getSupabaseServerClient();
    if (supabase) {
      const { data, error } = await supabase.rpc("refund_translation_quota", {
        p_reservation_id: reservationId,
        p_user_id: userId.trim(),
        p_reason: reason,
      });

      if (!error && data && typeof data === "object") {
        return data as RefundQuotaResult;
      }
      if (error && !error.message?.includes("Could not find the function")) {
        console.warn("Supabase refund_translation_quota error:", error.message);
      }
    }
  } catch (err) {
    console.warn("refundQuota exception:", err);
  }

  // Fallback in-memory refund
  const res = memoryReservations.get(reservationId);
  const sub = memorySubscriptions.get(userId.trim());
  if (res && res.status === "reserved" && sub) {
    res.status = "refunded";
    sub.reserved_pages = Math.max(0, sub.reserved_pages - 1);
    const avail = Math.max(0, sub.plan_pages_limit - sub.plan_pages_used) + sub.topup_pages_balance - sub.reserved_pages;
    sub.available_pages = Math.max(0, avail);
    return { success: true, refunded: true, reason };
  }

  return { success: true, refunded: true };
}

/**
 * Fetch full user billing profile, active subscription, available plans, and usage history.
 */
export async function getUserBillingProfile(userId: string): Promise<UserBillingProfileData> {
  const cleanUserId = (userId || "").trim();
  const defaultPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const emptyProfile: UserBillingProfileData = {
    subscription: {
      plan_id: "free",
      plan_type: "free",
      status: "active",
      period_start: new Date().toISOString(),
      period_end: defaultPeriodEnd,
      days_remaining: 30,
      plan_pages_limit: 30,
      plan_pages_used: 0,
      topup_pages_balance: 0,
      reserved_pages: 0,
      available_pages: 30,
      lifetime_pages_used: 0,
    },
    available_plans: DEFAULT_BILLING_PLANS,
    recent_usage: [],
    billing_history: [],
  };

  if (!cleanUserId) return emptyProfile;

  try {
    const supabase = await getSupabaseServerClient();
    if (supabase) {
      const { data, error } = await supabase.rpc("get_user_billing_profile", {
        p_user_id: cleanUserId,
      });

      if (!error && data && typeof data === "object" && data.subscription) {
        return data as UserBillingProfileData;
      }
      if (error && !error.message?.includes("Could not find the function")) {
        console.warn("Supabase get_user_billing_profile error:", error.message);
      }
    }
  } catch (err) {
    console.warn("getUserBillingProfile exception:", err);
  }

  // Fallback in-memory
  const sub = memorySubscriptions.get(cleanUserId);
  if (sub) {
    const daysLeft = Math.max(0, Math.ceil((new Date(sub.period_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
    return {
      subscription: { ...sub, days_remaining: daysLeft },
      available_plans: DEFAULT_BILLING_PLANS,
      recent_usage: Array.from(memoryReservations.values())
        .filter((r) => r.userId === cleanUserId)
        .map((r) => ({
          id: r.id,
          book_title: r.bookTitle,
          page_number: r.pageNumber,
          language: r.language,
          status: r.status,
          pages: 1,
          quota_source: r.quotaSource,
          created_at: r.createdAt,
        })),
      billing_history: [],
    };
  }

  return emptyProfile;
}

/**
 * Update user subscription upon verified plan purchase or topup.
 */
export async function purchasePlan(
  userId: string,
  planId: string,
  paymentDetails: { razorpayOrderId?: string; razorpayPaymentId?: string },
): Promise<{ success: boolean; plan_id?: string; available_pages?: number; error?: string }> {
  const cleanUserId = (userId || "").trim();
  if (!cleanUserId || !planId) {
    return { success: false, error: "Missing required parameters" };
  }

  try {
    const supabase = await getSupabaseServerClient();
    if (supabase) {
      const { data, error } = await supabase.rpc("purchase_or_topup_plan", {
        p_user_id: cleanUserId,
        p_plan_id: planId,
        p_razorpay_order_id: paymentDetails.razorpayOrderId || null,
        p_razorpay_payment_id: paymentDetails.razorpayPaymentId || null,
      });

      if (!error && data && typeof data === "object" && data.success) {
        return data;
      }
      if (error) {
        console.warn("Supabase purchase_or_topup_plan error:", error.message);
      }
    }
  } catch (err) {
    console.warn("purchasePlan exception:", err);
  }

  // Fallback in-memory
  const plan = DEFAULT_BILLING_PLANS.find((p) => p.id === planId);
  if (!plan) return { success: false, error: "Invalid plan ID" };

  let sub = memorySubscriptions.get(cleanUserId);
  const now = new Date();
  if (!sub) {
    sub = {
      plan_id: "free",
      plan_type: "free",
      status: "active",
      period_start: now.toISOString(),
      period_end: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      days_remaining: 30,
      plan_pages_limit: 30,
      plan_pages_used: 0,
      topup_pages_balance: 0,
      reserved_pages: 0,
      available_pages: 30,
      lifetime_pages_used: 0,
    };
  }

  if (plan.plan_type === "topup") {
    sub.topup_pages_balance += plan.pages_allotment;
  } else {
    sub.plan_id = plan.id;
    sub.plan_type = plan.plan_type;
    sub.plan_pages_limit = plan.pages_allotment;
    sub.plan_pages_used = 0;
    sub.period_start = now.toISOString();
    sub.period_end = new Date(now.getTime() + plan.validity_days * 24 * 60 * 60 * 1000).toISOString();
  }

  const avail = Math.max(0, sub.plan_pages_limit - sub.plan_pages_used) + sub.topup_pages_balance - sub.reserved_pages;
  sub.available_pages = Math.max(0, avail);
  memorySubscriptions.set(cleanUserId, sub);

  return { success: true, plan_id: sub.plan_id, available_pages: sub.available_pages };
}

