import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireSession } from "../_lib/auth-server";
import { listUsersFromFirestore } from "../_lib/firestore-server";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // 1. Verify admin privilege via HttpOnly cookie session
    const session = await requireSession(req, res, ["admin"]);
    if (!session) return; // Response sent in requireSession

    // 2. Extract client authorization token for Firestore security rules
    const authHeader =
      (req.headers.authorization as string) ||
      (req.headers["x-firebase-token"] as string) ||
      "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.substring(7)
      : authHeader || undefined;

    // 3. Fetch users list from Firestore using admin credentials
    const users = await listUsersFromFirestore(token);

    return res.status(200).json({ users });
  } catch (err: any) {
    console.error("Admin list users error:", err);
    return res.status(500).json({ error: err?.message || "Failed to list users" });
  }
}
