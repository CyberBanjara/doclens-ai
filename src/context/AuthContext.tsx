import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
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
  hasRole: (roles: UserRole | UserRole[]) => boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  verifyRoleWithServer: () => Promise<{ role: UserRole; isPrivileged: boolean } | null>;
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
  hasRole: () => false,
  signInWithGoogle: async () => {},
  signOut: async () => {},
  refreshProfile: async () => {},
  verifyRoleWithServer: async () => null,
  changeUserRoleForTesting: async () => false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifiedRole, setVerifiedRole] = useState<UserRole | null>(null);
  const [serverVerifying, setServerVerifying] = useState(false);

  const verifyRoleWithServer = useCallback(async () => {
    if (!auth.currentUser) {
      setVerifiedRole(null);
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
        const errJson = await res.json().catch(() => ({}));
        console.warn("Server role verification returned error:", res.status, errJson);
        const fallbackRole = userProfile?.role || "user";
        setVerifiedRole(fallbackRole);
        return {
          role: fallbackRole,
          isPrivileged: PRIVILEGED_ROLES.includes(fallbackRole),
        };
      }

      const data = await res.json();
      const serverRole: UserRole = data.role || "user";
      setVerifiedRole(serverRole);

      if (userProfile && userProfile.role !== serverRole) {
        setUserProfile((prev) => (prev ? { ...prev, role: serverRole } : prev));
      }

      return {
        role: serverRole,
        isPrivileged: data.isPrivileged ?? PRIVILEGED_ROLES.includes(serverRole),
      };
    } catch (err) {
      console.error("Failed to verify role with serverless function:", err);
      const fallbackRole = userProfile?.role || "user";
      setVerifiedRole(fallbackRole);
      return {
        role: fallbackRole,
        isPrivileged: PRIVILEGED_ROLES.includes(fallbackRole),
      };
    } finally {
      setServerVerifying(false);
    }
  }, [userProfile]);

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
      if (currentUser) {
        try {
          const profile = await syncUserProfile(currentUser);
          setUserProfile(profile);
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
          } else {
            setVerifiedRole(profile?.role || "user");
          }
        } catch (err) {
          console.error("Failed during auth state change verification:", err);
        }
      } else {
        setUserProfile(null);
        setVerifiedRole(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

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
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch("/api/admin/set-role", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ newRole }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      toast.success(`Role updated to '${data.newRole}' on Firestore & server.`);
      setUserProfile((prev) => (prev ? { ...prev, role: data.newRole } : prev));
      setVerifiedRole(data.newRole);
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
        hasRole,
        signInWithGoogle: handleSignIn,
        signOut: handleSignOut,
        refreshProfile,
        verifyRoleWithServer,
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
