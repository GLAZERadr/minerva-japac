"use client";

import { useMemo } from "react";
import { RotateCw } from "lucide-react";
import { useSensorStream } from "@/components/simulation/useSensorStream";
import { retryFeed, type FeedSource } from "@/lib/sensor-feed";
import { formatIndicator } from "@/lib/machine-display";
import { cn } from "@/lib/utils";

const SHORT_LABEL: Record<string, string> = {
  airTemperature: "Air temp",
  billetTemperature: "Billet temp",
  numberOfBillet: "Billets",
};

const BADGE: Record<FeedSource, { label: string; dot: string; text: string; title: string }> = {
  live: {
    label: "Live",
    dot: "bg-[#81c995] animate-pulse",
    text: "text-[#81c995]",
    title: "Streaming from InfluxDB via the Minerva API",
  },
  mock: {
    label: "Demo",
    dot: "bg-[#8ab4f8] animate-pulse",
    text: "text-[#8ab4f8]",
    title: "Backend unreachable — showing generated demo sensor data",
  },
  connecting: {
    label: "Connecting",
    dot: "bg-[#fdd663]",
    text: "text-[#fdd663]",
    title: "Connecting to the sensor stream…",
  },
  offline: {
    label: "Offline",
    dot: "bg-[#5f6368]",
    text: "text-[#9aa0a6]",
    title: "Sensor stream unavailable",
  },
};

/** Green "Live" / blue "Demo" / grey "Offline" pill for the sensor stream. */
export function ConnectionBadge({ source, className }: { source: FeedSource; className?: string }) {
  const badge = BADGE[source];
  return (
    <span
      title={badge.title}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#3c4043] bg-[#303134] px-2.5 py-1 text-xs font-medium",
        badge.text,
        className
      )}
    >
      <span className={cn("inline-flex h-2 w-2 rounded-full", badge.dot)} />
      {badge.label}
    </span>
  );
}

export default function LiveSensorTicker() {
  const { readings, source, error } = useSensorStream({ limit: 8 });
  const topReadings = useMemo(() => readings.slice(0, 4), [readings]);

  return (
    <div className="flex min-w-0 items-center gap-2">
      <ConnectionBadge source={source} />
      {source === "offline" ? (
        <button
          type="button"
          onClick={retryFeed}
          title={error ?? "Retry"}
          className="hidden items-center gap-1 rounded-full px-2 py-1 text-xs text-[#8ab4f8] transition hover:bg-[rgba(138,180,248,0.12)] md:inline-flex"
        >
          <RotateCw className="h-3 w-3" />
          Retry
        </button>
      ) : (
        <div className="hidden min-w-0 items-center gap-3 overflow-hidden rounded-full border border-[#3c4043] bg-[#303134] px-3 py-1.5 text-xs text-[#e8eaed] [mask-image:linear-gradient(to_right,black_calc(100%-2.5rem),transparent)] lg:flex">
          {topReadings.length === 0 ? (
            <span className="whitespace-nowrap text-[#9aa0a6]">Connecting to sensors…</span>
          ) : (
            topReadings.map((item) => (
              <span key={item.id} className="flex items-center gap-1 whitespace-nowrap text-[#bdc1c6]">
                <span className="font-medium text-[#e8eaed]">{item.machineName}</span>
                <span className="text-[#9aa0a6]">·</span>
                <span>{SHORT_LABEL[item.sensorName] ?? item.sensorName}</span>
                <span className="font-medium tabular-nums text-white">
                  {formatIndicator(item.sensorName, item.value)}
                </span>
              </span>
            ))
          )}
        </div>
      )}
    </div>
  );
}
