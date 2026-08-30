import { initializeApp, getApp, getApps, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";

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

// Lazy/safe initialization of Firebase App instance
export function getFirebaseApp(): FirebaseApp {
  return getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
}

let firestoreInstance: Firestore | null = null;

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

export { firebaseConfig };
