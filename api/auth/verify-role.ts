import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  verifyTokenAndFetchRole,
  setCorsHeaders,
  extractToken,
  issueSessionJWT,
  issueRefreshToken,
  setAuthCookies,
  PRIVILEGED_ROLES,
} from "../_lib/auth-server.js";

/**
 * /api/auth/verify-role
 *
 * Verifies the caller's Firebase ID token server-side ONCE on login/auth change,
 * fetches the user's role from Firestore, and issues a short-lived session JWT access token
 * and a long-lived refresh token using the jose library.
 * Sets HTTP cookies and returns { token, refreshToken, role }.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const authResult = await verifyTokenAndFetchRole(req);

    if (!authResult.authorized || !authResult.uid) {
      return res.status(authResult.statusCode).json({
        error: authResult.error,
      });
    }

    const firebaseIdToken = extractToken(req);
    if (!firebaseIdToken) {
      return res.status(401).json({
        error: "401 Unauthorized: Firebase ID token missing",
      });
    }

    let sessionToken: string | null = null;
    let refreshToken: string | null = null;
    const isPrivileged = PRIVILEGED_ROLES.includes(authResult.role);

    // Issue JWT access token and refresh token for privileged/authenticated user
    if (isPrivileged) {
      sessionToken = await issueSessionJWT(
        firebaseIdToken,
        authResult.uid,
        authResult.email,
        authResult.role
      );
      refreshToken = await issueRefreshToken(
        authResult.uid,
        authResult.email,
        authResult.role
      );
    }

    // Set HTTP cookies for browser inspection and automated request attachment
    setAuthCookies(res, sessionToken, refreshToken);

    // Return tokens and the user's role to the client
    return res.status(200).json({
      token: sessionToken,
      refreshToken: refreshToken,
      role: authResult.role,
    });
  } catch (err: any) {
    console.error("Error in verify-role serverless function:", err);
    return res.status(500).json({
      error: `Internal Server Error: ${err.message}`,
    });
  }
}



