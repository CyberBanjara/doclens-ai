import type { VercelRequest, VercelResponse } from "@vercel/node";
import * as adminModule from "firebase-admin";

const admin = (adminModule as any).default || adminModule;

export type UserRole = "admin" | "editor" | "moderator" | "viewer" | "user";

export const PRIVILEGED_ROLES: UserRole[] = ["admin", "moderator", "editor"];

export interface AuthResult {
  authorized: boolean;
  uid: string | null;
  email: string | null;
  role: UserRole;
  isPrivileged: boolean;
  statusCode: number;
  error?: string;
}

// Initialize Firebase Admin if apps is available and empty
try {
  const apps = admin.apps || admin.default?.apps;
  if (Array.isArray(apps) && apps.length === 0) {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
      ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
      : null;

    if (serviceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: process.env.VITE_FIREBASE_PROJECT_ID || "anuwad-789a9",
      });
    } else {
      admin.initializeApp({
        projectId: process.env.VITE_FIREBASE_PROJECT_ID || "anuwad-789a9",
      });
    }
  }
} catch (err) {
  console.warn("Firebase Admin SDK init warning:", err);
}

/**
 * Extracts Authorization Bearer token from Vercel/Node request or body
 */
export function extractToken(req: any): string | null {
  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  if (authHeader && typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    return authHeader.split("Bearer ")[1].trim();
  }
  if (req.body?.token && typeof req.body.token === "string") {
    return req.body.token;
  }
  if (req.query?.token && typeof req.query.token === "string") {
    return req.query.token;
  }
  return null;
}

/**
 * Verifies Firebase ID Token server-side and fetches the user's role from Firestore (`users/{uid}`).
 */
export async function verifyTokenAndFetchRole(
  req: any,
  allowedRoles?: UserRole[]
): Promise<AuthResult> {
  const token = extractToken(req);

  if (!token) {
    return {
      authorized: false,
      uid: null,
      email: null,
      role: "user",
      isPrivileged: false,
      statusCode: 401,
      error: "401 Unauthorized: Missing Authorization Bearer token",
    };
  }

  const apiKey = process.env.VITE_FIREBASE_API_KEY || "AIzaSyBwfBcQ5HM_jbHrwwMa415fTg5NHoYuL6g";
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID || "anuwad-789a9";

  let uid: string | null = null;
  let email: string | null = null;

  // 1. Try Firebase Admin verification if available
  try {
    const apps = admin.apps || admin.default?.apps;
    if (Array.isArray(apps) && apps.length > 0 && typeof admin.auth === "function") {
      const decoded = await admin.auth().verifyIdToken(token);
      uid = decoded.uid;
      email = decoded.email || null;
    }
  } catch (adminErr) {
    // Admin SDK failed or unauthenticated, fallback to Google Identity Toolkit REST API
  }

  // Fallback: Verify token via Google Identity Toolkit REST API
  if (!uid) {
    try {
      const restRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken: token }),
        }
      );

      if (!restRes.ok) {
        return {
          authorized: false,
          uid: null,
          email: null,
          role: "user",
          isPrivileged: false,
          statusCode: 401,
          error: "401 Unauthorized: Invalid or expired Firebase ID token",
        };
      }

      const restData = await restRes.json();
      const userObj = restData.users?.[0];
      if (!userObj || !userObj.localId) {
        return {
          authorized: false,
          uid: null,
          email: null,
          role: "user",
          isPrivileged: false,
          statusCode: 401,
          error: "401 Unauthorized: User not found for token",
        };
      }

      uid = userObj.localId;
      email = userObj.email || null;
    } catch (fetchErr: any) {
      return {
        authorized: false,
        uid: null,
        email: null,
        role: "user",
        isPrivileged: false,
        statusCode: 500,
        error: `500 Internal Server Error verifying token: ${fetchErr.message}`,
      };
    }
  }

  // 2. Fetch User Role from Firestore `users/{uid}`
  let role: UserRole = "user";

  try {
    const apps = admin.apps || admin.default?.apps;
    if (Array.isArray(apps) && apps.length > 0 && typeof admin.firestore === "function") {
      const docSnap = await admin.firestore().collection("users").doc(uid).get();
      if (docSnap.exists) {
        const data = docSnap.data();
        if (data && data.role) {
          role = data.role as UserRole;
        }
      }
    } else {
      // Fallback: Query Firestore via REST API
      const docRes = await fetch(
        `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}?key=${apiKey}`
      );
      if (docRes.ok) {
        const docData = await docRes.json();
        const roleField = docData.fields?.role?.stringValue;
        if (roleField) {
          role = roleField as UserRole;
        }
      }
    }
  } catch (fsErr) {
    console.warn("Firestore role fetch warning:", fsErr);
  }

  const isPrivileged = PRIVILEGED_ROLES.includes(role);

  // 3. Authorization Check against allowedRoles
  if (allowedRoles && allowedRoles.length > 0) {
    if (!allowedRoles.includes(role)) {
      return {
        authorized: false,
        uid,
        email,
        role,
        isPrivileged,
        statusCode: 403,
        error: `403 Forbidden: Role '${role}' is not authorized. Allowed roles: [${allowedRoles.join(
          ", "
        )}]`,
      };
    }
  }

  return {
    authorized: true,
    uid,
    email,
    role,
    isPrivileged,
    statusCode: 200,
  };
}

/**
 * Standard CORS helper for Vercel Serverless Functions
 */
export function setCorsHeaders(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization"
  );
}
