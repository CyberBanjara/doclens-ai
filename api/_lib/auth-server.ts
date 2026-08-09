import { SignJWT, jwtVerify } from "jose";
import type { SessionUser, UserRole } from "./auth-types";

const COOKIE_NAME = "session_token";
const SESSION_EXPIRY_SECONDS = 4 * 60 * 60; // 4 hours

function getSecretKey(): Uint8Array {
  const secret =
    process.env.ADMIN_JWT_SECRET ||
    process.env.JWT_SECRET ||
    "anuwaad-production-secure-auth-secret-key-min32chars";
  return new TextEncoder().encode(secret);
}

/**
 * Sign a short-lived JWT session for the authenticated user.
 */
export async function createSessionJwt(user: SessionUser): Promise<string> {
  const secretKey = getSecretKey();
  return await new SignJWT({
    uid: user.uid,
    email: user.email,
    name: user.name,
    photoURL: user.photoURL,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_EXPIRY_SECONDS}s`)
    .sign(secretKey);
}

/**
 * Verify a JWT session token and extract the session user.
 */
export async function verifySessionJwt(token: string): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const secretKey = getSecretKey();
    const { payload } = await jwtVerify(token, secretKey, {
      algorithms: ["HS256"],
    });

    if (!payload || !payload.uid || !payload.email || !payload.role) {
      return null;
    }

    return {
      uid: String(payload.uid),
      email: String(payload.email),
      name: String(payload.name || ""),
      photoURL: String(payload.photoURL || ""),
      role: payload.role as UserRole,
    };
  } catch {
    return null;
  }
}

/**
 * Parse cookies from the standard request headers.
 */
export function parseCookies(req: any): Record<string, string> {
  const cookieHeader = req?.headers?.cookie || req?.headers?.get?.("cookie") || "";
  if (!cookieHeader || typeof cookieHeader !== "string") return {};

  const cookies: Record<string, string> = {};
  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx !== -1) {
      const key = pair.slice(0, idx).trim();
      const val = pair.slice(idx + 1).trim();
      if (key) {
        cookies[key] = decodeURIComponent(val);
      }
    }
  }
  return cookies;
}

/**
 * Extract and verify session user directly from request cookie.
 */
export async function getSessionUser(req: any): Promise<SessionUser | null> {
  const cookies = parseCookies(req);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  return await verifySessionJwt(token);
}

/**
 * Set the Secure, HttpOnly session cookie on the response.
 */
export function setSessionCookie(res: any, token: string): void {
  const isProd = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
  const secureFlag = isProd ? "; Secure" : "";
  const cookieValue = `${COOKIE_NAME}=${encodeURIComponent(
    token,
  )}; Path=/; Max-Age=${SESSION_EXPIRY_SECONDS}; HttpOnly; SameSite=Lax${secureFlag}`;

  if (typeof res.setHeader === "function") {
    res.setHeader("Set-Cookie", cookieValue);
  } else if (res.headers && typeof res.headers.set === "function") {
    res.headers.set("Set-Cookie", cookieValue);
  }
}

/**
 * Clear the session cookie on logout.
 */
export function clearSessionCookie(res: any): void {
  const isProd = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
  const secureFlag = isProd ? "; Secure" : "";
  const cookieValue = `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secureFlag}`;

  if (typeof res.setHeader === "function") {
    res.setHeader("Set-Cookie", cookieValue);
  } else if (res.headers && typeof res.headers.set === "function") {
    res.headers.set("Set-Cookie", cookieValue);
  }
}

/**
 * Guard for protected serverless endpoints: requires valid session and optional role.
 */
export async function requireSession(
  req: any,
  res: any,
  allowedRoles?: UserRole[],
): Promise<SessionUser | null> {
  const user = await getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized: Missing or invalid session" });
    return null;
  }

  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    res.status(403).json({
      error: `Forbidden: Requires one of [${allowedRoles.join(", ")}], but current role is '${user.role}'`,
    });
    return null;
  }

  return user;
}
