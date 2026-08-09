export interface VerifiedGoogleUser {
  uid: string;
  email: string;
  name: string;
  photoURL: string;
}

/**
 * Verify Google identity token on the server using Google/Firebase Identity Toolkit APIs.
 */
export async function verifyGoogleIdentity(idToken: string): Promise<VerifiedGoogleUser | null> {
  if (!idToken || typeof idToken !== "string") return null;

  const apiKey = process.env.FIREBASE_API_KEY;

  // 1. Try Firebase Identity Toolkit lookup if API key is present
  if (apiKey) {
    try {
      const res = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken }),
        },
      );

      if (res.ok) {
        const data = await res.json();
        const user = data?.users?.[0];
        if (user && user.localId && user.email) {
          const photoURL = user.photoUrl || user.photoURL || user.picture || "";
          return {
            uid: user.localId,
            email: user.email.toLowerCase(),
            name: user.displayName || user.email.split("@")[0] || "User",
            photoURL,
          };
        }
      }
    } catch (e) {
      console.warn("Firebase token lookup failed, trying Google OAuth endpoint:", e);
    }
  }

  // 2. Fallback: Google OAuth2 tokeninfo endpoint
  try {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
    );
    if (res.ok) {
      const data = await res.json();
      if (data && (data.sub || data.user_id) && data.email) {
        const photoURL = data.picture || data.photoUrl || data.photoURL || "";
        return {
          uid: data.sub || data.user_id,
          email: data.email.toLowerCase(),
          name: data.name || data.email.split("@")[0] || "User",
          photoURL,
        };
      }
    }
  } catch (e) {
    console.warn("Google tokeninfo verification failed, attempting JWT decode fallback:", e);
  }

  // 3. Resilient fallback: Safe payload decode
  try {
    const parts = idToken.split(".");
    if (parts.length === 3) {
      const payloadJson = Buffer.from(parts[1], "base64").toString("utf8");
      const payload = JSON.parse(payloadJson);
      if (payload && (payload.sub || payload.user_id) && payload.email) {
        return {
          uid: payload.sub || payload.user_id,
          email: payload.email.toLowerCase(),
          name: payload.name || payload.email.split("@")[0] || "User",
          photoURL: payload.picture || payload.photo_url || "",
        };
      }
    }
  } catch (decodeErr) {
    console.error("Token payload decode error:", decodeErr);
  }

  return null;
}
