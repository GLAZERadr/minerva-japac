"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import SimulationResultModal from "./SimulationResultModal";
import {
  simulationSteps,
  type SimulationStep,
  machineRegistry,
  baseMachineRegistry,
  cloneStep,
} from "./simulation-data";
import {
  computeSimulationReport,
  type ComparisonRow,
  type ReportParameters,
} from "@/lib/simulation-report";

export type SimulationVariant = "sequence" | "realtime";

export type FlowMachineStepDefinition = {
  machineId: string;
  name?: string;
  duration?: number;
};

export type ProductFlowDefinition = {
  productId: string;
  productName: string;
  description?: string;
  defaultConfig?: Record<string, unknown>;
  flow: FlowMachineStepDefinition[];
};

export type SimulationConfiguratorFormValues = {
  general: {
    lot?: string;

    derivative?: string;
    diameter?: string;
    moltenState?: string;
    materialMix?: string;
    series?: string;
  };
  parameters: {
    temperature?: string;
    altitude?: string;
    castingSpeed?: string;
    argonPressure?: string;
    waterPump?: string;
  };
};

type SimulationContextValue = {
  isSimulationMode: boolean;
  simulationVariant: SimulationVariant;
  setSimulationVariant: (variant: SimulationVariant) => void;
  startSimulation: () => void;
  stopSimulation: (preserveRealtimeResult?: boolean) => void;
  requestSimulationStart: () => void;
  steps: SimulationStep[];
  activeMachineId: string | null;
  activeMachine: SimulationStep | null;
  elapsedSeconds: number;
  stepProgress: number; // 0..1 progress within the current machine
  /** 0..1 progress through the whole sequence run. */
  overallProgress: number;
  totalDuration: number;
  /** Jump to the end of a running sequence and show the report. */
  skipSimulation: () => void;
  productFlows: ProductFlowDefinition[];
  flowsLoading: boolean;
  flowsError: string | null;
  selectedProduct: ProductFlowDefinition | null;
  selectedProductId: string | null;
  lastConfiguration: SimulationConfiguratorFormValues | null;
  openConfigurator: () => void;
  closeConfigurator: () => void;
  isConfiguratorOpen: boolean;
  submitConfiguration: (
    productId: string,
    form: SimulationConfiguratorFormValues
  ) => void;
  realtimeResult: RealtimeResult | null;
  dismissRealtimeResult: () => void;
};

const SimulationContext = createContext<SimulationContextValue | undefined>(
  undefined
);

const TICK_INTERVAL_MS = 250;
const REALTIME_POLL_INTERVAL_MS = 2000;
const REALTIME_ENDPOINT = "/product-data.json";
const ELAPSED_INTERVAL_MS = 500;

type ProductDataStatus = "process" | "finish";

type ProductDataEntry = {
  lot?: string;
  status?: ProductDataStatus;
  activeMachineId?: string | null;
  averages?: Record<string, number | string> | null;
  operationHour?: number | string | null;
  goodProduct?: number | string | null;
  defectProduct?: number | string | null;
  conclusion?: string | null;
  updatedAt?: string | null;
};

export type RealtimeResult = {
  lot: string;
  status: ProductDataStatus;
  averages: Record<string, number | string>;
  operationHour: string | null;
  goodProduct: number | null;
  defectProduct: number | null;
  conclusion: string;
  updatedAt?: string | null;
  /** Before (current practice) vs after (simulated settings). */
  comparison?: ComparisonRow[];
  parameters?: ReportParameters;
  productName?: string | null;
};

export function SimulationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isSimulationMode, setSimulationMode] = useState(false);
  const [simulationVariant, setSimulationVariantState] =
    useState<SimulationVariant>("sequence");
  const [currentSteps, setCurrentSteps] =
    useState<SimulationStep[]>(simulationSteps);
  const [activeMachineId, setActiveMachineId] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [stepProgress, setStepProgress] = useState(0);

  const [productFlows, setProductFlows] = useState<ProductFlowDefinition[]>([]);
  const [flowsLoading, setFlowsLoading] = useState<boolean>(true);
  const [flowsError, setFlowsError] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    null
  );
  const [selectedProduct, setSelectedProduct] =
    useState<ProductFlowDefinition | null>(null);
  const [lastConfiguration, setLastConfiguration] =
    useState<SimulationConfiguratorFormValues | null>(null);
  const [isConfiguratorOpen, setConfiguratorOpen] = useState(false);
  const [realtimeResult, setRealtimeResult] = useState<RealtimeResult | null>(
    null
  );
  const [suppressSimulationResultModal, setSuppressSimulationResultModal] =
    useState(false);

  const startTimeRef = useRef<number | null>(null);
  const sequenceIntervalRef = useRef<number | null>(null);
  const realtimeIntervalRef = useRef<number | null>(null);
  const elapsedIntervalRef = useRef<number | null>(null);
  const hasInitialisedFlowsRef = useRef(false);
  const lastConfigurationRef = useRef<SimulationConfiguratorFormValues | null>(null);
  const selectedProductRef = useRef<ProductFlowDefinition | null>(null);
  lastConfigurationRef.current = lastConfiguration;
  selectedProductRef.current = selectedProduct;

  const totalDuration = useMemo(
    () => currentSteps.reduce((acc, item) => acc + item.duration, 0),
    [currentSteps]
  );

  const resolveMachineStep = useCallback(
    (machineId: string): SimulationStep | null => {
      const direct = machineRegistry[machineId];
      if (direct) {
        return cloneStep(direct);
      }
      const baseCandidates = baseMachineRegistry[machineId];
      if (baseCandidates && baseCandidates.length > 0) {
        return cloneStep(baseCandidates[0]);
      }
      return null;
    },
    []
  );

  const deriveStepsFromFlow = useCallback(
    (flowDefinition: ProductFlowDefinition): SimulationStep[] => {
      return flowDefinition.flow
        .map((stepDef) => {
          const base = resolveMachineStep(stepDef.machineId);
          if (!base) {
            console.warn(
              `Simulation flow references unknown machine id: ${stepDef.machineId}`
            );
            return null;
          }
          return cloneStep(base, {
            name: stepDef.name ?? base.name,
            duration: stepDef.duration ?? base.duration,
          });
        })
        .filter((step): step is SimulationStep => Boolean(step));
    },
    [resolveMachineStep]
  );

  useEffect(() => {
    let active = true;
    const loadFlows = async () => {
      setFlowsLoading(true);
      setFlowsError(null);
      try {
        const response = await fetch("/simulation-flows.json", {
          cache: "no-store",
          headers: { "cache-control": "no-store" },
        });
        if (!response.ok) {
          throw new Error(response.statusText);
        }
        const json = (await response.json()) as ProductFlowDefinition[];
        if (!active) return;
        const normalized = Array.isArray(json) ? json : [];
        setProductFlows(normalized);

        if (!hasInitialisedFlowsRef.current && normalized.length > 0) {
          const first = normalized[0];
          hasInitialisedFlowsRef.current = true;
          setSelectedProductId(first.productId);
          setSelectedProduct(first);
          const derived = deriveStepsFromFlow(first);
          if (derived.length > 0) {
            setCurrentSteps(derived);
          }
        }
      } catch (error) {
        if (!active) return;
        console.error("Failed to load simulation flows", error);
        setFlowsError("Could not load the simulation flow configuration.");
        setProductFlows([]);
      } finally {
        if (active) {
          setFlowsLoading(false);
        }
      }
    };

    loadFlows();
    return () => {
      active = false;
    };
  }, [deriveStepsFromFlow]);

  const computeState = useCallback(
    (elapsed: number) => {
      if (totalDuration <= 0 || currentSteps.length === 0) {
        setActiveMachineId(null);
        setStepProgress(0);
        setElapsedSeconds(0);
        return;
      }
      const cycle = elapsed % totalDuration;
      let accumulated = 0;
      let currentStep = currentSteps[0];
      for (const step of currentSteps) {
        accumulated += step.duration;
        currentStep = step;
        if (cycle < accumulated) {
          const prevAccumulated = accumulated - step.duration;
          const progress = (cycle - prevAccumulated) / step.duration;
          setActiveMachineId(step.id);
          setStepProgress(progress);
          setElapsedSeconds(elapsed);
          return;
        }
      }
      setActiveMachineId(currentStep.id);
      setStepProgress(1);
      setElapsedSeconds(elapsed);
    },
    [currentSteps, totalDuration]
  );

  const clearTimers = useCallback(() => {
    if (sequenceIntervalRef.current != null) {
      window.clearInterval(sequenceIntervalRef.current);
      sequenceIntervalRef.current = null;
    }
    if (realtimeIntervalRef.current != null) {
      window.clearInterval(realtimeIntervalRef.current);
      realtimeIntervalRef.current = null;
    }
    if (elapsedIntervalRef.current != null) {
      window.clearInterval(elapsedIntervalRef.current);
      elapsedIntervalRef.current = null;
    }
  }, []);

  const startSimulation = useCallback(() => {
    setRealtimeResult(null);
    startTimeRef.current = performance.now();
    setSimulationMode(true);
  }, []);

  const stopSimulation = useCallback(
    (preserveRealtimeResult = false) => {
      clearTimers();
      setSimulationMode(false);
      startTimeRef.current = null;
      setActiveMachineId(null);
      setStepProgress(0);
      setElapsedSeconds(0);
      setConfiguratorOpen(false);
      if (!preserveRealtimeResult) {
        setRealtimeResult(null);
      }
    },
    [clearTimers]
  );

  const applyProductFlow = useCallback(
    (productId: string, formValues: SimulationConfiguratorFormValues) => {
      const flowDefinition = productFlows.find(
        (item) => item.productId === productId
      );
      if (!flowDefinition) {
        console.warn(
          "Attempted to start simulation for unknown product",
          productId
        );
        return;
      }
      const derivedSteps = deriveStepsFromFlow(flowDefinition);
      if (derivedSteps.length === 0) {
        console.warn(
          "Simulation flow does not contain valid machine references.",
          flowDefinition
        );
        return;
      }
      setCurrentSteps(derivedSteps);
      setSelectedProductId(flowDefinition.productId);
      setSelectedProduct(flowDefinition);
      setLastConfiguration(formValues);
      setConfiguratorOpen(false);
      setActiveMachineId(null);
      setStepProgress(0);
      setElapsedSeconds(0);
      startSimulation();
    },
    [deriveStepsFromFlow, productFlows, startSimulation]
  );

  useEffect(() => {
    let cancelled = false;

    const stopAllTimers = () => {
      clearTimers();
    };

    if (!isSimulationMode) {
      stopAllTimers();
      setActiveMachineId(null);
      setStepProgress(0);
      setElapsedSeconds(0);
      startTimeRef.current = null;
      return () => {
        cancelled = true;
      };
    }

    setActiveMachineId(null);
    setStepProgress(0);
    setElapsedSeconds(0);
    startTimeRef.current = performance.now();

    if (simulationVariant === "sequence") {
      const tick = async () => {
        if (cancelled || startTimeRef.current == null) return;
        const now = performance.now();
        const elapsed = (now - startTimeRef.current) / 1000;

        // If we've reached or passed the total duration, finish the simulation
        if (totalDuration > 0 && elapsed >= totalDuration) {
          // mark final step as active and progress 100%
          const last = currentSteps[currentSteps.length - 1];
          if (last) {
            setActiveMachineId(last.id);
          } else {
            setActiveMachineId(null);
          }
          setStepProgress(1);
          setElapsedSeconds(totalDuration);

          // Report computed from the configured parameters (before vs after).
          const config = lastConfigurationRef.current;
          const report = computeSimulationReport({
            lot: config?.general?.lot,
            productName: selectedProductRef.current?.productName ?? null,
            machines: currentSteps.length,
            parameters: config?.parameters,
          });
          setRealtimeResult({
            lot: report.lot,
            status: "finish",
            averages: report.averages,
            operationHour: String(report.operationHour),
            goodProduct: report.goodProduct,
            defectProduct: report.defectProduct,
            conclusion: report.conclusion,
            updatedAt: new Date().toISOString(),
            comparison: report.comparison,
            parameters: report.parameters,
            productName: report.productName,
          });

          // stop simulation and clear timers
          clearTimers();
          startTimeRef.current = null;
          setSimulationMode(false);
          return;
        }

        computeState(elapsed);
      };

      tick();
      sequenceIntervalRef.current = window.setInterval(tick, TICK_INTERVAL_MS);

      return () => {
        cancelled = true;
        stopAllTimers();
      };
    }

    if (simulationVariant === "realtime") {
      const updateElapsed = () => {
        if (cancelled || startTimeRef.current == null) return;
        const now = performance.now();
        setElapsedSeconds((now - startTimeRef.current) / 1000);
      };

      updateElapsed();
      elapsedIntervalRef.current = window.setInterval(
        updateElapsed,
        ELAPSED_INTERVAL_MS
      );

      const sanitizeLot = (value?: string | null) =>
        typeof value === "string" ? value.trim().toLowerCase() : "";

      const expectedLot = sanitizeLot(lastConfiguration?.general?.lot);

      const parseOperationHour = (
        value: ProductDataEntry["operationHour"]
      ): string | null => {
        if (value == null) return null;
        if (typeof value === "number" && Number.isFinite(value)) {
          const hourLabel = value === 1 ? "hour" : "hours";
          return `${value} ${hourLabel}`;
        }
        if (typeof value === "string" && value.trim().length > 0) {
          return value.trim();
        }
        return null;
      };

      const parseCount = (
        value: ProductDataEntry["goodProduct"]
      ): number | null => {
        if (value == null) return null;
        if (typeof value === "number" && Number.isFinite(value)) {
          return Math.round(value);
        }
        if (typeof value === "string") {
          const parsed = Number.parseInt(value, 10);
          return Number.isFinite(parsed) ? parsed : null;
        }
        return null;
      };

      const ensureAverages = (
        value: ProductDataEntry["averages"]
      ): Record<string, number | string> => {
        if (!value || typeof value !== "object") {
          return {};
        }
        return Object.entries(value).reduce<Record<string, number | string>>(
          (acc, [key, val]) => {
            if (typeof val === "number" && Number.isFinite(val)) {
              acc[key] = val;
            } else if (typeof val === "string") {
              acc[key] = val;
            }
            return acc;
          },
          {}
        );
      };

      const pollRealtime = async () => {
        if (cancelled) return;
        try {
          const response = await fetch(REALTIME_ENDPOINT, {
            cache: "no-store",
            headers: {
              "cache-control": "no-store",
            },
          });
          if (!response.ok) {
            throw new Error(response.statusText);
          }
          const json = await response.json();
          if (cancelled) return;

          const entries: ProductDataEntry[] = Array.isArray(json)
            ? json
            : json
            ? [json as ProductDataEntry]
            : [];

          if (entries.length === 0) {
            setActiveMachineId(null);
            setStepProgress(0);
            return;
          }

          const match =
            expectedLot.length > 0
              ? entries.find((entry) => sanitizeLot(entry?.lot) === expectedLot)
              : undefined;

          const record = match ?? entries[0];
          const status: ProductDataStatus =
            record?.status === "finish" ? "finish" : "process";

          if (status === "finish") {
            const result: RealtimeResult = {
              lot:
                typeof record?.lot === "string" && record.lot.trim().length > 0
                  ? record.lot.trim()
                  : expectedLot.toUpperCase() || "-",
              status,
              averages: ensureAverages(record?.averages ?? null),
              operationHour: parseOperationHour(record?.operationHour ?? null),
              goodProduct: parseCount(record?.goodProduct ?? null),
              defectProduct: parseCount(record?.defectProduct ?? null),
              conclusion:
                typeof record?.conclusion === "string" &&
                record.conclusion.trim().length > 0
                  ? record.conclusion.trim()
                  : "Simulation finished. No conclusion provided.",
              updatedAt:
                typeof record?.updatedAt === "string" ? record.updatedAt : null,
            };

            setRealtimeResult(result);
            clearTimers();
            startTimeRef.current = null;
            setActiveMachineId(null);
            setStepProgress(0);
            setElapsedSeconds(0);
            setSimulationMode(false);
            return;
          }

          const activeId =
            typeof record?.activeMachineId === "string" &&
            record.activeMachineId.trim().length > 0
              ? record.activeMachineId.trim()
              : null;
          setActiveMachineId(activeId);
          setStepProgress(activeId ? 1 : 0);
        } catch (error) {
          if (!cancelled) {
            console.warn("Realtime simulation polling failed", error);
            setActiveMachineId(null);
            setStepProgress(0);
          }
        }
      };

      pollRealtime();
      realtimeIntervalRef.current = window.setInterval(
        pollRealtime,
        REALTIME_POLL_INTERVAL_MS
      );

      return () => {
        cancelled = true;
        stopAllTimers();
      };
    }

    return () => {
      cancelled = true;
      stopAllTimers();
    };
  }, [
    clearTimers,
    computeState,
    isSimulationMode,
    lastConfiguration,
    simulationVariant,
  ]);

  const skipSimulation = useCallback(() => {
    if (!isSimulationMode || simulationVariant !== "sequence") return;
    if (startTimeRef.current == null || totalDuration <= 0) return;
    // Move the start back so the next tick (≤ 250 ms) sees the run as finished.
    startTimeRef.current = performance.now() - totalDuration * 1000;
  }, [isSimulationMode, simulationVariant, totalDuration]);

  const overallProgress =
    isSimulationMode && simulationVariant === "sequence" && totalDuration > 0
      ? Math.min(1, elapsedSeconds / totalDuration)
      : 0;

  const openConfigurator = useCallback(() => {
    setConfiguratorOpen(true);
  }, []);

  const closeConfigurator = useCallback(() => {
    setConfiguratorOpen(false);
  }, []);

  const submitConfiguration = useCallback(
    (productId: string, formValues: SimulationConfiguratorFormValues) => {
      applyProductFlow(productId, formValues);
    },
    [applyProductFlow]
  );

  const handleVariantChange = useCallback((variant: SimulationVariant) => {
    setSimulationVariantState(variant);
  }, []);

  const dismissRealtimeResult = useCallback(() => {
    setRealtimeResult(null);
  }, []);

  const requestSimulationStart = useCallback(() => {
    const effectiveVariant = isSimulationMode ? simulationVariant : "sequence";

    if (!isSimulationMode && simulationVariant === "realtime") {
      setSimulationVariantState("sequence");
    }

    if (effectiveVariant === "sequence") {
      if (flowsLoading) {
        console.warn("Simulation flows are still loading.");
        return;
      }
      if (productFlows.length === 0) {
        console.warn(
          "Simulation flows unavailable. Falling back to default sequence."
        );
        setCurrentSteps(simulationSteps);
        setSelectedProductId(null);
        setSelectedProduct(null);
        setLastConfiguration(null);
        startSimulation();
        return;
      }
      setConfiguratorOpen(true);
      return;
    }
    startSimulation();
  }, [
    isSimulationMode,
    flowsLoading,
    productFlows.length,
    setCurrentSteps,
    setConfiguratorOpen,
    setLastConfiguration,
    setSelectedProduct,
    setSelectedProductId,
    setSimulationVariantState,
    simulationVariant,
    startSimulation,
  ]);

  const activeMachine = useMemo(() => {
    if (!activeMachineId) return null;
    const fromSteps = currentSteps.find((step) => step.id === activeMachineId);
    if (fromSteps) return fromSteps;
    return machineRegistry[activeMachineId] ?? null;
  }, [activeMachineId, currentSteps]);

  const contextValue = useMemo<SimulationContextValue>(
    () => ({
      isSimulationMode,
      simulationVariant,
      setSimulationVariant: handleVariantChange,
      startSimulation,
      stopSimulation,
      requestSimulationStart,
      steps: currentSteps,
      activeMachineId,
      activeMachine,
      elapsedSeconds,
      stepProgress,
      overallProgress,
      totalDuration,
      skipSimulation,
      productFlows,
      flowsLoading,
      flowsError,
      selectedProduct,
      selectedProductId,
      lastConfiguration,
      openConfigurator,
      closeConfigurator,
      isConfiguratorOpen,
      submitConfiguration,
      realtimeResult,
      dismissRealtimeResult,
    }),
    [
      activeMachine,
      activeMachineId,
      closeConfigurator,
      currentSteps,
      elapsedSeconds,
      overallProgress,
      skipSimulation,
      totalDuration,
      dismissRealtimeResult,
      flowsError,
      flowsLoading,
      handleVariantChange,
      isConfiguratorOpen,
      isSimulationMode,
      lastConfiguration,
      openConfigurator,
      productFlows,
      requestSimulationStart,
      realtimeResult,
      selectedProduct,
      selectedProductId,
      simulationVariant,
      startSimulation,
      stepProgress,
      stopSimulation,
      submitConfiguration,
    ]
  );

  // dispatch a window event when simulation transitions from running -> stopped
  const prevIsSimulationRef = useRef<boolean>(isSimulationMode);
  useEffect(() => {
    const prev = prevIsSimulationRef.current;
    if (prev && !isSimulationMode) {
      (() => {
        try {
          window.dispatchEvent(
            new CustomEvent("__simulationDisabled", {
              detail: { time: new Date().toISOString() },
            })
          );
        } catch (err) {
          /* ignore */
        }
      })();
    }
    prevIsSimulationRef.current = isSimulationMode;
  }, [isSimulationMode]);

  // Listen for autonomous start/stop events so we can suppress the default
  // SimulationResultModal while an autonomous flow is active (AutonomousResult
  // modal will be used instead).
  useEffect(() => {
    const timerRef = { current: 0 as number | null };
    const onStart = () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setSuppressSimulationResultModal(true);
    };
    const onStop = () => {
      // keep suppression for a short grace period so the AutonomousResult
      // modal can open without the SimulationResultModal flashing.
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        setSuppressSimulationResultModal(false);
        timerRef.current = null;
      }, 3000);
    };

    try {
      window.addEventListener("__autonomousStarted", onStart as EventListener);
      window.addEventListener("__autonomousStopped", onStop as EventListener);
    } catch (err) {
      // ignore
    }
    return () => {
      try {
        window.removeEventListener(
          "__autonomousStarted",
          onStart as EventListener
        );
        window.removeEventListener(
          "__autonomousStopped",
          onStop as EventListener
        );
      } catch (err) {
        // ignore
      }
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  return (
    <SimulationContext.Provider value={contextValue}>
      {children}
      <SimulationResultModal
        isOpen={realtimeResult !== null && !suppressSimulationResultModal}
        result={realtimeResult}
        onCloseAction={dismissRealtimeResult}
      />
    </SimulationContext.Provider>
  );
}

export function useSimulation() {
  const context = useContext(SimulationContext);
  if (!context) {
    throw new Error("useSimulation must be used within SimulationProvider");
  }
  return context;
}
