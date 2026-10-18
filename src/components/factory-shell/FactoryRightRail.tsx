"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, Cpu, Info, Maximize, X } from "lucide-react";
import { loadMachines } from "@/lib/machines";
import type { MachineDetails } from "@/lib/machines";
import { formatTimestamp, useNotifications } from "./useNotifications";
import { openModelModal } from "./FactoryTopBar";
import { cn } from "@/lib/utils";
import {
  HEALTH_TEXT,
  STATUS_COLORS,
  getMachineStatus,
  healthTone,
} from "@/lib/machine-display";

export type RightPanel = "machines" | "notifications" | "info" | null;
type Panel = RightPanel;

const TABS: { key: Exclude<Panel, null>; label: string }[] = [
  { key: "machines", label: "Machines" },
  { key: "notifications", label: "Notifications" },
  { key: "info", label: "Info" },
];

function StripButton({
  title,
  active,
  badge,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  badge?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cn(
        "relative flex h-10 w-10 items-center justify-center rounded-md transition-all duration-200",
        active
          ? "bg-[rgba(138,180,248,0.12)] text-[#8ab4f8]"
          : "text-[#acacbe] hover:bg-[rgba(232,234,237,0.08)] hover:text-[#e8eaed]"
      )}
    >
      {children}
      {badge && (
        <span className="absolute right-1.5 top-1.5 inline-flex h-2 w-2 rounded-full bg-[#f28b82]" />
      )}
    </button>
  );
}

export default function FactoryRightRail({
  panel,
  onPanelChange: setPanel,
}: {
  panel: Panel;
  onPanelChange: (next: Panel | ((current: Panel) => Panel)) => void;
}) {
  const [machines, setMachines] = useState<MachineDetails[] | null>(null);
  // Lowest health first so the machines needing attention are on top.
  const sortedMachines = useMemo(
    () => (machines ? [...machines].sort((a, b) => a.healthScore - b.healthScore) : null),
    [machines]
  );
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  // Unread stays bold while the list is open; leaving the panel clears it.
  const prevPanelRef = useRef<Panel>(panel);
  useEffect(() => {
    if (prevPanelRef.current === "notifications" && panel !== "notifications") markAllRead();
    prevPanelRef.current = panel;
  }, [panel, markAllRead]);

  useEffect(() => {
    if (panel !== "machines" || machines) return;
    let alive = true;
    loadMachines()
      .then((list) => {
        if (alive) setMachines(list);
      })
      .catch(() => {
        if (alive) setMachines([]);
      });
    return () => {
      alive = false;
    };
  }, [panel, machines]);

  const toggleFullscreen = () => {
    try {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen();
    } catch {
      /* ignore */
    }
  };

  return (
    <>
      <div className="fixed bottom-0 right-0 top-14 z-40 hidden w-[60px] flex-col items-center gap-1.5 border-l border-[#333333] bg-[#181818] py-3 md:flex">
        <StripButton
          title="Machines"
          active={panel === "machines"}
          onClick={() => setPanel((p) => (p === "machines" ? null : "machines"))}
        >
          <Cpu className="h-5 w-5" />
        </StripButton>
        <StripButton
          title="Notifications"
          active={panel === "notifications"}
          badge={unreadCount > 0}
          onClick={() => setPanel((p) => (p === "notifications" ? null : "notifications"))}
        >
          <Bell className="h-5 w-5" />
        </StripButton>
        <StripButton
          title="Information"
          active={panel === "info"}
          onClick={() => setPanel((p) => (p === "info" ? null : "info"))}
        >
          <Info className="h-5 w-5" />
        </StripButton>
        <StripButton title="Fullscreen" onClick={toggleFullscreen}>
          <Maximize className="h-5 w-5" />
        </StripButton>
      </div>

      {panel && (
        <section className="fixed inset-x-0 bottom-14 top-[30dvh] z-30 flex flex-col rounded-t-2xl border-t border-[#333333] bg-[#181818] shadow-2xl md:inset-x-auto md:bottom-0 md:right-[60px] md:top-14 md:w-[380px] md:max-w-[calc(100vw-60px)] md:rounded-none md:border-l md:border-t-0">
          <div className="flex shrink-0 items-stretch gap-1 border-b border-[#333333] px-2">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setPanel(t.key)}
                className={cn(
                  "flex-1 border-b-2 px-2 py-3 text-sm transition-colors",
                  panel === t.key
                    ? "border-[#8ab4f8] font-medium text-[#8ab4f8]"
                    : "border-transparent text-[#9aa0a6] hover:text-[#e8eaed]"
                )}
              >
                {t.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPanel(null)}
              aria-label="Close panel"
              className="self-center rounded p-1.5 text-[#9aa0a6] hover:bg-[rgba(232,234,237,0.08)] hover:text-[#e8eaed]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {panel === "machines" && (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#333333] bg-[#181818] px-5 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[#8e8ea0]">
                <span>Machine · lowest health first</span>
                <span>Health</span>
              </div>
              <div className="space-y-1.5 p-4">
                {sortedMachines === null ? (
                  <p className="py-8 text-center text-sm text-[#9aa0a6]">Loading machines…</p>
                ) : sortedMachines.length === 0 ? (
                  <p className="py-8 text-center text-sm text-[#9aa0a6]">No machines found</p>
                ) : (
                  sortedMachines.map((m) => {
                    const status = getMachineStatus(m);
                    const subtitle = `${m.location} · ${m.alarms.active}/${m.alarms.total} alarms`;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setPanel(null);
                          openModelModal(m.id);
                        }}
                        title={`Open ${m.title}`}
                        className="flex w-full items-center gap-3 rounded-md border border-transparent px-3 py-2.5 text-left transition-colors hover:border-[rgba(138,180,248,0.4)] hover:bg-[#2a2a2a]"
                      >
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: STATUS_COLORS[status] }}
                          title={status}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-[#e8eaed]">
                            {m.title}
                          </span>
                          <span className="block truncate text-xs text-[#9aa0a6]" title={subtitle}>
                            {status} · {subtitle}
                          </span>
                        </span>
                        <span className={cn("font-mono text-sm font-medium", HEALTH_TEXT[healthTone(m.healthScore)])}>
                          {m.healthScore}%
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {panel === "notifications" && (
            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-4">
              {notifications.length === 0 ? (
                <p className="py-8 text-center text-sm text-[#9aa0a6]">No notifications</p>
              ) : (
                notifications.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (item.machineId) openModelModal(item.machineId);
                      markRead(item.id);
                    }}
                    className="flex w-full flex-col gap-1 rounded-md border border-transparent px-3 py-2 text-left transition hover:border-[rgba(138,180,248,0.4)] hover:bg-[#2a2a2a]"
                  >
                    <div className="flex items-start justify-between gap-3 text-xs">
                      <span className="flex min-w-0 items-center gap-2 font-medium text-[#e8eaed]">
                        <span
                          className={cn(
                            "h-2 w-2 shrink-0 rounded-full",
                            item.severity === "critical"
                              ? "bg-[#f28b82]"
                              : item.severity === "warning"
                                ? "bg-[#fdd663]"
                                : "bg-[#8ab4f8]"
                          )}
                        />
                        <span className={cn(!item.read && "font-semibold")}>{item.title}</span>
                      </span>
                      <span className="shrink-0 whitespace-nowrap text-[11px] text-[#9aa0a6]">
                        {formatTimestamp(item.timestamp)}
                      </span>
                    </div>
                    <p className="text-xs text-[#bdc1c6]">{item.message}</p>
                  </button>
                ))
              )}
            </div>
          )}

          {panel === "info" && (
            <div className="space-y-3 overflow-y-auto p-4 text-sm leading-relaxed text-[#bdc1c6]">
              <p>
                <strong className="font-medium text-[#e8eaed]">MINERVA Smelter Plant</strong> —
                real-time digital-twin monitoring with AI energy optimization, predictive
                maintenance, and smart simulation.
              </p>
              <p className="text-xs font-medium uppercase tracking-wider text-[#8e8ea0]">
                How to use
              </p>
              <ul className="list-disc space-y-1 pl-5 text-[#9aa0a6]">
                <li>Click a machine in 3D to open its detail modal.</li>
                <li>Use the left rail (or the bottom tabs on mobile) to run simulations or open product data.</li>
                <li>Ask AI about machine performance via the bottom prompt.</li>
              </ul>
              <p className="text-xs text-[#9aa0a6]">
                Bandung, Jawa Barat, Indonesia · minerva@gmail.com
              </p>
            </div>
          )}
        </section>
      )}
    </>
  );
}
