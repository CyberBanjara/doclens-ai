import { initializeApp, getApp, getApps, type FirebaseApp } from "firebase/app";

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

export { firebaseConfig };
