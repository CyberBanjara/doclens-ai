import type { VercelRequest, VercelResponse } from "@vercel/node";
import * as adminModule from "firebase-admin";
import { verifyAdminJWT, setCorsHeaders, type UserRole } from "../_lib/auth-server.js";

const admin = (adminModule as any).default || adminModule;

const VALID_ROLES: UserRole[] = ["admin", "moderator", "editor", "user", "viewer"];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST" && req.method !== "PATCH") {
    return res.status(405).json({ error: "Method Not Allowed. Use POST or PATCH." });
  }

  try {
    // 1. Independently verify admin JWT & enforce that caller MUST be an 'admin'
    const authCheck = await verifyAdminJWT(req, ["admin"]);

    if (!authCheck.authorized) {
      return res.status(authCheck.statusCode).json({
        error: authCheck.error,
        callerRole: authCheck.role,
      });
    }

    const { targetUid, newRole } = req.body || {};

    if (!targetUid || typeof targetUid !== "string") {
      return res.status(400).json({ error: "Missing or invalid 'targetUid' in request body" });
    }

    if (!newRole || !VALID_ROLES.includes(newRole as UserRole)) {
      return res.status(400).json({
        error: `Invalid 'newRole'. Allowed roles: [${VALID_ROLES.join(", ")}]`,
      });
    }

    const apiKey = process.env.FIREBASE_API_KEY;
    const projectId = process.env.FIREBASE_PROJECT_ID;

    if (!apiKey || !projectId) {
      return res.status(500).json({
        error: "Firebase configuration missing from server environment variables.",
      });
    }

    let updated = false;

    // 2. Try Firebase Admin SDK first if service account is configured
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      try {
        const apps = admin.apps || admin.default?.apps;
        if (Array.isArray(apps) && apps.length > 0 && typeof admin.firestore === "function") {
          await admin
            .firestore()
            .collection("users")
            .doc(targetUid)
            .set({ role: newRole, updatedAt: new Date().toISOString() }, { merge: true });
          updated = true;
        }
      } catch (fsErr) {
        console.warn("Firestore Admin SDK update failed, trying REST API:", fsErr);
      }
    }

    // 3. Fallback: Firestore REST API PATCH request
    if (!updated) {
      const token = (req as any).firebaseIdToken;
      const restRes = await fetch(
        `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${targetUid}?updateMask.fieldPaths=role&updateMask.fieldPaths=updatedAt&key=${apiKey}`,
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

      if (!restRes.ok) {
        const errJson = await restRes.json().catch(() => ({}));
        return res.status(restRes.status).json({
          error: `Failed to update target user role in Firestore: ${
            errJson.error?.message || restRes.statusText
          }`,
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: `User '${targetUid}' role successfully updated to '${newRole}'.`,
      targetUid,
      newRole,
      updatedBy: authCheck.uid,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("Error in update-user-role serverless function:", err);
    return res.status(500).json({
      error: `Internal Server Error updating user role: ${err.message}`,
    });
  }
}

