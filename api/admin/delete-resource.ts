import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAdminJWT, setCorsHeaders } from "../_lib/auth-server.js";

/**
 * /api/admin/delete-resource
 * Allowed roles: admin
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST" && req.method !== "DELETE") {
    return res.status(405).json({ error: "Method Not Allowed. Use POST or DELETE." });
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

    const { resourceId } = req.body || {};

    if (!resourceId || typeof resourceId !== "string") {
      return res.status(400).json({ error: "Missing or invalid 'resourceId' in request body" });
    }

    return res.status(200).json({
      success: true,
      message: "Resource deleted successfully (Simulated Server Operation)",
      resourceId,
      deletedBy: authCheck.uid,
      deleterRole: authCheck.role,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("Error in delete-resource:", err);
    return res.status(500).json({ error: `Internal Server Error: ${err.message}` });
  }
}
