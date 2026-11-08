import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import {
  type ClientUser,
  type UserRole,
  apiFetchCurrentUser,
  apiGetTranslationCounter,
  apiLoginWithGoogle,
  apiLogout,
  apiUpdateUserProfile,
  checkRedirectResult,
  resetAuthTokenFallbackCache,
  setStoredAuthToken,
} from "@/lib/auth-client";
import { warmFirebaseAuth, getFirebaseAuth } from "@/lib/firebase";
import {
  setOutputLanguage,
  setStyle,
  setMode,
  TRANSLATION_STYLES,
  type ProcessingStyle,
} from "@/lib/openrouter";
import { saveEducationLevel, type EducationLevel } from "@/lib/classification";
import { listenDocEvent } from "@/lib/docEvents";

interface AuthContextType {
  user: ClientUser | null;
  loading: boolean;
  isAdmin: boolean;
  isPrivileged: boolean;
  role: UserRole | null;
  needsPreferencesSetup: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  refreshTranslationCount: () => Promise<number>;
  updateProfile: (updates: {
    nativeLanguage?: string;
    style?: string;
    educationLevel?: string;
    name?: string;
    photoURL?: string;
  }) => Promise<ClientUser>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Minimum gap between background session re-verifications (tab focus, visibility, interval).
 * Each /api/auth/me costs a Firestore read + Supabase query + JWT re-sign on the server,
 * and the session cookie is valid for 10 days, so a few minutes of throttling is safe.
 * Explicit refreshes (refreshUser() from components) are never throttled.
 */
const BACKGROUND_REVERIFY_MIN_INTERVAL_MS = 5 * 60 * 1000;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<ClientUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Single-flight + throttle bookkeeping for /api/auth/me
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const lastVerifiedAtRef = useRef(0);
  // uid currently represented in React state (read from async listeners without stale closures)
  const currentUidRef = useRef<string | null>(null);
  // Set while a popup/redirect sign-in is being finalized, so the Firebase auth listener
  // doesn't race it with its own /me call — google-login already returns the full user.
  const signingInRef = useRef(false);
  // Activity preload should run once per signed-in uid, not on every session renewal
  const activityPreloadedForRef = useRef<string | null>(null);

  useEffect(() => {
    currentUidRef.current = user?.uid ?? null;
  }, [user?.uid]);

  // Background translation sync only pushes to Supabase for roles the server accepts,
  // so regular users never fire write requests that are guaranteed to be rejected.
  useEffect(() => {
    const allowed = !!user && ["admin", "editor", "moderator"].includes(user.role);
    void import("@/lib/sync")
      .then(({ setSupabasePushAllowed }) => setSupabasePushAllowed(allowed))
      .catch(() => {});
  }, [user?.role, user?.uid]);

  const markVerified = (u: ClientUser | null) => {
    lastVerifiedAtRef.current = Date.now();
    currentUidRef.current = u?.uid ?? null;
    if (u) resetAuthTokenFallbackCache();
  };

  const syncUserToLocalStorage = (u: ClientUser | null) => {
    if (!u) return;
    if (u.nativeLanguage) {
      setOutputLanguage(u.nativeLanguage);
    }
    if (u.style) {
      setStyle(u.style as ProcessingStyle);
      const mode = TRANSLATION_STYLES.some((s) => s.id === u.style) ? "translate" : "explain";
      setMode(mode);
    }
    if (u.educationLevel) {
      saveEducationLevel(u.educationLevel as EducationLevel);
    }
  };

  // Initialize session on mount by checking HttpOnly cookie via /api/auth/me
  // Translation count is loaded directly from Supabase, defaulting to 0 if not set.
  // Single-flight: concurrent callers share one /api/auth/me request.
  const runRefreshUser = useCallback((): Promise<void> => {
    if (refreshInFlightRef.current) return refreshInFlightRef.current;

    const request = (async () => {
      try {
        const currentUser = await apiFetchCurrentUser();
        markVerified(currentUser);
        if (currentUser) {
          setUser(currentUser);
          syncUserToLocalStorage(currentUser);
          if (activityPreloadedForRef.current !== currentUser.uid) {
            activityPreloadedForRef.current = currentUser.uid;
            try {
              const { getCachedTranslationActivity } = await import(
                "@/lib/storage/translationActivity"
              );
              void getCachedTranslationActivity(currentUser.uid);
            } catch {}
          }
        } else {
          setUser(null);
        }
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
        refreshInFlightRef.current = null;
      }
    })();

    refreshInFlightRef.current = request;
    return request;
  }, []);

  // Public refresh (explicit, never throttled)
  const refreshUser = runRefreshUser;

  // Background re-verification (focus / visibility / interval): throttled
  const backgroundRefreshUser = useCallback(() => {
    if (signingInRef.current) return;
    if (Date.now() - lastVerifiedAtRef.current < BACKGROUND_REVERIFY_MIN_INTERVAL_MS) return;
    void runRefreshUser();
  }, [runRefreshUser]);

  // Fetch the latest authoritative translation counter directly from Supabase on demand
  const refreshTranslationCount = useCallback(async (): Promise<number> => {
    try {
      const count = await apiGetTranslationCounter();
      setUser((prev) => (prev ? { ...prev, totalTranslatedPages: count } : null));
      return count;
    } catch {
      return user?.totalTranslatedPages ?? 0;
    }
  }, [user?.totalTranslatedPages]);

  // Listen for real-time translation counter updates across the application
  useEffect(() => {
    const unlistenCounter = listenDocEvent("doclens:translation-counter-updated", (d) => {
      setUser((prev) => (prev ? { ...prev, totalTranslatedPages: d.totalTranslatedPages } : null));
    });
    return () => {
      unlistenCounter();
    };
  }, []);

  useEffect(() => {
    // Eagerly pre-warm Firebase Auth SDK so popup trigger is instantaneous
    warmFirebaseAuth();

    let isMounted = true;

    const initAuth = async () => {
      // Block the auth listener from issuing its own /me while we resolve the initial session
      signingInRef.current = true;
      try {
        const redirectUser = await checkRedirectResult();
        if (redirectUser) {
          signingInRef.current = false;
          if (!isMounted) return;
          markVerified(redirectUser);
          activityPreloadedForRef.current = redirectUser.uid;
          setUser(redirectUser);
          syncUserToLocalStorage(redirectUser);
          setLoading(false);
          try {
            const { fetchAndCacheUserTranslationActivity } = await import(
              "@/lib/storage/translationActivity"
            );
            void fetchAndCacheUserTranslationActivity(redirectUser.uid);
          } catch (err) {
            console.warn("Translation activity sync on redirect note:", err);
          }
          toast.success(`Welcome back, ${redirectUser.name || "User"}!`, {
            description: `Signed in as ${redirectUser.email} (${redirectUser.role})`,
          });
          return;
        }
      } catch (err) {
        console.warn("Redirect auth check:", err);
      }
      if (isMounted) {
        await runRefreshUser();
      }
      signingInRef.current = false;
    };

    void initAuth();

    // Listen to Firebase Auth state for silent session restoration across browser restarts & reloads
    let unsubscribeAuth: (() => void) | null = null;
    try {
      const auth = getFirebaseAuth();
      unsubscribeAuth = auth.onAuthStateChanged(async (fbUser) => {
        if (!isMounted) return;
        if (fbUser) {
          try {
            const tok = await fbUser.getIdToken(false);
            setStoredAuthToken(tok);
          } catch {}
          // Only re-verify when Firebase reports a *different* user than the one we already
          // resolved (e.g. sign-in in another tab). The initial restore on page load and
          // in-app sign-ins are already covered by initAuth / signInWithGoogle.
          if (signingInRef.current) return;
          if (currentUidRef.current === fbUser.uid) return;
          await runRefreshUser();
        }
      });
    } catch (err) {
      console.warn("Firebase onAuthStateChanged notice:", err);
    }

    // Background renewal interval: Automatically renew session in background every 15 minutes
    // and whenever user refocuses the app/tab, keeping the rolling 10-day inactivity timer refreshed.
    const renewalInterval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        backgroundRefreshUser();
      }
    }, 15 * 60 * 1000);

    // focus and visibilitychange usually fire together; the throttle collapses them to one check
    const onVisibilityOrFocus = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        backgroundRefreshUser();
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("focus", onVisibilityOrFocus);
      document.addEventListener("visibilitychange", onVisibilityOrFocus);
    }

    return () => {
      isMounted = false;
      if (unsubscribeAuth) unsubscribeAuth();
      clearInterval(renewalInterval);
      if (typeof window !== "undefined") {
        window.removeEventListener("focus", onVisibilityOrFocus);
        document.removeEventListener("visibilitychange", onVisibilityOrFocus);
      }
    };
  }, [runRefreshUser, backgroundRefreshUser]);

  const updateProfile = async (updates: {
    nativeLanguage?: string;
    style?: string;
    educationLevel?: string;
    name?: string;
    photoURL?: string;
  }): Promise<ClientUser> => {
    const updated = await apiUpdateUserProfile(updates);
    // The profile endpoint authenticates the session and returns the authoritative user,
    // so it counts as a fresh verification (avoids an immediate redundant /api/auth/me).
    markVerified(updated);
    const retainedUser = {
      ...updated,
      totalTranslatedPages: user?.totalTranslatedPages ?? updated.totalTranslatedPages ?? 0,
    };
    setUser(retainedUser);
    syncUserToLocalStorage(retainedUser);
    return retainedUser;
  };

  const signInWithGoogle = async () => {
    try {
      setLoading(true);
      signingInRef.current = true;
      const authenticatedUser = await apiLoginWithGoogle();
      markVerified(authenticatedUser);
      activityPreloadedForRef.current = authenticatedUser.uid;
      setUser(authenticatedUser);
      syncUserToLocalStorage(authenticatedUser);
      try {
        const { clearCachedR2Files } = await import("@/lib/r2-cache");
        await clearCachedR2Files();
      } catch {}
      try {
        const { fetchAndCacheUserTranslationActivity } = await import(
          "@/lib/storage/translationActivity"
        );
        void fetchAndCacheUserTranslationActivity(authenticatedUser.uid);
      } catch (err) {
        console.warn("Translation activity sync on login note:", err);
      }
      toast.success(`Welcome, ${authenticatedUser.name || "User"}!`, {
        description: `Signed in as ${authenticatedUser.email} (${authenticatedUser.role})`,
      });
    } catch (err: any) {
      console.error("Sign in error:", err);
      // Suppress user popup close / cancellation warnings
      if (
        err?.code !== "auth/popup-closed-by-user" &&
        err?.code !== "auth/cancelled-popup-request" &&
        !err?.message?.includes("closed-by-user")
      ) {
        toast.error("Sign in failed", {
          description: err?.message || "Could not complete Google authentication.",
        });
      }
    } finally {
      signingInRef.current = false;
      setLoading(false);
    }
  };

  const signOut = async () => {
    try {
      const currentUid = user?.uid;
      await apiLogout();
      currentUidRef.current = null;
      activityPreloadedForRef.current = null;
      setUser(null);
      try {
        const { clearCachedR2Files } = await import("@/lib/r2-cache");
        await clearCachedR2Files();
      } catch {}
      try {
        const { clearCachedTranslationActivity } = await import(
          "@/lib/storage/translationActivity"
        );
        await clearCachedTranslationActivity(currentUid);
      } catch {}
      toast.success("Signed out successfully");
    } catch (err: any) {
      console.error("Sign out error:", err);
      setUser(null);
    }
  };

  const isAdmin = user?.role === "admin";
  const isPrivileged = user ? ["admin", "editor", "moderator"].includes(user.role) : false;
  const needsPreferencesSetup = Boolean(
    user && (!user.nativeLanguage || !user.style || !user.educationLevel),
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAdmin,
        isPrivileged,
        role: user?.role || null,
        needsPreferencesSetup,
        signInWithGoogle,
        signOut,
        refreshUser,
        refreshTranslationCount,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
