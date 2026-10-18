// Simulation report model. Turns the configurator inputs (temperature,
// casting speed, argon pressure, water pump, …) into a "before vs after"
// comparison against the plant's current baseline, replacing the fixed
// numbers in /simulation-results.json.
//
// The response curves are a simple process model tuned to the 6xxx-series
// billet line in the demo; swap `simulate()` for the backend's model when
// one exists.

export type ReportParameters = {
  temperature: number; // °C, melt/furnace setpoint
  castingSpeed: number; // m/min
  argonPressure: number; // bar
  waterPump: number; // % duty
};

export type ComparisonRow = {
  key: string;
  label: string;
  unit: string;
  before: number;
  after: number;
  /** Which direction counts as an improvement. */
  better: "lower" | "higher";
  digits: number;
};

export type SimulationReport = {
  lot: string;
  productName: string | null;
  machines: number;
  parameters: ReportParameters;
  goodProduct: number;
  defectProduct: number;
  operationHour: number;
  averages: Record<string, number>;
  comparison: ComparisonRow[];
  conclusion: string;
};

/** Current plant practice (last 30 days) — the "before" column. */
export const BASELINE_PARAMETERS: ReportParameters = {
  temperature: 742,
  castingSpeed: 15.5,
  argonPressure: 2.2,
  waterPump: 74,
};

const OPTIMUM: ReportParameters = {
  temperature: 728,
  castingSpeed: 14,
  argonPressure: 2.5,
  waterPump: 80,
};

const PLANNED_BILLETS = 48;
const CO2_PER_KWH = 0.78; // kg CO₂e per kWh (Java-Bali grid factor)

function parseNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return fallback;
  const match = value.replace(",", ".").match(/-?\d+(\.\d+)?/);
  const parsed = match ? Number.parseFloat(match[0]) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseReportParameters(
  raw: Partial<Record<keyof ReportParameters, string | undefined>> | undefined
): ReportParameters {
  return {
    temperature: parseNumber(raw?.temperature, OPTIMUM.temperature),
    castingSpeed: parseNumber(raw?.castingSpeed, OPTIMUM.castingSpeed),
    argonPressure: parseNumber(raw?.argonPressure, OPTIMUM.argonPressure),
    waterPump: parseNumber(raw?.waterPump, OPTIMUM.waterPump),
  };
}

type Outcome = {
  yieldPct: number;
  energyPerBillet: number; // kWh
  cycleMinutes: number;
};

function simulate(p: ReportParameters): Outcome {
  const tempOff = p.temperature - OPTIMUM.temperature;
  const speedOff = p.castingSpeed - OPTIMUM.castingSpeed;
  const argonOff = Math.abs(p.argonPressure - OPTIMUM.argonPressure);
  const pumpOff = p.waterPump - OPTIMUM.waterPump;

  let defectPct = 3.2;
  defectPct += Math.abs(tempOff) * 0.12; // over/under-heated melt
  defectPct += Math.max(0, speedOff) * 1.6; // porosity & cracks when too fast
  defectPct += argonOff * 12; // degassing efficiency
  defectPct += Math.max(0, -pumpOff) * 0.18; // insufficient cooling
  defectPct = Math.min(35, Math.max(1.2, defectPct));

  let energy = 8.6;
  energy *= 1 + Math.max(0, tempOff) * 0.0045; // superheat costs energy
  energy *= 1 + Math.max(0, pumpOff) * 0.004; // pump energy
  energy *= 1 - Math.min(0, tempOff) * 0.001;

  let cycle = 118;
  cycle *= 1 + Math.max(0, -speedOff) * 0.05; // slower casting
  cycle *= 1 - Math.max(0, speedOff) * 0.03;
  cycle *= 1 + Math.max(0, -pumpOff) * 0.006; // longer cooling

  return { yieldPct: 100 - defectPct, energyPerBillet: energy, cycleMinutes: cycle };
}

const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;

export function computeSimulationReport(input: {
  lot?: string | null;
  productName?: string | null;
  machines: number;
  parameters?: Partial<Record<keyof ReportParameters, string | undefined>>;
}): SimulationReport {
  const parameters = parseReportParameters(input.parameters);
  const before = simulate(BASELINE_PARAMETERS);
  const after = simulate(parameters);

  const goodBefore = Math.round((PLANNED_BILLETS * before.yieldPct) / 100);
  const goodAfter = Math.round((PLANNED_BILLETS * after.yieldPct) / 100);
  const energyBefore = before.energyPerBillet * PLANNED_BILLETS;
  const energyAfter = after.energyPerBillet * PLANNED_BILLETS;

  const comparison: ComparisonRow[] = [
    { key: "yield", label: "Yield", unit: "%", before: round(before.yieldPct, 1), after: round(after.yieldPct, 1), better: "higher", digits: 1 },
    { key: "good", label: "Good billets", unit: "pcs", before: goodBefore, after: goodAfter, better: "higher", digits: 0 },
    { key: "defects", label: "Defects", unit: "pcs", before: PLANNED_BILLETS - goodBefore, after: PLANNED_BILLETS - goodAfter, better: "lower", digits: 0 },
    { key: "energy", label: "Energy", unit: "kWh", before: round(energyBefore, 0), after: round(energyAfter, 0), better: "lower", digits: 0 },
    { key: "energyPerBillet", label: "Energy per good billet", unit: "kWh", before: round(energyBefore / Math.max(1, goodBefore), 2), after: round(energyAfter / Math.max(1, goodAfter), 2), better: "lower", digits: 2 },
    { key: "co2", label: "CO₂e", unit: "kg", before: round(energyBefore * CO2_PER_KWH, 0), after: round(energyAfter * CO2_PER_KWH, 0), better: "lower", digits: 0 },
    { key: "cycle", label: "Cycle time", unit: "min", before: round(before.cycleMinutes, 0), after: round(after.cycleMinutes, 0), better: "lower", digits: 0 },
  ];

  const delta = (key: string) => {
    const row = comparison.find((r) => r.key === key)!;
    return row.before === 0 ? 0 : ((row.after - row.before) / row.before) * 100;
  };
  const energyDelta = delta("energyPerBillet");
  const yieldDelta = comparison[0].after - comparison[0].before;
  const improved = energyDelta < 0 && yieldDelta >= 0;

  const advice: string[] = [];
  if (parameters.castingSpeed > OPTIMUM.castingSpeed + 0.5) {
    advice.push(`lower casting speed toward ${OPTIMUM.castingSpeed} m/min to cut porosity`);
  }
  if (Math.abs(parameters.temperature - OPTIMUM.temperature) > 8) {
    advice.push(`bring the melt temperature closer to ${OPTIMUM.temperature} °C`);
  }
  if (Math.abs(parameters.argonPressure - OPTIMUM.argonPressure) > 0.15) {
    advice.push(`keep argon at ${OPTIMUM.argonPressure} bar for effective degassing`);
  }
  if (parameters.waterPump < OPTIMUM.waterPump - 3) {
    advice.push(`raise the water pump to ~${OPTIMUM.waterPump}% to shorten cooling`);
  }

  const fmt = (value: number) => `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
  const conclusion = [
    `Simulated ${PLANNED_BILLETS} billets across ${input.machines} machines at ${parameters.temperature} °C, ${parameters.castingSpeed} m/min casting speed, ${parameters.argonPressure} bar argon and ${parameters.waterPump}% water pump.`,
    `Compared with current practice, yield changes by ${yieldDelta >= 0 ? "+" : ""}${yieldDelta.toFixed(1)} pts and energy per good billet by ${fmt(energyDelta)}.`,
    improved
      ? "These settings are better than the current baseline on both quality and energy."
      : "These settings do not beat the current baseline on both quality and energy.",
    advice.length ? `Next step: ${advice.join("; ")}.` : "Parameters are at the modelled optimum.",
  ].join(" ");

  return {
    lot: input.lot?.trim() || "SIM-001",
    productName: input.productName ?? null,
    machines: input.machines,
    parameters,
    goodProduct: goodAfter,
    defectProduct: PLANNED_BILLETS - goodAfter,
    operationHour: round(after.cycleMinutes / 60, 2),
    averages: {
      temperature: parameters.temperature,
      argon_pressure: parameters.argonPressure,
      water_pump: parameters.waterPump,
      energy_usage: round(energyAfter, 1),
    },
    comparison,
    conclusion,
  };
}
