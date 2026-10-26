import { jwtVerify, createRemoteJWKSet, decodeProtectedHeader, decodeJwt } from "jose";

export interface VerifiedGoogleUser {
  uid: string;
  email: string;
  name: string;
  photoURL: string;
}

let firebaseJwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let googleOAuthJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getFirebaseJwks() {
  if (!firebaseJwks) {
    firebaseJwks = createRemoteJWKSet(
      new URL(
        "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
      ),
    );
  }
  return firebaseJwks;
}

function getGoogleOAuthJwks() {
  if (!googleOAuthJwks) {
    googleOAuthJwks = createRemoteJWKSet(
      new URL("https://www.googleapis.com/oauth2/v3/certs"),
    );
  }
  return googleOAuthJwks;
}

/**
 * Verify Google identity token on the server with fast, cached cryptographic JWKS
 * verification (sub-millisecond local crypto), with graceful fallback to Google/Firebase
 * Identity Toolkit and tokeninfo APIs.
 */
export async function verifyGoogleIdentity(idToken: string): Promise<VerifiedGoogleUser | null> {
  if (!idToken || typeof idToken !== "string") return null;
  const cleanToken = idToken.trim();
  if (!cleanToken) return null;

  // 1. Instant check of JWT protected header: reject alg: 'none' and unsigned tokens
  try {
    const header = decodeProtectedHeader(cleanToken);
    if (!header || !header.alg || header.alg === "none") {
      return null;
    }
  } catch {
    return null;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;

  // 2. High-speed local cryptographic verification using cached Google/Firebase JWKS
  try {
    const unverifiedPayload = decodeJwt(cleanToken);
    const iss = unverifiedPayload.iss || "";

    if (iss.startsWith("https://securetoken.google.com/") || (projectId && unverifiedPayload.aud === projectId)) {
      const { payload } = await jwtVerify(cleanToken, getFirebaseJwks(), {
        algorithms: ["RS256"],
        clockTolerance: 10,
      });

      const uid = typeof payload.sub === "string" ? payload.sub.trim() : (payload.user_id as string);
      const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";

      if (uid && email) {
        return {
          uid,
          email,
          name: typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : email.split("@")[0] || "User",
          photoURL: typeof payload.picture === "string" ? payload.picture : "",
        };
      }
    } else if (iss === "https://accounts.google.com" || iss === "accounts.google.com") {
      const { payload } = await jwtVerify(cleanToken, getGoogleOAuthJwks(), {
        algorithms: ["RS256"],
        clockTolerance: 10,
      });

      const uid = typeof payload.sub === "string" ? payload.sub.trim() : "";
      const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";

      if (uid && email) {
        return {
          uid,
          email,
          name: typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : email.split("@")[0] || "User",
          photoURL: typeof payload.picture === "string" ? payload.picture : "",
        };
      }
    }
  } catch {
    // If JWKS verification throws (e.g. clock mismatch, custom key, or mock token), proceed to API fallbacks
  }

  const apiKey = process.env.FIREBASE_API_KEY;

  // 3. Fallback 1: Firebase Identity Toolkit lookup if API key is present
  if (apiKey) {
    try {
      const res = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken: cleanToken }),
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

  // 4. Fallback 2: Google OAuth2 tokeninfo endpoint
  try {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(cleanToken)}`,
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
    console.warn("Google tokeninfo verification failed:", e);
  }

  // Strictly reject unverified tokens to prevent JWT bypass / forged identity attacks.
  return null;
}

