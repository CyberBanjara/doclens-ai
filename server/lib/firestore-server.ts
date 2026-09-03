import type { UserProfileRecord, UserRole } from "./auth-types";
import type { VerifiedGoogleUser } from "./google-verify";

function getFirestoreBaseUrl(): { baseUrl: string; apiKey: string; projectId: string } | null {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
  const apiKey = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY;
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
      nativeLanguage: decoded.nativeLanguage || undefined,
      educationLevel: decoded.educationLevel || undefined,
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
      nativeLanguage: existing?.nativeLanguage,
      educationLevel: existing?.educationLevel,
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
      const mask =
        "updateMask.fieldPaths=name&updateMask.fieldPaths=photoURL&updateMask.fieldPaths=lastLoginAt&updateMask.fieldPaths=updatedAt";
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
      nativeLanguage: existing.nativeLanguage,
      educationLevel: existing.educationLevel,
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
 * Update user preferences (nativeLanguage, educationLevel) in Firestore.
 */
export async function updateUserProfileInFirestore(
  uid: string,
  updates: {
    nativeLanguage?: string;
    educationLevel?: string;
    name?: string;
    photoURL?: string;
  },
  idToken?: string,
): Promise<UserProfileRecord | null> {
  const config = getFirestoreBaseUrl();
  if (!config) return null;

  try {
    const nowIso = new Date().toISOString();
    const updateData: Record<string, any> = {
      updatedAt: nowIso,
    };
    const fieldMasks = ["updateMask.fieldPaths=updatedAt"];

    if (updates.nativeLanguage !== undefined) {
      updateData.nativeLanguage = updates.nativeLanguage;
      fieldMasks.push("updateMask.fieldPaths=nativeLanguage");
    }

    if (updates.educationLevel !== undefined) {
      updateData.educationLevel = updates.educationLevel;
      fieldMasks.push("updateMask.fieldPaths=educationLevel");
    }

    if (updates.name !== undefined) {
      updateData.name = updates.name;
      fieldMasks.push("updateMask.fieldPaths=name");
    }

    if (updates.photoURL !== undefined) {
      updateData.photoURL = updates.photoURL;
      fieldMasks.push("updateMask.fieldPaths=photoURL");
    }

    const mask = fieldMasks.join("&");
    const url = `${config.baseUrl}/users/${encodeURIComponent(uid)}?${mask}&key=${config.apiKey}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (idToken) {
      headers["Authorization"] = `Bearer ${idToken}`;
    }

    const res = await fetch(url, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ fields: encodeFirestoreFields(updateData) }),
    });

    if (!res.ok) {
      console.warn(`Firestore REST update profile notice for ${uid} (${res.status}):`, await res.text());
      return null;
    }

    // Return the updated full profile
    return await getUserFromFirestore(uid, idToken);
  } catch (err) {
    console.warn(`Firestore REST update profile notice for ${uid}:`, err);
    return null;
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

    let res = await fetch(url, { headers });
    // If authenticated fetch failed (e.g. token expired), fallback to public REST read allowed by firestore.rules
    if (!res.ok && idToken) {
      console.warn("Firestore list users with idToken failed, attempting fallback read:", await res.text());
      res = await fetch(url);
    }

    if (!res.ok) {
      console.error("Firestore list users failed:", await res.text());
      return [];
    }

    const data = await res.json();
    const documents = data.documents || [];

    return documents
      .map((doc: any) => {
        const decoded = decodeFirestoreDocument(doc) || {};
        const docId = doc.name ? doc.name.split("/").pop() : "";
        const uid = decoded.uid || docId;
        if (!uid) return null;
        return {
          uid,
          email: decoded.email || "",
          name: decoded.name || "",
          photoURL: decoded.photoURL || "",
          role: (decoded.role as UserRole) || "user",
          nativeLanguage: decoded.nativeLanguage || undefined,
          educationLevel: decoded.educationLevel || undefined,
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

export interface FirestoreSupporter {
  id?: string;
  amount: number;
  currency: string;
  status?: "completed" | "failed" | "pending";
  failureReason?: string;
  errorCode?: string;
  errorDescription?: string;
  isAnonymous: boolean;
  supporterName: string;
  supporterEmail?: string;
  userUid?: string;
  userPhotoURL?: string;
  message?: string;
  tier?: string;
  razorpayPaymentId?: string;
  razorpayOrderId?: string;
  createdAt: string;
}

/**
 * Record a community contribution or payment transaction in Firestore.
 */
export async function createSupporterInFirestore(
  data: FirestoreSupporter,
): Promise<FirestoreSupporter | null> {
  const config = getFirestoreBaseUrl();
  if (!config) return null;

  try {
    const url = `${config.baseUrl}/supporters?key=${config.apiKey}`;
    const payload = {
      amount: data.amount,
      currency: data.currency || "INR",
      status: data.status || "completed",
      failureReason: data.failureReason || "",
      errorCode: data.errorCode || "",
      errorDescription: data.errorDescription || "",
      isAnonymous: Boolean(data.isAnonymous),
      supporterName: data.isAnonymous
        ? "Anonymous Supporter"
        : data.supporterName || "Community Supporter",
      supporterEmail: data.supporterEmail || "",
      userUid: data.userUid || "",
      userPhotoURL: data.isAnonymous ? "" : data.userPhotoURL || "",
      message: data.message || "",
      tier: data.tier || "Supporter",
      razorpayPaymentId: data.razorpayPaymentId || "",
      razorpayOrderId: data.razorpayOrderId || "",
      createdAt: data.createdAt || new Date().toISOString(),
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: encodeFirestoreFields(payload) }),
    });

    if (!res.ok) {
      console.error("Firestore create supporter failed:", await res.text());
      return null;
    }

    const resData = await res.json();
    const docId = resData.name ? resData.name.split("/").pop() : undefined;
    return {
      ...payload,
      id: docId,
    };
  } catch (err) {
    console.error("Error creating supporter in Firestore:", err);
    return null;
  }
}

/**
 * Record a failed payment transaction in Firestore for auditing and telemetry.
 */
export async function recordPaymentFailureInFirestore(
  data: Partial<FirestoreSupporter> & {
    amount?: number;
    currency?: string;
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    failureReason?: string;
    errorCode?: string;
    errorDescription?: string;
  },
): Promise<FirestoreSupporter | null> {
  const failureData: FirestoreSupporter = {
    amount: data.amount || 0,
    currency: data.currency || "INR",
    status: "failed",
    failureReason: data.failureReason || "Payment failed or declined",
    errorCode: data.errorCode || "",
    errorDescription: data.errorDescription || "",
    isAnonymous: Boolean(data.isAnonymous),
    supporterName: data.supporterName || "Supporter",
    supporterEmail: data.supporterEmail || "",
    userUid: data.userUid || "",
    userPhotoURL: data.userPhotoURL || "",
    message: data.message || "",
    tier: data.tier || "Supporter",
    razorpayPaymentId: data.razorpayPaymentId || "",
    razorpayOrderId: data.razorpayOrderId || "",
    createdAt: data.createdAt || new Date().toISOString(),
  };

  return await createSupporterInFirestore(failureData);
}

/**
 * List all verified supporters and aggregate funding statistics from Firestore.
 * Strictly excludes failed payment records from the Supporter Wall and metrics.
 */
export async function listSupportersFromFirestore(): Promise<{
  supporters: FirestoreSupporter[];
  totalRaised: number;
  totalSupporters: number;
}> {
  const config = getFirestoreBaseUrl();
  if (!config) {
    return { supporters: [], totalRaised: 0, totalSupporters: 0 };
  }

  try {
    const url = `${config.baseUrl}/supporters?pageSize=200&key=${config.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn("Firestore list supporters warning:", await res.text());
      return { supporters: [], totalRaised: 0, totalSupporters: 0 };
    }

    const data = await res.json();
    const documents = data.documents || [];

    let totalRaised = 0;
    const supporters: FirestoreSupporter[] = [];

    for (const doc of documents) {
      const decoded = decodeFirestoreDocument(doc);
      if (!decoded) continue;

      // Filter out failed payments — never display on Supporter Wall
      if (decoded.status === "failed") {
        continue;
      }

      const docId = doc.name ? doc.name.split("/").pop() : undefined;
      const amount =
        typeof decoded.amount === "number" ? decoded.amount : Number(decoded.amount) || 0;
      totalRaised += amount;

      supporters.push({
        id: docId,
        amount,
        currency: decoded.currency || "INR",
        status: "completed",
        isAnonymous: Boolean(decoded.isAnonymous),
        supporterName: decoded.isAnonymous
          ? "Anonymous Supporter"
          : decoded.supporterName || "Anonymous Supporter",
        // Email is intentionally omitted for public privacy
        userUid: decoded.isAnonymous ? undefined : decoded.userUid,
        userPhotoURL: decoded.isAnonymous ? undefined : decoded.userPhotoURL,
        message: decoded.message || "",
        tier: decoded.tier || "Supporter",
        razorpayPaymentId: decoded.razorpayPaymentId || "",
        createdAt: decoded.createdAt || new Date().toISOString(),
      });
    }

    // Sort by createdAt descending (most recent first)
    supporters.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return {
      supporters,
      totalRaised,
      totalSupporters: supporters.length,
    };
  } catch (err) {
    console.error("Failed to query supporters from Firestore:", err);
    return { supporters: [], totalRaised: 0, totalSupporters: 0 };
  }
}
