import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireSession } from "../_lib/auth-server";
import { updateUserRoleInFirestore } from "../_lib/firestore-server";
import type { UserRole } from "../_lib/auth-types";

const VALID_ROLES: UserRole[] = ["admin", "editor", "moderator", "viewer", "user"];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // 1. Verify admin privilege via HttpOnly cookie session
    const session = await requireSession(req, res, ["admin"]);
    if (!session) return;

    const { uid, role, idToken } = req.body || {};
    if (!uid || typeof uid !== "string") {
      return res.status(400).json({ error: "Missing valid uid parameter" });
    }

    if (!role || !VALID_ROLES.includes(role as UserRole)) {
      return res.status(400).json({
        error: `Invalid role '${role}'. Must be one of: ${VALID_ROLES.join(", ")}`,
      });
    }

    // 2. Extract authorization token
    const authHeader =
      (req.headers.authorization as string) ||
      (req.headers["x-firebase-token"] as string) ||
      "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.substring(7)
      : authHeader || idToken || undefined;

    // 3. Update role in Firestore using admin credentials
    const updated = await updateUserRoleInFirestore(uid, role as UserRole, token);
    if (!updated) {
      return res.status(500).json({ error: "Failed to update role in database" });
    }

    return res.status(200).json({
      success: true,
      uid,
      role,
      message: `User role updated to ${role}`,
    });
  } catch (err: any) {
    console.error("Admin update role error:", err);
    return res.status(500).json({ error: err?.message || "Failed to update user role" });
  }
}
