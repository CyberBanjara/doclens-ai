import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAdminJWT, setCorsHeaders } from "../_lib/auth-server.js";

/**
 * /api/admin/sensitive-config
 * Allowed roles: admin
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    // Enforce that caller MUST have 'admin' role
    const authCheck = await verifyAdminJWT(req, ["admin"]);

    if (!authCheck.authorized) {
      return res.status(authCheck.statusCode).json({
        error: authCheck.error,
        callerRole: authCheck.role,
      });
    }

    return res.status(200).json({
      success: true,
      config: {
        environment: process.env.NODE_ENV || "development",
        firebaseProjectId: process.env.FIREBASE_PROJECT_ID,
        supabaseUrl: process.env.VITE_SUPABASE_URL,
        r2BucketName: process.env.R2_BUCKET_NAME,
        sessionExpiry: "15 minutes",
      },
    });
  } catch (err: any) {
    console.error("Error in sensitive-config:", err);
    return res.status(500).json({ error: `Internal Server Error: ${err.message}` });
  }
}
