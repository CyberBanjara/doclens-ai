import { initializeApp, getApp, getApps } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import { getFirestore, collection, addDoc, serverTimestamp } from "firebase/firestore";
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

export { app, analytics, onAuthStateChanged, type User };

