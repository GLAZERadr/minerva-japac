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
import type { MachineDetails } from "@/lib/machines";
import { loadMachineById } from "@/lib/machines";

// --- Google-dark (Material You) health tones ---
/**
 * Health-score colors in the Google dark palette, matching the rest of the
 * factory shell (#81c995 green, #fdd663 yellow, #f28b82 red).
 * @param health - Skor kesehatan (0-100)
 */
const getHealthColorClasses = (health: number) => {
  // 20% = Merah
  if (health <= 20) {
    return {
      softBg: "bg-[rgba(242,139,130,0.12)]",
      text: "text-[#f28b82]",
      border: "border-[rgba(242,139,130,0.35)]",
      chip: "bg-[#f28b82] text-[#601410]",
    };
  }
  // 43%, 55% = Kuning
  if (health <= 55) {
    return {
      softBg: "bg-[rgba(253,214,99,0.12)]",
      text: "text-[#fdd663]",
      border: "border-[rgba(253,214,99,0.35)]",
      chip: "bg-[#fdd663] text-[#3c2e00]",
    };
  }
  // 68%, 76%, 90% = Hijau
  return {
    softBg: "bg-[rgba(129,201,149,0.12)]",
    text: "text-[#81c995]",
    border: "border-[rgba(129,201,149,0.35)]",
    chip: "bg-[#81c995] text-[#0e3b21]",
  };
};

// Google-dark status chip (filled tonal pill, Material 3).
function StatusChip({ trouble }: { trouble: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
        trouble
          ? "bg-[rgba(242,139,130,0.16)] text-[#f28b82]"
          : "bg-[rgba(129,201,149,0.16)] text-[#81c995]"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${trouble ? "bg-[#f28b82]" : "bg-[#81c995]"}`}
      />
      {trouble ? "Trouble" : "Normal"}
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

  const maintenanceItems = machine?.predictiveMaintenance ?? [];
  const maintenanceCount = maintenanceItems.length;
  const prescriptive = machine?.prescriptiveMaintenance;

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
      {/* --- MODIFIKASI: Lebar diubah menjadi 30vw (responsif) --- */}
      <DialogContent
        style={{ fontFamily: "Roboto, system-ui, -apple-system, sans-serif" }}
        className={`max-h-[90vh] w-[92vw] min-w-[320px] overflow-hidden border-white/10 bg-[#212121] p-0 text-[#e8eaed] shadow-[0_8px_30px_rgba(0,0,0,0.5)] transition-[width] duration-200 md:top-1/2 md:translate-x-0! md:-translate-y-1/2 ${
          expanded
            ? "md:w-[64vw] lg:w-[60vw] xl:w-[56vw] md:left-auto! md:right-10! md:rounded-3xl md:border"
            : "md:w-[28vw] md:left-auto! md:right-6! md:rounded-l-3xl md:rounded-r-none md:border-y md:border-l"
        }`}
      >
        <div className="flex max-h-[90vh] flex-col">
          <DialogHeader className="flex flex-row items-center gap-3 border-b border-white/10 px-5 py-4">
            {/* Google-style avatar with machine initial */}
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgba(138,180,248,0.16)] text-base font-medium text-[#8ab4f8]">
              {(machine?.title ?? description ?? id)?.charAt(0)?.toUpperCase() ?? "M"}
            </span>
            <span className="min-w-0 flex-1">
              <DialogTitle className="truncate text-base font-medium text-[#e8eaed]">
                {machine?.title ?? description ?? id}
              </DialogTitle>
              <p className="truncate text-xs text-[#9aa0a6]">
                {[machine?.machineId, machine?.location]
                  .filter(Boolean)
                  .join(" · ") || "Machine detail"}
              </p>
            </span>
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="shrink-0 rounded-full bg-[rgba(138,180,248,0.12)] px-4 py-1.5 text-xs font-medium text-[#8ab4f8] transition hover:bg-[rgba(138,180,248,0.2)]"
            >
              {expanded ? "Collapse" : "Expand"}
            </button>
          </DialogHeader>
          <div className="google-scroll flex-1 space-y-4 overflow-y-auto px-5 py-5">
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
                        <dt>
                          <FieldLabel>{label}</FieldLabel>
                        </dt>
                        <dd className="truncate text-sm text-[#e8eaed]">
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
                    <h4 className="text-sm font-medium text-[#e8eaed]">
                      Live indicators
                    </h4>
                    <StatusChip
                      trouble={(machine?.alarms?.active ?? 0) > 0}
                    />
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
                    {machine?.indicators ? (
                      Object.entries(machine.indicators).map(([key, value]) => (
                        <div
                          key={key}
                          className="rounded-2xl bg-[#2b2b2b] p-4"
                        >
                          <p className="truncate text-xs text-[#9aa0a6]">
                            {key}
                          </p>
                          <p className="mt-1 text-[22px] font-medium leading-7 text-[#e8eaed]">
                            {value ?? "-"}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="col-span-3 text-sm text-[#9aa0a6]">
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
                        Updated {new Date().toLocaleTimeString()}
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
                            <p className="flex-1 truncate text-sm text-[#e8eaed]">
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
                <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-3">
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
              <h4 className="text-sm font-medium text-[#e8eaed]">
                Prescriptive analysis
              </h4>

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
          <DialogFooter className="border-t border-white/10 px-5 py-4">
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
