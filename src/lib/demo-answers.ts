"use client";

import { loadMachines, type MachineDetails } from "@/lib/machines";
import { listProducts } from "@/lib/products";
import { getMachineSnapshot } from "@/lib/sensor-feed";
import {
  computePlantOee,
  formatIndicator,
  getMachineStatus,
  indicatorLabel,
} from "@/lib/machine-display";

// Last-resort Ask AI answerer used when neither the backend chatbot nor the
// Gemma API is reachable. It answers from the same data the dashboard shows
// (machine roster, live/demo sensor values, product lots), so demo questions
// get a correct, instant answer even fully offline.

export const SUGGESTED_QUESTIONS = [
  "Which machines need attention right now?",
  "What is the current temperature of Furnace (2)?",
  "Summarize today's yield and energy use.",
];

const has = (text: string, ...words: string[]) => words.some((w) => text.includes(w));

function liveIndicators(machine: MachineDetails): string[] {
  const snapshot = getMachineSnapshot(machine.id);
  return Object.entries(machine.indicators ?? {})
    .map(([key, fallback]) => {
      const value = snapshot?.[key]?.value ?? fallback;
      const formatted = formatIndicator(key, value);
      return formatted === "-" ? null : `${indicatorLabel(key)}: **${formatted}**`;
    })
    .filter((line): line is string => Boolean(line));
}

function describeMachine(machine: MachineDetails): string {
  const lines = [
    `### ${machine.title}`,
    `- Status: **${getMachineStatus(machine)}** · Health score **${machine.healthScore}%**`,
    ...liveIndicators(machine).map((line) => `- ${line}`),
    `- Active alarms: ${machine.alarms?.active ?? 0} of ${machine.alarms?.total ?? 0}`,
  ];
  const action = machine.prescriptiveMaintenance?.recommendedAction;
  if (action && action !== "-") lines.push(`- Recommended action: ${action}`);
  return lines.join("\n");
}

function findMachine(question: string, machines: MachineDetails[]): MachineDetails | null {
  const q = question.toLowerCase();
  if (/furnace\s*\(?\s*(2|b|two)\)?/.test(q)) return machines.find((m) => m.id === "furnace2") ?? null;
  const ctMatch = q.match(/(?:ct|cooling table)\s*(?:segment\s*)?-?\s*(\d)/);
  if (ctMatch) return machines.find((m) => m.id === `ct-${ctMatch[1]}`) ?? null;
  return (
    [...machines]
      .sort((a, b) => b.title.length - a.title.length)
      .find((m) => q.includes(m.title.toLowerCase()) || q.includes(m.id.replace(/-/g, " "))) ?? null
  );
}

async function attentionAnswer(machines: MachineDetails[]): Promise<string> {
  const flagged = machines
    .filter((m) => m.id !== "arrow")
    .filter((m) => {
      const status = getMachineStatus(m);
      return status === "Trouble" || status === "Maintenance" || m.healthScore < 70;
    })
    .sort((a, b) => a.healthScore - b.healthScore)
    .slice(0, 4);
  if (flagged.length === 0) return "All machines are healthy — no machine is below 70% health or in Trouble.";
  const rows = flagged.map(
    (m) =>
      `- **${m.title}** — ${getMachineStatus(m)}, health ${m.healthScore}%, ${m.alarms?.active ?? 0} active alarm(s). ${
        m.prescriptiveMaintenance?.recommendedAction && m.prescriptiveMaintenance.recommendedAction !== "-"
          ? m.prescriptiveMaintenance.recommendedAction
          : ""
      }`
  );
  return [
    `**${flagged.length} machines need attention**, lowest health first:`,
    "",
    ...rows,
    "",
    `Start with **${flagged[0].title}**: it has the lowest health score on the line.`,
  ].join("\n");
}

async function productionAnswer(machines: MachineDetails[]): Promise<string> {
  const { data: lots } = await listProducts();
  const completed = lots.filter((lot) => (lot.status ?? "").toLowerCase() === "completed");
  const good = completed.reduce((sum, lot) => sum + (lot.goodProduct ?? 0), 0);
  const defect = completed.reduce((sum, lot) => sum + (lot.defectProduct ?? 0), 0);
  const energy = completed.reduce((sum, lot) => {
    const value = Number(lot.averages?.energy_usage);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
  const yieldPct = good + defect > 0 ? ((good / (good + defect)) * 100).toFixed(1) : "-";
  const perBillet = good > 0 ? (energy / good).toFixed(1) : "-";
  const oee = computePlantOee(machines);
  return [
    `**Production summary** (${completed.length} completed lots, ${lots.length - completed.length} in progress)`,
    "",
    `- Good billets: **${good}** · Defects: **${defect}** · Yield **${yieldPct}%**`,
    `- Energy: **${energy.toFixed(0)} kWh** total, **${perBillet} kWh per good billet**`,
    oee
      ? `- Plant OEE: **${oee.oee}%** (availability ${oee.availability}%, performance ${oee.performance}%, quality ${oee.quality}%)`
      : null,
    "",
    "Biggest lever: casting-speed spikes caused most defects; capping speed at 14 m/min should lift yield about 1–2 points.",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

function alarmsAnswer(machines: MachineDetails[]): string {
  const withAlarms = machines.filter((m) => (m.alarms?.active ?? 0) > 0).sort((a, b) => b.alarms.active - a.alarms.active);
  if (withAlarms.length === 0) return "There are no active alarms on the line.";
  const total = withAlarms.reduce((sum, m) => sum + m.alarms.active, 0);
  return [
    `**${total} active alarms** across ${withAlarms.length} machines:`,
    "",
    ...withAlarms.map((m) => `- **${m.title}**: ${m.alarms.active} active — ${m.alarms.list.slice(0, m.alarms.active).join(", ") || "see machine detail"}`),
  ].join("\n");
}

function overviewAnswer(machines: MachineDetails[]): string {
  const counts = machines.reduce<Record<string, number>>((acc, m) => {
    const status = getMachineStatus(m);
    acc[status] = (acc[status] ?? 0) + 1;
    return acc;
  }, {});
  const oee = computePlantOee(machines);
  const avg = Math.round(machines.reduce((sum, m) => sum + m.healthScore, 0) / Math.max(1, machines.length));
  return [
    "**Plant overview — MINERVA Smelter**",
    "",
    `- ${machines.length} machines: ${Object.entries(counts)
      .map(([status, n]) => `${n} ${status}`)
      .join(", ")}`,
    `- Average health score: **${avg}%**`,
    oee ? `- OEE: **${oee.oee}%**` : null,
    "",
    "Ask me about a specific machine (e.g. *Casting Machine*), alarms, maintenance or production yield.",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

export async function answerFromDemoData(question: string): Promise<string> {
  const q = question.toLowerCase();
  let machines: MachineDetails[] = [];
  try {
    machines = await loadMachines();
  } catch {
    machines = [];
  }
  if (machines.length === 0) return "Machine data is not available right now. Please try again.";

  if (has(q, "attention", "worst", "lowest", "critical", "risk", "problem", "trouble", "perhatian")) {
    return attentionAnswer(machines);
  }
  if (has(q, "yield", "production", "produksi", "energy", "energi", "lot", "defect", "oee", "efficien")) {
    return productionAnswer(machines);
  }
  if (has(q, "alarm")) return alarmsAnswer(machines);

  const machine = findMachine(question, machines);
  if (machine) return describeMachine(machine);
  if (has(q, "health", "maintenance", "kesehatan", "status")) return attentionAnswer(machines);
  return overviewAnswer(machines);
}
