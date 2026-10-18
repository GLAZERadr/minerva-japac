#!/usr/bin/env node
// Seed (or reset) Cloud Firestore with the MINERVA demo data:
//   products/{lot}       ← src/data/demo-lots.json
//   notifications/{id}   ← public/notification-data.json
//
// Timestamps are shifted so the data always looks recent on camera.
//
// Usage:
//   npm run seed:firestore              # add/overwrite the demo docs
//   npm run seed:firestore -- --reset   # also delete every other doc first
//
// Credentials: Application Default Credentials
//   (`gcloud auth application-default login`) or GOOGLE_APPLICATION_CREDENTIALS.
// Against the local emulator, set FIRESTORE_EMULATOR_HOST=127.0.0.1:8080.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { initializeApp } from "firebase-admin/app";
import { Timestamp, getFirestore } from "firebase-admin/firestore";

const root = new URL("..", import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(fileURLToPath(new URL(path, root)), "utf8"));

const projectId =
  process.env.FIREBASE_PROJECT_ID ??
  process.env.GCLOUD_PROJECT ??
  readJson(".firebaserc").projects.default;
const reset = process.argv.includes("--reset");

initializeApp({ projectId });
const db = getFirestore();

const hoursAgo = (hours) => Timestamp.fromMillis(Date.now() - hours * 3_600_000);

async function clear(collectionName) {
  const snapshot = await db.collection(collectionName).get();
  const batch = db.batch();
  snapshot.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  return snapshot.size;
}

async function main() {
  console.log(`Seeding Firestore project "${projectId}"${process.env.FIRESTORE_EMULATOR_HOST ? " (emulator)" : ""}…`);
  if (reset) {
    console.log(`  cleared ${await clear("products")} products, ${await clear("notifications")} notifications`);
  }

  const batch = db.batch();

  const { lots } = readJson("src/data/demo-lots.json");
  for (const { hoursAgo: age, ...lot } of lots) {
    batch.set(db.collection("products").doc(lot.lot), { ...lot, updatedAt: hoursAgo(age) });
  }

  // Keep the original spacing between alerts, newest one 10 minutes ago.
  const { notifications } = readJson("public/notification-data.json");
  const newest = Math.max(...notifications.map((n) => Date.parse(n.timestamp)));
  for (const { id, read: _read, ...alert } of notifications) {
    const offsetMs = newest - Date.parse(alert.timestamp) + 10 * 60_000;
    batch.set(db.collection("notifications").doc(id), {
      ...alert,
      timestamp: Timestamp.fromMillis(Date.now() - offsetMs),
    });
  }

  await batch.commit();
  console.log(`  wrote ${lots.length} products and ${notifications.length} notifications`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
