import { defineEventHandler, readBody, createError, sendStream, setHeader, getHeader } from "h3";
import { getSessionUserFromEvent } from "../../lib/auth-server";
import {
  validateAndReserveQuota,
  finalizeQuota,
  refundQuota,
} from "../../lib/supabase-server";

declare const __SERVER_OPENROUTER_DEFAULT_KEY__: string | undefined;
declare const __SERVER_OPENROUTER_DEFAULT_MODEL__: string | undefined;

function cleanApiKey(raw?: string | null): string {
  if (!raw) return "";
  let k = raw.trim();
  k = k.replace(/^["']+|["']+$/g, "").trim();
  k = k.replace(/^Bearer\s+/i, "").trim();
  return k;
}

export default defineEventHandler(async (event) => {
  try {
    // 1. Authenticate user session strictly
    const session = await getSessionUserFromEvent(event);
    if (!session || !session.uid) {
      throw createError({
        statusCode: 401,
        statusMessage: "Unauthorized",
        data: {
          error: "Authentication required to translate pages under your plan",
          code: "UNAUTHORIZED",
        },
      });
    }

    // 2. Parse request body
    const body = await readBody<{
      payload?: Record<string, any>;
      docId?: string;
      bookId?: string;
      bookTitle?: string;
      pageNumber?: number;
      language?: string;
      pageKey?: string;
    }>(event);

    if (!body || !body.payload) {
      throw createError({
        statusCode: 400,
        statusMessage: "Bad Request",
        data: { error: "Missing required chat payload", code: "BAD_REQUEST" },
      });
    }

    const docId = typeof body.docId === "string" ? body.docId.trim() : "";
    const bookId = typeof body.bookId === "string" && body.bookId.trim() ? body.bookId.trim() : docId;
    const bookTitle = typeof body.bookTitle === "string" ? body.bookTitle.trim() : "Untitled Document";
    const pageNumber = typeof body.pageNumber === "number" ? body.pageNumber : 1;
    const language = typeof body.language === "string" ? body.language.trim().toLowerCase() : "default";
    const pageKey = (body.pageKey || `${bookId || docId || "doc"}:${pageNumber}:${language}`).trim();

    // 3. Single optimized Supabase RPC for atomic quota validation and reservation
    const reservation = await validateAndReserveQuota({
      userId: session.uid,
      docId,
      bookId,
      bookTitle,
      pageNumber,
      language,
      pageKey,
    });

    if (!reservation.authorized) {
      throw createError({
        statusCode: 402,
        statusMessage: "Payment Required",
        data: {
          error:
            reservation.error ||
            "Translation quota exceeded. Upgrade to Reader Pass (300 pages) or Monthly Pro (600 pages).",
          code: reservation.code || "QUOTA_EXCEEDED",
          plan: reservation.plan || "free",
          remaining_pages: 0,
        },
      });
    }

    const reservationId = reservation.already_counted ? null : reservation.reservation_id;

    // 4. Resolve OpenRouter API keys (support server runtime env, build-time inject, and client default env fallback)
    const customHeaderKey = cleanApiKey(getHeader(event, "x-custom-openrouter-key"));
    const defaultHeaderKey = cleanApiKey(getHeader(event, "x-default-openrouter-key"));
    const runtimeEnvKey = cleanApiKey(
      process.env.OPENROUTER_API_KEY || process.env.VITE_OPENROUTER_API_KEY
    );
    let buildTimeKey = "";
    try {
      if (typeof __SERVER_OPENROUTER_DEFAULT_KEY__ !== "undefined" && __SERVER_OPENROUTER_DEFAULT_KEY__) {
        buildTimeKey = cleanApiKey(__SERVER_OPENROUTER_DEFAULT_KEY__);
      }
    } catch {}

    const isManagedMode = !customHeaderKey;
    const primaryKey = customHeaderKey || runtimeEnvKey || buildTimeKey || defaultHeaderKey;
    const fallbackKey = !customHeaderKey
      ? (buildTimeKey && buildTimeKey !== primaryKey ? buildTimeKey : "") ||
        (defaultHeaderKey && defaultHeaderKey !== primaryKey ? defaultHeaderKey : "") ||
        (runtimeEnvKey && runtimeEnvKey !== primaryKey ? runtimeEnvKey : "")
      : "";

    let activeApiKey = primaryKey;

    if (!activeApiKey) {
      if (reservationId) {
        await refundQuota(reservationId, session.uid, "server_key_missing");
      }
      throw createError({
        statusCode: 500,
        statusMessage: "Internal Server Error",
        data: {
          error: "No OpenRouter API key configured on server",
          code: "SERVER_KEY_MISSING",
        },
      });
    }

    // 5. Enforce AI model server-side in Managed-AI mode (when using server API key)
    // The AI model must always be read from environment variables and enforced server-side.
    // Users must not be able to change or override it from the client under any circumstances.
    // Automatically append `:floor` to select the cheapest available provider on OpenRouter.
    let buildTimeModel = "";
    try {
      if (typeof __SERVER_OPENROUTER_DEFAULT_MODEL__ !== "undefined" && __SERVER_OPENROUTER_DEFAULT_MODEL__) {
        buildTimeModel = String(__SERVER_OPENROUTER_DEFAULT_MODEL__).trim();
      }
    } catch {}

    const serverEnforcedModel = (
      process.env.OPENROUTER_DEFAULT_MODEL ||
      process.env.MANAGED_AI_MODEL ||
      process.env.VITE_OPENROUTER_DEFAULT_MODEL ||
      buildTimeModel ||
      "z-ai/glm-5.3-flash"
    ).trim();

    const withFloor = (m: string): string => {
      const trimmed = m.trim();
      if (!trimmed) return trimmed;
      return trimmed.endsWith(":floor") ? trimmed : `${trimmed}:floor`;
    };

    const requestPayload: Record<string, any> = {
      ...body.payload,
      stream: true,
    };

    if (isManagedMode) {
      requestPayload.model = withFloor(serverEnforcedModel);
      delete requestPayload.models;
    } else if (typeof requestPayload.model === "string" && requestPayload.model.trim()) {
      requestPayload.model = withFloor(requestPayload.model);
    }

    if (Array.isArray(requestPayload.models)) {
      requestPayload.models = requestPayload.models.map((m: any) =>
        typeof m === "string" ? withFloor(m) : m
      );
    }

    // 6. Route request to OpenRouter API with SSE streaming enabled
    let orResponse: Response;
    const fetchUpstream = async (keyToUse: string) => {
      return await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${keyToUse}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://doclens-ai.vercel.app",
          "X-Title": "Anuwad Document Reader",
        },
        body: JSON.stringify(requestPayload),
      });
    };

    try {
      orResponse = await fetchUpstream(activeApiKey);

      // If upstream rejects with 401 (e.g. "User not found." due to stale/invalid server env key on Vercel),
      // and we have a valid configured fallback key, retry once with the fallback key.
      if (orResponse.status === 401 && fallbackKey) {
        let isUserNotFound = false;
        try {
          const errClone = await orResponse.clone().text();
          isUserNotFound = /user not found|unauthorized|invalid api key/i.test(errClone);
        } catch {}

        if (isUserNotFound) {
          console.warn(
            "[Managed AI] Primary key returned 401 (User not found). Automatically recovering using configured fallback key."
          );
          activeApiKey = fallbackKey;
          orResponse = await fetchUpstream(activeApiKey);
        }
      }

      // If temporary upstream rate-limit with retry-after <= 3 seconds, retry once automatically
      if (orResponse.status === 429) {
        let retrySeconds = 1;
        try {
          const firstErrText = await orResponse.clone().text();
          const parsed = JSON.parse(firstErrText);
          const ra = parsed?.error?.metadata?.retry_after_seconds;
          if (typeof ra === "number" && ra > 0 && ra <= 3) {
            retrySeconds = ra;
          }
        } catch {}

        if (retrySeconds <= 3) {
          await new Promise((resolve) => setTimeout(resolve, Math.max(1000, retrySeconds * 1000)));
          orResponse = await fetchUpstream(activeApiKey);
        }
      }
    } catch (fetchErr: any) {
      if (reservationId) {
        await refundQuota(reservationId, session.uid, "fetch_failed");
      }
      throw createError({
        statusCode: 502,
        statusMessage: "Bad Gateway",
        data: {
          error: fetchErr?.message || "Failed to reach OpenRouter API",
          code: "UPSTREAM_NETWORK_ERROR",
        },
      });
    }

    // 6. Handle upstream errors from OpenRouter
    if (!orResponse.ok) {
      const errText = await orResponse.text();
      if (reservationId) {
        await refundQuota(reservationId, session.uid, `upstream_error_${orResponse.status}`);
      }

      let cleanError = `OpenRouter returned status ${orResponse.status}`;
      try {
        const parsed = JSON.parse(errText);
        const raw = parsed?.error?.metadata?.raw;
        const msg = parsed?.error?.message;
        if (typeof raw === "string" && raw.trim()) {
          cleanError = raw.trim();
        } else if (typeof msg === "string" && msg.trim() && msg !== "Provider returned error") {
          cleanError = msg.trim();
        }
      } catch {
        if (errText) cleanError = errText;
      }

      // If it's a provider rate limit (e.g. shared pool or free model rate limit exceeded)
      if (orResponse.status === 429) {
        cleanError = cleanError.replace(/https?:\/\/\S+/g, "").trim();
        if (/upstream|temporarily rate-limited|shared_pool|rate_limit_exceeded/i.test(cleanError)) {
          cleanError = "The AI model is temporarily busy upstream. Please wait a moment and try again, or switch models in Settings.";
        }
      }

      throw createError({
        statusCode: orResponse.status,
        statusMessage: "Upstream Error",
        data: {
          error: cleanError,
          code: orResponse.status === 429 ? "UPSTREAM_RATE_LIMITED" : "UPSTREAM_ERROR",
        },
      });
    }

    if (!orResponse.body) {
      if (reservationId) {
        await refundQuota(reservationId, session.uid, "empty_upstream_stream");
      }
      throw createError({
        statusCode: 502,
        statusMessage: "Bad Gateway",
        data: { error: "OpenRouter returned an empty stream", code: "EMPTY_STREAM" },
      });
    }

    // 7. Configure SSE streaming headers
    setHeader(event, "Content-Type", "text/event-stream; charset=utf-8");
    setHeader(event, "Cache-Control", "no-cache, no-transform");
    setHeader(event, "Connection", "keep-alive");
    setHeader(event, "X-Accel-Buffering", "no");

    let isFinalized = false;
    let isRefunded = false;
    let receivedAnyData = false;

    // Detect client disconnect before stream finalizes
    if (event.node?.req && typeof event.node.req.on === "function") {
      event.node.req.on("close", () => {
        if (reservationId && !isFinalized && !isRefunded) {
          isRefunded = true;
          void refundQuota(reservationId, session.uid, "client_disconnected").catch((err) =>
            console.warn("Background refundQuota note:", err),
          );
        }
      });
    }

    // Create stream pass-through with lifecycle tracking
    const transformStream = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        if (chunk && chunk.length > 0) {
          receivedAnyData = true;
          controller.enqueue(chunk);
        }
      },
      async flush() {
        // Stream completed normally! Finalize reservation and deduct quota.
        if (reservationId && !isFinalized && !isRefunded) {
          isFinalized = true;
          if (receivedAnyData) {
            void finalizeQuota(reservationId, session.uid).catch((err) =>
              console.warn("Background finalizeQuota note:", err),
            );
          } else {
            void refundQuota(reservationId, session.uid, "empty_data_received").catch((err) =>
              console.warn("Background refundQuota note:", err),
            );
          }
        }
      },
    });

    const outputStream = orResponse.body.pipeThrough(transformStream);
    return sendStream(event, outputStream);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "statusCode" in err) {
      throw err;
    }
    console.error("Error in /api/translations/translate:", err);
    throw createError({
      statusCode: 500,
      statusMessage: "Internal Server Error",
      data: {
        error: err instanceof Error ? err.message : "Translation proxy encountered an error",
        code: "INTERNAL_ERROR",
      },
    });
  }
});
