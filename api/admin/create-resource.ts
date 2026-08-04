import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAdminJWT, setCorsHeaders } from "../_lib/auth-server.js";

/**
 * /api/admin/create-resource
 * Allowed roles: admin, editor
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
    // Enforce that caller MUST have 'admin' or 'editor' role
    const authCheck = await verifyAdminJWT(req, ["admin", "editor"]);

    if (!authCheck.authorized) {
      return res.status(authCheck.statusCode).json({
        error: authCheck.error,
        callerRole: authCheck.role,
      });
    }

    const { title, content } = req.body || {};

    if (!title || typeof title !== "string") {
      return res.status(400).json({ error: "Missing or invalid 'title' in request body" });
    }

    return res.status(201).json({
      success: true,
      message: "Resource created successfully (Simulated Server Operation)",
      data: {
        resourceId: `res_${Math.floor(Math.random() * 100000)}`,
        title,
        content: content || "",
        createdBy: authCheck.uid,
        creatorRole: authCheck.role,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    console.error("Error in create-resource:", err);
    return res.status(500).json({ error: `Internal Server Error: ${err.message}` });
  }
}
