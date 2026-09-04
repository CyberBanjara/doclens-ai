import { getCookie, getRequestHeader } from "@tanstack/react-start/server";
import type { UserRole } from "./auth-client";
import type { SessionUser } from "../../server/lib/auth-types";

/**
 * ============================================================================
 * TWO-LAYER AUTHENTICATION & AUTHORIZATION ENGINE: LAYER 1
 * ----------------------------------------------------------------------------
 * Layer 1: JWT Session & Role Verification
 * Validates cryptographic JWT signature, expiry timestamp, and asserts allowed roles.
 * Extracts session_token from HttpOnly cookie or Authorization / x-session-token / x-firebase-token header.
 * ============================================================================
 */
export async function assertRoleSession(
  allowedRoles: UserRole[] = ["admin", "moderator", "editor"],
  tokenOrAuth?: string,
): Promise<SessionUser> {
  let token = tokenOrAuth;
  if (!token) {
    try {
      token = getCookie("session_token");
    } catch {
      // getCookie may throw if called outside server request context
    }
  }
  if (!token) {
    try {
      const header =
        getRequestHeader("authorization") ||
        getRequestHeader("x-session-token") ||
        getRequestHeader("x-firebase-token");
      if (header) {
        token = header.startsWith("Bearer ") ? header.substring(7).trim() : header.trim();
      }
    } catch {
      // getRequestHeader may throw if outside request context
    }
  }

  if (!token) {
    throw new Error(
      "Unauthorized [Layer 1 Failed]: Missing authentication session. Valid JWT required.",
    );
  }

  const { verifySessionJwt } = await import("../../server/lib/auth-server");
  const user = await verifySessionJwt(token);
  if (!user) {
    throw new Error("Unauthorized [Layer 1 Failed]: Invalid or expired session token signature.");
  }

  if (!allowedRoles.includes(user.role)) {
    throw new Error(
      `Forbidden [Layer 1 Failed]: Operation requires one of [${allowedRoles.join(", ")}] roles (current role: '${user.role}').`,
    );
  }

  return user;
}
