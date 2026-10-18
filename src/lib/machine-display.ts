import type { MachineDetails } from "@/lib/machines";

// Shared presentation rules for machines: operating status, health-score
// tones and human-readable indicator labels. Used by the 3D view, the
// machines panel, hover tooltips and the machine detail modal so they agree.

export type MachineStatus =
  | "Running"
  | "Idle"
  | "Trouble"
  | "Maintenance"
  | "Shutdown";

export const MACHINE_STATUSES: MachineStatus[] = [
  "Running",
  "Idle",
  "Trouble",
  "Maintenance",
  "Shutdown",
];

export const STATUS_COLORS: Record<MachineStatus, string> = {
  Running: "#81c995",
  Idle: "#8ab4f8",
  Trouble: "#f28b82",
  Maintenance: "#fdd663",
  Shutdown: "#9aa0a6",
};

export function getMachineStatus(machine: MachineDetails | null | undefined): MachineStatus {
  if (!machine) return "Idle";
  const explicit = machine.status;
  if (explicit && (MACHINE_STATUSES as string[]).includes(explicit)) {
    return explicit as MachineStatus;
  }
  if (machine.healthScore < 60 || (machine.alarms?.active ?? 0) > 1) return "Trouble";
  if (machine.healthScore < 80) return "Maintenance";
  return "Running";
}

export type HealthTone = "good" | "warn" | "bad";

/** red < 60, amber 60–79, green ≥ 80 */
export function healthTone(score: number): HealthTone {
  if (score >= 80) return "good";
  if (score >= 60) return "warn";
  return "bad";
}

export const HEALTH_TEXT: Record<HealthTone, string> = {
  good: "text-[#81c995]",
  warn: "text-[#fdd663]",
  bad: "text-[#f28b82]",
};

export const HEALTH_CHIP: Record<HealthTone, string> = {
  good: "bg-[#81c995] text-[#0e3b21]",
  warn: "bg-[#fdd663] text-[#3c2e00]",
  bad: "bg-[#f28b82] text-[#601410]",
};

export const HEALTH_BORDER: Record<HealthTone, string> = {
  good: "border-[rgba(129,201,149,0.35)]",
  warn: "border-[rgba(253,214,99,0.35)]",
  bad: "border-[rgba(242,139,130,0.35)]",
};

type IndicatorMeta = { label: string; unit: string; digits: number };

const INDICATOR_META: Record<string, IndicatorMeta> = {
  airTemperature: { label: "Air temperature", unit: "°C", digits: 1 },
  billetTemperature: { label: "Billet temperature", unit: "°C", digits: 0 },
  numberOfBillet: { label: "Billets in process", unit: "pcs", digits: 0 },
  temperature: { label: "Temperature", unit: "°C", digits: 1 },
  argon_pressure: { label: "Argon pressure", unit: "bar", digits: 1 },
  argonPressure: { label: "Argon pressure", unit: "bar", digits: 1 },
  water_pump: { label: "Water pump", unit: "%", digits: 0 },
  waterPump: { label: "Water pump", unit: "%", digits: 0 },
  vibration: { label: "Vibration", unit: "mm/s", digits: 2 },
  energy: { label: "Energy", unit: "kWh", digits: 1 },
};

/** "billetTemperature" → "Billet temperature"; unknown keys are de-camelCased. */
export function indicatorLabel(key: string): string {
  const meta = INDICATOR_META[key];
  if (meta) return meta.label;
  const spaced = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function indicatorUnit(key: string): string {
  return INDICATOR_META[key]?.unit ?? "";
}

/** Parse "51.3 Celsius" / "78%" / 12 into a number, or null for "-". */
export function parseIndicatorNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const match = value.replace(",", ".").match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const parsed = Number.parseFloat(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Format an indicator value with its unit: (airTemperature, "51.3 Celsius") → "51.3 °C". */
export function formatIndicator(key: string, value: unknown): string {
  const numeric = parseIndicatorNumber(value);
  if (numeric === null) {
    return typeof value === "string" && value.trim() ? value : "-";
  }
  const meta = INDICATOR_META[key];
  const digits = meta?.digits ?? (Math.abs(numeric) >= 100 ? 0 : 1);
  const unit = meta?.unit ?? "";
  const text = numeric.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return unit ? `${text} ${unit}` : text;
}

/**
 * Plant-level OEE (Availability × Performance × Quality) derived from the
 * machine roster. Demo approximation until the backend serves real OEE.
 */
export function computePlantOee(machines: MachineDetails[]) {
  const scored = machines.filter((m) => m.id !== "arrow");
  if (scored.length === 0) return null;
  const running = scored.filter((m) => {
    const status = getMachineStatus(m);
    return status !== "Shutdown" && status !== "Trouble";
  }).length;
  const availability = running / scored.length;
  const avgHealth =
    scored.reduce((sum, m) => sum + (m.healthScore || 0), 0) / scored.length / 100;
  const performance = Math.min(1, 0.55 + avgHealth * 0.45);
  const quality = 0.965;
  const oee = availability * performance * quality;
  return {
    oee: Math.round(oee * 100),
    availability: Math.round(availability * 100),
    performance: Math.round(performance * 100),
    quality: Math.round(quality * 100),
  };
}
