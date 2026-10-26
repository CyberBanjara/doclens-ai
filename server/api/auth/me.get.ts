import { defineEventHandler } from "h3";
import {
  getSessionUserFromEvent,
  createSessionJwt,
  setSessionCookieOnEvent,
  clearSessionCookieOnEvent,
} from "../../lib/auth-server";
import { getUserFromFirestore } from "../../lib/firestore-server";
import { getUserTranslationCounter } from "../../lib/supabase-server";
import type { ClientUser, SessionUser } from "../../lib/auth-types";

export default defineEventHandler(async (event) => {
  try {
    const session = await getSessionUserFromEvent(event);
    if (!session) {
      return { user: null };
    }

    // 1. Silent verification of auth state and dynamic role & permissions refresh from Firestore
    // Run Firestore profile fetch and Supabase translation counter concurrently
    const [profile, totalTranslatedPages] = await Promise.all([
      getUserFromFirestore(session.uid).catch((err) => {
        console.warn("Firestore profile fetch notice on session check:", err);
        return null;
      }),
      getUserTranslationCounter(session.uid).catch(() => 0),
    ]);

    // Check for revocation or disabled status
    if (profile) {
      const rawProfile = profile as any;
      if (rawProfile.disabled === true || rawProfile.revoked === true || rawProfile.status === "disabled") {
        clearSessionCookieOnEvent(event);
        return { user: null, revoked: true };
      }
    }

    // Dynamic role updates: Authoritative role from Firestore overrides stale JWT claim
    const authoritativeRole = profile?.role || session.role;

    // 2. Rolling inactivity renewal: Renew 10-day session expiry on authenticated activity
    const refreshedSessionUser: SessionUser = {
      uid: session.uid,
      email: session.email,
      name: profile?.name || session.name,
      photoURL: profile?.photoURL || session.photoURL,
      role: authoritativeRole,
      nativeLanguage: profile?.nativeLanguage || session.nativeLanguage,
      style: profile?.style || session.style,
      educationLevel: profile?.educationLevel || session.educationLevel,
    };

    // Re-issue fresh JWT with rolled 10-day expiration and updated role
    const renewedJwt = await createSessionJwt(refreshedSessionUser);
    setSessionCookieOnEvent(event, renewedJwt);

    // 3. Return refreshed user data with live role and permissions
    const clientUser: ClientUser = {
      uid: refreshedSessionUser.uid,
      name: refreshedSessionUser.name,
      email: refreshedSessionUser.email,
      photoURL: refreshedSessionUser.photoURL,
      role: refreshedSessionUser.role,
      nativeLanguage: refreshedSessionUser.nativeLanguage,
      style: refreshedSessionUser.style,
      educationLevel: refreshedSessionUser.educationLevel,
      totalTranslatedPages,
    };

    return { user: clientUser };
  } catch (err: any) {
    console.error("Session check error:", err);
    return { user: null };
  }
});
