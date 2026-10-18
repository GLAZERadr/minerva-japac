#!/usr/bin/env node
// Runs before every build (npm "prebuild"): stamps a unique build id into
// public/version.json. next.config.ts exposes the same id to the app as
// NEXT_PUBLIC_BUILD_ID, and src/components/UpdateBanner.tsx compares the two
// to tell an open tab that a newer deploy is live.
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

let sha = "local";
try {
  sha = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
} catch {
  /* not a git checkout */
}
const buildId = `${sha}-${Date.now().toString(36)}`;
writeFileSync(new URL("../public/version.json", import.meta.url), `${JSON.stringify({ buildId })}\n`);
console.log(`write-version: ${buildId}`);
