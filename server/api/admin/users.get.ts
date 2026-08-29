import { defineEventHandler, getHeader, createError } from "h3";
import { requireSessionFromEvent } from "../../lib/auth-server";
import { listUsersFromFirestore } from "../../lib/firestore-server";

export default defineEventHandler(async (event) => {
  try {
    // 1. Verify admin privilege via HttpOnly cookie session
    await requireSessionFromEvent(event, ["admin"]);

    // 2. Extract client authorization token for Firestore security rules
    const authHeader =
      getHeader(event, "authorization") || getHeader(event, "x-firebase-token") || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.substring(7)
      : authHeader || undefined;

    // 3. Fetch users list from Firestore using admin credentials
    const users = await listUsersFromFirestore(token);

    return { users };
  } catch (err: any) {
    if (err.statusCode) {
      throw err;
    }
    console.error("Admin list users error:", err);
    throw createError({
      statusCode: 500,
      statusMessage: err?.message || "Failed to list users",
      data: { error: err?.message || "Failed to list users" },
    });
  }
});
