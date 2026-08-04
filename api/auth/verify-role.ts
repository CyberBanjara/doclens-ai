import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  verifyTokenAndFetchRole,
  setCorsHeaders,
  extractToken,
  issueSessionJWT,
  PRIVILEGED_ROLES,
} from "../_lib/auth-server.js";

/**
 * /api/auth/verify-role
 *
 * Verifies the caller's Firebase ID token server-side, fetches the role from Firestore,
 * and if authorized (privileged), issues a short-lived JWT using the jose library.
 * Returns only the JWT (token) and user's role to the client.
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
    const isPrivileged = PRIVILEGED_ROLES.includes(authResult.role);

    // If authorized (privileged), issue a short-lived JWT
    if (isPrivileged) {
      sessionToken = await issueSessionJWT(
        firebaseIdToken,
        authResult.uid,
        authResult.email,
        authResult.role
      );
    }

    // Return only the JWT and the user's role to the client
    return res.status(200).json({
      token: sessionToken,
      role: authResult.role,
    });
  } catch (err: any) {
    console.error("Error in verify-role serverless function:", err);
    return res.status(500).json({
      error: `Internal Server Error: ${err.message}`,
    });
  }
}

