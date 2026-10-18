import { defineEventHandler } from "h3";
import { getSessionUserFromEvent } from "../../lib/auth-server";
import { getUserTranslationCounter } from "../../lib/supabase-server";
import type { ClientUser } from "../../lib/auth-types";

export default defineEventHandler(async (event) => {
  try {
    const session = await getSessionUserFromEvent(event);
    if (!session) {
      return { user: null };
    }

    const totalTranslatedPages = await getUserTranslationCounter(session.uid);

    const clientUser: ClientUser = {
      uid: session.uid,
      name: session.name,
      email: session.email,
      photoURL: session.photoURL,
      role: session.role,
      nativeLanguage: session.nativeLanguage,
      style: session.style,
      educationLevel: session.educationLevel,
      totalTranslatedPages,
    };

    return { user: clientUser };
  } catch (err: any) {
    console.error("Session check error:", err);
    return { user: null };
  }
});
