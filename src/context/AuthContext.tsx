import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  type ClientUser,
  type UserRole,
  apiFetchCurrentUser,
  apiLoginWithGoogle,
  apiLogout,
} from "@/lib/auth-client";

interface AuthContextType {
  user: ClientUser | null;
  loading: boolean;
  isAdmin: boolean;
  isPrivileged: boolean;
  role: UserRole | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<ClientUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Initialize session on mount by checking HttpOnly cookie via /api/auth/me
  const refreshUser = useCallback(async () => {
    try {
      const currentUser = await apiFetchCurrentUser();
      setUser(currentUser);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const signInWithGoogle = async () => {
    try {
      setLoading(true);
      const authenticatedUser = await apiLoginWithGoogle();
      setUser(authenticatedUser);
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
      await apiLogout();
      setUser(null);
      toast.success("Signed out successfully");
    } catch (err: any) {
      console.error("Sign out error:", err);
      setUser(null);
    }
  };

  const isAdmin = user?.role === "admin";
  const isPrivileged = user ? ["admin", "editor", "moderator"].includes(user.role) : false;

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAdmin,
        isPrivileged,
        role: user?.role || null,
        signInWithGoogle,
        signOut,
        refreshUser,
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
