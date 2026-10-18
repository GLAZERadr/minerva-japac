export type MachineIndicators = Record<string, string>;

export type MachineAlarms = {
  active: number;
  total: number;
  list: string[];
};

export type PredictiveMaintenanceEntry = {
  part: string;
  predictive: string;
  last: string;
  health: number;
  thumbnail?: string;
};

export type PrescriptiveMaintenanceEntry = {
  whatHappened: string;
  why: string;
  recommendedAction: string;
};

export type MachineDetails = {
  id: string;
  previewImage: string;
  title: string;
  machineId: string;
  PLC: string;
  nodeRed: string;
  dateAdded: string;
  location: string;
  indicators: MachineIndicators;
  alarms: MachineAlarms;
  predictiveMaintenance: PredictiveMaintenanceEntry[];
  healthScore: number;
  /** Running | Idle | Trouble | Maintenance | Shutdown (derived when absent). */
  status?: string;
  prescriptiveMaintenance?: PrescriptiveMaintenanceEntry;
};

type MachinesPayload = {
  machines?: MachineDetails[];
};

let machinesCache: MachineDetails[] | null = null;
let loadingPromise: Promise<MachineDetails[]> | null = null;

export async function loadMachines(force = false): Promise<MachineDetails[]> {
  if (!force && machinesCache) {
    return machinesCache;
  }
  if (!force && loadingPromise) {
    return loadingPromise;
  }

  const request = fetch("/3d-model/modal-data.json", {
    cache: "no-store",
    headers: {
      "cache-control": "no-store",
    },
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(response.statusText);
      }
      return response.json() as Promise<MachinesPayload>;
    })
    .then((json) => {
      const list = Array.isArray(json?.machines) ? json.machines : [];
      const normalized = list.map((item) => {
        const predictive = Array.isArray(item.predictiveMaintenance)
          ? item.predictiveMaintenance
          : [];
        const health =
          typeof item.healthScore === "number" ? item.healthScore : 0;
        const prescriptive =
          item &&
          typeof item === "object" &&
          item.prescriptiveMaintenance &&
          typeof item.prescriptiveMaintenance === "object"
            ? item.prescriptiveMaintenance
            : {
                whatHappened: "-",
                why: "-",
                recommendedAction: "-",
              };
        return {
          ...item,
          predictiveMaintenance: predictive,
          healthScore: health,
          prescriptiveMaintenance: prescriptive,
        } satisfies MachineDetails;
      });

      machinesCache = normalized;
      return normalized;
    })
    .finally(() => {
      loadingPromise = null;
    });

  if (!force) {
    loadingPromise = request;
  }

  return request;
}

export async function loadMachineById(
  id: string
): Promise<MachineDetails | null> {
  try {
    const machines = await loadMachines();
    return machines.find((item) => item.id === id) ?? null;
  } catch (error) {
    console.error("Failed to load machine metadata", error);
    return null;
  }
}

export function invalidateMachineCache() {
  machinesCache = null;
}
