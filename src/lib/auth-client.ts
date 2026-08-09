import { getAuth, GoogleAuthProvider, signInWithPopup, signOut as fbSignOut } from "firebase/auth";
import { getFirebaseApp } from "./firebase";

export type UserRole = "admin" | "editor" | "moderator" | "viewer" | "user";

export interface ClientUser {
  uid: string;
  email: string;
  name: string;
  photoURL: string;
  role: UserRole;
}

export interface AdminUserProfile {
  uid: string;
  email: string;
  name: string;
  photoURL?: string;
  role: UserRole;
  createdAt?: string;
  updatedAt?: string;
  lastLoginAt?: string;
}

const AUTH_TOKEN_KEY = "anuwad_auth_id_token";
let inMemoryToken: string | null = null;

export function getStoredAuthToken(): string | null {
  if (inMemoryToken) return inMemoryToken;
  if (typeof window !== "undefined") {
    try {
      return sessionStorage.getItem(AUTH_TOKEN_KEY);
    } catch {
      return null;
    }
  }
  return null;
}

export function setStoredAuthToken(token: string | null): void {
  inMemoryToken = token;
  if (typeof window !== "undefined") {
    try {
      if (token) {
        sessionStorage.setItem(AUTH_TOKEN_KEY, token);
      } else {
        sessionStorage.removeItem(AUTH_TOKEN_KEY);
      }
    } catch {
      // Ignore storage error
    }
  }
}

/**
 * Trigger Google Sign-In popup to obtain an identity token.
 */
export async function promptGoogleIdToken(): Promise<string> {
  const app = getFirebaseApp();
  const auth = getAuth(app);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  const result = await signInWithPopup(auth, provider);
  const idToken = await result.user.getIdToken(true);

  // Store token in client storage for authorized Firestore operations
  setStoredAuthToken(idToken);

  // Sign out from client Firebase Auth instance
  try {
    await fbSignOut(auth);
  } catch {
    // Ignore cleanup error
  }

  return idToken;
}

/**
 * Login with Google:
 * 1. Prompts Google login once.
 * 2. Saves credential on client for authorized admin fetches.
 * 3. Sends ID token to serverless /api/auth/google-login.
 * 4. Server verifies identity, syncs role in Firestore, sets HttpOnly cookie session.
 * 5. Receives filtered client user data.
 */
export async function apiLoginWithGoogle(): Promise<ClientUser> {
  const idToken = await promptGoogleIdToken();

  const res = await fetch("/api/auth/google-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ idToken }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: "Authentication failed" }));
    throw new Error(errorData.error || `Login failed with status ${res.status}`);
  }

  const data = await res.json();
  return data.user as ClientUser;
}

/**
 * Fetch current user session from HttpOnly cookie.
 */
export async function apiFetchCurrentUser(): Promise<ClientUser | null> {
  try {
    const res = await fetch("/api/auth/me", {
      method: "GET",
      credentials: "include",
    });

    if (!res.ok) return null;
    const data = await res.json();
    return (data?.user as ClientUser) || null;
  } catch (err) {
    console.error("Failed to check auth session:", err);
    return null;
  }
}

/**
 * Logout and clear the HttpOnly session cookie on the server and local client storage.
 */
export async function apiLogout(): Promise<void> {
  setStoredAuthToken(null);
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
  } catch (err) {
    console.error("Logout request failed:", err);
  }
}

/**
 * Admin: list all users from Firestore via serverless endpoint.
 * Automatically attaches stored admin credentials for authenticated Firestore REST access.
 */
export async function apiAdminListUsers(): Promise<AdminUserProfile[]> {
  const token = getStoredAuthToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
    headers["x-firebase-token"] = token;
  }

  const res = await fetch("/api/admin/users", {
    method: "GET",
    headers,
    credentials: "include",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to list users" }));
    throw new Error(err.error || `Request failed with status ${res.status}`);
  }

  const data = await res.json();
  return (data?.users as AdminUserProfile[]) || [];
}

/**
 * Admin: update a user's role via protected serverless endpoint.
 * Automatically attaches stored admin credentials for authenticated Firestore REST access.
 */
export async function apiAdminUpdateUserRole(
  uid: string,
  role: UserRole,
): Promise<{ success: boolean; uid: string; role: UserRole; message?: string }> {
  const token = getStoredAuthToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
    headers["x-firebase-token"] = token;
  }

  const res = await fetch("/api/admin/update-user-role", {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify({ uid, role, idToken: token }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to update user role" }));
    throw new Error(err.error || `Update failed with status ${res.status}`);
  }

  return await res.json();
}
