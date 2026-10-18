"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useState } from "react";
import type { RealtimeResult } from "./SimulationProvider";
import SimulationValidationModal from "./SimulationValidationModal";
import type { ComparisonRow } from "@/lib/simulation-report";
import { cn } from "@/lib/utils";

type Props = {
  isOpen: boolean;
  result: RealtimeResult | null;
  onCloseAction: () => void;
};

const fmt = (value: number, digits: number) =>
  value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

function DeltaChip({ row }: { row: ComparisonRow }) {
  const diff = row.after - row.before;
  if (Math.abs(diff) < 10 ** -row.digits / 2) {
    return <span className="text-xs text-[#9aa0a6]">no change</span>;
  }
  const improved = row.better === "lower" ? diff < 0 : diff > 0;
  const pct = row.before !== 0 ? (diff / row.before) * 100 : 0;
  const text =
    row.unit === "%"
      ? `${diff > 0 ? "+" : ""}${fmt(diff, 1)} pts`
      : `${diff > 0 ? "+" : ""}${fmt(pct, 1)}%`;
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
        improved ? "bg-[rgba(129,201,149,0.16)] text-[#81c995]" : "bg-[rgba(242,139,130,0.16)] text-[#f28b82]"
      )}
    >
      {text}
    </span>
  );
}

export default function SimulationResultModal({ isOpen, result, onCloseAction }: Props) {
  const [isValidationOpen, setValidationOpen] = useState(false);
  if (!result) return null;

  const value = (val: string | number | null | undefined) => (val == null || val === "" ? "-" : val);
  const stats = [
    { label: "Avg temperature", value: value(result.averages?.temperature), unit: "°C", tone: "text-[#e8eaed]" },
    { label: "Operation time", value: value(result.operationHour), unit: "h", tone: "text-[#e8eaed]" },
    { label: "Good billets", value: value(result.goodProduct), unit: "pcs", tone: "text-[#81c995]" },
    { label: "Defects", value: value(result.defectProduct), unit: "pcs", tone: "text-[#f28b82]" },
  ];

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onCloseAction()}>
        <DialogContent
          style={{ fontFamily: "Roboto, system-ui, -apple-system, sans-serif" }}
          className="flex max-h-[min(90dvh,860px)] w-[calc(100vw-1.5rem)] max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#212121] p-0 text-[#e8eaed] shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
        >
          <DialogHeader className="border-b border-white/10 px-6 py-5">
            <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#9aa0a6]">
              Simulation report · Lot {result.lot}
            </span>
            <DialogTitle className="mt-1 text-xl font-medium text-[#e8eaed]">
              {result.productName ?? "Production simulation"}
            </DialogTitle>
            <DialogDescription className="mt-1 text-xs text-[#9aa0a6]">
              Simulated settings compared with current plant practice.
            </DialogDescription>
          </DialogHeader>

          <div className="google-scroll min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {stats.map((stat) => (
                <div key={stat.label} className="rounded-2xl bg-white/5 p-4">
                  <p className="text-xs text-[#9aa0a6]">{stat.label}</p>
                  <p className={cn("mt-1 text-2xl font-medium tabular-nums", stat.tone)}>
                    {stat.value}
                    <span className="ml-1 text-xs font-normal text-[#9aa0a6]">{stat.unit}</span>
                  </p>
                </div>
              ))}
            </div>

            {result.comparison && result.comparison.length > 0 && (
              <section className="overflow-hidden rounded-2xl border border-white/10">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] text-sm">
                    <thead>
                      <tr className="bg-white/5 text-left text-[11px] uppercase tracking-[0.12em] text-[#9aa0a6]">
                        <th className="px-4 py-2.5 font-medium">Metric</th>
                        <th className="px-4 py-2.5 text-right font-medium">Before</th>
                        <th className="px-4 py-2.5 text-right font-medium">After</th>
                        <th className="px-4 py-2.5 text-right font-medium">Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.comparison.map((row) => (
                        <tr key={row.key} className="border-t border-white/5">
                          <td className="px-4 py-2.5 text-[#bdc1c6]">{row.label}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-[#9aa0a6]">
                            {fmt(row.before, row.digits)} <span className="text-[10px]">{row.unit}</span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-medium tabular-nums text-[#e8eaed]">
                            {fmt(row.after, row.digits)} <span className="text-[10px] text-[#9aa0a6]">{row.unit}</span>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <DeltaChip row={row} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <section className="rounded-2xl bg-[rgba(138,180,248,0.08)] p-4">
              <h4 className="text-[13px] font-medium text-[#8ab4f8]">Analysis</h4>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-[#e8eaed]">
                {result.conclusion ?? "No conclusion available."}
              </p>
            </section>
          </div>

          <DialogFooter className="border-t border-white/10 px-6 py-4">
            <button
              type="button"
              onClick={() => setValidationOpen(true)}
              className="rounded-full px-4 py-2 text-sm font-medium text-[#8ab4f8] transition hover:bg-[rgba(138,180,248,0.12)]"
            >
              Validate
            </button>
            <button
              type="button"
              onClick={onCloseAction}
              className="rounded-full bg-[#8ab4f8] px-5 py-2 text-sm font-medium text-[#062e6f] transition hover:bg-[#aecbfa]"
            >
              Close report
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <SimulationValidationModal
        isOpen={isValidationOpen}
        initial={{
          temperature: result.averages?.temperature ?? null,
          operationHour: result.operationHour ?? null,
          goodProduct: result.goodProduct ?? null,
          defectProduct: result.defectProduct ?? null,
        }}
        onCloseAction={() => setValidationOpen(false)}
        onSubmitAction={() => setValidationOpen(false)}
      />
    </>
  );
}
