export type UserRole = "admin" | "editor" | "moderator" | "viewer" | "user";

export interface SessionUser {
  uid: string;
  email: string;
  name: string;
  photoURL: string;
  role: UserRole;
  nativeLanguage?: string;
  educationLevel?: string;
}

export interface ClientUser {
  uid: string;
  email: string;
  name: string;
  photoURL: string;
  role: UserRole;
  nativeLanguage?: string;
  educationLevel?: string;
}

export interface UserProfileRecord {
  uid: string;
  email: string;
  name: string;
  photoURL: string;
  role: UserRole;
  nativeLanguage?: string;
  educationLevel?: string;
  createdAt?: string;
  updatedAt?: string;
  lastLoginAt?: string;
}
