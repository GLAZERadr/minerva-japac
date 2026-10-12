import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";

// Firebase Web App configuration for project: minerva-apac
// Values are read from NEXT_PUBLIC_FIREBASE_* env vars so secrets are not
// committed. Fill them via `.env.local` (see `.env.example`) or by running:
//   npx -y firebase-tools@latest apps:sdkconfig WEB <APP_ID> --project minerva-apac
//
// After login + app registration, copy the output into `.env.local`.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "minerva-apac",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ?? "",
};

function getFirebaseApp(): FirebaseApp | null {
  if (!firebaseConfig.apiKey || !firebaseConfig.appId) {
    // Not configured yet — caller can check for null and skip Firebase usage.
    // This keeps `next build` / static export working before `apps:sdkconfig`
    // has been run.
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[firebase] Missing NEXT_PUBLIC_FIREBASE_API_KEY / APP_ID — Firebase not initialized. Run apps:sdkconfig and fill .env.local."
      );
    }
    return null;
  }
  if (getApps().length > 0) {
    return getApp();
  }
  return initializeApp(firebaseConfig);
}

export const firebaseApp: FirebaseApp | null = getFirebaseApp();
export { firebaseConfig };
export default firebaseApp;
