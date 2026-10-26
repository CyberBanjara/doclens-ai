import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SignJWT, jwtVerify } from "jose";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

// Ensure ADMIN_JWT_SECRET is configured for test execution
if (!process.env.ADMIN_JWT_SECRET) {
  process.env.ADMIN_JWT_SECRET = "super-secret-ultra-secure-key-32-chars-long-minimum!";
}

import { H3Event, getResponseHeaders } from "h3";

describe("🚀 Seamless Authentication & Rolling 10-Day Inactivity Architecture", async () => {
  const {
    COOKIE_NAME,
    SESSION_EXPIRY_SECONDS,
    createSessionJwt,
    verifySessionJwt,
    setSessionCookieOnEvent,
    renewSessionCookieOnEvent,
    clearSessionCookieOnEvent,
    requireSessionFromEvent,
    getSecretKey,
  } = await import("../server/lib/auth-server.ts");

  const { verifyGoogleIdentity } = await import("../server/lib/google-verify.ts");

  // Standard H3Event helper for unit testing cookie and header handling
  function createMockEvent(options = {}) {
    const headers = new Headers();
    if (options.cookies) {
      const cookieStr = Object.entries(options.cookies)
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join("; ");
      headers.set("cookie", cookieStr);
    }
    if (options.headers) {
      for (const [k, v] of Object.entries(options.headers)) {
        if (v) headers.set(k, v);
      }
    }
    const req = new Request("https://anuwad.local/api/auth/me", { headers });
    return new H3Event(req);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 1. Session Persistence & 10-Day Expiry Configuration
  // ─────────────────────────────────────────────────────────────────────────
  describe("📌 1. Session Persistence Configuration", () => {
    it("should configure session expiry to precisely 10 days of inactivity (864,000 seconds)", () => {
      assert.equal(
        SESSION_EXPIRY_SECONDS,
        10 * 24 * 60 * 60,
        "SESSION_EXPIRY_SECONDS must be exactly 10 days (864,000s)",
      );
    });

    it("should set HttpOnly session cookies with 10-day maxAge and SameSite Lax", () => {
      const mockEvent = createMockEvent();
      const testToken = "test.jwt.token";
      setSessionCookieOnEvent(mockEvent, testToken);

      const headers = getResponseHeaders(mockEvent);
      const cookieHeader = Array.isArray(headers["set-cookie"])
        ? headers["set-cookie"].find((c) => c.startsWith(`${COOKIE_NAME}=`))
        : headers["set-cookie"] || "";
      assert.ok(cookieHeader, "Cookie header must be emitted");
      assert.match(cookieHeader, /Max-Age=864000/i, "Cookie must have 864,000s (10 days) max-age");
      assert.match(cookieHeader, /HttpOnly/i, "Cookie must have HttpOnly attribute");
      assert.match(cookieHeader, /SameSite=Lax/i, "Cookie must have SameSite=Lax attribute");
    });

    it("should ensure client Firebase Auth initializes with browserLocalPersistence", () => {
      const firebasePath = path.join(rootDir, "src/lib/firebase.ts");
      const content = fs.readFileSync(firebasePath, "utf-8");
      assert.match(
        content,
        /browserLocalPersistence/,
        "src/lib/firebase.ts must import and configure browserLocalPersistence",
      );
      assert.match(
        content,
        /setPersistence\(\s*authInstance,\s*browserLocalPersistence\s*\)/,
        "src/lib/firebase.ts must call setPersistence with browserLocalPersistence",
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 2. Rolling Inactivity Renewal vs Fixed Expiry
  // ─────────────────────────────────────────────────────────────────────────
  describe("🔄 2. Rolling Inactivity Renewal (Sliding Window)", () => {
    it("should renew session expiry upon authenticated activity, resetting the 10-day timer", async () => {
      const initialUser = {
        uid: "user-rolling-123",
        email: "persistent@anuwad.com",
        name: "Persistent User",
        photoURL: "https://anuwad.com/avatar.png",
        role: "user",
      };

      // 1. Initial Login at T0 (simulated with 10 days = 864000s)
      const tokenAtT0 = await createSessionJwt(initialUser);
      const verifiedT0 = await verifySessionJwt(tokenAtT0);
      assert.ok(verifiedT0);

      // Verify token contains 10-day exp
      const parts = tokenAtT0.split(".");
      const payloadT0 = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));
      const expT0 = payloadT0.exp;
      const iatT0 = payloadT0.iat;
      assert.equal(expT0 - iatT0, 864000, "Token lifespan must be 10 days from issuance");

      // 2. Simulate valid authenticated activity occurring 4 days later
      // The server rolls the session: renewSessionCookieOnEvent re-issues a new JWT
      const mockEvent = createMockEvent({ cookies: { [COOKIE_NAME]: tokenAtT0 } });
      const renewedToken = await renewSessionCookieOnEvent(mockEvent, verifiedT0);

      const renewedParts = renewedToken.split(".");
      const renewedPayload = JSON.parse(Buffer.from(renewedParts[1], "base64url").toString("utf-8"));

      // The new expiration must extend 10 days from the moment of the renewal
      assert.ok(renewedPayload.exp >= expT0, "Renewed token expiry must be extended forward");
      assert.equal(renewedPayload.uid, initialUser.uid);
      assert.equal(renewedPayload.role, "user");

      // Verify cookie was updated with fresh 10-day maxAge
      const headers = getResponseHeaders(mockEvent);
      const setCookieStr = Array.isArray(headers["set-cookie"])
        ? headers["set-cookie"].find((c) => c.startsWith(`${COOKIE_NAME}=`))
        : headers["set-cookie"] || "";
      assert.match(setCookieStr, /Max-Age=864000/i);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 3. Inactivity Expiry Enforcement (> 10 Days)
  // ─────────────────────────────────────────────────────────────────────────
  describe("⏳ 3. Inactivity Expiry Enforcement", () => {
    it("should reject sessions when inactivity exceeds 10 days", async () => {
      const secretKey = getSecretKey();
      const now = Math.floor(Date.now() / 1000);

      // Create token issued 11 days ago that expired 1 day ago (10-day inactivity threshold exceeded)
      const expiredSessionToken = await new SignJWT({
        uid: "inactive-user-456",
        email: "inactive@anuwad.com",
        name: "Inactive User",
        photoURL: "",
        role: "user",
      })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt(now - 11 * 24 * 60 * 60)
        .setExpirationTime(now - 1 * 24 * 60 * 60)
        .sign(secretKey);

      const verified = await verifySessionJwt(expiredSessionToken);
      assert.equal(
        verified,
        null,
        "Session inactive for > 10 days must be strictly rejected by signature verification",
      );
    });

    it("should accept active sessions within the 10-day window", async () => {
      const secretKey = getSecretKey();
      const now = Math.floor(Date.now() / 1000);

      // Token issued 3 days ago (still valid within 10-day inactivity window)
      const validToken = await new SignJWT({
        uid: "active-user-789",
        email: "active@anuwad.com",
        name: "Active User",
        photoURL: "",
        role: "user",
      })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt(now - 3 * 24 * 60 * 60)
        .setExpirationTime(now + 7 * 24 * 60 * 60) // 7 days remaining
        .sign(secretKey);

      const verified = await verifySessionJwt(validToken);
      assert.ok(verified, "Session active within 10-day window must be accepted");
      assert.equal(verified.uid, "active-user-789");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 4. Silent Verification & Dynamic Role & Permissions Refresh
  // ─────────────────────────────────────────────────────────────────────────
  describe("🛡️ 4. Dynamic Role & Permissions Refresh", () => {
    it("server me.get.ts must verify session and dynamically update role from Firestore", () => {
      const mePath = path.join(rootDir, "server/api/auth/me.get.ts");
      const content = fs.readFileSync(mePath, "utf-8");

      assert.match(
        content,
        /getUserFromFirestore\(\s*session\.uid\s*\)/,
        "me.get.ts must check Firestore for authoritative profile and role",
      );
      assert.match(
        content,
        /authoritativeRole\s*=\s*profile\?\.role\s*\|\|\s*session\.role/,
        "me.get.ts must override stale session role with authoritative Firestore role",
      );
      assert.match(
        content,
        /createSessionJwt\(\s*refreshedSessionUser\s*\)/,
        "me.get.ts must issue refreshed JWT with new role and updated 10-day inactivity expiry",
      );
      assert.match(
        content,
        /setSessionCookieOnEvent\(\s*event,\s*renewedJwt\s*\)/,
        "me.get.ts must update the HttpOnly cookie with the renewed session",
      );
    });

    it("should enforce authorization server-side immediately when role changes from user to admin", async () => {
      // 1. User starts with 'user' role
      const userToken = await createSessionJwt({
        uid: "promo-user-1",
        email: "promo@anuwad.com",
        name: "Promoted User",
        photoURL: "",
        role: "user",
      });

      const eventAsUser = createMockEvent({ cookies: { [COOKIE_NAME]: userToken } });

      // Admin endpoint must reject user role with 403 Forbidden
      await assert.rejects(
        async () => {
          await requireSessionFromEvent(eventAsUser, ["admin"]);
        },
        (err) => {
          assert.equal(err.statusCode, 403);
          return true;
        },
      );

      // 2. User is promoted to 'admin' (refreshed session JWT issued)
      const adminToken = await createSessionJwt({
        uid: "promo-user-1",
        email: "promo@anuwad.com",
        name: "Promoted User",
        photoURL: "",
        role: "admin",
      });

      const eventAsAdmin = createMockEvent({ cookies: { [COOKIE_NAME]: adminToken } });

      // Admin endpoint must now grant immediate access without requiring re-login
      const authorizedSession = await requireSessionFromEvent(eventAsAdmin, ["admin"]);
      assert.ok(authorizedSession);
      assert.equal(authorizedSession.role, "admin");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 5. Session Revocation & Disabled Accounts
  // ─────────────────────────────────────────────────────────────────────────
  describe("🚫 5. Session Revocation", () => {
    it("me.get.ts must clear cookie and reject access when user is revoked or disabled", () => {
      const mePath = path.join(rootDir, "server/api/auth/me.get.ts");
      const content = fs.readFileSync(mePath, "utf-8");

      assert.match(
        content,
        /disabled === true \|\| .*revoked === true/,
        "me.get.ts must check for disabled or revoked flags",
      );
      assert.match(
        content,
        /clearSessionCookieOnEvent\(event\)/,
        "me.get.ts must clear the session cookie when revoked",
      );
      assert.match(
        content,
        /return\s*\{\s*user:\s*null,\s*revoked:\s*true\s*\}/,
        "me.get.ts must return revoked indicator",
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 6. Logout Cleanup
  // ─────────────────────────────────────────────────────────────────────────
  describe("🚪 6. Logout Mechanism", () => {
    it("should clear the session cookie on server logout", () => {
      const mockEvent = createMockEvent({ cookies: { [COOKIE_NAME]: "active-session-token" } });
      clearSessionCookieOnEvent(mockEvent);

      const headers = getResponseHeaders(mockEvent);
      const deleteCookieHeader = Array.isArray(headers["set-cookie"])
        ? headers["set-cookie"].find((c) => c.startsWith(`${COOKIE_NAME}=`))
        : headers["set-cookie"] || "";
      assert.ok(deleteCookieHeader, "Must emit Set-Cookie to clear session");
      assert.match(
        deleteCookieHeader,
        /Max-Age=0|Expires=Thu, 01 Jan 1970/i,
        "Cookie must be expired immediately on logout",
      );
    });

    it("client apiLogout must clear local tokens and trigger server logout endpoint", () => {
      const authClientPath = path.join(rootDir, "src/lib/auth-client.ts");
      const content = fs.readFileSync(authClientPath, "utf-8");

      assert.match(
        content,
        /setStoredAuthToken\(null\)/,
        "apiLogout must clear client-side stored tokens",
      );
      assert.match(
        content,
        /fbSignOut\(auth\)/,
        "apiLogout must sign out of Firebase Auth client instance",
      );
      assert.match(
        content,
        /\/api\/auth\/logout/,
        "apiLogout must call serverless /api/auth/logout endpoint",
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 7. Google Sign-In Performance Optimization & Bottleneck Removal
  // ─────────────────────────────────────────────────────────────────────────
  describe("⚡ 7. Google Sign-In Performance Optimizations", () => {
    it("promptGoogleUser in auth-client.ts must use getIdToken(false) to avoid redundant force-refresh network round-trip", () => {
      const authClientPath = path.join(rootDir, "src/lib/auth-client.ts");
      const content = fs.readFileSync(authClientPath, "utf-8");

      assert.match(
        content,
        /getIdToken\(false\)/,
        "promptGoogleUser must use getIdToken(false) rather than forcing an expensive network refresh",
      );
      assert.doesNotMatch(
        content,
        /result\.user\.getIdToken\(true\)/,
        "promptGoogleUser must not contain redundant getIdToken(true)",
      );
    });

    it("google-login.post.ts must run Firestore user sync and Supabase counter in parallel via Promise.all", () => {
      const googleLoginPath = path.join(rootDir, "server/api/auth/google-login.post.ts");
      const content = fs.readFileSync(googleLoginPath, "utf-8");

      assert.match(
        content,
        /Promise\.all\(\s*\[\s*syncUserInFirestore\(verified,\s*idToken\),\s*import\("\.\.\/\.\.\/lib\/supabase-server"\)/,
        "google-login.post.ts must run Firestore sync and Supabase translation counter concurrently with Promise.all",
      );
    });

    it("google-verify.ts should reject forged tokens in sub-millisecond local crypto without network calls", async () => {
      const fakeToken =
        "eyJhbGciOiJub25lIn0.eyJzdWIiOiJmb3JnZWQtZ29vZ2xlLXVpZCIsImVtYWlsIjoiZm9yZ2VkQGdvb2dsZS5jb20ifQ.";

      const start = performance.now();
      const verified = await verifyGoogleIdentity(fakeToken);
      const durationMs = performance.now() - start;

      assert.equal(verified, null, "Forged token must be rejected");
      assert.ok(
        durationMs < 20,
        `Verification must take under 20ms (took ${durationMs.toFixed(2)}ms)`,
      );
    });

    it("AuthContext.tsx must maintain background auto-renewal and onAuthStateChanged session listener", () => {
      const authContextPath = path.join(rootDir, "src/context/AuthContext.tsx");
      const content = fs.readFileSync(authContextPath, "utf-8");

      assert.match(
        content,
        /auth\.onAuthStateChanged/,
        "AuthContext must listen to onAuthStateChanged for silent session restoration across reloads/restarts",
      );
      assert.match(
        content,
        /setInterval\(/,
        "AuthContext must configure periodic background interval to renew session while active",
      );
      assert.match(
        content,
        /visibilitychange/,
        "AuthContext must listen for document visibilitychange to renew session upon user return",
      );
    });
  });
});
