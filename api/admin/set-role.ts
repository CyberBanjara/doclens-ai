import type { VercelRequest, VercelResponse } from "@vercel/node";
import * as adminModule from "firebase-admin";
import { verifyTokenAndFetchRole, setCorsHeaders, type UserRole } from "../_lib/auth-server.js";

const admin = (adminModule as any).default || adminModule;

const VALID_ROLES: UserRole[] = ["admin", "moderator", "editor", "user", "viewer"];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    // Enforce that caller MUST be an 'admin' to set roles
    const authCheck = await verifyTokenAndFetchRole(req, ["admin"]);

    if (!authCheck.authorized || !authCheck.uid) {
      return res.status(authCheck.statusCode).json({
        error: authCheck.error,
        callerRole: authCheck.role,
      });
    }

    const { newRole, targetUid } = req.body || {};
    const uidToUpdate = targetUid || authCheck.uid;

    if (!newRole || !VALID_ROLES.includes(newRole as UserRole)) {
      return res.status(400).json({
        error: `Invalid 'newRole'. Allowed roles: [${VALID_ROLES.join(", ")}]`,
      });
    }

    const apiKey = process.env.VITE_FIREBASE_API_KEY || "AIzaSyBwfBcQ5HM_jbHrwwMa415fTg5NHoYuL6g";
    const projectId = process.env.VITE_FIREBASE_PROJECT_ID || "anuwad-789a9";

    let updated = false;

    try {
      const apps = admin.apps || admin.default?.apps;
      if (Array.isArray(apps) && apps.length > 0 && typeof admin.firestore === "function") {
        await admin
          .firestore()
          .collection("users")
          .doc(uidToUpdate)
          .set({ role: newRole, updatedAt: new Date().toISOString() }, { merge: true });
        updated = true;
      }
    } catch (fsErr) {
      console.warn("Firestore Admin SDK update failed, trying REST API:", fsErr);
    }

    if (!updated) {
      const token = req.headers?.authorization?.split("Bearer ")[1] || req.body?.token;
      await fetch(
        `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uidToUpdate}?updateMask.fieldPaths=role&updateMask.fieldPaths=updatedAt&key=${apiKey}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            fields: {
              role: { stringValue: newRole },
              updatedAt: { stringValue: new Date().toISOString() },
            },
          }),
        }
      );
    }

    return res.status(200).json({
      success: true,
      message: `Role for user '${uidToUpdate}' updated to '${newRole}'.`,
      targetUid: uidToUpdate,
      newRole,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
