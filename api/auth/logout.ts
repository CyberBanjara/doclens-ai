import type { VercelRequest, VercelResponse } from "@vercel/node";
import { clearSessionCookie } from "../_lib/auth-server";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    clearSessionCookie(res);
    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error("Logout error:", err);
    return res.status(500).json({ error: "Failed to logout" });
  }
}
