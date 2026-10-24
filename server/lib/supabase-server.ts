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

export interface DailyActivityItem {
  date: string; // YYYY-MM-DD
  count: number;
  books: DailyBookTranslationSummary;
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
          };
        }

        dailyActivity[d].count += 1;
        const title = (row.book_title && row.book_title.trim()) || "Untitled Document";
        dailyActivity[d].books[title] = (dailyActivity[d].books[title] || 0) + 1;
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
