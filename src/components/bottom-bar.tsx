"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useSimulation,
  type SimulationVariant,
} from "@/components/simulation/SimulationProvider";
import ProductDataModal, {
  type ProductDataResponse,
} from "@/components/ProductDataModal";
import AutonomousStartConfirmModal from "./simulation/AutonomousStartConfirmModal";
import AutonomousResultModal from "./simulation/AutonomousResultModal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";

const formatSeconds = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const secs = (total % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
};

function BottomBar({ embedded = false }: { embedded?: boolean }) {
  const [isProductModalOpen, setProductModalOpen] = useState(false);
  const [productSuccessMessage, setProductSuccessMessage] = useState<
    string | null
  >(null);
  const [isAutonomousConfirmOpen, setAutonomousConfirmOpen] = useState(false);
  const [isAutonomousResultOpen, setAutonomousResultOpen] = useState(false);
  const [isAutonomousRunning, setAutonomousRunning] = useState(false);
  const [autonomousSimResult, setAutonomousSimResult] = useState<
    import("./simulation/SimulationProvider").RealtimeResult | null
  >(null);
  const [autonomousRealData, setAutonomousRealData] = useState<any>(null);

  const {
    isSimulationMode,
    simulationVariant,
    setSimulationVariant,
    stopSimulation,
    requestSimulationStart,
    activeMachine,
    steps,
    activeMachineId,
    stepProgress,
    elapsedSeconds,
    flowsLoading,
    flowsError,
    selectedProduct,
    realtimeResult,
    overallProgress,
    skipSimulation,
  } = useSimulation();

  const isRealtime = simulationVariant === "realtime";
  const pathname = usePathname();

  const progressPercent = useMemo(() => {
    if (!isSimulationMode) return 0;
    if (isRealtime) return activeMachine ? 100 : 0;
    if (!Number.isFinite(overallProgress)) return 0;
    return Math.max(0, Math.min(100, Math.round(overallProgress * 100)));
  }, [activeMachine, isRealtime, isSimulationMode, overallProgress]);

  const nextMachine = useMemo(() => {
    if (isRealtime || !activeMachineId) return null;
    const currentIndex = steps.findIndex((step) => step.id === activeMachineId);
    if (currentIndex < 0) return null;
    return steps[currentIndex + 1] ?? null;
  }, [activeMachineId, isRealtime, steps]);

  const handleVariantClick = useCallback(
    (variant: SimulationVariant) => {
      setSimulationVariant(variant);
    },
    [setSimulationVariant]
  );

  const handleModeSwitchChange = useCallback(
    (checked: boolean) => {
      if (checked) {
        if (!isSimulationMode) {
          setSimulationVariant("sequence");
          requestSimulationStart();
        }
        return;
      }

      if (isSimulationMode) {
        stopSimulation();
      }
      setSimulationVariant("realtime");
    },
    [
      isSimulationMode,
      requestSimulationStart,
      setSimulationVariant,
      stopSimulation,
    ]
  );

  const handleProductModalSuccess = useCallback(
    (payload: ProductDataResponse) => {
      setProductModalOpen(false);
      setProductSuccessMessage(
        `Lot ${payload.lot} saved${
          payload.source === "firestore"
            ? " to Cloud Firestore"
            : payload.source === "mock"
              ? " (demo data — offline)"
              : ""
        }.`
      );
    },
    []
  );

  useEffect(() => {
    if (!productSuccessMessage) return;
    const timeout = window.setTimeout(() => {
      setProductSuccessMessage(null);
    }, 6000);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [productSuccessMessage]);

  const statusLabel = useMemo(() => {
    const productName = selectedProduct?.productName;
    const baseFlowLabel = flowsLoading
      ? "Loading product flows"
      : productName ?? "Default sequence";
    if (isSimulationMode) {
      if (isRealtime) {
        return activeMachine?.name ?? "Waiting for realtime signal";
      }
      return activeMachine?.name ?? `Simulation • ${baseFlowLabel}`;
    }
    return isRealtime ? "Realtime mode ready" : baseFlowLabel;
  }, [
    activeMachine,
    flowsLoading,
    isRealtime,
    isSimulationMode,
    selectedProduct,
  ]);

  const subStatusLabel = useMemo(() => {
    if (isRealtime) {
      return isSimulationMode
        ? "Tracking machine status from the InfluxDB stream."
        : "Use realtime mode to highlight machines from the InfluxDB stream.";
    }
    if (!isSimulationMode) {
      if (flowsLoading) {
        return "Loading simulation flow configuration…";
      }
      if (flowsError) {
        return flowsError;
      }
      return selectedProduct?.description
        ? selectedProduct.description
        : `${steps.length} machines will be included.`;
    }
    return nextMachine
      ? `Next: ${nextMachine.name}`
      : "Loading production sequence";
  }, [
    flowsError,
    flowsLoading,
    isRealtime,
    isSimulationMode,
    nextMachine,
    selectedProduct,
    steps.length,
  ]);

  const progressLabel = useMemo(() => {
    if (isRealtime) {
      return activeMachine ? "Live" : "Idle";
    }
    return `${progressPercent}%`;
  }, [activeMachine, isRealtime, progressPercent]);

  const isModeSwitchDisabled =
    !isSimulationMode && simulationVariant === "sequence" && flowsLoading;

  // When autonomous mode is started, we wait until the provider finishes the
  // simulation (realtimeResult is set and isSimulationMode becomes false),
  // then fetch real sensor data and show the autonomous result modal.
  useEffect(() => {
    if (!isAutonomousRunning) return;
    if (isSimulationMode) return; // still running
    if (!realtimeResult) return; // wait for result

    let active = true;
    (async () => {
      try {
        const resp = await fetch("/product-data.json", { cache: "no-store" });
        if (!resp.ok) throw new Error(resp.statusText);
        const json = await resp.json();
        if (!active) return;
        const entries = Array.isArray(json) ? json : json ? [json] : [];
        const real = entries.length > 0 ? entries[0] : null;
        setAutonomousSimResult(realtimeResult);
        setAutonomousRealData(real);
        setAutonomousResultOpen(true);
      } catch (err) {
        // still show sim result even if real sensor fetch failed
        setAutonomousSimResult(realtimeResult);
        setAutonomousRealData(null);
        setAutonomousResultOpen(true);
      } finally {
        // notify listeners that autonomous mode finished
        try {
          window.dispatchEvent(new CustomEvent("__autonomousStopped"));
        } catch (err) {
          /* ignore */
        }

        setAutonomousRunning(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [isAutonomousRunning, isSimulationMode, realtimeResult]);

  const baseModeButtonClass =
    "h-8 shrink-0 rounded-full px-3 text-[11px] font-semibold uppercase tracking-[0.08em] transition disabled:opacity-50 disabled:pointer-events-none";
  const monitoringButtonClass = cn(
    baseModeButtonClass,
    !isSimulationMode
      ? "bg-blue-500/20 text-white hover:bg-blue-500/25"
      : "bg-transparent text-slate-300 hover:bg-slate-700/40 hover:text-white"
  );
  const modeButtonClass = (active: boolean) =>
    cn(
      baseModeButtonClass,
      active
        ? "bg-blue-500/20 text-white hover:bg-blue-500/25"
        : "bg-transparent text-slate-300 hover:bg-slate-700/40 hover:text-white"
    );
  const simulationButtonClass = modeButtonClass(isSimulationMode && !isAutonomousRunning);
  const autonomousButtonClass = modeButtonClass(isSimulationMode && isAutonomousRunning);

  return (
    <footer
      className={cn(
        embedded
          ? "w-full text-slate-200"
          : "fixed bg-transparent left-1/2 z-50 w-[min(100%-2rem,48rem)] -translate-x-1/2 rounded-3xl px-6 py-4 text-slate-200",
        // On the factory shell (`/`) the Ask-AI prompt pill owns bottom-center,
        // so the transport docks above it. Everywhere else it stays at bottom-4.
        !embedded && (pathname === "/" ? "bottom-24" : "bottom-4")
      )}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-center gap-3">
          <div className="flex min-w-0 max-w-full flex-wrap items-center justify-center gap-2 sm:gap-3">
            <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-full bg-slate-800/60 p-1 shadow-inner [scrollbar-width:none]">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => handleModeSwitchChange(false)}
                className={monitoringButtonClass}
              >
                Monitoring
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => handleModeSwitchChange(true)}
                disabled={isModeSwitchDisabled}
                className={simulationButtonClass}
              >
                Simulation
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setAutonomousConfirmOpen(true)}
                disabled={isModeSwitchDisabled}
                className={autonomousButtonClass}
              >
                Autonomous
              </Button>
            </div>
            {isSimulationMode && (
              <span className="rounded-full bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-200">
                {formatSeconds(elapsedSeconds)}
              </span>
            )}
            {isSimulationMode && !isRealtime && (
              <Button
                type="button"
                variant="outline"
                onClick={skipSimulation}
                className="h-8 rounded-full border-blue-400/40 bg-blue-500/10 px-3 text-xs font-semibold text-blue-100 hover:bg-blue-500/20"
              >
                Skip to report
              </Button>
            )}
            {!isSimulationMode && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setProductModalOpen(true)}
                className="hidden rounded-full border-emerald-400/40 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/20 md:inline-flex"
              >
                Add product data
              </Button>
            )}
          </div>
        </div>
        {productSuccessMessage && (
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-center text-xs font-medium text-emerald-200">
            {productSuccessMessage}
          </div>
        )}
        {isSimulationMode && (
          <div className="flex flex-col gap-1">
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPercent}
              aria-label="Simulation progress"
              className="relative h-1.5 w-full overflow-hidden rounded-full bg-slate-700/80"
            >
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-[#8ab4f8] transition-[width] duration-200"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="flex justify-between gap-3 text-[11px] font-medium text-slate-300">
              <span className="min-w-0 truncate">
                {isRealtime
                  ? `Active (realtime): ${activeMachine?.name ?? "-"}`
                  : `Active: ${activeMachine?.name ?? "-"}${nextMachine ? ` · next ${nextMachine.name}` : ""}`}
              </span>
              <span className="shrink-0 tabular-nums">{progressLabel}</span>
            </div>
          </div>
        )}
      </div>
      <ProductDataModal
        isOpen={isProductModalOpen}
        onCloseAction={() => setProductModalOpen(false)}
        onSuccess={handleProductModalSuccess}
      />
      <AutonomousStartConfirmModal
        isOpen={isAutonomousConfirmOpen}
        onCloseAction={() => setAutonomousConfirmOpen(false)}
        onConfirmAction={() => {
          // start autonomous run (use sequence behavior)
          setAutonomousConfirmOpen(false);
          // notify other components that autonomous mode is starting
          try {
            window.dispatchEvent(new CustomEvent("__autonomousStarted"));
          } catch (err) {
            /* ignore */
          }

          setAutonomousRunning(true);
          setSimulationVariant("sequence");
          requestSimulationStart();
        }}
      />
      <AutonomousResultModal
        isOpen={isAutonomousResultOpen}
        simResult={autonomousSimResult}
        real={autonomousRealData}
        onCloseAction={() => setAutonomousResultOpen(false)}
      />
    </footer>
  );
}

export default BottomBar;
