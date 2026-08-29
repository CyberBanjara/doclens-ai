import { SignJWT, jwtVerify } from "jose";
import { getCookie, setCookie, deleteCookie, getHeader, createError } from "h3";
import type { H3Event } from "h3";
import type { SessionUser, UserRole } from "./auth-types";

export const COOKIE_NAME = "session_token";
export const SESSION_EXPIRY_SECONDS = 4 * 60 * 60; // 4 hours
export const VALID_ROLES: readonly UserRole[] = [
  "admin",
  "editor",
  "moderator",
  "viewer",
  "user",
] as const;

export function isValidRole(role: unknown): role is UserRole {
  return typeof role === "string" && VALID_ROLES.includes(role as UserRole);
}

export function getSecretKey(): Uint8Array {
  const secret = process.env.ADMIN_JWT_SECRET || "";
  if (!secret || secret.trim().length === 0) {
    throw new Error("Missing ADMIN_JWT_SECRET environment variable");
  }
  if (secret.length < 32) {
    console.warn(
      "SECURITY WARNING: ADMIN_JWT_SECRET is shorter than 32 characters. Consider using a 256-bit or longer secret.",
    );
  }
  return new TextEncoder().encode(secret);
}

/**
 * Sign a short-lived, cryptographically signed JWT session for the authenticated user.
 */
export async function createSessionJwt(user: SessionUser): Promise<string> {
  if (!user || !user.uid || !user.email) {
    throw new Error("Cannot create session JWT: missing required user fields (uid, email)");
  }

  if (!isValidRole(user.role)) {
    throw new Error(`Cannot create session JWT: invalid user role '${user.role}'`);
  }

  const secretKey = getSecretKey();
  return await new SignJWT({
    uid: user.uid,
    email: user.email.toLowerCase(),
    name: user.name || "",
    photoURL: user.photoURL || "",
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(user.uid)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_EXPIRY_SECONDS}s`)
    .sign(secretKey);
}

/**
 * Verify a JWT session token: verifies HS256 signature, expiry, and payload claims.
 */
export async function verifySessionJwt(token: string): Promise<SessionUser | null> {
  if (!token || typeof token !== "string") return null;
  const cleanToken = token.trim();
  if (!cleanToken) return null;

  try {
    const secretKey = getSecretKey();
    const { payload } = await jwtVerify(cleanToken, secretKey, {
      algorithms: ["HS256"],
      clockTolerance: 10, // 10s tolerance for clock skew
    });

    if (!payload) return null;

    const uid = typeof payload.uid === "string" ? payload.uid.trim() : "";
    const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    const role = payload.role;

    // Validate essential payload claims
    if (!uid || !email || !isValidRole(role)) {
      return null;
    }

    return {
      uid,
      email,
      name: typeof payload.name === "string" ? payload.name : "",
      photoURL: typeof payload.photoURL === "string" ? payload.photoURL : "",
      role: role as UserRole,
    };
  } catch {
    // Signature verification failure, expired token, or malformed structure
    return null;
  }
}

/**
 * Extract token string from cookie string or headers.
 */
export function extractTokenFromCookieString(cookieHeader?: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Extract and verify session user from H3 event (supporting HttpOnly cookie & Authorization header).
 */
export async function getSessionUserFromEvent(event: H3Event): Promise<SessionUser | null> {
  // 1. Try HttpOnly session cookie
  const cookieToken = getCookie(event, COOKIE_NAME);
  if (cookieToken) {
    const user = await verifySessionJwt(cookieToken);
    if (user) return user;
  }

  // 2. Try Authorization: Bearer <token>
  const authHeader = getHeader(event, "authorization") || getHeader(event, "x-session-token");
  if (authHeader) {
    const bearerToken = authHeader.startsWith("Bearer ")
      ? authHeader.substring(7).trim()
      : authHeader.trim();
    if (bearerToken) {
      const user = await verifySessionJwt(bearerToken);
      if (user) return user;
    }
  }

  return null;
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
 * Guard for protected server endpoints: requires valid session and optional role whitelist.
 */
export async function requireSessionFromEvent(
  event: H3Event,
  allowedRoles?: readonly UserRole[] | UserRole[],
): Promise<SessionUser> {
  const user = await getSessionUserFromEvent(event);
  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: "Unauthorized: Missing or invalid session token",
      data: { error: "Unauthorized: Missing or invalid session token" },
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

/**
 * Extract and verify session user from request headers / cookie in TanStack Start createServerFn context.
 */
export async function verifyRequestAuth(opts?: {
  cookie?: string;
  authorization?: string;
}): Promise<SessionUser | null> {
  if (opts?.cookie) {
    const token = extractTokenFromCookieString(opts.cookie);
    if (token) {
      const user = await verifySessionJwt(token);
      if (user) return user;
    }
  }

  if (opts?.authorization) {
    const token = opts.authorization.startsWith("Bearer ")
      ? opts.authorization.substring(7).trim()
      : opts.authorization.trim();
    if (token) {
      const user = await verifySessionJwt(token);
      if (user) return user;
    }
  }

  return null;
}
