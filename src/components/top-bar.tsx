"use client";

import type { SVGProps } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AskAiButton } from "@/components/AskAiButton";
import ProductDataViewerModal from "@/components/ProductDataViewerModal";
import LiveSensorTicker from "@/components/LiveSensorTicker";

type IconProps = SVGProps<SVGSVGElement>;

const BellIcon = (props: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    role="img"
    aria-hidden="true"
    focusable="false"
    {...props}
  >
    <path
      d="M18 14V11a6 6 0 0 0-12 0v3l-1.5 2h15Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    <path
      d="M10 18a2 2 0 0 0 4 0"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </svg>
);

const UserIcon = (props: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    role="img"
    aria-hidden="true"
    focusable="false"
    {...props}
  >
    <path
      d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-8 8a8 8 0 0 1 16 0"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </svg>
);

const MoonIcon = (props: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    role="img"
    aria-hidden="true"
    focusable="false"
    {...props}
  >
    <path
      d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </svg>
);

type NotificationSeverity = "critical" | "warning" | "info";

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  severity: NotificationSeverity;
  machineId?: string;
  read?: boolean;
};

const severityVisuals: Record<
  NotificationSeverity,
  { dot: string; pill: string }
> = {
  critical: {
    dot: "bg-red-500",
    pill: "text-red-400",
  },
  warning: {
    dot: "bg-yellow-400",
    pill: "text-yellow-300",
  },
  info: {
    dot: "bg-blue-400",
    pill: "text-blue-300",
  },
};

const formatTimestamp = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const createClientId = () => {
  try {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      return crypto.randomUUID();
    }
  } catch (err) {
    /* ignore */
  }
  return `notif-${Math.random().toString(36).slice(2, 10)}`;
};

export default function TopBar() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isProductModalOpen, setProductModalOpen] = useState(false);
  const notificationDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const response = await fetch("/notification-data.json", {
          cache: "no-store",
        });
        if (!response.ok) throw new Error(response.statusText);
        const json = await response.json();
        if (!isMounted) return;
        const list = Array.isArray(json?.notifications)
          ? json.notifications
          : [];
        const parsed: NotificationItem[] = list
          .filter((item: any) => item && typeof item === "object")
          .map((item: any) => {
            const severity: NotificationSeverity =
              item.severity === "critical" ||
              item.severity === "warning" ||
              item.severity === "info"
                ? item.severity
                : "info";
            return {
              id: String(item.id ?? createClientId()),
              title: String(item.title ?? "Notification"),
              message: String(item.message ?? "-"),
              timestamp: String(item.timestamp ?? new Date().toISOString()),
              machineId:
                typeof item.machineId === "string" ? item.machineId : undefined,
              severity,
              read: Boolean(item.read),
            } satisfies NotificationItem;
          });
        // sort descending by timestamp to mimic backend ordering
        parsed.sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        setNotifications(parsed);
      } catch (err) {
        console.error("Failed to load notifications", err);
        if (!isMounted) return;
        setNotifications([]);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      const isInsideNotifications = Boolean(
        target && notificationDropdownRef.current?.contains(target)
      );
      if (isInsideNotifications) return;
      setIsNotificationsOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, []);

  // NOTE: previously this component opened the Product Data modal when
  // the global "__simulationDisabled" event was dispatched. That caused
  // the ProductData modal to appear automatically after a simulation
  // finished. We intentionally remove that behavior so only the
  // SimulationResult modal is shown when simulations complete.

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.read).length,
    [notifications]
  );

  const sortedNotifications = useMemo(() => {
    return [...notifications].sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [notifications]);

  const handleNotificationToggle = () => {
    setIsNotificationsOpen((prev) => {
      const next = !prev;
      if (next) {
        setNotifications((current) =>
          current.map((item) => ({ ...item, read: true }))
        );
      }
      return next;
    });
  };

  const handleNotificationClick = (item: NotificationItem) => {
    if (item.machineId) {
      try {
        window.dispatchEvent(
          new CustomEvent("__openModelModal", {
            detail: { id: item.machineId },
          })
        );
      } catch (err) {
        console.error("Failed to open model modal from notification", err);
      }
    }
    setIsNotificationsOpen(false);
    setNotifications((current) =>
      current.map((entry) =>
        entry.id === item.id ? { ...entry, read: true } : entry
      )
    );
  };

  return (
    <>
      <header className="pointer-events-none fixed inset-x-0 top-6 z-40 flex justify-center bg-transparent">
        <div className="pointer-events-auto flex h-14 w-full max-w-6xl items-center gap-6 bg-transparent px-6">
          <div className="flex items-center gap-2 bg-slate-800 p-2 rounded-3xl">
            <Badge
              variant="secondary"
              className="uppercase tracking-[0.18em] text-[10px] text-slate-300"
            >
              Plant
            </Badge>
            <Badge className="bg-blue-500 text-white shadow-[0_0_18px_rgba(59,130,246,0.45)]">
              Smelter
            </Badge>
          </div>

          <LiveSensorTicker />

          <div className="ml-auto flex items-center gap-3">
            <AskAiButton className="md:w-auto" />
            <Button
              variant="outline"
              className="uppercase tracking-[0.2em]"
              onClick={() => setProductModalOpen(true)}
            >
              Product Data
            </Button>
            <div ref={notificationDropdownRef} className="relative">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Notifications"
                onClick={handleNotificationToggle}
              >
                <span className="relative inline-flex">
                  <BellIcon className="h-4 w-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -right-1 -top-1 inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
                  )}
                </span>
              </Button>
              {isNotificationsOpen && (
                <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-72 rounded-xl border border-white/10 bg-slate-950/95 p-3 shadow-2xl backdrop-blur">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-100">
                      Notifications
                    </span>
                    <span className="text-xs text-slate-400">
                      {unreadCount} unread
                    </span>
                  </div>
                  <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                    {sortedNotifications.length ? (
                      sortedNotifications.map((item) => {
                        const visuals =
                          severityVisuals[item.severity] ??
                          severityVisuals.info;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => handleNotificationClick(item)}
                            className="flex w-full flex-col gap-1 rounded-lg border border-white/5 bg-slate-900/60 px-3 py-2 text-left transition hover:border-blue-400/40 hover:bg-slate-800/80"
                          >
                            <div className="flex items-center justify-between text-xs">
                              <div
                                className={`flex items-center gap-2 font-semibold text-slate-100`}
                              >
                                <span
                                  className={`h-2.5 w-2.5 rounded-full ${visuals.dot}`}
                                />
                                <span>{item.title}</span>
                              </div>
                              <span className="text-right text-[11px] text-slate-500">
                                {formatTimestamp(item.timestamp)}
                              </span>
                            </div>
                            <p className="text-xs text-slate-300">
                              {item.message}
                            </p>
                            {item.machineId && (
                              <span
                                className={`text-[11px] uppercase tracking-[0.15em] ${visuals.pill}`}
                              >
                                {item.machineId}
                              </span>
                            )}
                          </button>
                        );
                      })
                    ) : (
                      <div className="rounded-lg border border-dashed border-white/10 px-3 py-6 text-center text-sm text-slate-500">
                        No notifications
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <Button variant="ghost" size="icon" aria-label="Profile">
              <UserIcon className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              className="gap-2 px-4 text-slate-200 hover:text-white"
              aria-label="Toggle theme"
            >
              <MoonIcon className="h-4 w-4" />
              <span className="text-sm font-medium">Dark</span>
            </Button>
          </div>
        </div>
      </header>
      <ProductDataViewerModal
        isOpen={isProductModalOpen}
        onCloseAction={() => setProductModalOpen(false)}
      />
    </>
  );
}
