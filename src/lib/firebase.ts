import { initializeApp, getApp, getApps } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  addDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { getAnalytics, logEvent, isSupported, type Analytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export const db = getFirestore(app);

let analytics: Analytics | null = null;

// Safe initialization of Firebase Analytics
if (typeof window !== "undefined") {
  isSupported().then((supported) => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  });
}

/**
 * Log a page view event to Firebase Analytics
 * @param pagePath The URL path of the page viewed
 */
export function logPageView(pagePath: string) {
  if (typeof window !== "undefined") {
    if (analytics) {
      logEvent(analytics, "page_view", {
        page_path: pagePath,
      });
    } else {
      isSupported().then((supported) => {
        if (supported && !analytics) {
          analytics = getAnalytics(app);
        }
        if (analytics) {
          logEvent(analytics, "page_view", {
            page_path: pagePath,
          });
        }
      });
    }
  }
}

export async function signInWithGoogle() {
  return await signInWithPopup(auth, googleProvider);
}

export async function logOut() {
  return await signOut(auth);
}

export async function submitReviewToFirestore(rating: number, comment: string) {
  const user = auth.currentUser;
  if (!user) throw new Error("Must be signed in to submit a review");

  return await addDoc(collection(db, "reviews"), {
    uid: user.uid,
    displayName: user.displayName || "Anonymous",
    email: user.email || "",
    photoURL: user.photoURL || "",
    rating,
    comment,
    createdAt: serverTimestamp(),
  });
}

export type UserRole = "admin" | "editor" | "moderator" | "viewer" | "user";

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  photoURL?: string;
  role: UserRole;
  createdAt?: any;
  updatedAt?: any;
  lastLoginAt?: any;
}

/**
 * Synchronizes user profile with Firestore `users` collection.
 * Creates document `users/{uid}` with default role 'user' on first login.
 * Updates metadata (`lastLoginAt`, `updatedAt`, `email`, `name`, `photoURL`) on subsequent logins
 * without overwriting manually managed fields like `role` or `createdAt`.
 */
export async function syncUserProfile(user: User): Promise<UserProfile | null> {
  if (!user) return null;

  try {
    const userDocRef = doc(db, "users", user.uid);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      // First time login - create new user document
      const newProfile: UserProfile = {
        uid: user.uid,
        email: user.email || "",
        name: user.displayName || user.email?.split("@")[0] || "User",
        photoURL: user.photoURL || "",
        role: "user", // Default role, NEVER assign 'admin' automatically
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      };

      await setDoc(userDocRef, newProfile);

      return {
        ...newProfile,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastLoginAt: new Date(),
      };
    } else {
      // Existing user - update metadata only, preserving role and createdAt
      const existingData = userDoc.data() as UserProfile;
      const updatedMetadata = {
        email: user.email || existingData.email || "",
        name: user.displayName || existingData.name || "User",
        photoURL: user.photoURL || existingData.photoURL || "",
        updatedAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      };

      await updateDoc(userDocRef, updatedMetadata);

      return {
        ...existingData,
        ...updatedMetadata,
        role: existingData.role || "user",
      };
    }
  } catch (error) {
    console.error("Failed to sync user profile in Firestore:", error);
    // Return fallback profile if Firestore sync fails (e.g. offline)
    return {
      uid: user.uid,
      email: user.email || "",
      name: user.displayName || "User",
      photoURL: user.photoURL || "",
      role: "user",
    };
  }
}

/**
 * Fetches the user profile from Firestore `users/{uid}`
 */
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  try {
    const userDocRef = doc(db, "users", uid);
    const userDoc = await getDoc(userDocRef);
    if (userDoc.exists()) {
      return userDoc.data() as UserProfile;
    }
    return null;
  } catch (error) {
    console.error("Error fetching user profile:", error);
    return null;
  }
}

export { app, analytics, onAuthStateChanged, type User };

