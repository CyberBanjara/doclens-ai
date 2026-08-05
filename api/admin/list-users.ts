import type { VercelRequest, VercelResponse } from "@vercel/node";
import * as adminModule from "firebase-admin";
import { verifyAdminJWT, setCorsHeaders, type UserRole } from "../_lib/auth-server.js";

const admin = (adminModule as any).default || adminModule;

export interface UserItem {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string | null;
  role: UserRole;
  createdAt?: string;
  updatedAt?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    // Strictly verify admin JWT & enforce caller MUST have 'admin' role
    const authCheck = await verifyAdminJWT(req, ["admin"]);

    if (!authCheck.authorized) {
      return res.status(authCheck.statusCode).json({
        error: authCheck.error,
        role: authCheck.role,
      });
    }

    const apiKey = process.env.FIREBASE_API_KEY;
    const projectId = process.env.FIREBASE_PROJECT_ID;

    if (!apiKey || !projectId) {
      return res.status(500).json({
        error: "Firebase configuration missing from server environment variables.",
      });
    }

    const usersList: UserItem[] = [];

    // Try Firebase Admin SDK first if service account is configured
    let adminFetched = false;
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      try {
        const apps = admin.apps || admin.default?.apps;
        if (Array.isArray(apps) && apps.length > 0 && typeof admin.firestore === "function") {
          const snapshot = await admin.firestore().collection("users").get();
          snapshot.forEach((doc: any) => {
            const data = doc.data();
            usersList.push({
              uid: doc.id,
              displayName: data.displayName || data.name || "Anonymous User",
              email: data.email || "No email",
              photoURL: data.photoURL || data.avatar || null,
              role: (data.role as UserRole) || "user",
              createdAt: data.createdAt ? new Date(data.createdAt).toISOString() : undefined,
              updatedAt: data.updatedAt ? new Date(data.updatedAt).toISOString() : undefined,
            });
          });
          adminFetched = true;
        }
      } catch (fsErr) {
        console.warn("Firestore Admin query failed, falling back to REST:", fsErr);
      }
    }

    // Fallback: Query Firestore via REST API if Admin SDK wasn't used or failed
    if (!adminFetched) {
      const firebaseIdToken =
        (req.headers["x-firebase-id-token"] as string) ||
        (req.headers["X-Firebase-ID-Token"] as string) ||
        (req as any).firebaseIdToken ||
        authCheck.firebaseIdToken;

      const restRes = await fetch(
        `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users?key=${apiKey}`,
        {
          headers: firebaseIdToken ? { Authorization: `Bearer ${firebaseIdToken}` } : {},
        }
      );

      if (restRes.ok) {
        const restData = await restRes.json();
        const documents = restData.documents || [];

        for (const doc of documents) {
          const nameParts = doc.name ? doc.name.split("/") : [];
          const docId = nameParts[nameParts.length - 1];
          const fields = doc.fields || {};

          usersList.push({
            uid: docId,
            displayName:
              fields.displayName?.stringValue || fields.name?.stringValue || "Anonymous User",
            email: fields.email?.stringValue || "No email",
            photoURL: fields.photoURL?.stringValue || fields.avatar?.stringValue || null,
            role: (fields.role?.stringValue as UserRole) || "user",
            createdAt: doc.createTime,
            updatedAt: doc.updateTime,
          });
        }
      } else {
        const errJson = await restRes.json().catch(() => ({}));
        console.error("Firestore REST list users error:", restRes.status, errJson);
        return res.status(restRes.status).json({
          error: `Firestore REST error (${restRes.status}): ${
            errJson?.error?.message || "Missing or insufficient permissions to query users."
          }`,
        });
      }
    }



    return res.status(200).json({
      success: true,
      requesterUid: authCheck.uid,
      users: usersList,
      totalCount: usersList.length,
    });
  } catch (err: any) {
    console.error("Error in list-users serverless function:", err);
    return res.status(500).json({
      error: `Internal Server Error listing users: ${err.message}`,
    });
  }
}
