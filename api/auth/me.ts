import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSessionUser } from "../_lib/auth-server";
import type { ClientUser } from "../_lib/auth-types";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const session = await getSessionUser(req);
    if (!session) {
      return res.status(200).json({ user: null });
    }

    const clientUser: ClientUser = {
      uid: session.uid,
      name: session.name,
      email: session.email,
      photoURL: session.photoURL,
      role: session.role,
    };

    return res.status(200).json({ user: clientUser });
  } catch (err: any) {
    console.error("Session check error:", err);
    return res.status(200).json({ user: null });
  }
}
