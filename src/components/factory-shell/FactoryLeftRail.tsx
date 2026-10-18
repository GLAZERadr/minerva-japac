"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Box,
  Building2,
  Database,
  PackagePlus,
  PanelLeft,
  Play,
  Sparkles,
} from "lucide-react";
import { useSimulation } from "@/components/simulation/SimulationProvider";
import ProductDataViewerModal from "@/components/ProductDataViewerModal";
import ProductDataModal from "@/components/ProductDataModal";
import { openAskAi } from "./FactoryTopBar";
import { cn } from "@/lib/utils";

function formatSeconds(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60).toString().padStart(2, "0")}:${(total % 60)
    .toString()
    .padStart(2, "0")}`;
}

function RailButton({
  title,
  active,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-md transition-all duration-200",
        active
          ? "bg-[rgba(138,180,248,0.12)] text-[#8ab4f8]"
          : "text-[#acacbe] hover:bg-[rgba(232,234,237,0.08)] hover:text-[#e8eaed]"
      )}
    >
      {children}
    </button>
  );
}

export default function FactoryLeftRail({
  expanded,
  onToggle,
}: {
  expanded: boolean;
  onToggle: () => void;
}) {
  const { isSimulationMode, simulationVariant, elapsedSeconds, openConfigurator } =
    useSimulation();
  const [productOpen, setProductOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const items = [
    {
      key: "view",
      title: "3D View",
      desc: "Digital twin viewport",
      icon: <Box className="h-5 w-5" />,
      active: !isSimulationMode,
      onClick: undefined as (() => void) | undefined,
    },
    {
      key: "sim",
      title: "Simulation",
      desc: "Configure & run",
      icon: <Play className="h-5 w-5" />,
      active: isSimulationMode,
      onClick: () => openConfigurator(),
    },
    {
      key: "data",
      title: "Product Data",
      desc: "Flows & products",
      icon: <Database className="h-5 w-5" />,
      active: false,
      onClick: () => setProductOpen(true),
    },
    {
      key: "add",
      title: "Add product data",
      desc: "Register a new lot",
      icon: <PackagePlus className="h-5 w-5" />,
      active: false,
      onClick: () => setAddOpen(true),
    },
    {
      key: "ask",
      title: "Ask AI",
      desc: "Query machine data",
      icon: <Sparkles className="h-5 w-5" />,
      active: false,
      onClick: () => openAskAi(),
    },
  ];

  return (
    <>
      <aside
        className={cn(
          "fixed left-0 top-0 z-50 hidden h-full flex-col border-r border-[#333333] bg-[#181818] transition-all duration-300",
          "md:flex",
          expanded ? "w-[260px]" : "w-[60px]"
        )}
      >
        {expanded ? (
          <div className="relative flex h-14 w-full items-center border-b border-[#333333] px-3">
            <img
              src="/minerva-logo.png"
              alt="Minerva"
              className="absolute left-1/2 h-9 w-auto -translate-x-1/2"
            />
            <div className="ml-auto">
              <RailButton title="Collapse sidebar" onClick={onToggle}>
                <PanelLeft className="h-5 w-5" />
              </RailButton>
            </div>
          </div>
        ) : (
          <div className="flex h-14 items-center justify-center border-b border-[#333333]">
            <RailButton title="Expand sidebar" onClick={onToggle}>
              <PanelLeft className="h-5 w-5" />
            </RailButton>
          </div>
        )}

        {!expanded && (
          <div className="flex flex-col items-center gap-1.5 py-3">
            {items.map((item) => (
              <RailButton
                key={item.key}
                title={item.title}
                active={item.active}
                onClick={item.onClick}
              >
                {item.icon}
              </RailButton>
            ))}
          </div>
        )}

        {expanded && (
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-3">
            {items.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={item.onClick}
                className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-[#2a2a2a]"
              >
                <span className={cn(item.active ? "text-[#8ab4f8]" : "text-[#acacbe]")}>
                  {item.icon}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm text-[#e8eaed]">{item.title}</span>
                  <span className="block truncate text-xs text-[#9aa0a6]">{item.desc}</span>
                </span>
              </button>
            ))}
            <div className="rounded-lg border border-[#3c4043] bg-[#202124] p-3 text-xs">
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-[#8e8ea0]">
                Status
              </p>
              <p className="text-[#bdc1c6]">
                Mode:{" "}
                <span className="font-medium text-[#e8eaed]">
                  {isSimulationMode ? `Simulation (${simulationVariant})` : "Monitoring"}
                </span>
              </p>
              <p className="text-[#bdc1c6]">
                Elapsed:{" "}
                <span className="font-mono text-[#e8eaed]">{formatSeconds(elapsedSeconds)}</span>
              </p>
            </div>
          </div>
        )}

        <div className="border-t border-[#333333] py-3">
          {expanded ? (
            <div className="px-3">
              <Link
                href="/compro"
                title="Company Profile"
                aria-label="Company Profile"
                className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-[#2a2a2a]"
              >
                <span className="text-[#acacbe]">
                  <Building2 className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm text-[#e8eaed]">Company Profile</span>
                  <span className="block truncate text-xs text-[#9aa0a6]">
                    About Minerva
                  </span>
                </span>
              </Link>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5">
              <Link
                href="/compro"
                title="Company Profile"
                aria-label="Company Profile"
                className="flex h-10 w-10 items-center justify-center rounded-md text-[#acacbe] transition-all hover:bg-[rgba(232,234,237,0.08)] hover:text-[#e8eaed]"
              >
                <Building2 className="h-5 w-5" />
              </Link>
            </div>
          )}
        </div>
      </aside>
      <ProductDataViewerModal isOpen={productOpen} onCloseAction={() => setProductOpen(false)} />
      <ProductDataModal
        isOpen={addOpen}
        onCloseAction={() => setAddOpen(false)}
        onSuccess={() => setProductOpen(true)}
      />
    </>
  );
}
