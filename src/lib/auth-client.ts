import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
} from "firebase/auth";
import { getFirebaseApp } from "./firebase";

export type UserRole = "admin" | "editor" | "moderator" | "viewer" | "user";

export interface ClientUser {
  uid: string;
  email: string;
  name: string;
  photoURL: string;
  role: UserRole;
  nativeLanguage?: string;
  educationLevel?: string;
}

export interface AdminUserProfile {
  uid: string;
  email: string;
  name: string;
  photoURL?: string;
  role: UserRole;
  nativeLanguage?: string;
  educationLevel?: string;
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
      return localStorage.getItem(AUTH_TOKEN_KEY) || sessionStorage.getItem(AUTH_TOKEN_KEY);
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
        localStorage.setItem(AUTH_TOKEN_KEY, token);
        sessionStorage.setItem(AUTH_TOKEN_KEY, token);
      } else {
        localStorage.removeItem(AUTH_TOKEN_KEY);
        sessionStorage.removeItem(AUTH_TOKEN_KEY);
      }
    } catch {
      // Ignore storage error
    }
  }
}

/**
 * Get the current fresh ID token from Firebase auth or storage.
 */
export async function getFreshAuthToken(): Promise<string | null> {
  if (typeof window !== "undefined") {
    try {
      const app = getFirebaseApp();
      const auth = getAuth(app);
      if (auth.currentUser) {
        const token = await auth.currentUser.getIdToken(false);
        setStoredAuthToken(token);
        return token;
      }

      // If Firebase Auth is still initializing on page reload, wait briefly
      const token = await new Promise<string | null>((resolve) => {
        const unsubscribe = auth.onAuthStateChanged(async (fbUser) => {
          unsubscribe();
          if (fbUser) {
            try {
              const tok = await fbUser.getIdToken();
              setStoredAuthToken(tok);
              resolve(tok);
            } catch {
              resolve(getStoredAuthToken());
            }
          } else {
            resolve(getStoredAuthToken());
          }
        });

        setTimeout(() => {
          unsubscribe();
          resolve(getStoredAuthToken());
        }, 1200);
      });

      if (token) return token;
    } catch {
      // Fall through to stored token
    }
  }
  return getStoredAuthToken();
}

/**
 * Trigger Google Sign-In popup to obtain an identity token.
 */
export async function promptGoogleUser(): Promise<{ idToken: string; user: ClientUser }> {
  const app = getFirebaseApp();
  const auth = getAuth(app);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  let result;
  try {
    result = await signInWithPopup(auth, provider);
  } catch (err: any) {
    if (err?.code === "auth/popup-blocked") {
      console.warn("Firebase auth popup blocked. Redirecting to Google Sign-In...");
      await signInWithRedirect(auth, provider);
      throw new Error("Redirecting to Google Sign-In...");
    }
    throw err;
  }

  const idToken = await result.user.getIdToken(true);
  setStoredAuthToken(idToken);

  const fallbackUser: ClientUser = {
    uid: result.user.uid,
    email: (result.user.email || "").toLowerCase(),
    name: result.user.displayName || result.user.email?.split("@")[0] || "User",
    photoURL: result.user.photoURL || "",
    role: "user",
  };

  return { idToken, user: fallbackUser };
}

/**
 * Trigger Google Sign-In popup to obtain an identity token.
 */
export async function promptGoogleIdToken(): Promise<string> {
  const { idToken } = await promptGoogleUser();
  return idToken;
}

/**
 * Login with Google:
 * 1. Authenticates with Google via Firebase Auth SDK.
 * 2. Saves credential on client for authorized admin fetches.
 * 3. Sends ID token to serverless /api/auth/google-login for role sync & HttpOnly cookie.
 * 4. Falls back gracefully to Firebase client user if server is unreachable.
 */
export async function apiLoginWithGoogle(): Promise<ClientUser> {
  const { idToken, user: fallbackUser } = await promptGoogleUser();

  try {
    const res = await fetch("/api/auth/google-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ idToken }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data?.user) {
        return data.user as ClientUser;
      }
    } else {
      console.warn("Serverless /api/auth/google-login returned status:", res.status);
    }
  } catch (err) {
    console.warn(
      "Could not reach /api/auth/google-login, using authenticated client session:",
      err,
    );
  }

  return fallbackUser;
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
 * Logout and clear both the HttpOnly session cookie on the server and local client storage.
 */
export async function apiLogout(): Promise<void> {
  setStoredAuthToken(null);

  try {
    const app = getFirebaseApp();
    const auth = getAuth(app);
    await fbSignOut(auth);
  } catch (err) {
    console.warn("Client Firebase signout warning:", err);
  }

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

/**
 * Update user preferences (nativeLanguage, educationLevel, etc.) in Firebase Firestore and refresh JWT session cookie.
 */
export async function apiUpdateUserProfile(updates: {
  nativeLanguage?: string;
  educationLevel?: string;
  name?: string;
  photoURL?: string;
}): Promise<ClientUser> {
  const token = await getFreshAuthToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
    headers["x-firebase-token"] = token;
  }

  const res = await fetch("/api/auth/update-profile", {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify({ ...updates, idToken: token }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to update profile preferences" }));
    throw new Error(err.error || `Update failed with status ${res.status}`);
  }

  const data = await res.json();
  return data.user as ClientUser;
}
