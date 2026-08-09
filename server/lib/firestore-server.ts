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

/**
 * Decode Firestore REST Document into JSON object.
 */
function decodeFirestoreDocument(doc: any): any {
  if (!doc || !doc.fields) return null;
  const result: any = {};
  for (const [key, valueObj] of Object.entries(doc.fields as Record<string, any>)) {
    if (valueObj.stringValue !== undefined) {
      result[key] = valueObj.stringValue;
    } else if (valueObj.integerValue !== undefined) {
      result[key] = Number(valueObj.integerValue);
    } else if (valueObj.doubleValue !== undefined) {
      result[key] = Number(valueObj.doubleValue);
    } else if (valueObj.booleanValue !== undefined) {
      result[key] = Boolean(valueObj.booleanValue);
    } else if (valueObj.timestampValue !== undefined) {
      result[key] = valueObj.timestampValue;
    } else if (valueObj.nullValue !== undefined) {
      result[key] = null;
    } else if (valueObj.mapValue !== undefined) {
      result[key] = decodeFirestoreDocument(valueObj.mapValue);
    } else {
      result[key] = valueObj;
    }
  }
  return result;
}

/**
 * Encode simple JSON object into Firestore REST Document fields.
 */
function encodeFirestoreFields(obj: Record<string, any>): Record<string, any> {
  const fields: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val === null || val === undefined) {
      fields[key] = { nullValue: null };
    } else if (typeof val === "string") {
      fields[key] = { stringValue: val };
    } else if (typeof val === "boolean") {
      fields[key] = { booleanValue: val };
    } else if (typeof val === "number") {
      if (Number.isInteger(val)) {
        fields[key] = { integerValue: String(val) };
      } else {
        fields[key] = { doubleValue: val };
      }
    }
  }
  return fields;
}

/**
 * Fetch a single user profile from Firestore by UID.
 */
export async function getUserFromFirestore(
  uid: string,
  idToken?: string,
): Promise<UserProfileRecord | null> {
  const config = getFirestoreBaseUrl();
  if (!config) return null;

  try {
    const url = `${config.baseUrl}/users/${encodeURIComponent(uid)}?key=${config.apiKey}`;
    const headers: Record<string, string> = {};
    if (idToken) {
      headers["Authorization"] = `Bearer ${idToken}`;
    }

    const res = await fetch(url, { headers });
    if (res.status === 404) {
      return null;
    }

    if (!res.ok) {
      console.error(`Firestore GET /users/${uid} failed (${res.status}):`, await res.text());
      return null;
    }

    const data = await res.json();
    const decoded = decodeFirestoreDocument(data);
    if (!decoded || !decoded.uid) return null;

    return {
      uid: decoded.uid,
      email: decoded.email || "",
      name: decoded.name || "",
      photoURL: decoded.photoURL || "",
      role: (decoded.role as UserRole) || "user",
      createdAt: decoded.createdAt,
      updatedAt: decoded.updatedAt,
      lastLoginAt: decoded.lastLoginAt,
    };
  } catch (err) {
    console.error(`Error retrieving user ${uid} from Firestore:`, err);
    return null;
  }
}

/**
 * Synchronize user profile in Firestore on login.
 */
export async function syncUserInFirestore(
  googleUser: VerifiedGoogleUser,
  idToken?: string,
): Promise<UserProfileRecord> {
  const existing = await getUserFromFirestore(googleUser.uid, idToken);
  const nowIso = new Date().toISOString();
  const config = getFirestoreBaseUrl();

  if (!config) {
    return {
      uid: googleUser.uid,
      email: googleUser.email,
      name: googleUser.name,
      photoURL: googleUser.photoURL,
      role: existing?.role || "user",
      lastLoginAt: nowIso,
    };
  }

  const role: UserRole = existing?.role || "user";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (idToken) {
    headers["Authorization"] = `Bearer ${idToken}`;
  }

  if (existing) {
    try {
      const updateData = {
        name: googleUser.name,
        photoURL: googleUser.photoURL,
        lastLoginAt: nowIso,
        updatedAt: nowIso,
      };
      const mask = "updateMask.fieldPaths=name&updateMask.fieldPaths=photoURL&updateMask.fieldPaths=lastLoginAt&updateMask.fieldPaths=updatedAt";
      const url = `${config.baseUrl}/users/${encodeURIComponent(googleUser.uid)}?${mask}&key=${config.apiKey}`;

      const res = await fetch(url, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ fields: encodeFirestoreFields(updateData) }),
      });

      if (!res.ok) {
        console.warn("Firestore update user warning:", await res.text());
      }
    } catch (err) {
      console.warn("Firestore update user error:", err);
    }

    return {
      uid: googleUser.uid,
      email: googleUser.email,
      name: googleUser.name,
      photoURL: googleUser.photoURL,
      role,
      createdAt: existing.createdAt,
      updatedAt: nowIso,
      lastLoginAt: nowIso,
    };
  } else {
    const newProfile: UserProfileRecord = {
      uid: googleUser.uid,
      email: googleUser.email,
      name: googleUser.name,
      photoURL: googleUser.photoURL,
      role: "user",
      createdAt: nowIso,
      updatedAt: nowIso,
      lastLoginAt: nowIso,
    };

    try {
      const url = `${config.baseUrl}/users/${encodeURIComponent(googleUser.uid)}?key=${config.apiKey}`;
      const res = await fetch(url, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ fields: encodeFirestoreFields(newProfile) }),
      });

      if (!res.ok) {
        console.warn("Firestore create user warning:", await res.text());
      }
    } catch (err) {
      console.warn("Firestore create user error:", err);
    }

    return newProfile;
  }
}

/**
 * List all users from Firestore (Admin only).
 */
export async function listUsersFromFirestore(idToken?: string): Promise<UserProfileRecord[]> {
  const config = getFirestoreBaseUrl();
  if (!config) return [];

  try {
    const url = `${config.baseUrl}/users?pageSize=100&key=${config.apiKey}`;
    const headers: Record<string, string> = {};
    if (idToken) {
      headers["Authorization"] = `Bearer ${idToken}`;
    }

    const res = await fetch(url, { headers });
    if (!res.ok) {
      console.error("Firestore list users failed:", await res.text());
      return [];
    }

    const data = await res.json();
    const documents = data.documents || [];

    return documents
      .map((doc: any) => {
        const decoded = decodeFirestoreDocument(doc);
        if (!decoded || !decoded.uid) return null;
        return {
          uid: decoded.uid,
          email: decoded.email || "",
          name: decoded.name || "",
          photoURL: decoded.photoURL || "",
          role: (decoded.role as UserRole) || "user",
          createdAt: decoded.createdAt,
          updatedAt: decoded.updatedAt,
          lastLoginAt: decoded.lastLoginAt,
        };
      })
      .filter(Boolean) as UserProfileRecord[];
  } catch (err) {
    console.error("Failed to query users from Firestore:", err);
    return [];
  }
}

/**
 * Update a user's role in Firestore (Admin only).
 */
export async function updateUserRoleInFirestore(
  targetUid: string,
  newRole: UserRole,
  idToken?: string,
): Promise<boolean> {
  const config = getFirestoreBaseUrl();
  if (!config) return false;

  try {
    const nowIso = new Date().toISOString();
    const mask = "updateMask.fieldPaths=role&updateMask.fieldPaths=updatedAt";
    const url = `${config.baseUrl}/users/${encodeURIComponent(targetUid)}?${mask}&key=${config.apiKey}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (idToken) {
      headers["Authorization"] = `Bearer ${idToken}`;
    }

    const res = await fetch(url, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        fields: encodeFirestoreFields({
          role: newRole,
          updatedAt: nowIso,
        }),
      }),
    });

    if (!res.ok) {
      console.error(`Failed to update role for ${targetUid}:`, await res.text());
      return false;
    }

    return true;
  } catch (err) {
    console.error(`Error updating role for ${targetUid}:`, err);
    return false;
  }
}
