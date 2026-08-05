import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from "react";
import {
  auth,
  onAuthStateChanged,
  signInWithGoogle,
  logOut,
  syncUserProfile,
  getUserProfile,
  type User,
  type UserProfile,
  type UserRole,
} from "@/lib/firebase";
import { toast } from "sonner";

export const PRIVILEGED_ROLES: UserRole[] = ["admin", "moderator", "editor"];

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  role: UserRole | null;
  verifiedRole: UserRole | null;
  isPrivileged: boolean;
  isAdmin: boolean;
  serverVerifying: boolean;
  adminToken: string | null;
  refreshToken: string | null;
  hasRole: (roles: UserRole | UserRole[]) => boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  verifyRoleWithServer: () => Promise<{ role: UserRole; isPrivileged: boolean } | null>;
  renewSessionTokenWithRefreshToken: () => Promise<string | null>;
  changeUserRoleForTesting: (newRole: UserRole) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userProfile: null,
  loading: true,
  role: null,
  verifiedRole: null,
  isPrivileged: false,
  isAdmin: false,
  serverVerifying: false,
  adminToken: null,
  refreshToken: null,
  hasRole: () => false,
  signInWithGoogle: async () => {},
  signOut: async () => {},
  refreshProfile: async () => {},
  verifyRoleWithServer: async () => null,
  renewSessionTokenWithRefreshToken: async () => null,
  changeUserRoleForTesting: async () => false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifiedRole, setVerifiedRole] = useState<UserRole | null>(null);
  const [serverVerifying, setServerVerifying] = useState(false);
  const [adminToken, setAdminToken] = useState<string | null>(() => {
    return typeof window !== "undefined" ? localStorage.getItem("admin_session_token") : null;
  });
  const [refreshToken, setRefreshToken] = useState<string | null>(() => {
    return typeof window !== "undefined" ? localStorage.getItem("admin_refresh_token") : null;
  });

  const activeUidRef = useRef<string | null>(null);


  const clearAuthTokens = useCallback(() => {
    setAdminToken(null);
    setRefreshToken(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem("admin_session_token");
      localStorage.removeItem("admin_refresh_token");
      document.cookie = "admin_session_token=; Path=/; SameSite=Lax; Max-Age=0";
      document.cookie = "admin_refresh_token=; Path=/; SameSite=Lax; Max-Age=0";
    }
  }, []);

  const saveAuthTokens = useCallback((token: string | null, refToken: string | null) => {
    if (token) {
      setAdminToken(token);
      if (typeof window !== "undefined") {
        localStorage.setItem("admin_session_token", token);
        document.cookie = `admin_session_token=${encodeURIComponent(token)}; Path=/; SameSite=Lax; Max-Age=900`;
      }
    } else {
      setAdminToken(null);
      if (typeof window !== "undefined") {
        localStorage.removeItem("admin_session_token");
        document.cookie = "admin_session_token=; Path=/; SameSite=Lax; Max-Age=0";
      }
    }

    if (refToken) {
      setRefreshToken(refToken);
      if (typeof window !== "undefined") {
        localStorage.setItem("admin_refresh_token", refToken);
        document.cookie = `admin_refresh_token=${encodeURIComponent(refToken)}; Path=/; SameSite=Lax; Max-Age=604800`;
      }
    } else {
      setRefreshToken(null);
      if (typeof window !== "undefined") {
        localStorage.removeItem("admin_refresh_token");
        document.cookie = "admin_refresh_token=; Path=/; SameSite=Lax; Max-Age=0";
      }
    }
  }, []);


  /**
   * Renews the JWT access token using the cryptographic refresh token endpoint.
   * ZERO calls to Firebase or Firestore are made during refresh.
   */
  const renewSessionTokenWithRefreshToken = useCallback(async (): Promise<string | null> => {
    const storedRefToken =
      refreshToken || (typeof window !== "undefined" ? localStorage.getItem("admin_refresh_token") : null);

    if (!storedRefToken) {
      return null;
    }

    try {
      const res = await fetch("/api/auth/refresh-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: storedRefToken }),
      });

      if (!res.ok) {
        clearAuthTokens();
        return null;
      }

      const data = await res.json();
      saveAuthTokens(data.token || null, data.refreshToken || storedRefToken);
      if (data.role) {
        setVerifiedRole(data.role as UserRole);
      }
      return data.token || null;
    } catch (err) {
      console.error("Error renewing session token via refresh token:", err);
      return null;
    }
  }, [refreshToken, clearAuthTokens, saveAuthTokens]);

  const verifyRoleWithServer = useCallback(async () => {
    if (!auth.currentUser) {
      setVerifiedRole(null);
      clearAuthTokens();
      return null;
    }

    setServerVerifying(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch("/api/auth/verify-role", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ token: idToken }),
      });

      if (!res.ok) {
        const fallbackRole = userProfile?.role || "user";
        setVerifiedRole(fallbackRole);
        clearAuthTokens();
        return {
          role: fallbackRole,
          isPrivileged: PRIVILEGED_ROLES.includes(fallbackRole),
        };
      }

      const data = await res.json();
      const serverRole: UserRole = data.role || "user";
      setVerifiedRole(serverRole);
      saveAuthTokens(data.token || null, data.refreshToken || null);

      if (userProfile && userProfile.role !== serverRole) {
        setUserProfile((prev) => (prev ? { ...prev, role: serverRole } : prev));
      }

      return {
        role: serverRole,
        isPrivileged: PRIVILEGED_ROLES.includes(serverRole),
      };
    } catch (err) {
      console.error("Failed to verify role with serverless function:", err);
      const fallbackRole = userProfile?.role || "user";
      setVerifiedRole(fallbackRole);
      clearAuthTokens();
      return {
        role: fallbackRole,
        isPrivileged: PRIVILEGED_ROLES.includes(fallbackRole),
      };
    } finally {
      setServerVerifying(false);
    }
  }, [userProfile, clearAuthTokens, saveAuthTokens]);

  const refreshProfile = useCallback(async () => {
    if (auth.currentUser) {
      const profile = await getUserProfile(auth.currentUser.uid);
      if (profile) {
        setUserProfile(profile);
        setVerifiedRole(profile.role);
      }
      await verifyRoleWithServer();
    }
  }, [verifyRoleWithServer]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      if (!currentUser) {
        activeUidRef.current = null;
        setUserProfile(null);
        setVerifiedRole(null);
        clearAuthTokens();
        setLoading(false);
        return;
      }

      // Prevent redundant verification loops for the same logged-in user session
      if (activeUidRef.current === currentUser.uid) {
        setLoading(false);
        return;
      }

      activeUidRef.current = currentUser.uid;

      try {
        const profile = await syncUserProfile(currentUser);
        setUserProfile(profile);

        // Try using stored refresh token / session token first
        const currentStoredToken =
          typeof window !== "undefined" ? localStorage.getItem("admin_session_token") : null;
        const currentStoredRef =
          typeof window !== "undefined" ? localStorage.getItem("admin_refresh_token") : null;

        if (currentStoredToken && currentStoredRef) {
          const res = await fetch("/api/auth/refresh-token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refreshToken: currentStoredRef }),
          });

          if (res.ok) {
            const data = await res.json();
            setVerifiedRole(data.role || profile?.role || "user");
            saveAuthTokens(data.token || currentStoredToken, data.refreshToken || currentStoredRef);
            setLoading(false);
            return;
          }
        }

        // Initial full role verification on first login
        const idToken = await currentUser.getIdToken();
        const res = await fetch("/api/auth/verify-role", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ token: idToken }),
        });

        if (res.ok) {
          const data = await res.json();
          setVerifiedRole(data.role || profile?.role || "user");
          saveAuthTokens(data.token || null, data.refreshToken || null);
        } else {
          setVerifiedRole(profile?.role || "user");
          clearAuthTokens();
        }
      } catch (err) {
        console.error("Failed during auth state change verification:", err);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []); // Run ONCE on mount to avoid infinite auth loops


  const handleSignIn = async () => {
    try {
      const res = await signInWithGoogle();
      const profile = await syncUserProfile(res.user);
      if (profile) setUserProfile(profile);

      const idToken = await res.user.getIdToken();
      const srvRes = await fetch("/api/auth/verify-role", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ token: idToken }),
      });

      if (srvRes.ok) {
        const data = await srvRes.json();
        setVerifiedRole(data.role || "user");
        saveAuthTokens(data.token || null, data.refreshToken || null);
      } else {
        clearAuthTokens();
      }

      toast.success(`Welcome back, ${res.user.displayName || "User"}!`);
    } catch (err: any) {
      console.error("Sign in error:", err);
      if (err.code !== "auth/popup-closed-by-user") {
        toast.error(err.message || "Failed to sign in with Google.");
      }
    }
  };

  const handleSignOut = async () => {
    try {
      await logOut();
      setUserProfile(null);
      setVerifiedRole(null);
      clearAuthTokens();
      toast.info("Signed out successfully.");
    } catch (err: any) {
      console.error("Sign out error:", err);
      toast.error(err.message || "Failed to sign out.");
    }
  };

  const changeUserRoleForTesting = async (newRole: UserRole): Promise<boolean> => {
    if (!auth.currentUser) {
      toast.error("Must be signed in to change role.");
      return false;
    }
    try {
      const token =
        adminToken || (typeof window !== "undefined" ? localStorage.getItem("admin_session_token") : null);
      const res = await fetch("/api/admin/set-role", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token || ""}`,
        },
        body: JSON.stringify({ newRole }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      toast.success(`Role updated to '${data.newRole}' on Firestore & server.`);

      // Re-fetch role from server to issue a new JWT containing the updated role
      await verifyRoleWithServer();
      return true;
    } catch (err: any) {
      toast.error(`Failed to update role: ${err.message}`);
      return false;
    }
  };

  const activeRole: UserRole | null = verifiedRole || userProfile?.role || null;
  const isPrivileged = !!activeRole && PRIVILEGED_ROLES.includes(activeRole);
  const isAdmin = activeRole === "admin";

  const hasRole = (requiredRoles: UserRole | UserRole[]): boolean => {
    if (!activeRole) return false;
    const allowed = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
    return allowed.includes(activeRole);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        userProfile,
        loading,
        role: activeRole,
        verifiedRole,
        isPrivileged,
        isAdmin,
        serverVerifying,
        adminToken,
        refreshToken,
        hasRole,
        signInWithGoogle: handleSignIn,
        signOut: handleSignOut,
        refreshProfile,
        verifyRoleWithServer,
        renewSessionTokenWithRefreshToken,
        changeUserRoleForTesting,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

