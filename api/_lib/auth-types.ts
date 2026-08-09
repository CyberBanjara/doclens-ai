export type UserRole = "admin" | "editor" | "moderator" | "viewer" | "user";

export interface SessionUser {
  uid: string;
  email: string;
  name: string;
  photoURL: string;
  role: UserRole;
}

export interface UserProfileRecord {
  uid: string;
  email: string;
  name: string;
  photoURL?: string;
  role: UserRole;
  createdAt?: string;
  updatedAt?: string;
  lastLoginAt?: string;
}

export interface ClientUser {
  uid: string;
  email: string;
  name: string;
  photoURL: string;
  role: UserRole;
}
