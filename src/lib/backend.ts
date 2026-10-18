"use client";

import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api";
import { publicEnv } from "@/lib/public-env";

// Backend reachability + data-source selection for every feature that talks
// to the Go API (sensor stream, products, Ask AI, notifications).
//
// NEXT_PUBLIC_DATA_MODE controls where data comes from:
//   "auto" (default) — probe the backend; use it when reachable, otherwise
//                      fall back to the bundled demo data.
//   "mock"           — never call the backend (offline demo recording).
//   "live"           — always call the backend, no demo fallback.

export type DataMode = "auto" | "mock" | "live";
export type BackendStatus = "checking" | "online" | "offline";
export type DataSource = "live" | "mock";

const rawMode = publicEnv("NEXT_PUBLIC_DATA_MODE").toLowerCase();
export const DATA_MODE: DataMode =
  rawMode === "mock" || rawMode === "live" ? rawMode : "auto";

const HEALTH_TIMEOUT_MS = 4000;
const HEALTH_CACHE_MS = 30_000;

/** Loading states give up after this long and show an error + retry. */
export const LOADING_TIMEOUT_MS = 10_000;

let status: BackendStatus = DATA_MODE === "mock" ? "offline" : "checking";
let lastCheckedAt = 0;
let inflight: Promise<BackendStatus> | null = null;
const listeners = new Set<(next: BackendStatus) => void>();

function setStatus(next: BackendStatus) {
  if (next === status) return;
  status = next;
  listeners.forEach((listener) => listener(next));
}

export function getBackendStatus(): BackendStatus {
  return status;
}

/** fetch() that aborts after `timeoutMs`, also honouring a caller's signal. */
export async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  timeoutMs = LOADING_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const outer = init.signal;
  const onOuterAbort = () => controller.abort();
  outer?.addEventListener("abort", onOuterAbort);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
    outer?.removeEventListener("abort", onOuterAbort);
  }
}

/**
 * Probe `GET /health`. Results are cached for 30 s and concurrent callers
 * share one request. Pass `force` to re-probe (e.g. from a Retry button).
 */
export function checkBackend(force = false): Promise<BackendStatus> {
  if (DATA_MODE === "mock") return Promise.resolve("offline");
  if (DATA_MODE === "live") {
    setStatus("online");
    return Promise.resolve("online");
  }
  if (!force && status !== "checking") {
    // Known status: answer immediately; refresh in the background when stale
    // so later loads never wait on a probe of a dead backend.
    if (Date.now() - lastCheckedAt >= HEALTH_CACHE_MS && !inflight) void probe();
    return Promise.resolve(status);
  }
  return inflight ?? probe();
}

function probe(): Promise<BackendStatus> {
  inflight = fetchWithTimeout(apiUrl("/health"), { cache: "no-store" }, HEALTH_TIMEOUT_MS)
    .then((response) => (response.ok ? "online" : "offline") as BackendStatus)
    .catch(() => "offline" as BackendStatus)
    .then((result) => {
      lastCheckedAt = Date.now();
      setStatus(result);
      return result;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Record that a live request just failed, so other features stop waiting on it. */
export function markBackendOffline() {
  if (DATA_MODE !== "auto") return;
  lastCheckedAt = Date.now();
  setStatus("offline");
}

/** Whether the bundled demo data may be used when the backend fails. */
export const canUseMockFallback = DATA_MODE !== "live";

export function subscribeBackendStatus(listener: (next: BackendStatus) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useBackendStatus(): BackendStatus {
  const [current, setCurrent] = useState<BackendStatus>(status);
  useEffect(() => {
    setCurrent(getBackendStatus());
    const unsubscribe = subscribeBackendStatus(setCurrent);
    void checkBackend();
    return unsubscribe;
  }, []);
  return current;
}
