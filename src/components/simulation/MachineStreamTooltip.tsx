"use client";

import { useMemo } from "react";
import type { LiveSensorReading } from "./useSensorStream";
import { formatIndicator, indicatorLabel, indicatorUnit } from "@/lib/machine-display";

type MachineStreamTooltipProps = {
  machineName: string;
  readings: LiveSensorReading[];
  screenPosition: { x: number; y: number };
};

const formatValue = (value: number, sensorName: string) => {
  if (!Number.isFinite(value)) return "-";
  if (indicatorUnit(sensorName)) return formatIndicator(sensorName, value);

  const sensorLower = sensorName.toLowerCase();

  if (sensorLower.includes("temperature") || sensorLower.includes("temp")) {
    return `${value.toFixed(1)}°C`;
  }
  if (sensorLower.includes("pressure")) {
    return `${value.toFixed(1)} bar`;
  }
  if (sensorLower.includes("speed")) {
    return `${value.toFixed(1)} rpm`;
  }
  if (sensorLower.includes("flow")) {
    return `${value.toFixed(1)} L/m`;
  }
  if (sensorLower.includes("level")) {
    return `${value.toFixed(1)}%`;
  }
  if (sensorLower.includes("weight")) {
    return `${value.toFixed(0)} kg`;
  }
  if (sensorLower.includes("accuracy")) {
    return `${value.toFixed(2)}%`;
  }

  if (Math.abs(value) >= 1000) {
    return value.toFixed(0);
  }
  return value.toFixed(1);
};

export default function MachineStreamTooltip({
  machineName,
  readings,
  screenPosition,
}: MachineStreamTooltipProps) {
  const machineReadings = useMemo(() => {
    return readings.filter(
      (item) => item.machineName.toLowerCase() === machineName.toLowerCase()
    );
  }, [machineName, readings]);

  // Always render the tooltip header (so highlighted models show a label even
  // if there are no sensor readings). If there are no readings, render a
  // placeholder row showing unavailable accuracy.

  return (
    <div
      className="pointer-events-none fixed z-50 flex flex-col gap-1.5 rounded-lg border border-blue-400/40 bg-slate-900/95 px-3 py-2 shadow-[0_0_24px_rgba(59,130,246,0.25)] backdrop-blur-sm"
      style={{
        left: `${screenPosition.x}px`,
        top: `${screenPosition.y}px`,
        transform: "translate(-50%, calc(-100% - 12px))",
      }}
    >
      <div className="flex items-center gap-2 border-b border-white/10 pb-1.5">
        <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-white">
          {machineName}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {machineReadings.length > 0 ? (
          machineReadings.map((reading) => (
            <div
              key={reading.id}
              className="flex items-center justify-between gap-3 text-xs"
            >
              <span className="text-slate-300">{indicatorLabel(reading.sensorName)}</span>
              <span className="font-semibold text-blue-200">
                {formatValue(reading.value, reading.sensorName)}
              </span>
            </div>
          ))
        ) : (
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="text-slate-300">Accuracy</span>
            <span className="font-semibold text-blue-200">-</span>
          </div>
        )}
      </div>
    </div>
  );
}
