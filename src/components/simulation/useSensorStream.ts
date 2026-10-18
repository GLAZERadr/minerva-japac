"use client";

import { useMemo } from "react";
import {
  useFeedState,
  useSensorReadings,
  type FeedSource,
  type LiveSensorReading,
} from "@/lib/sensor-feed";

export type { LiveSensorReading } from "@/lib/sensor-feed";

type UseSensorStreamOptions = {
  machine?: string;
  sensor?: string;
  limit?: number;
  enabled?: boolean;
};

type UseSensorStreamResult = {
  readings: LiveSensorReading[];
  /** True while data is flowing (live backend or demo feed). */
  connected: boolean;
  source: FeedSource;
  error: string | null;
};

const DEFAULT_LIMIT = 32;

// Thin wrapper over the shared sensor feed (src/lib/sensor-feed.ts): one SSE
// connection for the whole app, with automatic demo-data fallback.
export function useSensorStream(
  options: UseSensorStreamOptions = {}
): UseSensorStreamResult {
  const { machine, sensor, enabled = true, limit: rawLimit } = options;
  const limit = Math.max(1, rawLimit ?? DEFAULT_LIMIT);
  const readings = useSensorReadings(limit, enabled);
  const { source, error } = useFeedState();

  const orderedReadings = useMemo(() => {
    const machineKey = machine?.toLowerCase();
    const sensorKey = sensor?.toLowerCase();
    return readings
      .filter((item) => !machineKey || item.machineName.toLowerCase() === machineKey)
      .filter((item) => !sensorKey || item.sensorName.toLowerCase() === sensorKey)
      .sort((a, b) => b.time.localeCompare(a.time));
  }, [machine, readings, sensor]);

  return {
    readings: orderedReadings,
    connected: source === "live" || source === "mock",
    source,
    error,
  };
}
