import { defineEventHandler, createError } from "h3";
import { getSessionUserFromEvent } from "../../lib/auth-server";
import { getUserTranslationCounter } from "../../lib/supabase-server";

export default defineEventHandler(async (event) => {
  try {
    const session = await getSessionUserFromEvent(event);
    if (!session) {
      throw createError({
        statusCode: 401,
        statusMessage: "Unauthorized",
        data: { error: "Authentication required to access translation counter" },
      });
    }

    const count = await getUserTranslationCounter(session.uid);
    return {
      total_translated_pages: count,
    };
  } catch (err: unknown) {
    if (err && typeof err === "object" && "statusCode" in err) {
      throw err;
    }
    console.error("Error in /api/translations/counter:", err);
    return { total_translated_pages: 0 };
  }
});
