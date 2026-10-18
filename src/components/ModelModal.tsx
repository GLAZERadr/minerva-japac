"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Euler, Object3D, Vector3 } from "three";
import { createRoot, type Root } from "react-dom/client";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { MachineDetails, PrescriptiveMaintenanceEntry } from "@/lib/machines";
import { loadMachineById } from "@/lib/machines";
import {
  HEALTH_BORDER,
  HEALTH_CHIP,
  STATUS_COLORS,
  formatIndicator,
  getMachineStatus,
  healthTone,
  indicatorLabel,
  type MachineStatus,
} from "@/lib/machine-display";
import { useFeedState, useMachineSnapshot } from "@/lib/sensor-feed";
import { generateGeminiText, isGeminiConfigured } from "@/lib/gemini";

// Health tones shared with the machines panel: red < 60, amber 60–79, green ≥ 80.
const getHealthColorClasses = (health: number) => {
  const tone = healthTone(health);
  return { chip: HEALTH_CHIP[tone], border: HEALTH_BORDER[tone] };
};

// Google-dark status chip (filled tonal pill, Material 3).
function StatusChip({ status }: { status: MachineStatus }) {
  const color = STATUS_COLORS[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
      style={{ color, backgroundColor: `${color}29` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {status}
    </span>
  );
}

// Overline label used across Google settings-style rows.
function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#9aa0a6]">
      {children}
    </p>
  );
}

type ModelModalOptions = {
  id: string;
  description?: string;
  position?: Vector3;
  rotation?: Euler;
  scale?: Vector3;
  objectSnapshot?: Object3D;
  onClose?: () => void;
};

function ModelModal(props: ModelModalOptions) {
  const { id, description, onClose } = props;
  const [isOpen, setIsOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const hasClosedRef = useRef(false);
  const hasOpenedRef = useRef(false);
  const [machine, setMachine] = useState<MachineDetails | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  // Publish the docked panel's width so the factory shell can keep the
  // Ask AI bar and transport controls clear of it (desktop only).
  useEffect(() => {
    const node = contentRef.current;
    const root = document.documentElement;
    if (!isOpen || !node) return;
    const update = () => {
      const docked = window.matchMedia("(min-width: 768px)").matches;
      root.style.setProperty("--detail-panel-w", docked ? `${node.offsetWidth + 8}px` : "0px");
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      root.style.removeProperty("--detail-panel-w");
    };
  }, [isOpen, expanded]);

  const maintenanceItems = machine?.predictiveMaintenance ?? [];
  const maintenanceCount = maintenanceItems.length;
  const snapshot = useMachineSnapshot(id);
  const { source: feedSource } = useFeedState();
  const [aiPrescriptive, setAiPrescriptive] = useState<PrescriptiveMaintenanceEntry | null>(null);
  const [aiState, setAiState] = useState<"idle" | "loading" | "error">("idle");
  const prescriptive = aiPrescriptive ?? machine?.prescriptiveMaintenance;
  const status = getMachineStatus(machine);
  const liveTimes = Object.values(snapshot ?? {}).map((entry) => entry.time).sort();
  const lastUpdate = liveTimes.length ? new Date(liveTimes[liveTimes.length - 1]) : null;

  const generatePrescriptive = async () => {
    if (!machine) return;
    setAiState("loading");
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    try {
      const indicators = Object.fromEntries(
        Object.keys(machine.indicators ?? {}).map((key) => [
          indicatorLabel(key),
          formatIndicator(key, snapshot?.[key]?.value ?? machine.indicators[key]),
        ])
      );
      const { text } = await generateGeminiText({
        prompt: [
          "You are a maintenance engineer at an aluminium billet casting plant.",
          'Return ONLY JSON: {"whatHappened": string, "why": string, "recommendedAction": string}, each one or two sentences.',
          `Machine: ${machine.title} (${machine.location}). Status: ${status}. Health: ${machine.healthScore}%.`,
          `Live indicators: ${JSON.stringify(indicators)}.`,
          `Active alarms: ${machine.alarms.list.slice(0, machine.alarms.active).join(", ") || "none"}.`,
          `Predictive maintenance: ${JSON.stringify(machine.predictiveMaintenance.slice(0, 4))}.`,
        ].join("\n"),
        signal: controller.signal,
      });
      const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
      if (typeof json?.whatHappened !== "string" || typeof json?.recommendedAction !== "string") {
        throw new Error("Unexpected AI response");
      }
      setAiPrescriptive({
        whatHappened: json.whatHappened,
        why: typeof json.why === "string" ? json.why : "-",
        recommendedAction: json.recommendedAction,
      });
      setAiState("idle");
    } catch (err) {
      console.warn("Prescriptive generation failed", err);
      setAiState("error");
    } finally {
      clearTimeout(timeoutId);
    }
  };

  useEffect(() => {
    let isMounted = true;
    loadMachineById(id).then((result) => {
      if (!isMounted) return;
      setMachine(result);
    });
    return () => {
      isMounted = false;
    };
  }, [id]);

  useEffect(() => {
    if (typeof window === "undefined") {
      hasOpenedRef.current = true;
      setIsOpen(true);
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      hasOpenedRef.current = true;
      setIsOpen(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!hasOpenedRef.current) return;
    if (!isOpen && !hasClosedRef.current) {
      hasClosedRef.current = true;
      try {
        onClose?.();
      } catch (err) {
        console.error("ModelModal onClose handler failed", err);
      }
      const detach = () => unmountModelModal();
      if (typeof window !== "undefined" && window.requestAnimationFrame) {
        window.requestAnimationFrame(detach);
      } else {
        detach();
      }
    }
  }, [isOpen, onClose]);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => setIsOpen(open)}
      modal={false}
    >
      {/* Phone: bottom sheet. ≥ 768 px: docked side panel between the top bar
          and the bottom edge, left of the right icon rail (60 px). */}
      <DialogContent
        ref={contentRef}
        onOpenAutoFocus={(event) => event.preventDefault()}
        style={{ fontFamily: "Roboto, system-ui, -apple-system, sans-serif" }}
        className={`overflow-hidden max-md:inset-x-0 max-md:bottom-0 max-md:left-0 max-md:top-auto max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-b-none max-md:rounded-t-3xl max-md:border-x-0 max-md:border-b-0 border-white/10 bg-[#212121] p-0 text-[#e8eaed] shadow-[0_8px_30px_rgba(0,0,0,0.5)] transition-[width] duration-200 md:left-auto! md:right-[68px]! md:top-[64px]! md:bottom-2 md:max-w-none md:translate-x-0! md:translate-y-0! md:rounded-2xl md:border ${
          expanded
            ? "md:w-[min(900px,calc(100vw-160px))]"
            : "md:w-[min(420px,calc(100vw-160px))]"
        }`}
      >
        <div className="flex h-[88dvh] flex-col md:h-full">
          <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-white/20 md:hidden" />
          <DialogHeader className="flex shrink-0 flex-row items-center gap-3 border-b border-white/10 px-5 py-4">
            {/* Google-style avatar with machine initial */}
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgba(138,180,248,0.16)] text-base font-medium text-[#8ab4f8]">
              {(machine?.title ?? description ?? id)?.charAt(0)?.toUpperCase() ?? "M"}
            </span>
            <span className="min-w-0 flex-1">
              <DialogTitle className="truncate text-base font-medium text-[#e8eaed]">
                {machine?.title ?? description ?? id}
              </DialogTitle>
              <p className="line-clamp-2 text-xs text-[#9aa0a6]">
                {[machine?.machineId, machine?.location]
                  .filter(Boolean)
                  .join(" · ") || "Machine detail"}
              </p>
            </span>
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="hidden shrink-0 rounded-full bg-[rgba(138,180,248,0.12)] px-4 py-1.5 text-xs md:inline-flex font-medium text-[#8ab4f8] transition hover:bg-[rgba(138,180,248,0.2)]"
            >
              {expanded ? "Collapse" : "Expand"}
            </button>
          </DialogHeader>
          <div className="google-scroll min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 sm:py-5">
            {/* --- BAGIAN ATAS (Info & Status) --- */}
            {/* --- MODIFIKASI: Layout grid diubah jadi 1 kolom (tumpuk) --- */}
            <div className="grid grid-cols-1 gap-4">
              {/* --- Kolom Kiri (Hanya Info Mesin) --- */}
              <div className="flex flex-col gap-4">
                {/* --- DIHAPUS: Kartu 3D Preview --- */}

                {/* Kartu Machine Info — Google settings rows */}
                <section className="rounded-2xl bg-white/5 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-sm font-medium text-[#e8eaed]">
                      {machine?.title ?? description ?? id}
                    </h4>
                    {typeof machine?.healthScore === "number" && (
                      <span
                        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${getHealthColorClasses(machine.healthScore).chip}`}
                      >
                        {machine.healthScore}% health
                      </span>
                    )}
                  </div>
                  <dl className="mt-3 divide-y divide-white/5">
                    {[
                      ["Machine ID", machine?.machineId ?? "-"],
                      ["PLC", machine?.PLC ?? "-"],
                      ["Node-RED", machine?.nodeRed ?? "-"],
                      ["Date added", machine?.dateAdded ?? "-"],
                      ["Location", machine?.location ?? "-"],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="flex items-baseline justify-between gap-4 py-2.5"
                      >
                        <dt className="shrink-0">
                          <FieldLabel>{label}</FieldLabel>
                        </dt>
                        <dd className="min-w-0 text-right text-sm text-[#e8eaed] [overflow-wrap:anywhere]">
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              </div>

              {/* --- Kolom Kanan (Indicators & Alarms) --- */}
              <div className="flex flex-col gap-4">
                {/* Kartu Indicators */}
                <section className="rounded-2xl bg-white/5 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="text-sm font-medium text-[#e8eaed]">
                        Live indicators
                      </h4>
                      <p className="mt-0.5 text-[11px] text-[#9aa0a6]">
                        {lastUpdate
                          ? `${feedSource === "live" ? "Live" : "Demo feed"} · updated ${lastUpdate.toLocaleTimeString("en-GB")}`
                          : "Last recorded values"}
                      </p>
                    </div>
                    <StatusChip status={status} />
                  </div>
                  <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3 text-sm">
                    {machine?.indicators ? (
                      Object.entries(machine.indicators).map(([key, value]) => {
                        const live = snapshot?.[key];
                        return (
                          <div
                            key={key}
                            className="min-w-0 rounded-2xl bg-[#2b2b2b] p-4"
                          >
                            <p className="text-xs text-[#9aa0a6]">
                              {indicatorLabel(key)}
                            </p>
                            <p className="mt-1 text-[22px] font-medium leading-7 tabular-nums text-[#e8eaed] [overflow-wrap:anywhere]">
                              {formatIndicator(key, live?.value ?? value)}
                            </p>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-sm text-[#9aa0a6]">
                        No indicator data.
                      </p>
                    )}
                  </div>
                </section>

                {/* Kartu Alarms */}
                <section className="rounded-2xl bg-white/5 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-[#f28b82]" />
                      <h4 className="text-sm font-medium text-[#e8eaed]">
                        {(machine?.title ?? "Machine") + " alarms"}
                      </h4>
                      <span className="text-xs text-[#f28b82]">
                        {machine?.alarms?.active ?? 0} active
                      </span>
                      <span className="text-xs text-[#9aa0a6]">
                        ({machine?.alarms?.total ?? 0} total)
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] text-[#9aa0a6]">
                        Updated {new Date().toLocaleTimeString("en-GB")}
                      </span>
                      <button
                        type="button"
                        className="rounded-full px-3 py-1.5 text-xs font-medium text-[#8ab4f8] transition hover:bg-[rgba(138,180,248,0.12)]"
                      >
                        Show all
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1">
                    {machine?.alarms?.list && machine.alarms.list.length > 0 ? (
                      machine.alarms.list.slice(0, 5).map((alarm, index) => {
                        const isActive =
                          index < (machine?.alarms?.active ?? 0);
                        return (
                          <div
                            key={alarm}
                            className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-white/5"
                          >
                            <span
                              className={`h-2 w-2 shrink-0 rounded-full ${
                                isActive ? "bg-[#81c995]" : "bg-[#5f6368]"
                              }`}
                            />
                            <p className="min-w-0 flex-1 text-sm text-[#e8eaed] [overflow-wrap:anywhere]">
                              {alarm}
                            </p>
                            <span
                              className={`text-[11px] ${
                                isActive
                                  ? "text-[#81c995]"
                                  : "text-[#9aa0a6]"
                              }`}
                            >
                              {isActive ? "Active" : "Cleared"}
                            </span>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-sm text-[#9aa0a6]">
                        No alarms registered.
                      </p>
                    )}
                  </div>
                </section>
              </div>
            </div>

            {/* --- BAGIAN PREDICTIVE MAINTENANCE --- */}
            <section className="rounded-2xl bg-white/5 p-5">
              {/* HEADER SECTION 
    - flex-wrap: Memastikan item kanan (badge/button) bisa turun 
      ke bawah judul di layar yang sangat sempit.
  */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-medium text-[#e8eaed]">
                    Predictive maintenance
                  </h4>
                  <p className="mt-0.5 text-xs text-[#9aa0a6]">
                    {machine?.title ?? id}
                    {maintenanceCount ? (
                      <span className="ml-2">({maintenanceCount} total)</span>
                    ) : null}
                  </p>
                </div>
                {/* ITEM KANAN HEADER
      - flex-wrap: Memastikan tombol "Show All" bisa turun 
        ke bawah Health Score jika keduanya tidak muat berdampingan.
      - justify-end: Memastikan item tetap di kanan saat wrapping.
      - gap-2 sm:gap-4: Mengurangi spasi di layar kecil.
    */}
                <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
                  {typeof machine?.healthScore === "number" && (
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                        getHealthColorClasses(machine.healthScore).chip
                      }`}
                    >
                      {machine.healthScore}% health
                    </span>
                  )}
                  <button
                    type="button"
                    className="rounded-full px-3 py-1.5 text-xs font-medium text-[#8ab4f8] transition hover:bg-[rgba(138,180,248,0.12)]"
                  >
                    Show all
                  </button>
                </div>
              </div>

              {maintenanceCount > 0 ? (
                /* GRID KARTU MAINTENANCE
      - Mengganti "md:grid-cols-2 lg:grid-cols-3" dengan teknik grid responsif
        yang otomatis menyesuaikan jumlah kolom.
      - "auto-fit": Buat kolom sebanyak mungkin.
      - "minmax(250px, 1fr)": Setiap kolom minimal 250px, 
        dan jika ada sisa ruang, bagi rata (1fr).
      - Ini jauh lebih robust daripada breakpoint tetap.
    */
                <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(250px,100%),1fr))] gap-3">
                  {maintenanceItems.map((item) => {
                    const healthColors = getHealthColorClasses(item.health);
                    // Prefer item.thumbnail, fallback to machine.previewImage when available
                    const thumbSrc =
                      item.thumbnail ?? machine?.previewImage ?? null;
                    return (
                      <article
                        key={item.part}
                        className={`flex flex-col justify-between rounded-2xl border bg-[#2b2b2b] p-4 ${healthColors.border}`}
                      >
                        <div>
                          <div className="flex items-start gap-4">
                            {thumbSrc ? (
                              <img
                                src={thumbSrc}
                                alt={`${item.part} thumbnail`}
                                // shrink-0 mencegah gambar penyet saat teks panjang
                                className="h-20 w-20 shrink-0 rounded-2xl bg-white/5 p-1 object-contain"
                                loading="lazy"
                                // fallback to a small inline SVG so user doesn't see the broken image icon
                                onError={(e) => {
                                  const img =
                                    e.currentTarget as HTMLImageElement;
                                  img.onerror = null;
                                  img.src =
                                    "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='80'><rect width='100%' height='100%' fill='%230F172A'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='%23888' font-family='Arial' font-size='14'>No image</text></svg>";
                                }}
                              />
                            ) : (
                              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-white/5 text-center text-[11px] text-[#9aa0a6]">
                                No image
                              </div>
                            )}
                            <div className="flex-1 space-y-1">
                              {/* TEXT OVERFLOW
                    - break-words: Memaksa teks yang sangat panjang 
                      (tanpa spasi) untuk pindah baris agar tidak 
                      merusak layout kartu.
                  */}
                              <p className="text-sm font-medium text-[#e8eaed] wrap-break-word">
                                {item.part}
                              </p>
                              <p className="text-xs text-[#9aa0a6]">
                                Predictive: {item.predictive || "-"}
                              </p>
                              <p className="text-xs text-[#9aa0a6]">
                                Last: {item.last || "-"}
                              </p>
                            </div>
                          </div>
                        </div>
                        {/* FOOTER KARTU
              - flex-wrap: Memizinkan "Health Score" turun 
                ke bawah tombol "Detail" di layar sempit.
              - gap-2: Memberi jarak aman saat wrapping.
            */}
                        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                          <button
                            type="button"
                            className="rounded-full px-3 py-1.5 text-xs font-medium text-[#8ab4f8] transition hover:bg-[rgba(138,180,248,0.12)]"
                          >
                            Detail
                          </button>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-medium ${healthColors.chip}`}
                          >
                            {item.health}% health
                          </span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-4 text-sm text-[#9aa0a6]">
                  No predictive maintenance records available.
                </p>
              )}
            </section>

            {/* --- BAGIAN PRESCRIPTIVE ANALYSIS --- */}
            <section className="rounded-2xl bg-white/5 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-medium text-[#e8eaed]">
                  Prescriptive analysis
                  {aiPrescriptive && (
                    <span className="ml-2 rounded-full bg-[rgba(138,180,248,0.12)] px-2 py-0.5 text-[10px] font-medium text-[#8ab4f8]">
                      Gemma 4
                    </span>
                  )}
                </h4>
                {isGeminiConfigured() && (
                  <button
                    type="button"
                    onClick={() => void generatePrescriptive()}
                    disabled={aiState === "loading" || !machine}
                    className="rounded-full px-3 py-1.5 text-xs font-medium text-[#8ab4f8] transition hover:bg-[rgba(138,180,248,0.12)] disabled:opacity-50"
                  >
                    {aiState === "loading"
                      ? "Generating…"
                      : aiState === "error"
                        ? "Retry with AI"
                        : aiPrescriptive
                          ? "Regenerate"
                          : "Generate with AI"}
                  </button>
                )}
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                {/* What Happened */}
                <article className="rounded-2xl bg-[#2b2b2b] p-4">
                  <h5 className="flex items-center gap-2 text-[13px] font-medium text-[#e8eaed]">
                    <span className="h-2 w-2 rounded-full bg-[#f28b82]" />
                    What happened?
                  </h5>
                  <p className="mt-2.5 text-sm leading-relaxed text-[#bdc1c6]">
                    {prescriptive?.whatHappened ?? "-"}
                  </p>
                </article>

                {/* Why / How It Happened */}
                <article className="rounded-2xl bg-[#2b2b2b] p-4">
                  <h5 className="flex items-center gap-2 text-[13px] font-medium text-[#e8eaed]">
                    <span className="h-2 w-2 rounded-full bg-[#fdd663]" />
                    Why / how it happened?
                  </h5>
                  <p className="mt-2.5 text-sm leading-relaxed text-[#bdc1c6]">
                    {prescriptive?.why ?? "-"}
                  </p>
                </article>
              </div>

              {/* Recommended Action */}
              <article className="mt-3 rounded-2xl bg-[rgba(138,180,248,0.08)] p-4">
                <h5 className="text-[13px] font-medium text-[#8ab4f8]">
                  Recommended action
                </h5>
                <p className="mt-2.5 whitespace-pre-line text-sm leading-relaxed text-[#e8eaed]">
                  {prescriptive?.recommendedAction ?? "-"}
                </p>
              </article>
            </section>
          </div>
          <DialogFooter className="shrink-0 border-t border-white/10 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:py-4">
            <DialogClose asChild>
              <button
                type="button"
                className="rounded-full bg-[#8ab4f8] px-5 py-2 text-sm font-medium text-[#062e6f] transition hover:bg-[#aecbfa]"
              >
                Close
              </button>
            </DialogClose>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

export function mountModelModal(options: ModelModalOptions) {
  if (typeof document === "undefined") return;

  if (!container) {
    container = document.createElement("div");
    container.id = "model-modal-root";
    document.body.appendChild(container);
  }

  if (!root) {
    root = createRoot(container);
  }

  root.render(<ModelModal {...options} />);
}

export function unmountModelModal() {
  if (root) {
    root.unmount();
    root = null;
  }
  if (container) {
    container.remove();
    container = null;
  }
}

export type { ModelModalOptions };
