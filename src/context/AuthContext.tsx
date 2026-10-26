import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<ClientUser | null>(null);
  const [loading, setLoading] = useState(true);

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
  const refreshUser = useCallback(async () => {
    try {
      const currentUser = await apiFetchCurrentUser();
      if (currentUser) {
        setUser(currentUser);
        syncUserToLocalStorage(currentUser);
        try {
          const { getCachedTranslationActivity } = await import(
            "@/lib/storage/translationActivity"
          );
          void getCachedTranslationActivity(currentUser.uid);
        } catch {}
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

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
      try {
        const redirectUser = await checkRedirectResult();
        if (redirectUser) {
          if (!isMounted) return;
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
        await refreshUser();
      }
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
          // Silently verify & refresh role and session
          await refreshUser();
        }
      });
    } catch (err) {
      console.warn("Firebase onAuthStateChanged notice:", err);
    }

    // Background renewal interval: Automatically renew session in background every 15 minutes
    // and whenever user refocuses the app/tab, keeping the rolling 10-day inactivity timer refreshed.
    const renewalInterval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void refreshUser();
      }
    }, 15 * 60 * 1000);

    const onVisibilityOrFocus = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void refreshUser();
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
  }, [refreshUser]);

  const updateProfile = async (updates: {
    nativeLanguage?: string;
    style?: string;
    educationLevel?: string;
    name?: string;
    photoURL?: string;
  }): Promise<ClientUser> => {
    const updated = await apiUpdateUserProfile(updates);
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
      const authenticatedUser = await apiLoginWithGoogle();
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
      setLoading(false);
    }
  };

  const signOut = async () => {
    try {
      const currentUid = user?.uid;
      await apiLogout();
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
