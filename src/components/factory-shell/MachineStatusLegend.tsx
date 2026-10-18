"use client";

import { MACHINE_STATUSES, STATUS_COLORS } from "@/lib/machine-display";

/** Key for the status rings drawn under each machine in the 3D view. */
export default function MachineStatusLegend() {
  return (
    <div className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-x-3 gap-y-1 rounded-lg border border-[#3c4043] bg-[#202124]/85 px-3 py-1.5 text-[11px] text-[#bdc1c6] backdrop-blur">
      {MACHINE_STATUSES.map((status) => (
        <span key={status} className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_COLORS[status] }} />
          {status}
        </span>
      ))}
    </div>
  );
}
