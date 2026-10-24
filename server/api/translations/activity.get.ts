import { defineEventHandler, getQuery, createError } from "h3";
import { getSessionUserFromEvent } from "../../lib/auth-server";
import { getUserTranslationActivity } from "../../lib/supabase-server";

export default defineEventHandler(async (event) => {
  try {
    const session = await getSessionUserFromEvent(event);
    if (!session) {
      throw createError({
        statusCode: 401,
        statusMessage: "Unauthorized",
        data: { error: "Authentication required to access translation activity" },
      });
    }

    const query = getQuery(event);
    const rawDays = typeof query?.days === "string" ? parseInt(query.days, 10) : 365;
    const days = !isNaN(rawDays) && rawDays > 0 && rawDays <= 730 ? rawDays : 365;

    // Strictly fetch translation activity for the authenticated session user ONLY
    const activity = await getUserTranslationActivity(session.uid, days);

    return {
      success: true,
      ...activity,
    };
  } catch (err: unknown) {
    if (err && typeof err === "object" && "statusCode" in err) {
      throw err;
    }
    console.error("Error in /api/translations/activity:", err);
    throw createError({
      statusCode: 500,
      statusMessage: "Internal server error retrieving translation activity",
      data: { error: "Failed to load translation activity data" },
    });
  }
});
