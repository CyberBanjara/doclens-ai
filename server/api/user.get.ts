import { defineEventHandler, createError } from "h3";
import { getSessionUserFromEvent } from "../lib/auth-server";
import { getUserTranslationCounter, getUserTranslationActivity } from "../lib/supabase-server";

export default defineEventHandler(async (event) => {
  try {
    const session = await getSessionUserFromEvent(event);
    if (!session) {
      throw createError({
        statusCode: 401,
        statusMessage: "Unauthorized",
        data: { error: "Authentication required to access user profile" },
      });
    }

    // Fetch authoritative counter and 365-day translation activity for the authenticated user only
    const [totalTranslatedPages, activity] = await Promise.all([
      getUserTranslationCounter(session.uid),
      getUserTranslationActivity(session.uid, 365),
    ]);

    return {
      success: true,
      user: {
        uid: session.uid,
        email: session.email,
        name: session.name,
        photoURL: session.photoURL,
        role: session.role,
        nativeLanguage: session.nativeLanguage,
        educationLevel: session.educationLevel,
        style: session.style,
        totalTranslatedPages,
      },
      activity,
    };
  } catch (err: unknown) {
    if (err && typeof err === "object" && "statusCode" in err) {
      throw err;
    }
    console.error("Error in /api/user:", err);
    throw createError({
      statusCode: 500,
      statusMessage: "Internal server error retrieving user profile",
      data: { error: "Failed to load user profile" },
    });
  }
});
