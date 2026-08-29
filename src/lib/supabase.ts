import { createClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { isGlobalSyncEnabled } from "./env";

async function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key || url.includes("your-project.supabase.co")) {
    return null;
  }

  // Node.js 20 WebSocket polyfill for Supabase Realtime/SDK requirements
  if (typeof window === "undefined" && typeof globalThis.WebSocket === "undefined") {
    try {
      const ws = await import("ws");
      globalThis.WebSocket = ws.default as any;
    } catch (err) {
      console.error("Failed to polyfill WebSocket in Supabase client:", err);
    }
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

export const fetchSupabaseExtraction = createServerFn({ method: "POST" })
  .validator((input: { key: string }) => input)
  .handler(async ({ data }) => {
    "use server";
    if (!isGlobalSyncEnabled()) {
      return { found: false };
    }
    try {
      const supabase = await getSupabaseClient();
      if (!supabase) {
        return {
          found: false,
          error: "Supabase URL or Key is missing from environment variables.",
        };
      }

      const { data: record, error } = await supabase
        .from("pdf_extractions")
        .select("*")
        .eq("id", data.key)
        .maybeSingle();

      if (error) {
        console.warn("Supabase select warning:", error.message || error);
        return { found: false, error: error.message };
      }

      if (!record) {
        return { found: false };
      }

      return {
        found: true,
        record: {
          id: record.id,
          key: record.key,
          size: record.size,
          lastModified: record.last_modified,
          numPages: record.num_pages,
          text: record.text,
          usedOcr: record.used_ocr,
          extractedAt: record.extracted_at,
        },
      };
    } catch (e: any) {
      console.warn("Supabase lookup exception:", e?.message || String(e));
      return { found: false, error: e?.message || String(e) };
    }
  });

export const saveSupabaseExtraction = createServerFn({ method: "POST" })
  .validator(
    (input: {
      key: string;
      size: number;
      lastModified?: string;
      numPages: number;
      text: string;
      usedOcr: boolean;
      translationConfig?: {
        language?: string;
        mode?: string;
        modelId?: string;
        style?: string;
        temperature?: number;
      };
    }) => input,
  )
  .handler(async ({ data }) => {
    "use server";
    const isSyncEnabled = isGlobalSyncEnabled();
    if (!isSyncEnabled) {
      return {
        success: false,
        error: "Global sync (Supabase writes) is disabled in this environment.",
      };
    }
    try {
      const supabase = await getSupabaseClient();
      if (!supabase) {
        return {
          success: false,
          error: "Supabase URL or Key is missing from environment variables.",
        };
      }

      let finalText = data.text;
      if (data.translationConfig) {
        try {
          const parsed = JSON.parse(finalText);
          if (parsed && typeof parsed === "object") {
            parsed.translationConfig = {
              ...(parsed.translationConfig || {}),
              ...data.translationConfig,
            };
            finalText = JSON.stringify(parsed);
          }
        } catch {
          finalText = JSON.stringify({
            version: 1,
            text: data.text,
            pages: [],
            translationConfig: data.translationConfig,
          });
        }
      }

      const { error } = await supabase.from("pdf_extractions").upsert(
        {
          id: data.key,
          key: data.key,
          size: data.size,
          last_modified: data.lastModified || "",
          num_pages: data.numPages,
          text: finalText,
          used_ocr: data.usedOcr,
          extracted_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );

      if (error) {
        console.warn("Supabase upsert warning:", error.message || error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (e: any) {
      console.warn("Supabase save exception:", e?.message || String(e));
      return { success: false, error: e?.message || String(e) };
    }
  });
