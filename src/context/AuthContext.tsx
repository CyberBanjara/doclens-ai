import { createContext, useContext, useEffect, useState, ReactNode } from "react";
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

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  role: UserRole | null;
  isAdmin: boolean;
  hasRole: (roles: UserRole | UserRole[]) => boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userProfile: null,
  loading: true,
  role: null,
  isAdmin: false,
  hasRole: () => false,
  signInWithGoogle: async () => {},
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = async () => {
    if (auth.currentUser) {
      const profile = await getUserProfile(auth.currentUser.uid);
      if (profile) {
        setUserProfile(profile);
      }
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const profile = await syncUserProfile(currentUser);
          setUserProfile(profile);
        } catch (err) {
          console.error("Failed to sync user profile on auth state change:", err);
        }
      } else {
        setUserProfile(null);
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
      toast.info("Signed out successfully.");
    } catch (err: any) {
      console.error("Sign out error:", err);
      toast.error(err.message || "Failed to sign out.");
    }
  };

  const role = userProfile?.role || null;
  const isAdmin = role === "admin";

  const hasRole = (requiredRoles: UserRole | UserRole[]): boolean => {
    if (!role) return false;
    const allowed = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
    return allowed.includes(role);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        userProfile,
        loading,
        role,
        isAdmin,
        hasRole,
        signInWithGoogle: handleSignIn,
        signOut: handleSignOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
