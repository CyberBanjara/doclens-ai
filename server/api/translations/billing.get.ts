import { defineEventHandler, createError } from "h3";
import { getSessionUserFromEvent } from "../../lib/auth-server";
import { getUserBillingProfile } from "../../lib/supabase-server";

export default defineEventHandler(async (event) => {
  try {
    const session = await getSessionUserFromEvent(event);
    if (!session || !session.uid) {
      throw createError({
        statusCode: 401,
        statusMessage: "Unauthorized",
        data: { error: "Authentication required to access billing profile", code: "UNAUTHORIZED" },
      });
    }

    const billingProfile = await getUserBillingProfile(session.uid);

    return {
      success: true,
      ...billingProfile,
    };
  } catch (err: unknown) {
    if (err && typeof err === "object" && "statusCode" in err) {
      throw err;
    }
    console.error("Error in /api/translations/billing:", err);
    throw createError({
      statusCode: 500,
      statusMessage: "Internal Server Error",
      data: { error: "Failed to retrieve billing profile", code: "INTERNAL_ERROR" },
    });
  }
});
