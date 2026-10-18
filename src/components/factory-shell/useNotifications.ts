"use client";

import { useEffect, useMemo, useState } from "react";
import { apiUrl } from "@/lib/api";
import { DATA_MODE, checkBackend, fetchWithTimeout } from "@/lib/backend";
import { getFirestoreDb, isFirestoreConfigured } from "@/lib/firestore";
import {
  Timestamp,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";

export type NotificationSeverity = "critical" | "warning" | "info";

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  severity: NotificationSeverity;
  machineId?: string;
  read?: boolean;
}

function createClientId() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* ignore */
  }
  return `notif-${Math.random().toString(36).slice(2, 10)}`;
}

export function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Alerts from the backend when it is reachable (`/api/notifications`, e.g. an
 * alerts table or InfluxDB rules), otherwise the bundled demo feed.
 */
async function fetchNotificationFeed(): Promise<unknown> {
  if (DATA_MODE !== "mock" && (await checkBackend()) === "online") {
    try {
      const response = await fetchWithTimeout(apiUrl("/api/notifications"), { cache: "no-store" });
      if (response.ok) return await response.json();
    } catch {
      /* fall through to the demo feed */
    }
  }
  const response = await fetch("/notification-data.json", { cache: "no-store" });
  if (!response.ok) throw new Error(response.statusText);
  return response.json();
}

function parseNotifications(json: unknown): NotificationItem[] {
  const payload = json as { notifications?: unknown } | null;
  const list = Array.isArray(payload?.notifications) ? payload.notifications : [];
  const parsed: NotificationItem[] = list
    .filter((item: unknown) => item && typeof item === "object")
    .map((item: Record<string, unknown>) => {
      const raw = item.severity;
      const severity: NotificationSeverity =
        raw === "critical" || raw === "warning" || raw === "info" ? raw : "info";
      return {
        id: String(item.id ?? createClientId()),
        title: String(item.title ?? "Notification"),
        message: String(item.message ?? "-"),
        timestamp: String(item.timestamp ?? new Date().toISOString()),
        machineId: typeof item.machineId === "string" ? item.machineId : undefined,
        severity,
        read: Boolean(item.read),
      } satisfies NotificationItem;
    });
  return parsed.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

// One shared store so the rail panel, the mobile Alerts tab and their badges
// agree on what has been read.
let store: NotificationItem[] = [];
let loading: Promise<void> | null = null;
const listeners = new Set<(items: NotificationItem[]) => void>();

function setStore(next: NotificationItem[]) {
  store = next;
  listeners.forEach((listener) => listener(next));
}

/** Keep what this viewer already read when a new snapshot arrives. */
function mergeReadState(next: NotificationItem[]): NotificationItem[] {
  const read = new Set(store.filter((item) => item.read).map((item) => item.id));
  return next.map((item) => (read.has(item.id) ? { ...item, read: true } : item));
}

/** Live alerts from Cloud Firestore; resolves false if it isn't available. */
async function subscribeFirestore(): Promise<boolean> {
  if (DATA_MODE === "mock" || !isFirestoreConfigured()) return false;
  const db = await getFirestoreDb();
  if (!db) return false;
  return new Promise((resolve) => {
    let first = true;
    onSnapshot(
      query(collection(db, "notifications"), orderBy("timestamp", "desc"), limit(50)),
      (snapshot) => {
        const notifications = snapshot.docs.map((d) => {
          const data = d.data();
          const ts = data.timestamp instanceof Timestamp ? data.timestamp.toDate().toISOString() : data.timestamp;
          return { ...data, id: d.id, timestamp: ts };
        });
        setStore(mergeReadState(parseNotifications({ notifications })));
        if (first) {
          first = false;
          resolve(true);
        }
      },
      (err) => {
        console.warn("[notifications] Firestore unavailable, using fallback:", err);
        if (first) {
          first = false;
          resolve(false);
        }
      }
    );
  });
}

function ensureLoaded() {
  if (!loading) {
    loading = subscribeFirestore()
      .then(async (live) => {
        if (!live) setStore(parseNotifications(await fetchNotificationFeed()));
      })
      .catch((err) => {
        console.error("Failed to load notifications", err);
        loading = null;
      });
  }
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<NotificationItem[]>(store);

  useEffect(() => {
    setNotifications(store);
    listeners.add(setNotifications);
    ensureLoaded();
    return () => {
      listeners.delete(setNotifications);
    };
  }, []);

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.read).length,
    [notifications]
  );

  const markAllRead = () => setStore(store.map((item) => ({ ...item, read: true })));

  const markRead = (id: string) =>
    setStore(store.map((entry) => (entry.id === id ? { ...entry, read: true } : entry)));

  return { notifications, unreadCount, markAllRead, markRead };
}
