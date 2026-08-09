import { defineEventHandler } from "h3";
import { clearSessionCookieOnEvent } from "../../lib/auth-server";

export default defineEventHandler(async (event) => {
  try {
    clearSessionCookieOnEvent(event);
    return { success: true };
  } catch (err: any) {
    console.error("Logout error:", err);
    return { success: false, error: "Failed to logout" };
  }
});
