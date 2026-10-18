"use client";

import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api";
import {
  DATA_MODE,
  LOADING_TIMEOUT_MS,
  canUseMockFallback,
  checkBackend,
} from "@/lib/backend";
import { loadMachines } from "@/lib/machines";
import { parseIndicatorNumber } from "@/lib/machine-display";

// One shared sensor feed for the whole app (ticker, 3D stream tooltips and
// the machine detail modal). It streams from the Go API's SSE endpoint when
// the backend is reachable and switches to a generated demo feed otherwise,
// so the UI never sits on "waiting for sensor data".

export type LiveSensorReading = {
  id: string;
  time: string;
  machineName: string;
  sensorName: string;
  value: number;
};

export type FeedSource = "connecting" | "live" | "mock" | "offline";

export type FeedState = {
  source: FeedSource;
  error: string | null;
};

/** 3D model id → machine name as published to InfluxDB by Node-RED. */
const MODEL_TO_STREAM_NAME: Record<string, string> = {
  furnace: "Furnace-01",
  furnace2: "Furnace-02",
  "rod-feeder": "Rod-Feeder-01",
  "casting-machine": "Casting-Machine-01",
  "charging-machine": "Charging-Machine-01",
  homogenizing: "Homogenizing-01",
  "ct-1": "CT-01",
  "ct-2": "CT-02",
  "ct-3": "CT-03",
  "ct-4": "CT-04",
  ut: "UT-01",
  sawing: "Sawing-01",
  swarf: "Swarf-01",
  launder: "Launder-01",
  sir: "SIR-01",
  storage: "Storage-01",
};

const STREAM_NAME_TO_MODEL = Object.fromEntries(
  Object.entries(MODEL_TO_STREAM_NAME).map(([model, name]) => [name.toLowerCase(), model])
);

/** Resolve a stream machine name ("Furnace-02") to its 3D model id ("furnace2"). */
export function streamNameToModelId(machineName: string): string | null {
  const lower = machineName.trim().toLowerCase();
  if (STREAM_NAME_TO_MODEL[lower]) return STREAM_NAME_TO_MODEL[lower];
  const base = lower.replace(/[-_\s]?0*(\d+)$/, "");
  const index = Number.parseInt(lower.match(/(\d+)$/)?.[1] ?? "1", 10);
  if (base === "furnace") return index > 1 ? "furnace2" : "furnace";
  if (base === "ct") return `ct-${Math.min(4, Math.max(1, index))}`;
  if (base === "weightning" || base === "weighing") return "weightning";
  return base || null;
}

export function modelIdToStreamName(modelId: string): string {
  return MODEL_TO_STREAM_NAME[modelId] ?? modelId;
}

// ---------------------------------------------------------------------------
// Store: latest value per model + sensor, plus a reading broadcast
// ---------------------------------------------------------------------------

type MachineSnapshot = Record<string, { value: number; time: string }>;

const latestByModel = new Map<string, MachineSnapshot>();
const readingListeners = new Set<(reading: LiveSensorReading) => void>();
const stateListeners = new Set<(state: FeedState) => void>();
let feedState: FeedState = { source: "connecting", error: null };

function setFeedState(next: FeedState) {
  if (next.source === feedState.source && next.error === feedState.error) return;
  feedState = next;
  stateListeners.forEach((listener) => listener(next));
}

let lastWeighDispatch = 0;

function publish(reading: LiveSensorReading, fromLive: boolean) {
  const modelId = streamNameToModelId(reading.machineName);
  if (modelId) {
    const snapshot = latestByModel.get(modelId) ?? {};
    snapshot[reading.sensorName] = { value: reading.value, time: reading.time };
    latestByModel.set(modelId, snapshot);
  }
  readingListeners.forEach((listener) => listener(reading));

  // A live reading from the weighing station means a lot just finished; the
  // product modal listens for this to refresh. Never fired by the demo feed.
  if (fromLive && modelId === "weightning") {
    const now = Date.now();
    if (now - lastWeighDispatch > 10_000) {
      lastWeighDispatch = now;
      try {
        window.dispatchEvent(
          new CustomEvent("__simulationDisabled", { detail: { time: new Date().toISOString() } })
        );
      } catch {
        /* ignore */
      }
    }
  }
}

export function getMachineSnapshot(modelId: string): MachineSnapshot | null {
  return latestByModel.get(modelId) ?? null;
}

// ---------------------------------------------------------------------------
// Demo feed — mean-reverting random walk seeded from modal-data.json
// ---------------------------------------------------------------------------

type MockChannel = {
  modelId: string;
  sensor: string;
  base: number;
  value: number;
  amplitude: number;
  integer: boolean;
  phase: number;
};

const MOCK_TICK_MS = 1500;
let mockChannels: MockChannel[] | null = null;
let mockTimer: number | null = null;
let mockCursor = 0;

async function buildMockChannels(): Promise<MockChannel[]> {
  let machines: Awaited<ReturnType<typeof loadMachines>> = [];
  try {
    machines = await loadMachines();
  } catch {
    machines = [];
  }
  const channels: MockChannel[] = [];
  for (const machine of machines) {
    if (!MODEL_TO_STREAM_NAME[machine.id]) continue;
    for (const [sensor, raw] of Object.entries(machine.indicators ?? {})) {
      const base = parseIndicatorNumber(raw);
      if (base === null) continue;
      const integer = sensor === "numberOfBillet";
      channels.push({
        modelId: machine.id,
        sensor,
        base,
        value: base,
        amplitude: integer ? Math.max(1, Math.round(base * 0.25)) : Math.max(0.6, base * 0.02),
        integer,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }
  return channels;
}

function stepChannel(channel: MockChannel, t: number) {
  if (channel.integer) {
    if (Math.random() < 0.35) {
      const delta = Math.random() < 0.5 ? -1 : 1;
      const floor = Math.max(1, channel.base - channel.amplitude);
      channel.value = Math.max(floor, Math.min(channel.base + channel.amplitude, channel.value + delta));
    }
    return channel.value;
  }
  const wave = Math.sin(t / 9000 + channel.phase) * channel.amplitude;
  const noise = (Math.random() - 0.5) * channel.amplitude * 0.5;
  const target = channel.base + wave + noise;
  channel.value += (target - channel.value) * 0.6;
  return Math.round(channel.value * 10) / 10;
}

function emitMockBatch(count: number) {
  if (!mockChannels || mockChannels.length === 0) return;
  const now = Date.now();
  const time = new Date(now).toISOString();
  const modelIds = Array.from(new Set(mockChannels.map((c) => c.modelId)));
  for (let i = 0; i < count; i++) {
    // Furnace (2) is on camera in the demo script, so it updates every tick.
    const modelId = i === 0 ? "furnace2" : modelIds[mockCursor++ % modelIds.length];
    for (const channel of mockChannels.filter((c) => c.modelId === modelId)) {
      const value = stepChannel(channel, now);
      const machineName = modelIdToStreamName(channel.modelId);
      publish(
        { id: `${machineName}::${channel.sensor}`, time, machineName, sensorName: channel.sensor, value },
        false
      );
    }
  }
}

async function startMock() {
  if (mockTimer !== null) return;
  if (!mockChannels) mockChannels = await buildMockChannels();
  if (mockTimer !== null || activeConsumers === 0) return;
  emitMockBatch(4);
  mockTimer = window.setInterval(() => emitMockBatch(2), MOCK_TICK_MS);
}

function stopMock() {
  if (mockTimer !== null) {
    window.clearInterval(mockTimer);
    mockTimer = null;
  }
}

// ---------------------------------------------------------------------------
// Live feed — SSE with a watchdog that falls back to the demo feed
// ---------------------------------------------------------------------------

const LIVE_FIRST_DATA_MS = 5000;
let source: EventSource | null = null;
let watchdog: number | null = null;
let activeConsumers = 0;
let generation = 0;

function clearWatchdog() {
  if (watchdog !== null) {
    window.clearTimeout(watchdog);
    watchdog = null;
  }
}

function closeLive() {
  clearWatchdog();
  if (source) {
    source.close();
    source = null;
  }
}

function fallBack(reason: string) {
  if (canUseMockFallback) {
    setFeedState({ source: "mock", error: null });
    void startMock();
  } else {
    setFeedState({ source: "offline", error: reason });
  }
}

function openLive(gen: number) {
  const url = apiUrl("/api/influx/stream");
  try {
    source = new EventSource(url);
  } catch {
    fallBack("Could not open the sensor stream.");
    return;
  }
  let receivedLive = false;
  watchdog = window.setTimeout(
    () => {
      if (gen !== generation || receivedLive) return;
      fallBack("No sensor data received from the backend.");
    },
    canUseMockFallback ? LIVE_FIRST_DATA_MS : LOADING_TIMEOUT_MS
  );

  source.addEventListener("reading", (event) => {
    if (gen !== generation) return;
    try {
      const payload = JSON.parse((event as MessageEvent).data) as {
        time?: string;
        machineName?: string;
        sensorName?: string;
        value?: number | string;
      };
      const value =
        typeof payload.value === "number" ? payload.value : Number.parseFloat(String(payload.value ?? ""));
      if (!Number.isFinite(value)) return;
      const machineName = String(payload.machineName ?? "").trim() || "-";
      const sensorName = String(payload.sensorName ?? "").trim() || "Sensor";
      if (!receivedLive) {
        receivedLive = true;
        clearWatchdog();
        stopMock();
        setFeedState({ source: "live", error: null });
      }
      publish(
        {
          id: `${machineName}::${sensorName}`,
          machineName,
          sensorName,
          value,
          time: typeof payload.time === "string" && payload.time ? payload.time : new Date().toISOString(),
        },
        true
      );
    } catch (err) {
      console.error("Failed to parse sensor event", err);
    }
  });

  source.onerror = () => {
    if (gen !== generation) return;
    // EventSource retries on its own; keep the demo feed running meanwhile.
    if (feedState.source === "live") {
      receivedLive = false;
      fallBack("Sensor stream disconnected.");
    }
  };
}

async function connect() {
  const gen = ++generation;
  closeLive();
  stopMock();
  setFeedState({ source: "connecting", error: null });

  if (DATA_MODE === "mock") {
    fallBack("");
    return;
  }
  const status = await checkBackend();
  if (gen !== generation || activeConsumers === 0) return;
  if (status === "online") {
    openLive(gen);
  } else {
    fallBack("Backend offline — sensor stream unavailable.");
  }
}

function acquireFeed() {
  activeConsumers += 1;
  if (activeConsumers === 1) void connect();
}

function releaseFeed() {
  activeConsumers = Math.max(0, activeConsumers - 1);
  if (activeConsumers === 0) {
    generation += 1;
    closeLive();
    stopMock();
    setFeedState({ source: "connecting", error: null });
  }
}

/** Reconnect from scratch (re-probes the backend). Used by Retry buttons. */
export function retryFeed() {
  void checkBackend(true).then(() => {
    if (activeConsumers > 0) void connect();
  });
}

// ---------------------------------------------------------------------------
// React hooks
// ---------------------------------------------------------------------------

export function useFeedState(): FeedState {
  const [state, setState] = useState<FeedState>(feedState);
  useEffect(() => {
    setState(feedState);
    stateListeners.add(setState);
    return () => {
      stateListeners.delete(setState);
    };
  }, []);
  return state;
}

/** Subscribe to the shared feed; keeps the latest reading per machine::sensor. */
export function useSensorReadings(limit = 32, enabled = true): LiveSensorReading[] {
  const [readings, setReadings] = useState<LiveSensorReading[]>([]);
  useEffect(() => {
    if (!enabled) return;
    const onReading = (entry: LiveSensorReading) => {
      setReadings((current) => {
        const next = [entry, ...current.filter((item) => item.id !== entry.id)];
        if (next.length > limit) next.length = limit;
        return next;
      });
    };
    readingListeners.add(onReading);
    acquireFeed();
    return () => {
      readingListeners.delete(onReading);
      releaseFeed();
    };
  }, [enabled, limit]);
  return readings;
}

/** Latest values for one machine, re-rendering whenever a new reading lands. */
export function useMachineSnapshot(modelId: string | null): MachineSnapshot | null {
  const [snapshot, setSnapshot] = useState<MachineSnapshot | null>(() =>
    modelId ? getMachineSnapshot(modelId) : null
  );
  useEffect(() => {
    if (!modelId) return;
    setSnapshot(getMachineSnapshot(modelId));
    const onReading = (entry: LiveSensorReading) => {
      if (streamNameToModelId(entry.machineName) !== modelId) return;
      const current = getMachineSnapshot(modelId);
      setSnapshot(current ? { ...current } : null);
    };
    readingListeners.add(onReading);
    acquireFeed();
    return () => {
      readingListeners.delete(onReading);
      releaseFeed();
    };
  }, [modelId]);
  return snapshot;
}
