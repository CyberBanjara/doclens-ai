import { createClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { isGlobalSyncEnabled } from "./env";

/**
 * ============================================================================
 * SUPABASE CLIENT FACTORY & CREDENTIAL SEPARATION
 * ----------------------------------------------------------------------------
 * Read operations: strictly use read-only Supabase publishable key (VITE_SUPABASE_PUBLISHABLE_KEY).
 * Write operations: strictly require and use write-capable secret key (PIPELINE_CATALOG_SYNC_TOKEN).
 * ============================================================================
 */

/**
 * Layer 2 Verification & Credential Separation:
 * - Read operations: strictly use read-only Supabase publishable key (VITE_SUPABASE_PUBLISHABLE_KEY).
 * - Write operations: strictly require and use write-capable secret key (PIPELINE_CATALOG_SYNC_TOKEN).
 */
async function getSupabaseClient({ writeAccess = false }: { writeAccess?: boolean } = {}) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  let key = "";

  if (writeAccess) {
    // Layer 2: Verify and load dedicated server-side write credential
    key =
      process.env.PIPELINE_CATALOG_SYNC_TOKEN ||
      process.env.SUPABASE_WRITE_KEY ||
      process.env.SUPABASE_SECRET_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      "";

    if (!key) {
      throw new Error(
        "Unauthorized [Layer 2 Failed]: Missing write-capable database token (PIPELINE_CATALOG_SYNC_TOKEN / SUPABASE_SECRET_KEY).",
      );
    }
  } else {
    // Read-only access credentials: strictly limited to reading public data
    key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "";
  }

  if (!url || !key || url.includes("your-project.supabase.co")) {
    return null;
  }

  // Node.js 20 WebSocket polyfill for Supabase Realtime/SDK requirements
  let wsTransport: any = undefined;
  if (typeof window === "undefined") {
    try {
      const wsModule = await import("ws");
      const ws = wsModule.default || wsModule;
      if (typeof globalThis.WebSocket === "undefined") {
        globalThis.WebSocket = ws as any;
      }
      wsTransport = ws;
    } catch (err) {
      console.warn("WebSocket polyfill warning in Supabase client:", err);
    }
  }

  return createClient(url, key, {
    auth: { persistSession: false },
    ...(wsTransport ? { realtime: { transport: wsTransport } } : {}),
  });
}

/**
 * ============================================================================
 * MULTI-TABLE LANGUAGE STORAGE SERVER FUNCTIONS
 * ============================================================================
 * Dedicated per-language tables: translations_hindi, translations_telugu, etc.
 * Single source of truth for language availability: book_languages table
 * Key invariant: Same book + Same language = Reuse existing page and never process again.
 */

import {
  getLanguageTableName,
  getLanguageSlug,
  getLanguageInfoFromSlug,
  SUPPORTED_TRANSLATION_SLUGS,
  normalizeBookCandidates,
} from "./languageTableMap";

/**
 * Fetches all available translation languages and their translated page lists for a specific book.
 * Queries the book_languages metadata table (which contains pages: integer[] and translated_count),
 * with a resilient fallback across dedicated translation tables if book_languages is empty.
 */
export const fetchAvailableLanguagesForBook = createServerFn({ method: "POST" })
  .validator((input: { bookId: string; docId?: string }) => input)
  .handler(async ({ data }) => {
    "use server";
    if (!isGlobalSyncEnabled()) {
      return { found: false, languages: [], languageDetails: [] };
    }
    try {
      const supabase = await getSupabaseClient({ writeAccess: false });
      if (!supabase) {
        return {
          found: false,
          languages: [],
          languageDetails: [],
          error: "Supabase client not configured.",
        };
      }

      const { candidateIds } = normalizeBookCandidates(data.bookId, data.docId);
      const langMap = new Map<string, { pages: number[]; count: number }>();

      // 1. Primary lookup: book_languages metadata table
      const { data: records, error: metaErr } = await supabase
        .from("book_languages")
        .select("language, pages, translated_count")
        .in("book_id", candidateIds);

      if (!metaErr && records && records.length > 0) {
        for (const r of records) {
          if (r.language && typeof r.language === "string") {
            const slug = getLanguageSlug(r.language);
            const pageList: number[] = Array.isArray(r.pages)
              ? r.pages.filter((n: any) => typeof n === "number" && n > 0)
              : [];
            const count =
              typeof r.translated_count === "number" && r.translated_count > 0
                ? r.translated_count
                : pageList.length;

            const existing = langMap.get(slug);
            if (existing) {
              const mergedPages = Array.from(new Set([...existing.pages, ...pageList])).sort(
                (a, b) => a - b,
              );
              langMap.set(slug, {
                pages: mergedPages,
                count: Math.max(existing.count, count, mergedPages.length),
              });
            } else {
              langMap.set(slug, { pages: pageList.sort((a, b) => a - b), count });
            }
          }
        }
      }

      // 2. Fallback / supplementary check across translation tables if book_languages is empty
      if (langMap.size === 0) {
        await Promise.all(
          SUPPORTED_TRANSLATION_SLUGS.map(async (slug) => {
            try {
              const tableName = `translations_${slug}`;
              const { data: pageRows } = await supabase
                .from(tableName)
                .select("page_number")
                .in("book_id", candidateIds);

              if (pageRows && pageRows.length > 0) {
                const pages = Array.from(
                  new Set(pageRows.map((r) => r.page_number).filter((p) => p > 0)),
                ).sort((a, b) => a - b);
                langMap.set(slug, { pages, count: pages.length });
              }
            } catch {
              // Ignore individual table lookup errors
            }
          }),
        );
      }

      const languages = Array.from(langMap.keys());
      const languageDetails = languages.map((slug) => {
        const info = getLanguageInfoFromSlug(slug);
        const langData = langMap.get(slug);
        const pages = langData?.pages || [];
        const translatedCount = langData?.count || pages.length;
        return {
          ...info,
          slug,
          pages,
          translatedCount,
        };
      });

      return {
        found: languages.length > 0,
        languages,
        languageDetails,
      };
    } catch (e: any) {
      console.warn("Supabase fetchAvailableLanguagesForBook exception:", e?.message || String(e));
      return { found: false, languages: [], languageDetails: [], error: e?.message || String(e) };
    }
  });

/**
 * Fetches a single page's translation/content from the dedicated language table.
 */
export const fetchSupabaseLanguagePage = createServerFn({ method: "POST" })
  .validator(
    (input: { language: string; bookId: string; pageNumber: number; docId?: string }) => input,
  )
  .handler(async ({ data }) => {
    "use server";
    if (!isGlobalSyncEnabled()) {
      return { found: false };
    }
    try {
      const supabase = await getSupabaseClient({ writeAccess: false });
      if (!supabase) {
        return { found: false, error: "Supabase client not configured." };
      }

      const tableName = getLanguageTableName(data.language);
      const { candidateIds } = normalizeBookCandidates(data.bookId, data.docId);

      const { data: records, error } = await supabase
        .from(tableName)
        .select("content")
        .in("book_id", candidateIds)
        .eq("page_number", data.pageNumber)
        .limit(1);

      if (error) {
        if (!error.message?.includes("relation") && !error.message?.includes("does not exist")) {
          console.warn(`Supabase ${tableName} lookup warning:`, error.message);
        }
        return { found: false, error: error.message };
      }

      if (!records || records.length === 0 || !records[0]?.content) {
        return { found: false };
      }

      return {
        found: true,
        content: records[0].content,
      };
    } catch (e: any) {
      console.warn("Supabase fetchSupabaseLanguagePage exception:", e?.message || String(e));
      return { found: false, error: e?.message || String(e) };
    }
  });

/**
 * Fetches all available pre-translated pages for an entire book from the dedicated language table.
 */
export const fetchSupabaseLanguageBook = createServerFn({ method: "POST" })
  .validator((input: { language: string; bookId: string; docId?: string }) => input)
  .handler(async ({ data }) => {
    "use server";
    if (!isGlobalSyncEnabled()) {
      return { found: false, pages: [] };
    }
    try {
      const supabase = await getSupabaseClient({ writeAccess: false });
      if (!supabase) {
        return { found: false, pages: [], error: "Supabase client not configured." };
      }

      const tableName = getLanguageTableName(data.language);
      const { candidateIds } = normalizeBookCandidates(data.bookId, data.docId);

      const { data: records, error } = await supabase
        .from(tableName)
        .select("page_number, content")
        .in("book_id", candidateIds)
        .order("page_number", { ascending: true });

      if (error) {
        if (!error.message?.includes("relation") && !error.message?.includes("does not exist")) {
          console.warn(`Supabase ${tableName} book lookup warning:`, error.message);
        }
        return { found: false, pages: [], error: error.message };
      }

      if (!records || records.length === 0) {
        return { found: false, pages: [] };
      }

      const pages = records
        .filter((r) => r.page_number > 0 && typeof r.content === "string" && r.content.trim())
        .map((r) => ({
          pageNumber: r.page_number,
          content: r.content,
        }));

      return {
        found: pages.length > 0,
        pages,
      };
    } catch (e: any) {
      console.warn("Supabase fetchSupabaseLanguageBook exception:", e?.message || String(e));
      return { found: false, pages: [], error: e?.message || String(e) };
    }
  });

/**
 * Saves or updates a single translated/explained page in the dedicated language table,
 * and maintains the complete list of translated page numbers in book_languages.
 *
 * Strict Isolation: Writes EXCLUSIVELY to the specified language's table and book_languages row.
 */
export const saveSupabaseLanguagePage = createServerFn({ method: "POST" })
  .validator(
    (input: {
      language: string;
      bookId: string;
      pageNumber: number;
      content: string;
      docId?: string;
    }) => input,
  )
  .handler(async ({ data }) => {
    "use server";
    if (!isGlobalSyncEnabled()) {
      return { success: false, error: "Global sync is disabled in this environment." };
    }
    if (!data.language || !data.bookId || !data.pageNumber || !data.content?.trim()) {
      return { success: false, error: "Missing required parameters to save translated page." };
    }
    try {
      const supabase = await getSupabaseClient({ writeAccess: true });
      if (!supabase) {
        return { success: false, error: "Supabase write credentials not configured." };
      }

      const langSlug = getLanguageSlug(data.language);
      const tableName = getLanguageTableName(data.language);
      const { primaryId } = normalizeBookCandidates(data.bookId, data.docId);
      const nowIso = new Date().toISOString();

      // 1. Strictly write only to this language's dedicated table
      const { error } = await supabase.from(tableName).upsert(
        {
          book_id: primaryId,
          page_number: data.pageNumber,
          content: data.content.trim(),
          updated_at: nowIso,
        },
        { onConflict: "book_id,page_number" },
      );

      if (error) {
        console.warn(`Supabase ${tableName} upsert warning:`, error.message || error);
        return { success: false, error: error.message };
      }

      // 2. Fetch all translated page numbers for (primaryId, langSlug) to maintain complete page list
      const { data: pageRows } = await supabase
        .from(tableName)
        .select("page_number")
        .eq("book_id", primaryId);

      const allPages =
        pageRows && pageRows.length > 0
          ? Array.from(new Set(pageRows.map((r) => r.page_number).filter((p) => p > 0))).sort(
              (a, b) => a - b,
            )
          : [data.pageNumber];

      // 3. Register / update language availability in book_languages with full page list
      void Promise.resolve(
        supabase.from("book_languages").upsert(
          {
            book_id: primaryId,
            language: langSlug,
            pages: allPages,
            translated_count: allPages.length,
            updated_at: nowIso,
          },
          { onConflict: "book_id,language" },
        ),
      ).catch((err: any) => console.warn("book_languages upsert note:", err?.message || err));

      return { success: true, pages: allPages };
    } catch (e: any) {
      console.warn("Supabase saveSupabaseLanguagePage exception:", e?.message || String(e));
      return { success: false, error: e?.message || String(e) };
    }
  });

/**
 * Bulk saves multiple pages in the dedicated language table,
 * and maintains the complete list of translated page numbers in book_languages.
 *
 * Strict Isolation: Writes EXCLUSIVELY to the specified language's table and book_languages row.
 */
export const batchSaveSupabaseLanguagePages = createServerFn({ method: "POST" })
  .validator(
    (input: {
      language: string;
      bookId: string;
      pages: Array<{ pageNumber: number; content: string }>;
      docId?: string;
    }) => input,
  )
  .handler(async ({ data }) => {
    "use server";
    if (!isGlobalSyncEnabled()) {
      return { success: false, error: "Global sync is disabled in this environment." };
    }
    if (!data.pages || data.pages.length === 0) {
      return { success: true, count: 0, pages: [] };
    }

    try {
      const supabase = await getSupabaseClient({ writeAccess: true });
      if (!supabase) {
        return { success: false, error: "Supabase write credentials not configured." };
      }

      const langSlug = getLanguageSlug(data.language);
      const tableName = getLanguageTableName(data.language);
      const { primaryId } = normalizeBookCandidates(data.bookId, data.docId);
      const nowIso = new Date().toISOString();

      const validPages = data.pages.filter((p) => p.pageNumber > 0 && p.content?.trim());
      if (validPages.length === 0) {
        return { success: true, count: 0, pages: [] };
      }

      const rows = validPages.map((p) => ({
        book_id: primaryId,
        page_number: p.pageNumber,
        content: p.content.trim(),
        updated_at: nowIso,
      }));

      // 1. Strictly write only to this language's dedicated table
      const { error } = await supabase
        .from(tableName)
        .upsert(rows, { onConflict: "book_id,page_number" });

      if (error) {
        console.warn(`Supabase ${tableName} batch upsert warning:`, error.message || error);
        return { success: false, error: error.message };
      }

      // 2. Query all existing translated page numbers from the dedicated table
      const { data: pageRows } = await supabase
        .from(tableName)
        .select("page_number")
        .eq("book_id", primaryId);

      const allPages =
        pageRows && pageRows.length > 0
          ? Array.from(new Set(pageRows.map((r) => r.page_number).filter((p) => p > 0))).sort(
              (a, b) => a - b,
            )
          : Array.from(new Set(validPages.map((p) => p.pageNumber))).sort((a, b) => a - b);

      // 3. Register / update language availability in book_languages with full page list
      void Promise.resolve(
        supabase.from("book_languages").upsert(
          {
            book_id: primaryId,
            language: langSlug,
            pages: allPages,
            translated_count: allPages.length,
            updated_at: nowIso,
          },
          { onConflict: "book_id,language" },
        ),
      ).catch((err: any) => console.warn("book_languages batch upsert note:", err?.message || err));

      return { success: true, count: rows.length, pages: allPages };
    } catch (e: any) {
      console.warn("Supabase batchSaveSupabaseLanguagePages exception:", e?.message || String(e));
      return { success: false, error: e?.message || String(e) };
    }
  });
