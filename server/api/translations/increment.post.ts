import { defineEventHandler, readBody, createError } from "h3";
import { getSessionUserFromEvent } from "../../lib/auth-server";
import { incrementUserTranslationCounter } from "../../lib/supabase-server";

export default defineEventHandler(async (event) => {
  try {
    const session = await getSessionUserFromEvent(event);
    if (!session) {
      throw createError({
        statusCode: 401,
        statusMessage: "Unauthorized",
        data: { error: "Authentication required to increment translation counter" },
      });
    }

    const body = await readBody<{
      docId?: string;
      pageNumber?: number;
      language?: string;
      pageKey?: string;
    }>(event);

    const docId = typeof body?.docId === "string" ? body.docId.trim() : "";
    const pageNumber = typeof body?.pageNumber === "number" ? body.pageNumber : null;
    const language =
      typeof body?.language === "string" ? body.language.trim().toLowerCase() : "default";

    let pageKey = typeof body?.pageKey === "string" ? body.pageKey.trim() : "";
    if (!pageKey && docId && pageNumber !== null) {
      pageKey = `${docId}:${pageNumber}:${language}`;
    }

    if (!pageKey) {
      throw createError({
        statusCode: 400,
        statusMessage: "Bad Request",
        data: { error: "Missing required page identification (docId and pageNumber, or pageKey)" },
      });
    }

    // Atomically increment counter in Supabase strictly for the authenticated session user
    const result = await incrementUserTranslationCounter(session.uid, pageKey);

    return {
      success: true,
      total_translated_pages: result.totalTranslatedPages,
      already_counted: result.alreadyCounted,
    };
  } catch (err: unknown) {
    if (err && typeof err === "object" && "statusCode" in err) {
      throw err;
    }
    console.error("Error in /api/translations/increment:", err);
    const message =
      err instanceof Error ? err.message : "Internal server error updating translation counter";
    throw createError({
      statusCode: 500,
      statusMessage: "Internal server error updating translation counter",
      data: { error: message },
    });
  }
});
