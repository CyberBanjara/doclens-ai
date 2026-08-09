import { defineEventHandler, readBody, getHeader, createError } from "h3";
import { requireSessionFromEvent } from "../../lib/auth-server";
import { updateUserRoleInFirestore } from "../../lib/firestore-server";
import type { UserRole } from "../../lib/auth-types";

const VALID_ROLES: UserRole[] = ["admin", "editor", "moderator", "viewer", "user"];

export default defineEventHandler(async (event) => {
  try {
    // 1. Verify admin privilege via HttpOnly cookie session
    await requireSessionFromEvent(event, ["admin"]);

    const body = await readBody<{ uid?: string; role?: string; idToken?: string }>(event);
    const { uid, role, idToken } = body || {};

    if (!uid || typeof uid !== "string") {
      throw createError({
        statusCode: 400,
        statusMessage: "Missing valid uid parameter",
        data: { error: "Missing valid uid parameter" },
      });
    }

    if (!role || !VALID_ROLES.includes(role as UserRole)) {
      throw createError({
        statusCode: 400,
        statusMessage: `Invalid role '${role}'. Must be one of: ${VALID_ROLES.join(", ")}`,
        data: { error: `Invalid role '${role}'. Must be one of: ${VALID_ROLES.join(", ")}` },
      });
    }

    // 2. Extract authorization token
    const authHeader = getHeader(event, "authorization") || getHeader(event, "x-firebase-token") || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.substring(7)
      : authHeader || idToken || undefined;

    // 3. Update role in Firestore using admin credentials
    const updated = await updateUserRoleInFirestore(uid, role as UserRole, token);
    if (!updated) {
      throw createError({
        statusCode: 500,
        statusMessage: "Failed to update role in database",
        data: { error: "Failed to update role in database" },
      });
    }

    return {
      success: true,
      uid,
      role,
      message: `User role updated to ${role}`,
    };
  } catch (err: any) {
    if (err.statusCode) {
      throw err;
    }
    console.error("Admin update role error:", err);
    throw createError({
      statusCode: 500,
      statusMessage: err?.message || "Failed to update user role",
      data: { error: err?.message || "Failed to update user role" },
    });
  }
});
