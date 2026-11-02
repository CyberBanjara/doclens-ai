import { defineEventHandler, readBody, createError, sendStream, setHeader, getHeader } from "h3";
import { getSessionUserFromEvent } from "../../lib/auth-server";
import {
  validateAndReserveQuota,
  finalizeQuota,
  refundQuota,
} from "../../lib/supabase-server";

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

    // 4. Resolve server-side OpenRouter API key (kept strictly server-side)
    const customHeaderKey = getHeader(event, "x-custom-openrouter-key");
    const serverApiKey = (
      (customHeaderKey && customHeaderKey.trim()) ||
      process.env.OPENROUTER_API_KEY ||
      process.env.VITE_OPENROUTER_API_KEY ||
      ""
    ).trim();

    if (!serverApiKey) {
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

    // 5. Route request to OpenRouter API with SSE streaming enabled
    let orResponse: Response;
    try {
      orResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serverApiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://doclens-ai.vercel.app",
          "X-Title": "Anuwad Document Reader",
        },
        body: JSON.stringify({ ...body.payload, stream: true }),
      });
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
      throw createError({
        statusCode: orResponse.status,
        statusMessage: "Upstream Error",
        data: {
          error: errText || `OpenRouter returned status ${orResponse.status}`,
          code: "UPSTREAM_ERROR",
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
