import { readFileSync } from "node:fs";
import type { NextConfig } from "next";

// Build id written by scripts/write-version.mjs (npm "prebuild"); the app
// compares it with the live /version.json to detect a newer deploy.
function readBuildId(): string {
  try {
    return JSON.parse(readFileSync("public/version.json", "utf8")).buildId ?? "dev";
  } catch {
    return "dev";
  }
}

const nextConfig: NextConfig = {
  // Static export for Firebase Hosting (classic).
  // `npm run build` outputs to `out/` which is deployed via firebase.json `public: out`.
  output: "export",
  images: {
    unoptimized: true,
  },
  trailingSlash: false,
  env: {
    NEXT_PUBLIC_BUILD_ID: readBuildId(),
  },
};

export default nextConfig;
