"use client";

import { useEffect, useState } from "react";
import { Activity, Database, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import LiveSensorTicker from "@/components/LiveSensorTicker";
import ProductDataViewerModal from "@/components/ProductDataViewerModal";
import { loadMachines } from "@/lib/machines";
import { computePlantOee, healthTone, HEALTH_TEXT } from "@/lib/machine-display";
import { cn } from "@/lib/utils";

export function openAskAi(question?: string) {
  try {
    window.dispatchEvent(new CustomEvent("__openAskAi", { detail: { question } }));
  } catch {
    /* ignore */
  }
}

export function openModelModal(machineId: string) {
  try {
    window.dispatchEvent(new CustomEvent("__openModelModal", { detail: { id: machineId } }));
  } catch {
    /* ignore */
  }
}

/** Factory Health (OEE) chip — availability × performance × quality. */
function OeeChip() {
  const [oee, setOee] = useState<ReturnType<typeof computePlantOee>>(null);
  useEffect(() => {
    let alive = true;
    loadMachines()
      .then((machines) => alive && setOee(computePlantOee(machines)))
      .catch(() => alive && setOee(null));
    return () => {
      alive = false;
    };
  }, []);
  if (!oee) return null;
  return (
    <span
      title={`Factory health (OEE) ${oee.oee}% — availability ${oee.availability}%, performance ${oee.performance}%, quality ${oee.quality}%`}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[rgba(232,234,237,0.08)] px-2.5 py-1 text-xs text-[#bdc1c6]"
    >
      <Activity className="h-3.5 w-3.5 text-[#9aa0a6]" />
      <span className="hidden xl:inline">Factory health</span>
      <span className="xl:hidden">OEE</span>
      <span className={cn("font-medium tabular-nums", HEALTH_TEXT[healthTone(oee.oee)])}>{oee.oee}%</span>
    </span>
  );
}

export default function FactoryTopBar() {
  // Notifications live in the right rail (desktop) and the Alerts tab
  // (mobile); a second bell here used to clip under the rail.
  const [productOpen, setProductOpen] = useState(false);

  return (
    <>
      <header
        className="fixed left-0 right-0 top-0 z-40 flex h-14 items-center gap-2 border-b border-[#333333] bg-[#181818] px-3 transition-all duration-300 sm:gap-3 md:left-[var(--rail-left)] md:px-4"
      >
        <div className="flex shrink-0 items-center gap-2.5">
          <img src="/minerva-logo.png" alt="Minerva" className="h-7 w-auto" />
          <span className="hidden rounded-md bg-[rgba(232,234,237,0.08)] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-[#9aa0a6] xl:inline-block">
            Plant
          </span>
          <span className="hidden rounded-md bg-[rgba(138,180,248,0.15)] px-2.5 py-1 text-xs font-medium text-[#8ab4f8] sm:inline-block">
            Smelter
          </span>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <LiveSensorTicker />
          <OeeChip />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button
            size="sm"
            className="gap-1.5 rounded-md bg-[#2d2d2d] font-medium text-[#e8eaed] hover:bg-[#3d3d3d] hover:text-white"
            onClick={() => openAskAi()}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Ask AI</span>
          </Button>
          <Button
            size="sm"
            className="hidden gap-1.5 rounded-md bg-[#2d2d2d] font-medium text-[#e8eaed] hover:bg-[#3d3d3d] hover:text-white md:inline-flex"
            onClick={() => setProductOpen(true)}
          >
            <Database className="h-3.5 w-3.5" />
            Product Data
          </Button>
        </div>
      </header>
      <ProductDataViewerModal isOpen={productOpen} onCloseAction={() => setProductOpen(false)} />
    </>
  );
}
