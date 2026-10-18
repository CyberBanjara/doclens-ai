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
      // Gracefully handle table not created yet or network issues
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
 * Atomically increments the user's total_translated_pages counter in Supabase.
 *
 * Guarantees:
 * 1. Single counter per user (user_translation_counters table).
 * 2. Idempotency: Retries and duplicate requests with the same pageKey are counted only once.
 * 3. Atomic execution: Uses the PostgreSQL increment_user_translation_counter stored procedure,
 *    falling back to PostgREST upsert with deduplication check.
 * 4. Isolation: Only modifies the authenticated user's row.
 */
export async function incrementUserTranslationCounter(
  userId: string,
  pageKey: string,
): Promise<{ totalTranslatedPages: number; alreadyCounted: boolean }> {
  if (!userId || typeof userId !== "string") {
    return { totalTranslatedPages: 0, alreadyCounted: false };
  }
  if (!pageKey || typeof pageKey !== "string") {
    return { totalTranslatedPages: 0, alreadyCounted: false };
  }

  const cleanUserId = userId.trim();
  const cleanPageKey = pageKey.trim();

  try {
    const supabase = await getSupabaseServerClient();
    if (!supabase) {
      return { totalTranslatedPages: 0, alreadyCounted: false };
    }

    // 1. Primary Strategy: Call atomic PostgreSQL stored procedure
    try {
      const { data: rpcCount, error: rpcError } = await supabase.rpc(
        "increment_user_translation_counter",
        {
          p_user_id: cleanUserId,
          p_page_key: cleanPageKey,
        },
      );

      if (!rpcError && typeof rpcCount === "number") {
        return { totalTranslatedPages: rpcCount, alreadyCounted: false };
      }

      // If error is not "function does not exist", log warning
      if (rpcError && !rpcError.message?.includes("Could not find the function")) {
        console.warn("RPC increment_user_translation_counter warning:", rpcError.message);
      }
    } catch (rpcEx) {
      // Fall through to PostgREST fallback
    }

    // 2. PostgREST Fallback with atomic check & deduplication
    const { data: existing, error: selectErr } = await supabase
      .from("user_translation_counters")
      .select("total_translated_pages, page_keys")
      .eq("user_id", cleanUserId)
      .maybeSingle();

    if (selectErr) {
      if (
        !selectErr.message?.includes("relation") &&
        !selectErr.message?.includes("does not exist")
      ) {
        console.warn("Supabase select user counter warning:", selectErr.message);
      }
      return { totalTranslatedPages: 0, alreadyCounted: false };
    }

    const nowIso = new Date().toISOString();

    if (existing) {
      const existingKeys: string[] = Array.isArray(existing.page_keys) ? existing.page_keys : [];
      // Deduplication: If this exact translation was already processed, do not increment again!
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

      if (updateErr) {
        console.warn("Supabase update counter error:", updateErr.message);
        return {
          totalTranslatedPages: existing.total_translated_pages || 0,
          alreadyCounted: false,
        };
      }

      return { totalTranslatedPages: nextCount, alreadyCounted: false };
    } else {
      // Create initial record with count = 1
      const { error: insertErr } = await supabase.from("user_translation_counters").insert({
        user_id: cleanUserId,
        total_translated_pages: 1,
        page_keys: [cleanPageKey],
        created_at: nowIso,
        updated_at: nowIso,
      });

      if (insertErr) {
        console.warn("Supabase insert counter error:", insertErr.message);
        return { totalTranslatedPages: 0, alreadyCounted: false };
      }

      return { totalTranslatedPages: 1, alreadyCounted: false };
    }
  } catch (err) {
    console.warn("incrementUserTranslationCounter exception:", err);
    return { totalTranslatedPages: 0, alreadyCounted: false };
  }
}
