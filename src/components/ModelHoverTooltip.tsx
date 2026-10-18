"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { MachineDetails } from "@/lib/machines";
import {
  HEALTH_TEXT,
  STATUS_COLORS,
  getMachineStatus,
  healthTone,
} from "@/lib/machine-display";
import {
  Tooltip,
  TooltipArrow,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type ModelHoverInfo = {
  id: string;
  screenX: number;
  screenY: number;
  machine: MachineDetails | null;
};

type ModelHoverTooltipProps = {
  info: ModelHoverInfo | null;
};

export function ModelHoverTooltip({ info }: ModelHoverTooltipProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !info) {
    return null;
  }

  const machine = info.machine;

  return createPortal(
    <TooltipProvider delayDuration={0} disableHoverableContent>
      <Tooltip open>
        <TooltipTrigger asChild>
          <span
            style={{
              position: "fixed",
              left: `${info.screenX}px`,
              top: `${info.screenY}px`,
              width: "1px",
              height: "1px",
              pointerEvents: "none",
            }}
          />
        </TooltipTrigger>
        <TooltipContent
          side="top"
          sideOffset={12}
          className="max-w-[220px] space-y-1 bg-slate-900 border-none text-white"
        >
          <p className="text-sm font-semibold text-white leading-tight">
            {machine?.title ?? info.id}
          </p>
          {machine ? (
            <div className="space-y-1 text-xs text-white">
              <p className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: STATUS_COLORS[getMachineStatus(machine)] }}
                />
                {getMachineStatus(machine)}
              </p>
              <p>
                Health score:{" "}
                <span className={`font-semibold ${HEALTH_TEXT[healthTone(machine.healthScore)]}`}>
                  {typeof machine.healthScore === "number" ? `${machine.healthScore}%` : "-"}
                </span>
              </p>
              <p>Location: {machine.location || "-"}</p>
              <p>
                Active alarms: {machine.alarms?.active ?? 0} /{" "}
                {machine.alarms?.total ?? 0}
              </p>
            </div>
          ) : (
            <p className="text-xs text-background/70">Loading data…</p>
          )}
          <TooltipArrow className="fill-foreground" />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>,
    document.body
  );
}
