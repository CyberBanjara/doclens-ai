import { defineEventHandler, readBody, createError } from "h3";
import {
  getSessionUserFromEvent,
  createSessionJwt,
  setSessionCookieOnEvent,
} from "../../lib/auth-server";
import { updateUserProfileInFirestore } from "../../lib/firestore-server";
import type { ClientUser, SessionUser } from "../../lib/auth-types";

export default defineEventHandler(async (event) => {
  try {
    // 1. Verify that the requester has a valid session
    const session = await getSessionUserFromEvent(event);
    if (!session) {
      throw createError({
        statusCode: 401,
        statusMessage: "Unauthorized: Valid session required to update profile preferences",
        data: { error: "Unauthorized: Valid session required to update profile preferences" },
      });
    }

    const body = await readBody<{
      nativeLanguage?: string;
      educationLevel?: string;
      name?: string;
      photoURL?: string;
      idToken?: string;
    }>(event);

    const updates: {
      nativeLanguage?: string;
      educationLevel?: string;
      name?: string;
      photoURL?: string;
    } = {};

    if (typeof body?.nativeLanguage === "string") {
      updates.nativeLanguage = body.nativeLanguage.trim();
    }

    if (typeof body?.educationLevel === "string") {
      updates.educationLevel = body.educationLevel.trim();
    }

    if (typeof body?.name === "string" && body.name.trim()) {
      updates.name = body.name.trim();
    }

    if (typeof body?.photoURL === "string") {
      updates.photoURL = body.photoURL.trim();
    }

    // 2. Persist updates to Firebase Firestore (best effort / graceful notice)
    try {
      const idToken =
        body?.idToken ||
        event.node?.req?.headers?.["authorization"]?.replace(/^Bearer\s+/i, "") ||
        (event.node?.req?.headers?.["x-firebase-token"] as string) ||
        undefined;
      await updateUserProfileInFirestore(session.uid, updates, idToken);
    } catch (fErr) {
      console.warn("Firestore user profile sync notice:", fErr);
    }

    // 3. Issue refreshed session JWT with the updated claims
    const updatedSessionUser: SessionUser = {
      uid: session.uid,
      email: session.email,
      name: updates.name !== undefined ? updates.name : session.name,
      photoURL: updates.photoURL !== undefined ? updates.photoURL : session.photoURL || "",
      role: session.role,
      nativeLanguage:
        updates.nativeLanguage !== undefined ? updates.nativeLanguage : session.nativeLanguage,
      educationLevel:
        updates.educationLevel !== undefined ? updates.educationLevel : session.educationLevel,
    };

    const newSessionJwt = await createSessionJwt(updatedSessionUser);

    // 4. Update Secure, HttpOnly session cookie
    setSessionCookieOnEvent(event, newSessionJwt);

    // 5. Return updated ClientUser payload
    const clientUser: ClientUser = {
      uid: updatedSessionUser.uid,
      name: updatedSessionUser.name,
      email: updatedSessionUser.email,
      photoURL: updatedSessionUser.photoURL,
      role: updatedSessionUser.role,
      nativeLanguage: updatedSessionUser.nativeLanguage,
      educationLevel: updatedSessionUser.educationLevel,
    };

    return { success: true, user: clientUser };
  } catch (err: any) {
    if (err.statusCode) {
      throw err;
    }
    console.error("Profile update error:", err);
    throw createError({
      statusCode: 500,
      statusMessage: err?.message || "Internal server error during profile update",
      data: { error: err?.message || "Internal server error during profile update" },
    });
  }
});
