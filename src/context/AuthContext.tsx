import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { auth, onAuthStateChanged, signInWithGoogle, logOut, type User } from "@/lib/firebase";
import { toast } from "sonner";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signInWithGoogle: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleSignIn = async () => {
    try {
      const res = await signInWithGoogle();
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
      toast.info("Signed out successfully.");
    } catch (err: any) {
      console.error("Sign out error:", err);
      toast.error(err.message || "Failed to sign out.");
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signInWithGoogle: handleSignIn,
        signOut: handleSignOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
