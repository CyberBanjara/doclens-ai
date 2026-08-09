import { SignJWT, jwtVerify } from "jose";
import { getCookie, setCookie, deleteCookie, createError } from "h3";
import type { H3Event } from "h3";
import type { SessionUser, UserRole } from "./auth-types";

export const COOKIE_NAME = "session_token";
export const SESSION_EXPIRY_SECONDS = 4 * 60 * 60; // 4 hours

export function getSecretKey(): Uint8Array {
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
 * Extract and verify session user directly from H3 event cookie.
 */
export async function getSessionUserFromEvent(event: H3Event): Promise<SessionUser | null> {
  const token = getCookie(event, COOKIE_NAME);
  if (!token) return null;
  return await verifySessionJwt(token);
}

/**
 * Set the Secure, HttpOnly session cookie on the H3 response.
 */
export function setSessionCookieOnEvent(event: H3Event, token: string): void {
  const isProd = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
  setCookie(event, COOKIE_NAME, token, {
    path: "/",
    maxAge: SESSION_EXPIRY_SECONDS,
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
  });
}

/**
 * Clear the session cookie on logout on H3 event.
 */
export function clearSessionCookieOnEvent(event: H3Event): void {
  const isProd = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
  deleteCookie(event, COOKIE_NAME, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
  });
}

/**
 * Guard for protected serverless endpoints: requires valid session and optional role.
 */
export async function requireSessionFromEvent(
  event: H3Event,
  allowedRoles?: UserRole[],
): Promise<SessionUser> {
  const user = await getSessionUserFromEvent(event);
  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: "Unauthorized: Missing or invalid session",
      data: { error: "Unauthorized: Missing or invalid session" },
    });
  }

  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    throw createError({
      statusCode: 403,
      statusMessage: "Forbidden: Insufficient permissions",
      data: {
        error: `Forbidden: Requires one of [${allowedRoles.join(", ")}], but current role is '${user.role}'`,
      },
    });
  }

  return user;
}
