import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyGoogleIdentity } from "../_lib/google-verify";
import { syncUserInFirestore } from "../_lib/firestore-server";
import { createSessionJwt, setSessionCookie } from "../_lib/auth-server";
import type { ClientUser } from "../_lib/auth-types";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { idToken } = req.body || {};
    if (!idToken || typeof idToken !== "string") {
      return res.status(400).json({ error: "Missing required idToken in request body" });
    }

    // 1. Verify Google Identity
    const verified = await verifyGoogleIdentity(idToken);
    if (!verified) {
      return res.status(401).json({ error: "Invalid Google token or identity verification failed" });
    }

    // 2. Synchronize user in Firestore and retrieve their role (authenticating with Google ID token)
    const userProfile = await syncUserInFirestore(verified, idToken);

    // 3. Create short-lived session payload
    const sessionUser = {
      uid: userProfile.uid,
      email: userProfile.email,
      name: userProfile.name,
      photoURL: userProfile.photoURL || "",
      role: userProfile.role,
    };

    const sessionJwt = await createSessionJwt(sessionUser);

    // 4. Store session only in a Secure, HttpOnly cookie
    setSessionCookie(res, sessionJwt);

    // 5. Return ONLY filtered user data needed for UI
    const clientUser: ClientUser = {
      uid: sessionUser.uid,
      name: sessionUser.name,
      email: sessionUser.email,
      photoURL: sessionUser.photoURL,
      role: sessionUser.role,
    };

    return res.status(200).json({ user: clientUser });
  } catch (err: any) {
    console.error("Google login error:", err);
    return res.status(500).json({ error: err?.message || "Internal server error during authentication" });
  }
}
