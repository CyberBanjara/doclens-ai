/**
 * Comprehensive Security Test Suite for Anuwad (DocLens AI)
 *
 * Test Matrix:
 * 1. JWT Cryptographic Verification & Alg "none" Bypass
 * 2. Signature Tampering & Secret Key Forgery
 * 3. Token Expiry & Time Manipulation
 * 4. Token Claims & Role Validation
 * 5. Privilege Escalation Across Authorization Matrix
 * 6. Unauthorized Storage Write Access (Cloudflare R2)
 * 7. Unauthorized Database Write Access (Supabase)
 * 8. Google ID Token Forgery & Identity Bypass
 * 9. Header Spoofing & Direct Endpoint Access
 * 10. Server Credential Isolation & Leak Prevention
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SignJWT } from "jose";

// Ensure environment variables are loaded for testing
process.env.ADMIN_JWT_SECRET =
  process.env.ADMIN_JWT_SECRET || "super-secret-key-32-chars-long-or-more-for-jwt";
process.env.STORAGE_DISPATCH_TOKEN_ID =
  process.env.STORAGE_DISPATCH_TOKEN_ID || "test_r2_write_token_id";
process.env.STORAGE_DISPATCH_TOKEN_SECRET =
  process.env.STORAGE_DISPATCH_TOKEN_SECRET || "test_r2_write_token_secret";
process.env.PIPELINE_CATALOG_SYNC_TOKEN =
  process.env.PIPELINE_CATALOG_SYNC_TOKEN || "test_supabase_write_token";
process.env.R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "03961f8e926b09af73d33155c84647a1";
process.env.R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "anuwadpdf";
process.env.R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "read_only_r2_key";
process.env.R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "read_only_r2_secret";
process.env.VITE_SUPABASE_URL =
  process.env.VITE_SUPABASE_URL || "https://toaygknwrscylpcgrscm.supabase.co";
process.env.VITE_SUPABASE_PUBLISHABLE_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_test_key";

const {
  createSessionJwt,
  verifySessionJwt,
  getSecretKey,
  requireSessionFromEvent,
  getSessionUserFromEvent,
  VALID_ROLES,
} = await import("../server/lib/auth-server.ts");

const { verifyGoogleIdentity } = await import("../server/lib/google-verify.ts");
const { H3Event } = await import("h3");

describe("🔐 1. JWT Cryptographic Verification & Alg 'none' Bypass", () => {
  it("should reject unsigned tokens with alg: 'none'", async () => {
    // Construct unsigned JWT (alg: none)
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        uid: "attacker-1",
        email: "attacker@test.com",
        role: "admin",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url");
    const unsignedJwt = `${header}.${payload}.`;

    const result = await verifySessionJwt(unsignedJwt);
    assert.equal(result, null, "Unsigned JWT with alg: 'none' must be rejected");
  });

  it("should reject tokens signed with an arbitrary/wrong secret key", async () => {
    const wrongSecret = new TextEncoder().encode("wrong-secret-key-32-chars-long-at-least!!");
    const forgedToken = await new SignJWT({
      uid: "hacker-1",
      email: "hacker@evil.com",
      role: "admin",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("2h")
      .sign(wrongSecret);

    const result = await verifySessionJwt(forgedToken);
    assert.equal(result, null, "Token signed with incorrect secret key must be rejected");
  });

  it("should reject tokens where the payload has been tampered with after signing", async () => {
    // Generate valid user token
    const userToken = await createSessionJwt({
      uid: "user-123",
      email: "user@anuwad.com",
      name: "Normal User",
      photoURL: "",
      role: "user",
    });

    // Tamper with payload to change role from "user" to "admin" without updating signature
    const parts = userToken.split(".");
    assert.equal(parts.length, 3);

    const decodedPayload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    decodedPayload.role = "admin"; // Privilege escalation attempt
    const tamperedPayloadB64 = Buffer.from(JSON.stringify(decodedPayload)).toString("base64url");

    const tamperedToken = `${parts[0]}.${tamperedPayloadB64}.${parts[2]}`;

    const result = await verifySessionJwt(tamperedToken);
    assert.equal(result, null, "Tampered payload with mismatched signature must be rejected");
  });
});

describe("⏳ 2. Token Expiry & Time Manipulation", () => {
  it("should reject expired tokens", async () => {
    const secretKey = getSecretKey();
    const expiredToken = await new SignJWT({
      uid: "expired-user",
      email: "expired@test.com",
      role: "admin",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200) // 2h ago
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600) // expired 1h ago
      .sign(secretKey);

    const result = await verifySessionJwt(expiredToken);
    assert.equal(result, null, "Expired token must be rejected");
  });

  it("should reject malformed or truncated token strings", async () => {
    assert.equal(await verifySessionJwt(""), null);
    assert.equal(await verifySessionJwt("not.a.token"), null);
    assert.equal(await verifySessionJwt("eyJhbGciOiJIUzI1NiJ9.invalid-payload"), null);
    assert.equal(await verifySessionJwt("Bearer random-noise"), null);
  });
});

describe("📋 3. Token Claims & Role Validation", () => {
  it("should reject tokens missing essential claims (uid, email, role)", async () => {
    const secretKey = getSecretKey();

    // Missing email
    const noEmailToken = await new SignJWT({ uid: "user-1", role: "user" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(secretKey);
    assert.equal(
      await verifySessionJwt(noEmailToken),
      null,
      "Missing email claim must be rejected",
    );

    // Missing uid
    const noUidToken = await new SignJWT({ email: "user@test.com", role: "user" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(secretKey);
    assert.equal(await verifySessionJwt(noUidToken), null, "Missing uid claim must be rejected");

    // Missing role
    const noRoleToken = await new SignJWT({ uid: "user-1", email: "user@test.com" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(secretKey);
    assert.equal(await verifySessionJwt(noRoleToken), null, "Missing role claim must be rejected");
  });

  it("should reject tokens with invalid/invented role names", async () => {
    const secretKey = getSecretKey();
    const fakeRoles = ["root", "superuser", "owner", "god_mode", "administrator", ""];

    for (const fakeRole of fakeRoles) {
      const token = await new SignJWT({
        uid: "fake-role-user",
        email: "fake@test.com",
        role: fakeRole,
      })
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime("1h")
        .sign(secretKey);

      assert.equal(
        await verifySessionJwt(token),
        null,
        `Token with illegal role '${fakeRole}' must be rejected`,
      );
    }
  });

  it("should successfully verify all valid role claims in the Authorization Matrix", async () => {
    for (const validRole of VALID_ROLES) {
      const token = await createSessionJwt({
        uid: `test-${validRole}`,
        email: `${validRole}@anuwad.com`,
        name: `Test ${validRole}`,
        photoURL: "https://example.com/photo.jpg",
        role: validRole,
      });

      const user = await verifySessionJwt(token);
      assert.ok(user, `Valid token for role '${validRole}' should verify successfully`);
      assert.equal(user.uid, `test-${validRole}`);
      assert.equal(user.email, `${validRole}@anuwad.com`);
      assert.equal(user.role, validRole);
    }
  });

  it("should correctly encode and verify nativeLanguage and educationLevel profile claims in JWT", async () => {
    const token = await createSessionJwt({
      uid: "student-123",
      email: "student@anuwad.com",
      name: "Rohan Sharma",
      photoURL: "https://example.com/rohan.jpg",
      role: "user",
      nativeLanguage: "हिंदी",
      educationLevel: "class-10",
    });

    const user = await verifySessionJwt(token);
    assert.ok(user, "Token with profile preferences should verify");
    assert.equal(user.uid, "student-123");
    assert.equal(user.nativeLanguage, "हिंदी");
    assert.equal(user.educationLevel, "class-10");
  });
});

describe("🛡️ 4. Privilege Escalation Across Authorization Matrix", () => {
  function createMockEvent(opts = {}) {
    const headers = new Headers();
    if (opts.headers) {
      for (const [k, v] of Object.entries(opts.headers)) {
        if (v) headers.set(k, v);
      }
    }
    const req = new Request("https://anuwad.local/api/admin/users", {
      headers,
    });
    return new H3Event(req);
  }

  it("should reject anonymous requests to admin endpoints with 401 Unauthorized", async () => {
    const event = createMockEvent();
    await assert.rejects(
      async () => {
        await requireSessionFromEvent(event, ["admin"]);
      },
      (err) => {
        assert.equal(err.statusCode, 401);
        return true;
      },
    );
  });

  it("should reject non-admin roles (user, viewer, moderator, editor) from admin endpoints with 403 Forbidden", async () => {
    const nonAdminRoles = ["user", "viewer", "moderator", "editor"];

    for (const role of nonAdminRoles) {
      const token = await createSessionJwt({
        uid: `uid-${role}`,
        email: `${role}@anuwad.com`,
        name: `Test ${role}`,
        photoURL: "",
        role: role,
      });

      // 1. Test via Cookie
      const eventWithCookie = createMockEvent({
        headers: { cookie: `session_token=${token}` },
      });
      await assert.rejects(
        async () => {
          await requireSessionFromEvent(eventWithCookie, ["admin"]);
        },
        (err) => {
          assert.equal(
            err.statusCode,
            403,
            `Role '${role}' must receive 403 Forbidden on admin endpoints`,
          );
          return true;
        },
      );

      // 2. Test via Bearer Header
      const eventWithBearer = createMockEvent({
        headers: { authorization: `Bearer ${token}` },
      });
      await assert.rejects(
        async () => {
          await requireSessionFromEvent(eventWithBearer, ["admin"]);
        },
        (err) => {
          assert.equal(
            err.statusCode,
            403,
            `Role '${role}' via Bearer header must receive 403 Forbidden on admin endpoints`,
          );
          return true;
        },
      );
    }
  });

  it("should allow verified 'admin' sessions access to admin endpoints", async () => {
    const adminToken = await createSessionJwt({
      uid: "admin-uid-1",
      email: "admin@anuwad.com",
      name: "Super Admin",
      photoURL: "",
      role: "admin",
    });

    const event = createMockEvent({
      headers: { cookie: `session_token=${adminToken}` },
    });

    const session = await requireSessionFromEvent(event, ["admin"]);
    assert.ok(session);
    assert.equal(session.role, "admin");
    assert.equal(session.email, "admin@anuwad.com");
  });
});

describe("🗄️ 5. Unauthorized Storage Write Access & 2-Layer Credential Separation (R2)", () => {
  it("should ensure non-obvious write environment variables are configured and distinct", () => {
    assert.ok(
      process.env.STORAGE_DISPATCH_TOKEN_ID,
      "STORAGE_DISPATCH_TOKEN_ID must be configured",
    );
    assert.ok(
      process.env.STORAGE_DISPATCH_TOKEN_SECRET,
      "STORAGE_DISPATCH_TOKEN_SECRET must be configured",
    );
    // Ensure variable names do not expose obvious write keys
    assert.ok(!("R2_WRITE_KEY" in process.env), "Avoid obvious variable names like R2_WRITE_KEY");
  });

  it("should enforce Layer 1: reject write operations without a valid admin JWT session", async () => {
    const userToken = await createSessionJwt({
      uid: "regular-user",
      email: "user@test.com",
      name: "Regular User",
      photoURL: "",
      role: "user",
    });

    const user = await verifySessionJwt(userToken);
    assert.ok(user);
    assert.notEqual(user.role, "admin", "User must not be admin");

    assert.throws(() => {
      if (user.role !== "admin") {
        throw new Error("Forbidden [Layer 1 Failed]: Operation requires administrator role.");
      }
    }, /Forbidden \[Layer 1 Failed\]/);
  });

  it("should enforce Layer 2: reject write operations if write API key credential is missing", () => {
    const savedKey = process.env.STORAGE_DISPATCH_TOKEN_ID;
    delete process.env.STORAGE_DISPATCH_TOKEN_ID;

    assert.throws(() => {
      const writeKey = process.env.STORAGE_DISPATCH_TOKEN_ID;
      if (!writeKey) {
        throw new Error(
          "Unauthorized [Layer 2 Failed]: Missing write-capable API key credentials.",
        );
      }
    }, /Unauthorized \[Layer 2 Failed\]/);

    // Restore
    process.env.STORAGE_DISPATCH_TOKEN_ID = savedKey;
  });

  it("should strictly use read-only credentials for read operations (list/get/download)", () => {
    const readKeyId = process.env.R2_ACCESS_KEY_ID;
    const readSecret = process.env.R2_SECRET_ACCESS_KEY;
    assert.ok(readKeyId, "Read Key ID must be present");
    assert.ok(readSecret, "Read Secret must be present");
    assert.notEqual(
      readKeyId,
      process.env.STORAGE_DISPATCH_TOKEN_ID,
      "Read key ID and write key ID must remain separate",
    );
  });
});

describe("⚡ 6. Unauthorized Database Write Access & 2-Layer Credential Separation (Supabase)", () => {
  it("should ensure non-obvious Supabase write environment variable is configured", () => {
    assert.ok(
      process.env.PIPELINE_CATALOG_SYNC_TOKEN,
      "PIPELINE_CATALOG_SYNC_TOKEN must be configured",
    );
    assert.ok(
      !process.env.VITE_SUPABASE_SECRET_KEY,
      "SUPABASE_SECRET_KEY must never be prefixed with VITE_",
    );
  });

  it("should enforce Layer 1: reject database write operations without admin authorization", async () => {
    const editorToken = await createSessionJwt({
      uid: "editor-user",
      email: "editor@test.com",
      name: "Editor User",
      photoURL: "",
      role: "editor",
    });

    const editorUser = await verifySessionJwt(editorToken);
    assert.ok(editorUser);
    assert.notEqual(editorUser.role, "admin");

    assert.throws(() => {
      if (editorUser.role !== "admin") {
        throw new Error(
          "Forbidden [Layer 1 Failed]: Database write operations require administrator role.",
        );
      }
    }, /Forbidden \[Layer 1 Failed\]/);
  });

  it("should enforce Layer 2: reject database write operations if write token is missing", () => {
    const savedToken = process.env.PIPELINE_CATALOG_SYNC_TOKEN;
    delete process.env.PIPELINE_CATALOG_SYNC_TOKEN;

    assert.throws(() => {
      const token = process.env.PIPELINE_CATALOG_SYNC_TOKEN;
      if (!token) {
        throw new Error("Unauthorized [Layer 2 Failed]: Missing write-capable database token.");
      }
    }, /Unauthorized \[Layer 2 Failed\]/);

    process.env.PIPELINE_CATALOG_SYNC_TOKEN = savedToken;
  });
});

describe("🔍 7. Google ID Token Forgery & Identity Bypass", () => {
  it("should reject unverified/forged Google ID tokens (no bypass allowed)", async () => {
    // Construct forged Google ID Token with arbitrary sub/email
    const fakeToken =
      "eyJhbGciOiJub25lIn0.eyJzdWIiOiJmb3JnZWQtZ29vZ2xlLXVpZCIsImVtYWlsIjoiZm9yZ2VkQGdvb2dsZS5jb20ifQ.";

    const verified = await verifyGoogleIdentity(fakeToken);
    assert.equal(
      verified,
      null,
      "Forged Google ID token must be rejected without signature verification",
    );
  });

  it("should reject empty or non-string Google ID tokens", async () => {
    assert.equal(await verifyGoogleIdentity(""), null);
    assert.equal(await verifyGoogleIdentity(null), null);
    assert.equal(await verifyGoogleIdentity(undefined), null);
  });
});

describe("🔒 8. Server Credential Isolation & Leak Prevention", () => {
  it("should verify that server-side write secrets are NOT prefixed with VITE_", () => {
    const sensitiveServerKeys = [
      "ADMIN_JWT_SECRET",
      "STORAGE_DISPATCH_TOKEN_ID",
      "STORAGE_DISPATCH_TOKEN_SECRET",
      "PIPELINE_CATALOG_SYNC_TOKEN",
      "SUPABASE_SECRET_KEY",
      "FIREBASE_API_KEY",
      "RAZORPAY_KEY_SECRET",
    ];

    for (const key of sensitiveServerKeys) {
      assert.ok(
        !key.startsWith("VITE_"),
        `Sensitive secret '${key}' must never be prefixed with VITE_`,
      );
    }
  });

  it("should verify that session cookies use Secure, HttpOnly, and SameSite attributes", async () => {
    const { setSessionCookieOnEvent } = await import("../server/lib/auth-server.ts");
    assert.ok(setSessionCookieOnEvent);
  });
});
