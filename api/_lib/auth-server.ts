import type { VercelRequest, VercelResponse } from "@vercel/node";
import * as adminModule from "firebase-admin";
import { SignJWT, jwtVerify } from "jose";

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
  firebaseIdToken?: string;
}


// Initialize Firebase Admin if apps is available and empty
try {
  const apps = admin.apps || admin.default?.apps;
  if (Array.isArray(apps) && apps.length === 0) {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
      ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
      : null;

    const projectId = process.env.FIREBASE_PROJECT_ID;

    if (!projectId) {
      console.error("FIREBASE_PROJECT_ID environment variable is not set.");
    }

    if (serviceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId,
      });
    } else if (projectId) {
      admin.initializeApp({
        projectId,
      });
    }
  }
} catch (err) {
  console.warn("Firebase Admin SDK init warning:", err);
}

/**
 * Extracts Authorization Bearer token from Vercel/Node request, body, query, or HTTP cookies
 */
export function extractToken(req: any): string | null {
  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  if (authHeader && typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    const extracted = authHeader.split("Bearer ")[1].trim();
    if (extracted && extracted !== "null" && extracted !== "undefined") {
      return extracted;
    }
  }
  if (req.body?.token && typeof req.body.token === "string" && req.body.token !== "null") {
    return req.body.token;
  }
  if (req.query?.token && typeof req.query.token === "string" && req.query.token !== "null") {
    return req.query.token;
  }
  if (req.cookies?.admin_session_token) {
    return req.cookies.admin_session_token;
  }
  const rawCookie = req.headers?.cookie;
  if (rawCookie && typeof rawCookie === "string") {
    const match = rawCookie.match(/(?:^|;\s*)admin_session_token=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
  }
  return null;
}

/**
 * Sets HTTP cookies for admin_session_token and admin_refresh_token in the VercelResponse.
 */
export function setAuthCookies(res: VercelResponse, sessionToken?: string | null, refreshToken?: string | null) {
  const cookies: string[] = [];

  if (sessionToken) {
    cookies.push(`admin_session_token=${encodeURIComponent(sessionToken)}; Path=/; SameSite=Lax; Max-Age=900`);
  }
  if (refreshToken) {
    cookies.push(`admin_refresh_token=${encodeURIComponent(refreshToken)}; Path=/; SameSite=Lax; Max-Age=604800`);
  }

  if (cookies.length > 0) {
    res.setHeader("Set-Cookie", cookies);
  }
}

/**
 * Clears HTTP cookies in response
 */
export function clearAuthCookies(res: VercelResponse) {
  res.setHeader("Set-Cookie", [
    "admin_session_token=; Path=/; SameSite=Lax; Max-Age=0",
    "admin_refresh_token=; Path=/; SameSite=Lax; Max-Age=0",
  ]);
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

  const apiKey = process.env.FIREBASE_API_KEY;
  const projectId = process.env.FIREBASE_PROJECT_ID;

  if (!apiKey || !projectId) {
    return {
      authorized: false,
      uid: null,
      email: null,
      role: "user",
      isPrivileged: false,
      statusCode: 500,
      error: "500 Internal Server Error: Firebase configuration missing from server environment",
    };
  }

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
  let roleFetched = false;

  // Try Admin SDK first if service account is provided
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const apps = admin.apps || admin.default?.apps;
      if (Array.isArray(apps) && apps.length > 0 && typeof admin.firestore === "function") {
        const docSnap = await admin.firestore().collection("users").doc(uid).get();
        if (docSnap.exists) {
          const data = docSnap.data();
          if (data && data.role) {
            role = data.role as UserRole;
            roleFetched = true;
          }
        }
      }
    } catch (fsErr) {
      console.warn("Firestore Admin SDK role lookup warning:", fsErr);
    }
  }

  // Fallback: Query Firestore via REST API if Admin SDK failed or wasn't configured
  if (!roleFetched) {
    try {
      const docRes = await fetch(
        `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}?key=${apiKey}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      if (docRes.ok) {
        const docData = await docRes.json();
        const roleField = docData.fields?.role?.stringValue;
        if (roleField) {
          role = roleField as UserRole;
          roleFetched = true;
        }
      } else {
        console.warn("Firestore REST role lookup status:", docRes.status);
      }
    } catch (restErr) {
      console.warn("Firestore REST role lookup error:", restErr);
    }
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

// ─────────────────────────────────────────────────────────────────────────────
// JWT SESSION AUTHENTICATION (JOSE-based server-side session & refresh mechanism)
// ─────────────────────────────────────────────────────────────────────────────

const JWT_SECRET = process.env.ADMIN_JWT_SECRET || "super-secret-key-32-chars-long-or-more-for-jwt";
const secretKey = new TextEncoder().encode(JWT_SECRET);

/**
 * Issues a short-lived admin/session JWT access token signed using a server-side secret.
 * Contains: uid, email, role, tokenType="access", and optional firebaseIdToken.
 */
export async function issueSessionJWT(
  firebaseIdToken: string,
  uid: string,
  email: string | null,
  role: UserRole
): Promise<string> {
  return await new SignJWT({ uid, email, role, tokenType: "access", firebaseIdToken })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m") // 15-minute short-lived session access token
    .sign(secretKey);
}

/**
 * Issues a longer-lived refresh token signed using the server-side secret.
 * Contains: uid, email, role, tokenType="refresh".
 */
export async function issueRefreshToken(
  uid: string,
  email: string | null,
  role: UserRole
): Promise<string> {
  return await new SignJWT({ uid, email, role, tokenType: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d") // 7-day refresh token duration
    .sign(secretKey);
}

/**
 * Verifies a refresh token's cryptographic signature and returns its payload without calling Firebase/Firestore.
 */
export async function verifyRefreshToken(refreshToken: string): Promise<{
  valid: boolean;
  uid?: string;
  email?: string | null;
  role?: UserRole;
  error?: string;
}> {
  try {
    const { payload } = await jwtVerify(refreshToken, secretKey);
    if (payload.tokenType !== "refresh") {
      return { valid: false, error: "Invalid token type: expected refresh token" };
    }
    return {
      valid: true,
      uid: payload.uid as string,
      email: (payload.email as string) || null,
      role: (payload.role as UserRole) || "user",
    };
  } catch (err: any) {
    return { valid: false, error: `Invalid or expired refresh token: ${err.message}` };
  }
}

/**
 * Verifies a raw JWT string's signature cryptographically without external requests to Firebase or Firestore.
 */
export async function verifyTokenString(
  token: string,
  allowedRoles?: UserRole[]
): Promise<AuthResult> {
  try {
    const { payload } = await jwtVerify(token, secretKey);
    const uid = (payload.uid as string) || null;
    const email = (payload.email as string) || null;
    const role = (payload.role as UserRole) || "user";
    const isPrivileged = PRIVILEGED_ROLES.includes(role);

    if (!uid) {
      return {
        authorized: false,
        uid: null,
        email: null,
        role: "user",
        isPrivileged: false,
        statusCode: 401,
        error: "401 Unauthorized: Invalid payload claims in JWT token",
      };
    }

    // Check allowed roles
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

    const firebaseIdToken = payload.firebaseIdToken as string | undefined;

    return {
      authorized: true,
      uid,
      email,
      role,
      isPrivileged,
      statusCode: 200,
      firebaseIdToken,
    };
  } catch (err: any) {
    return {
      authorized: false,
      uid: null,
      email: null,
      role: "user",
      isPrivileged: false,
      statusCode: 401,
      error: `401 Unauthorized: Invalid or expired session JWT: ${err.message}`,
    };
  }
}

/**
 * Verifies a server-side session JWT token sent in headers or body,
 * and extracts the caller's role and credentials strictly via cryptographic signature.
 */
export async function verifyAdminJWT(
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
      error: "401 Unauthorized: Missing Session Token",
    };
  }

  const result = await verifyTokenString(token, allowedRoles);

  if (result.authorized && req) {
    const xHeaderToken =
      (req.headers?.["x-firebase-id-token"] as string) ||
      (req.headers?.["X-Firebase-ID-Token"] as string);
    req.firebaseIdToken = xHeaderToken || result.firebaseIdToken;
  }

  return result;
}



