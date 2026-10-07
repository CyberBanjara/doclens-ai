import { initializeApp, getApp, getApps, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getAuth, type Auth } from "firebase/auth";

// ---------------------------------------------------------------------------
// Firebase configuration — injected at BUILD TIME via Vite `define`
// ---------------------------------------------------------------------------
declare const __FIREBASE_CONFIG__: {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId: string;
};

const firebaseConfig =
  typeof __FIREBASE_CONFIG__ !== "undefined"
    ? __FIREBASE_CONFIG__
    : {
        apiKey: "",
        authDomain: "",
        projectId: "",
        storageBucket: "",
        messagingSenderId: "",
        appId: "",
        measurementId: "",
      };

let appInstance: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let firestoreInstance: Firestore | null = null;

// Safe initialization of Firebase App instance
export function getFirebaseApp(): FirebaseApp {
  if (!appInstance) {
    appInstance = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  }
  return appInstance;
}

// Eager / cached initialization of Firebase Auth instance
export function getFirebaseAuth(): Auth {
  if (!authInstance) {
    authInstance = getAuth(getFirebaseApp());
  }
  return authInstance;
}

// Lazy/safe initialization of Firestore database instance
export function getFirestoreDb(): Firestore | null {
  if (typeof window === "undefined") return null;
  try {
    if (!firestoreInstance) {
      firestoreInstance = getFirestore(getFirebaseApp());
    }
    return firestoreInstance;
  } catch (err) {
    console.warn("Could not initialize client Firestore SDK:", err);
    return null;
  }
}

// Warm up Firebase App and Auth immediately on client load
export function warmFirebaseAuth(): void {
  if (typeof window === "undefined") return;
  try {
    getFirebaseAuth();
  } catch (err) {
    console.warn("Failed to pre-warm Firebase Auth:", err);
  }
}

export { firebaseConfig };

