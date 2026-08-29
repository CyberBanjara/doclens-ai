import { createClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { getCookie, getRequestHeader } from "@tanstack/react-start/server";
import { isGlobalSyncEnabled } from "./env";

/**
 * ============================================================================
 * TWO-LAYER AUTHENTICATION & AUTHORIZATION ENGINE (DATABASE)
 * ----------------------------------------------------------------------------
 * Layer 1: JWT Session Verification (Cryptographic signature, expiry, claims & admin role check)
 * Layer 2: Write-Capable API Key Authorization (Server-side write credential verification)
 * ============================================================================
 */

import type { UserRole } from "./auth-client";

/**
 * Layer 1 Verification: Validates JWT signature, expiry, and asserts allowed role.
 */
async function assertRoleSession(
  allowedRoles: UserRole[] = ["admin", "moderator", "editor"],
  tokenOrAuth?: string,
) {
  let token = tokenOrAuth;
  if (!token) {
    try {
      token = getCookie("session_token");
    } catch {
      // getCookie may throw outside request context
    }
  }
  if (!token) {
    try {
      const header = getRequestHeader("authorization") || getRequestHeader("x-session-token");
      if (header) {
        token = header.startsWith("Bearer ") ? header.substring(7).trim() : header.trim();
      }
    } catch {
      // getRequestHeader may throw outside request context
    }
  }

  if (!token) {
    throw new Error(
      "Unauthorized [Layer 1 Failed]: Missing authentication session. Valid JWT required.",
    );
  }

  const { verifySessionJwt } = await import("../../server/lib/auth-server");
  const user = await verifySessionJwt(token);
  if (!user) {
    throw new Error(
      "Unauthorized [Layer 1 Failed]: Invalid or expired session token signature.",
    );
  }

  if (!allowedRoles.includes(user.role)) {
    throw new Error(
      `Forbidden [Layer 1 Failed]: Database write operations require one of [${allowedRoles.join(", ")}] roles (current role: '${user.role}').`,
    );
  }

  return user;
}

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

export const fetchSupabaseExtraction = createServerFn({ method: "POST" })
  .validator((input: { key: string }) => input)
  .handler(async ({ data }) => {
    "use server";
    if (!isGlobalSyncEnabled()) {
      return { found: false };
    }
    try {
      const supabase = await getSupabaseClient({ writeAccess: false });
      if (!supabase) {
        return {
          found: false,
          error: "Supabase URL or Key is missing from environment variables.",
        };
      }

      const cleanKey = data.key.split("/").pop() || data.key;
      const { data: record, error } = await supabase
        .from("pdf_extractions")
        .select("*")
        .or(`id.eq."${data.key}",key.eq."${data.key}",id.eq."${cleanKey}",key.eq."${cleanKey}"`)
        .limit(1)
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

    // 1. Verify role privilege before mutating Supabase extractions
    try {
      await assertRoleSession(["admin", "moderator", "editor"]);
    } catch (authErr: any) {
      return {
        success: false,
        error: authErr?.message || "Unauthorized: Administrator / Editor authorization required.",
      };
    }

    try {
      // 2. Use write-capable credentials
      const supabase = await getSupabaseClient({ writeAccess: true });
      if (!supabase) {
        return {
          success: false,
          error: "Supabase URL or write credential is missing from environment variables.",
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
