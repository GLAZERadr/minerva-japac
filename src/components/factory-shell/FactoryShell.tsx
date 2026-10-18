"use client";

import { useState, type CSSProperties } from "react";
import GLTFViewer from "@/components/GLTFViewer";
import SimulationScene from "@/components/simulation/simulation";
import { useSimulation } from "@/components/simulation/SimulationProvider";
import FactoryTopBar from "./FactoryTopBar";
import FactoryLeftRail from "./FactoryLeftRail";
import FactoryRightRail, { type RightPanel } from "./FactoryRightRail";
import FactoryPromptBar from "./FactoryPromptBar";
import FactoryMobileTabBar from "./FactoryMobileTabBar";
import MachineStatusLegend from "./MachineStatusLegend";
import { cn } from "@/lib/utils";

// Factory dashboard (monitoring + 3D twin + simulation) in GeoGemma-style
// Google-dark chrome: Roboto (applied by the route), #181818 surfaces,
// #8ab4f8 accents. Reuses existing Minerva logic (viewer, simulation
// provider, modals, notifications).
//
// Layout: ≥ 768 px shows the left and right icon rails; below that both
// collapse into a single bottom tab bar and the viewport is full width.
export default function FactoryShell() {
  const [expanded, setExpanded] = useState(false);
  const [panel, setPanel] = useState<RightPanel>(null);
  const { isSimulationMode } = useSimulation();

  return (
    <div
      className="fixed inset-0 h-[100dvh] overflow-hidden bg-[#181818] text-[#e8eaed]"
      style={
        {
          "--rail-left": expanded ? "260px" : "60px",
          // Width the right-rail panel takes from the viewport (desktop).
          "--rail-panel-w": panel ? "380px" : "0px",
        } as CSSProperties
      }
    >
      <FactoryTopBar />
      <FactoryLeftRail expanded={expanded} onToggle={() => setExpanded((v) => !v)} />
      <main
        className={cn(
          "absolute bottom-14 left-0 right-0 top-14 transition-all duration-300",
          "md:bottom-0 md:left-[var(--rail-left)] md:right-[60px]"
        )}
      >
        <div className="absolute inset-0">
          {isSimulationMode ? <SimulationScene embedded /> : <GLTFViewer />}
        </div>
        {!isSimulationMode && <MachineStatusLegend />}
        <FactoryPromptBar />
      </main>
      <FactoryRightRail panel={panel} onPanelChange={setPanel} />
      <FactoryMobileTabBar panel={panel} onPanelChange={setPanel} />
    </div>
  );
}
