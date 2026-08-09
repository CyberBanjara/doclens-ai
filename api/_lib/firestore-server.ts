import type { UserProfileRecord, UserRole } from "./auth-types";
import type { VerifiedGoogleUser } from "./google-verify";

function getFirestoreBaseUrl(): { baseUrl: string; apiKey: string; projectId: string } | null {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const apiKey = process.env.FIREBASE_API_KEY;
  if (!projectId || !apiKey) {
    console.warn("Missing FIREBASE_PROJECT_ID or FIREBASE_API_KEY for Firestore REST operations");
    return null;
  }
  return {
    baseUrl: `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`,
    apiKey,
    projectId,
  };
}

function decodeFirestoreFields(fields: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  if (!fields || typeof fields !== "object") return result;

  for (const [key, val] of Object.entries(fields)) {
    if (val && typeof val === "object") {
      if ("stringValue" in val) result[key] = val.stringValue;
      else if ("integerValue" in val) result[key] = Number(val.integerValue);
      else if ("doubleValue" in val) result[key] = Number(val.doubleValue);
      else if ("booleanValue" in val) result[key] = val.booleanValue;
      else if ("timestampValue" in val) result[key] = val.timestampValue;
      else if ("nullValue" in val) result[key] = null;
    }
  }
  return result;
}

function encodeFirestoreFields(data: Record<string, any>): Record<string, any> {
  const fields: Record<string, any> = {};
  for (const [key, val] of Object.entries(data)) {
    if (val === null || val === undefined) {
      fields[key] = { nullValue: null };
    } else if (typeof val === "string") {
      fields[key] = { stringValue: val };
    } else if (typeof val === "boolean") {
      fields[key] = { booleanValue: val };
    } else if (typeof val === "number") {
      fields[key] = Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
    }
  }
  return fields;
}

/**
 * Fetch a single user profile from Firestore.
 * Supports passing the user's ID token to authenticate with Firestore Security Rules.
 */
export async function getUserFromFirestore(
  uid: string,
  idToken?: string,
): Promise<UserProfileRecord | null> {
  const config = getFirestoreBaseUrl();
  if (!config) return null;

  try {
    const url = `${config.baseUrl}/users/${encodeURIComponent(uid)}?key=${config.apiKey}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (idToken) {
      headers["Authorization"] = `Bearer ${idToken}`;
    }

    const res = await fetch(url, { method: "GET", headers });
    if (!res.ok) {
      if (res.status === 404) return null;
      const text = await res.text();
      console.error(`Firestore get error (${res.status}):`, text);
      return null;
    }

    const doc = await res.json();
    const raw = decodeFirestoreFields(doc.fields || {});
    return {
      uid: raw.uid || uid,
      email: raw.email || "",
      name: raw.name || "User",
      photoURL: raw.photoURL || raw.photoUrl || raw.picture || "",
      role: (raw.role as UserRole) || "user",
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      lastLoginAt: raw.lastLoginAt,
    };
  } catch (err) {
    console.error("Failed to fetch user from Firestore:", err);
    return null;
  }
}

/**
 * Synchronize user profile on Google login.
 * Passes the verified Google ID token to Firestore so that security rules allow reading/updating the user's profile.
 * Preserves existing role if user already exists (e.g. 'admin'); otherwise assigns default 'user' role.
 */
export async function syncUserInFirestore(
  googleUser: VerifiedGoogleUser,
  idToken?: string,
): Promise<UserProfileRecord> {
  const config = getFirestoreBaseUrl();
  const nowIso = new Date().toISOString();

  // Fallback in-memory profile if Firestore config is missing
  if (!config) {
    return {
      uid: googleUser.uid,
      email: googleUser.email,
      name: googleUser.name,
      photoURL: googleUser.photoURL,
      role: "user",
      createdAt: nowIso,
      lastLoginAt: nowIso,
    };
  }

  const authHeaders: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (idToken) {
    authHeaders["Authorization"] = `Bearer ${idToken}`;
  }

  try {
    const existing = await getUserFromFirestore(googleUser.uid, idToken);
    if (existing) {
      // Existing user: update metadata and lastLoginAt, but preserve role and createdAt
      const photoURL = googleUser.photoURL || existing.photoURL || "";
      const updatedFields: Record<string, any> = {
        name: googleUser.name || existing.name,
        email: googleUser.email || existing.email,
        photoURL,
        photoUrl: photoURL,
        lastLoginAt: nowIso,
        updatedAt: nowIso,
      };

      const maskParams = [
        "updateMask.fieldPaths=name",
        "updateMask.fieldPaths=email",
        "updateMask.fieldPaths=photoURL",
        "updateMask.fieldPaths=photoUrl",
        "updateMask.fieldPaths=lastLoginAt",
        "updateMask.fieldPaths=updatedAt",
      ].join("&");

      const patchUrl = `${config.baseUrl}/users/${encodeURIComponent(googleUser.uid)}?${maskParams}&key=${config.apiKey}`;

      const res = await fetch(patchUrl, {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({ fields: encodeFirestoreFields(updatedFields) }),
      });

      if (!res.ok) {
        console.warn("Firestore PATCH metadata update status:", res.status);
      }

      return {
        ...existing,
        ...updatedFields,
        photoURL,
        role: existing.role || "user",
      };
    } else {
      // First-time user: create document with default role 'user'
      const photoURL = googleUser.photoURL || "";
      const newProfile: Record<string, any> = {
        uid: googleUser.uid,
        email: googleUser.email,
        name: googleUser.name,
        photoURL,
        photoUrl: photoURL,
        role: "user",
        createdAt: nowIso,
        updatedAt: nowIso,
        lastLoginAt: nowIso,
      };

      const patchUrl = `${config.baseUrl}/users/${encodeURIComponent(googleUser.uid)}?key=${config.apiKey}`;
      const res = await fetch(patchUrl, {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({ fields: encodeFirestoreFields(newProfile) }),
      });

      if (!res.ok) {
        console.warn("Firestore PATCH create profile status:", res.status);
      }

      return {
        uid: googleUser.uid,
        email: googleUser.email,
        name: googleUser.name,
        photoURL,
        role: "user",
        createdAt: nowIso,
        updatedAt: nowIso,
        lastLoginAt: nowIso,
      };
    }
  } catch (err) {
    console.error("Failed to sync user in Firestore:", err);
    return {
      uid: googleUser.uid,
      email: googleUser.email,
      name: googleUser.name,
      photoURL: googleUser.photoURL,
      role: "user",
      createdAt: nowIso,
      lastLoginAt: nowIso,
    };
  }
}

/**
 * List all users from Firestore for the Admin dashboard.
 */
export async function listUsersFromFirestore(idToken?: string): Promise<UserProfileRecord[]> {
  const config = getFirestoreBaseUrl();
  if (!config) return [];

  try {
    const url = `${config.baseUrl}/users?pageSize=300&key=${config.apiKey}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (idToken) {
      headers["Authorization"] = `Bearer ${idToken}`;
    }

    const res = await fetch(url, { headers });
    if (!res.ok) {
      const text = await res.text();
      console.error(`Firestore list error (${res.status}):`, text);
      return [];
    }

    const data = await res.json();
    const documents = data?.documents || [];

    return documents.map((doc: any) => {
      const raw = decodeFirestoreFields(doc.fields || {});
      const pathParts = (doc.name || "").split("/");
      const docId = pathParts[pathParts.length - 1];

      return {
        uid: raw.uid || docId,
        email: raw.email || "",
        name: raw.name || "User",
        photoURL: raw.photoURL || raw.photoUrl || raw.picture || "",
        role: (raw.role as UserRole) || "user",
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
        lastLoginAt: raw.lastLoginAt,
      };
    });
  } catch (err) {
    console.error("Failed to list users from Firestore:", err);
    return [];
  }
}

/**
 * Update a user's role in Firestore (Admin operation).
 */
export async function updateUserRoleInFirestore(
  targetUid: string,
  newRole: UserRole,
  idToken?: string,
): Promise<boolean> {
  const config = getFirestoreBaseUrl();
  if (!config) return false;

  const nowIso = new Date().toISOString();
  const updatedFields = {
    role: newRole,
    updatedAt: nowIso,
  };

  try {
    const maskParams = [
      "updateMask.fieldPaths=role",
      "updateMask.fieldPaths=updatedAt",
    ].join("&");
    const patchUrl = `${config.baseUrl}/users/${encodeURIComponent(targetUid)}?${maskParams}&key=${config.apiKey}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (idToken) {
      headers["Authorization"] = `Bearer ${idToken}`;
    }

    const res = await fetch(patchUrl, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ fields: encodeFirestoreFields(updatedFields) }),
    });

    return res.ok;
  } catch (err) {
    console.error("Failed to update user role in Firestore:", err);
    return false;
  }
}
