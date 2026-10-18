"use client";

import { useState } from "react";
import { Bell, Box, Cpu, Database, Play } from "lucide-react";
import { useSimulation } from "@/components/simulation/SimulationProvider";
import ProductDataViewerModal from "@/components/ProductDataViewerModal";
import { useNotifications } from "./useNotifications";
import type { RightPanel } from "./FactoryRightRail";
import { cn } from "@/lib/utils";

// Below 768 px the left and right icon rails collapse into this single bottom
// tab bar so the 3D view and the Ask AI input get the full screen width.
export default function FactoryMobileTabBar({
  panel,
  onPanelChange,
}: {
  panel: RightPanel;
  onPanelChange: (next: RightPanel) => void;
}) {
  const { isSimulationMode, openConfigurator } = useSimulation();
  const { unreadCount } = useNotifications();
  const [productOpen, setProductOpen] = useState(false);

  const togglePanel = (target: Exclude<RightPanel, null>) =>
    onPanelChange(panel === target ? null : target);

  const tabs = [
    {
      key: "view",
      label: "3D View",
      icon: <Box className="h-5 w-5" />,
      active: panel === null && !isSimulationMode,
      onClick: () => onPanelChange(null),
    },
    {
      key: "sim",
      label: "Simulate",
      icon: <Play className="h-5 w-5" />,
      active: isSimulationMode,
      onClick: () => {
        onPanelChange(null);
        openConfigurator();
      },
    },
    {
      key: "data",
      label: "Products",
      icon: <Database className="h-5 w-5" />,
      active: productOpen,
      onClick: () => setProductOpen(true),
    },
    {
      key: "machines",
      label: "Machines",
      icon: <Cpu className="h-5 w-5" />,
      active: panel === "machines",
      onClick: () => togglePanel("machines"),
    },
    {
      key: "alerts",
      label: "Alerts",
      icon: <Bell className="h-5 w-5" />,
      active: panel === "notifications",
      badge: unreadCount > 0,
      onClick: () => togglePanel("notifications"),
    },
  ];

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 flex h-14 items-stretch border-t border-[#333333] bg-[#181818] pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={tab.onClick}
            aria-pressed={tab.active}
            className={cn(
              "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
              tab.active ? "text-[#8ab4f8]" : "text-[#9aa0a6] active:text-[#e8eaed]"
            )}
          >
            <span className="relative">
              {tab.icon}
              {tab.badge && (
                <span className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-[#f28b82]" />
              )}
            </span>
            <span className="truncate">{tab.label}</span>
          </button>
        ))}
      </nav>
      <ProductDataViewerModal isOpen={productOpen} onCloseAction={() => setProductOpen(false)} />
    </>
  );
}
