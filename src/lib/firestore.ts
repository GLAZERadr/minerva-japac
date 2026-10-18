"use client";

import { connectAuthEmulator, getAuth, signInAnonymously } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";
import { firebaseApp } from "@/lib/firebase";

// Cloud Firestore for app data (product lots, alerts). The dashboard has no
// login, so each browser signs in anonymously; the security rules only let
// signed-in clients read, and validate every product write.
//
// Set NEXT_PUBLIC_FIREBASE_EMULATOR=1 to use the local emulators started by
// `firebase emulators:start` (Firestore :8080, Auth :9099).

const useEmulator = process.env.NEXT_PUBLIC_FIREBASE_EMULATOR === "1";
const READY_TIMEOUT_MS = 6000;

let ready: Promise<Firestore | null> | null = null;

export function isFirestoreConfigured(): boolean {
  return firebaseApp !== null;
}

/**
 * Resolves to a signed-in Firestore instance, or null when Firebase is not
 * configured or sign-in fails/times out (callers fall back to demo data).
 */
export function getFirestoreDb(): Promise<Firestore | null> {
  if (ready) return ready;
  const app = firebaseApp;
  if (!app) {
    ready = Promise.resolve(null);
    return ready;
  }
  ready = (async () => {
    try {
      const auth = getAuth(app);
      const db = getFirestore(app);
      if (useEmulator) {
        connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
        connectFirestoreEmulator(db, "127.0.0.1", 8080);
      }
      if (!auth.currentUser) {
        await Promise.race([
          signInAnonymously(auth),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Firebase sign-in timed out")), READY_TIMEOUT_MS)
          ),
        ]);
      }
      return db;
    } catch (err) {
      console.warn("[firestore] unavailable, using demo data:", err);
      ready = null; // allow a later retry
      return null;
    }
  })();
  return ready;
}
