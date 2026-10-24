import { defineEventHandler, readBody, createError } from "h3";
import { getSessionUserFromEvent } from "../../lib/auth-server";
import { recordUserTranslationActivity } from "../../lib/supabase-server";

export default defineEventHandler(async (event) => {
  try {
    const session = await getSessionUserFromEvent(event);
    if (!session) {
      throw createError({
        statusCode: 401,
        statusMessage: "Unauthorized",
        data: { error: "Authentication required to record translation activity" },
      });
    }

    const body = await readBody<{
      docId?: string;
      bookId?: string;
      bookTitle?: string;
      pageNumber?: number;
      language?: string;
      pageKey?: string;
    }>(event);

    const docId = typeof body?.docId === "string" ? body.docId.trim() : "";
    const bookId = typeof body?.bookId === "string" && body.bookId.trim() ? body.bookId.trim() : docId;
    const rawTitle = typeof body?.bookTitle === "string" ? body.bookTitle.trim() : "";
    const bookTitle = rawTitle || "Untitled Document";
    const pageNumber = typeof body?.pageNumber === "number" ? body.pageNumber : null;
    const language =
      typeof body?.language === "string" ? body.language.trim().toLowerCase() : "default";

    let pageKey = typeof body?.pageKey === "string" ? body.pageKey.trim() : "";
    if (!pageKey && (bookId || docId) && pageNumber !== null) {
      pageKey = `${bookId || docId}:${pageNumber}:${language}`;
    }

    if (!pageKey || pageNumber === null) {
      throw createError({
        statusCode: 400,
        statusMessage: "Bad Request",
        data: { error: "Missing required page identification (pageNumber and docId/bookId or pageKey)" },
      });
    }

    // Atomically record translation activity and update counter strictly for session user
    const result = await recordUserTranslationActivity({
      userId: session.uid,
      bookId,
      bookTitle,
      docId,
      pageNumber,
      language,
      pageKey,
    });

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
