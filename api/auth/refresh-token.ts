import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  setCorsHeaders,
  extractToken,
  verifyRefreshToken,
  issueSessionJWT,
  issueRefreshToken,
  setAuthCookies,
} from "../_lib/auth-server.js";

/**
 * /api/auth/refresh-token
 *
 * Renews the user's JWT access token using a valid refresh token.
 * Signature verification is performed 100% cryptographically using jose (server secret key).
 * ZERO network calls to Firebase or Firestore are made during token renewal.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed. Use POST." });
  }

  try {
    const rawToken = req.body?.refreshToken || extractToken(req);

    if (!rawToken || typeof rawToken !== "string") {
      return res.status(400).json({
        error: "400 Bad Request: Missing 'refreshToken' in request body or Authorization header",
      });
    }

    // Cryptographic signature verification via jose (No Firebase / Firestore roundtrips)
    const verification = await verifyRefreshToken(rawToken);

    if (!verification.valid || !verification.uid || !verification.role) {
      return res.status(401).json({
        error: verification.error || "401 Unauthorized: Invalid refresh token signature",
      });
    }

    // Issue renewed short-lived access JWT token and new refresh token
    const newAccessToken = await issueSessionJWT(
      "", // No ID token needed for refresh
      verification.uid,
      verification.email || null,
      verification.role
    );

    const newRefreshToken = await issueRefreshToken(
      verification.uid,
      verification.email || null,
      verification.role
    );

    // Set HTTP cookies for browser inspection and automated request attachment
    setAuthCookies(res, newAccessToken, newRefreshToken);

    return res.status(200).json({
      token: newAccessToken,
      refreshToken: newRefreshToken,
      role: verification.role,
      message: "Session token successfully renewed via JWT signature verification",
    });
  } catch (err: any) {
    console.error("Error in refresh-token serverless function:", err);
    return res.status(500).json({
      error: `Internal Server Error: ${err.message}`,
    });
  }
}

