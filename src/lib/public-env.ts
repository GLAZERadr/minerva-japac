// Public configuration, resolved at runtime first and at build time second.
//
// The site is a static export, so `process.env.NEXT_PUBLIC_*` is frozen into
// the bundle at build time. When running in the Cloud Run container, the
// entrypoint (docker/write-env.sh) writes /env.js from the service's
// environment variables, and that script runs before the app — so keys can
// be set in the Cloud Run console without rebuilding or committing them.

export type PublicEnvName =
  | "NEXT_PUBLIC_API_BASE_URL"
  | "NEXT_PUBLIC_DATA_MODE"
  | "NEXT_PUBLIC_GEMINI_API_KEY"
  | "NEXT_PUBLIC_FIREBASE_API_KEY"
  | "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"
  | "NEXT_PUBLIC_FIREBASE_PROJECT_ID"
  | "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"
  | "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"
  | "NEXT_PUBLIC_FIREBASE_APP_ID"
  | "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID"
  | "NEXT_PUBLIC_FIREBASE_EMULATOR";

// Each reference must be written out literally so Next.js can inline it.
const BUILD_ENV: Record<PublicEnvName, string | undefined> = {
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
  NEXT_PUBLIC_DATA_MODE: process.env.NEXT_PUBLIC_DATA_MODE,
  NEXT_PUBLIC_GEMINI_API_KEY: process.env.NEXT_PUBLIC_GEMINI_API_KEY,
  NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
  NEXT_PUBLIC_FIREBASE_EMULATOR: process.env.NEXT_PUBLIC_FIREBASE_EMULATOR,
};

declare global {
  interface Window {
    __MINERVA_ENV__?: Partial<Record<PublicEnvName, string>>;
  }
}

/** Runtime value (from /env.js) if set, else the build-time value, else "". */
export function publicEnv(name: PublicEnvName): string {
  const runtime = typeof window !== "undefined" ? window.__MINERVA_ENV__?.[name] : undefined;
  return (runtime || BUILD_ENV[name] || "").trim();
}
