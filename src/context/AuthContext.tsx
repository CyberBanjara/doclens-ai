import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  type ClientUser,
  type UserRole,
  apiFetchCurrentUser,
  apiLoginWithGoogle,
  apiLogout,
  apiUpdateUserProfile,
} from "@/lib/auth-client";
import { setOutputLanguage } from "@/lib/openrouter";
import { saveEducationLevel, type EducationLevel } from "@/lib/classification";

interface AuthContextType {
  user: ClientUser | null;
  loading: boolean;
  isAdmin: boolean;
  isPrivileged: boolean;
  role: UserRole | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateProfile: (updates: {
    nativeLanguage?: string;
    educationLevel?: string;
    name?: string;
    photoURL?: string;
  }) => Promise<ClientUser>;
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
      if (currentUser?.nativeLanguage) {
        setOutputLanguage(currentUser.nativeLanguage);
      }
      if (currentUser?.educationLevel) {
        saveEducationLevel(currentUser.educationLevel as EducationLevel);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const updateProfile = async (updates: {
    nativeLanguage?: string;
    educationLevel?: string;
    name?: string;
    photoURL?: string;
  }): Promise<ClientUser> => {
    const updated = await apiUpdateUserProfile(updates);
    setUser(updated);
    if (updated.nativeLanguage) {
      setOutputLanguage(updated.nativeLanguage);
    }
    if (updated.educationLevel) {
      saveEducationLevel(updated.educationLevel as EducationLevel);
    }
    return updated;
  };

  const signInWithGoogle = async () => {
    try {
      setLoading(true);
      const authenticatedUser = await apiLoginWithGoogle();
      setUser(authenticatedUser);
      if (authenticatedUser?.nativeLanguage) {
        setOutputLanguage(authenticatedUser.nativeLanguage);
      }
      if (authenticatedUser?.educationLevel) {
        saveEducationLevel(authenticatedUser.educationLevel as EducationLevel);
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
