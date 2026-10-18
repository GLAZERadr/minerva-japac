"use client";

import { apiUrl } from "@/lib/api";
import demoLots from "@/data/demo-lots.json";
import {
  DATA_MODE,
  canUseMockFallback,
  checkBackend,
  fetchWithTimeout,
  markBackendOffline,
  type DataSource,
} from "@/lib/backend";
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";
import { getFirestoreDb, isFirestoreConfigured } from "@/lib/firestore";

// Product (lot) data client. Talks to the Go API (`/api/products`, backed by
// MySQL) and falls back to a seeded demo store in localStorage when the
// backend is unreachable, so Product Data and "Add product data" always work
// on camera.

export type ProductDataRow = {
  lot: string;
  status: string;
  activeMachineId?: string;
  averages?: Record<string, number | string> | null;
  operationHour?: number | string | null;
  goodProduct?: number | null;
  defectProduct?: number | null;
  conclusion?: string | null;
  isConclusion?: boolean | null;
  updatedAt?: string;
};

/** "firestore" = Cloud Firestore, "live" = Go API (MySQL), "mock" = demo store. */
export type ProductSource = "firestore" | DataSource;
export type ProductResult<T> = { data: T; source: ProductSource };

const STORAGE_KEY = "minerva.demo.products.v1";

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

/** The five demo lots — shared with scripts/seed-firestore.mjs. */
function seedProducts(): ProductDataRow[] {
  return demoLots.lots.map(({ hoursAgo: age, ...row }) => ({ ...row, updatedAt: hoursAgo(age) }));
}

function readStore(): ProductDataRow[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as ProductDataRow[];
    }
  } catch {
    /* storage unavailable — fall through to seed */
  }
  return seedProducts();
}

function writeStore(rows: ProductDataRow[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  } catch {
    /* ignore — the demo still works for this page view */
  }
}

let memoryStore: ProductDataRow[] | null = null;
function mockRows(): ProductDataRow[] {
  if (!memoryStore) memoryStore = readStore();
  return memoryStore;
}
function saveMockRows(rows: ProductDataRow[]) {
  memoryStore = rows;
  writeStore(rows);
}

/** A 4xx from the API is a real answer (e.g. validation) — don't mask it. */
class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function callApi<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetchWithTimeout(apiUrl(path), { cache: "no-store", ...init });
  } catch (err) {
    markBackendOffline();
    throw err instanceof Error && err.name === "AbortError"
      ? new Error("The backend did not respond within 10 seconds.")
      : new Error("The backend is unreachable.");
  }
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof payload?.error === "string" ? payload.error : response.statusText || "Request failed";
    if (response.status >= 500) markBackendOffline();
    throw new ApiError(message, response.status);
  }
  return payload as T;
}

const PRODUCTS = "products";

/** Firestore, unless we're in offline demo mode or it isn't configured. */
async function firestoreDb(): Promise<Firestore | null> {
  if (DATA_MODE === "mock" || !isFirestoreConfigured()) return null;
  return getFirestoreDb();
}

function fromFirestore(data: DocumentData): ProductDataRow {
  const updatedAt = data.updatedAt instanceof Timestamp ? data.updatedAt.toDate().toISOString() : data.updatedAt;
  return { ...(data as ProductDataRow), updatedAt: typeof updatedAt === "string" ? updatedAt : undefined };
}

/** Firestore first; then the Go API; then the demo store. */
async function withFallback<T>(
  fire: ((db: Firestore) => Promise<T>) | null,
  live: () => Promise<T>,
  mock: () => T
): Promise<ProductResult<T>> {
  const db = fire ? await firestoreDb() : null;
  if (db && fire) {
    try {
      return { data: await fire(db), source: "firestore" };
    } catch (err) {
      if (err instanceof UserError) throw err;
      console.warn("[products] Firestore failed, falling back:", err);
    }
  }
  if (DATA_MODE === "mock") return { data: mock(), source: "mock" };
  if (canUseMockFallback && (await checkBackend()) === "offline") {
    return { data: mock(), source: "mock" };
  }
  try {
    return { data: await live(), source: "live" };
  } catch (err) {
    const isClientError = err instanceof ApiError && err.status < 500;
    if (!canUseMockFallback || isClientError) throw err;
    return { data: mock(), source: "mock" };
  }
}

/** A validation problem to show the user (not a reason to fall back). */
class UserError extends Error {}

export function listProducts(): Promise<ProductResult<ProductDataRow[]>> {
  return withFallback(
    async (db) => (await getDocs(collection(db, PRODUCTS))).docs.map((d) => fromFirestore(d.data())),
    async () => {
      const json = await callApi<{ products?: ProductDataRow[] }>("/api/products");
      return Array.isArray(json?.products) ? json.products : [];
    },
    () => [...mockRows()]
  );
}

/**
 * Live updates of the lot list from Firestore. Resolves to an unsubscribe
 * function, or null when Firestore isn't available (caller polls instead).
 */
export async function subscribeProducts(
  onRows: (rows: ProductDataRow[]) => void
): Promise<(() => void) | null> {
  const db = await firestoreDb();
  if (!db) return null;
  return onSnapshot(
    collection(db, PRODUCTS),
    (snapshot) => onRows(snapshot.docs.map((d) => fromFirestore(d.data()))),
    (err) => console.warn("[products] live sync stopped:", err)
  );
}

const rand = (min: number, max: number, digits = 1) =>
  Math.round((min + Math.random() * (max - min)) * 10 ** digits) / 10 ** digits;

/** A new lot entering the line, with demo-generated sensor averages. */
function newLot(lot: string): ProductDataRow {
  return {
    lot,
    status: "processing",
    activeMachineId: "furnace",
    averages: {
      temperature: rand(722, 738),
      argon_pressure: rand(2.3, 2.6),
      water_pump: Math.round(rand(76, 82, 0)),
      energy_usage: rand(80, 120),
    },
    operationHour: rand(0.3, 0.6, 2),
    goodProduct: Math.round(rand(8, 14, 0)),
    defectProduct: Math.random() < 0.5 ? 0 : 1,
    conclusion: null,
    isConclusion: false,
    updatedAt: new Date().toISOString(),
  };
}

const LOT_PATTERN = /^[A-Za-z0-9-]{3,40}$/;

export function createProduct(lotNumber: string): Promise<ProductResult<ProductDataRow>> {
  const lot = lotNumber.trim().toUpperCase();
  if (!LOT_PATTERN.test(lot)) {
    return Promise.reject(new UserError("Lot numbers use 3–40 letters, digits or dashes."));
  }
  return withFallback(
    async (db) => {
      const ref = doc(db, PRODUCTS, lot);
      if ((await getDoc(ref)).exists()) throw new UserError(`Lot ${lot} already exists.`);
      const entry = newLot(lot);
      await setDoc(ref, { ...entry, updatedAt: serverTimestamp() });
      return entry;
    },
    () =>
      callApi<ProductDataRow>("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lotNumber: lot }),
      }),
    () => {
      const rows = mockRows();
      if (rows.some((row) => row.lot.toLowerCase() === lot.toLowerCase())) {
        throw new UserError(`Lot ${lot} already exists.`);
      }
      const entry = newLot(lot);
      saveMockRows([entry, ...rows]);
      return entry;
    }
  );
}

export function acknowledgeProduct(
  lot: string,
  conclusion: string
): Promise<ProductResult<void>> {
  return withFallback(
    async (db) => {
      await updateDoc(doc(db, PRODUCTS, lot), {
        conclusion,
        isConclusion: true,
        updatedAt: serverTimestamp(),
      });
    },
    async () => {
      await callApi("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lotNumber: lot, conclusion, isConclusion: true }),
      });
    },
    () => {
      saveMockRows(
        mockRows().map((row) =>
          row.lot === lot
            ? { ...row, conclusion, isConclusion: true, updatedAt: new Date().toISOString() }
            : row
        )
      );
    }
  );
}

export function deleteProduct(lot: string): Promise<ProductResult<void>> {
  return withFallback(
    async (db) => {
      await deleteDoc(doc(db, PRODUCTS, lot));
    },
    async () => {
      await callApi(`/api/products/${encodeURIComponent(lot)}`, { method: "DELETE" });
    },
    () => {
      saveMockRows(mockRows().filter((row) => row.lot !== lot));
    }
  );
}

/** Restore the five seeded demo lots in the browser demo store. */
export function resetDemoProducts() {
  saveMockRows(seedProducts());
}
