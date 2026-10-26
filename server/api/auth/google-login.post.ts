import { defineEventHandler, readBody, createError } from "h3";
import { verifyGoogleIdentity } from "../../lib/google-verify";
import { syncUserInFirestore } from "../../lib/firestore-server";
import { createSessionJwt, setSessionCookieOnEvent } from "../../lib/auth-server";
import type { ClientUser } from "../../lib/auth-types";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<{ idToken?: string }>(event);
    const idToken = body?.idToken;

    if (!idToken || typeof idToken !== "string") {
      throw createError({
        statusCode: 400,
        statusMessage: "Missing required idToken in request body",
        data: { error: "Missing required idToken in request body" },
      });
    }

    // 1. Verify Google Identity
    const verified = await verifyGoogleIdentity(idToken);
    if (!verified) {
      throw createError({
        statusCode: 401,
        statusMessage: "Invalid Google token or identity verification failed",
        data: { error: "Invalid Google token or identity verification failed" },
      });
    }

    // 2. Synchronize user in Firestore and fetch translation counter in parallel
    const [userProfile, totalTranslatedPages] = await Promise.all([
      syncUserInFirestore(verified, idToken),
      import("../../lib/supabase-server")
        .then((m) => m.getUserTranslationCounter(verified.uid))
        .catch(() => 0),
    ]);

    // 3. Create rolling session payload with 10-day inactivity expiry
    const sessionUser = {
      uid: userProfile.uid,
      email: userProfile.email,
      name: userProfile.name,
      photoURL: userProfile.photoURL || "",
      role: userProfile.role,
      nativeLanguage: userProfile.nativeLanguage,
      style: userProfile.style,
      educationLevel: userProfile.educationLevel,
    };

    const sessionJwt = await createSessionJwt(sessionUser);

    // 4. Store session in Secure, HttpOnly cookie with 10-day expiry
    setSessionCookieOnEvent(event, sessionJwt);

    // 5. Return filtered user data for UI
    const clientUser: ClientUser = {
      uid: sessionUser.uid,
      name: sessionUser.name,
      email: sessionUser.email,
      photoURL: sessionUser.photoURL,
      role: sessionUser.role,
      nativeLanguage: sessionUser.nativeLanguage,
      style: sessionUser.style,
      educationLevel: sessionUser.educationLevel,
      totalTranslatedPages,
    };

    return { user: clientUser };
  } catch (err: any) {
    if (err.statusCode) {
      throw err;
    }
    console.error("Google login error:", err);
    throw createError({
      statusCode: 500,
      statusMessage: err?.message || "Internal server error during authentication",
      data: { error: err?.message || "Internal server error during authentication" },
    });
  }
});
