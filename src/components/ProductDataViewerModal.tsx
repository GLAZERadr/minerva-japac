"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { checkBackend } from "@/lib/backend";
import {
  acknowledgeProduct,
  deleteProduct,
  listProducts,
  subscribeProducts,
  type ProductDataRow,
  type ProductSource,
} from "@/lib/products";
import { formatIndicator, indicatorLabel } from "@/lib/machine-display";
import ProductDataModal from "@/components/ProductDataModal";

export type { ProductDataRow } from "@/lib/products";

type ProductDataViewerModalProps = {
  isOpen: boolean;
  // name the prop with an Action suffix so it's recognized as an action by the
  // Next.js client serialization rule. Callers should pass `onCloseAction`.
  onCloseAction: () => void;
};

const statusVisuals: Record<string, string> = {
  completed: "bg-emerald-500/20 text-emerald-300 ring-1 ring-inset ring-emerald-400/40",
  finish: "bg-emerald-500/20 text-emerald-300 ring-1 ring-inset ring-emerald-400/40",
  processing: "bg-amber-500/20 text-amber-200 ring-1 ring-inset ring-amber-400/40",
  process: "bg-amber-500/20 text-amber-200 ring-1 ring-inset ring-amber-400/40",
  default: "bg-slate-700/40 text-slate-200 ring-1 ring-inset ring-slate-600/60",
};

const formatDateTime = (value?: string) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatNumber = (value?: number | string | null, fractionDigits = 2) => {
  if (value === null || typeof value === "undefined") return "-";
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: fractionDigits }).format(numeric);
};

function findAverage(averages: ProductDataRow["averages"], ...needles: string[]) {
  const entries = Object.entries(averages ?? {});
  const hit = entries.find(([key]) => needles.some((n) => key.toLowerCase().includes(n)));
  return hit ? { key: hit[0], value: hit[1] } : null;
}

function summarize(product: ProductDataRow | undefined) {
  const energy = findAverage(product?.averages, "energy");
  const temp = findAverage(product?.averages, "temp");
  return {
    operationHour:
      product?.operationHour !== null && typeof product?.operationHour !== "undefined"
        ? `${formatNumber(product.operationHour, 2)} h`
        : "-",
    energy: energy ? `${formatNumber(energy.value, 1)} kWh` : "-",
    temperature: temp ? `${formatNumber(temp.value, 1)} °C` : "-",
  };
}

export default function ProductDataViewerModal({
  isOpen,
  onCloseAction,
}: ProductDataViewerModalProps) {
  const [products, setProducts] = useState<ProductDataRow[]>([]);
  const [source, setSource] = useState<ProductSource | null>(null);
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingLot, setPendingLot] = useState<string | null>(null);
  const [showConclusionModal, setShowConclusionModal] = useState(false);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [isSubmittingConclusion, setSubmittingConclusion] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deletingLot, setDeletingLot] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const loadProducts = useCallback(async (forceProbe = false) => {
    setLoading(true);
    setError(null);
    try {
      if (forceProbe) await checkBackend(true);
      const result = await listProducts();
      setProducts(result.data);
      setSource(result.source);

      // A completed lot that nobody acknowledged yet: ask for a conclusion.
      const pending = result.data.find(
        (p) => ["completed", "finish"].includes((p.status ?? "").toLowerCase()) && !p.isConclusion
      );
      if (pending) {
        setPendingLot(pending.lot);
        setShowConclusionModal(true);
        setShowValidationModal(true);
      } else {
        setPendingLot(null);
        setShowConclusionModal(false);
      }
    } catch (err) {
      console.error("Failed to load product data", err);
      setError(err instanceof Error ? err.message : "Could not load product data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setError(null);
      return;
    }
    void loadProducts();
  }, [isOpen, loadProducts]);

  // Cloud Firestore: keep the table in sync while it's open (other viewers'
  // new lots, acknowledgements and deletes appear without a refresh).
  useEffect(() => {
    if (!isOpen || source !== "firestore") return;
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;
    void subscribeProducts(setProducts).then((stop) => {
      if (cancelled) stop?.();
      else unsubscribe = stop;
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [isOpen, source]);

  const acknowledgePending = useCallback(async () => {
    if (!pendingLot) return;
    const product = products.find((p) => p.lot === pendingLot);
    const summary = summarize(product);
    const conclusion = `Operation time: ${summary.operationHour}; Energy usage: ${summary.energy}; Avg temperature: ${summary.temperature}`;
    setSubmittingConclusion(true);
    setActionError(null);
    try {
      await acknowledgeProduct(pendingLot, conclusion);
      setShowConclusionModal(false);
      setShowValidationModal(false);
      setPendingLot(null);
      await loadProducts();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not save the conclusion.");
    } finally {
      setSubmittingConclusion(false);
    }
  }, [loadProducts, pendingLot, products]);

  const deleteLot = useCallback(
    async (lot: string) => {
      if (!lot) return;
      if (!confirm(`Delete lot ${lot}? This cannot be undone.`)) return;
      setDeletingLot(lot);
      try {
        await deleteProduct(lot);
        await loadProducts();
      } catch (err) {
        console.error("Failed to delete lot", err);
        alert(err instanceof Error ? err.message : "Could not delete the lot.");
      } finally {
        setDeletingLot(null);
      }
    },
    [loadProducts]
  );

  const sortedProducts = useMemo(
    () =>
      [...products].sort((a, b) => {
        const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return bTime - aTime;
      }),
    [products]
  );

  const pendingProduct = products.find((p) => p.lot === pendingLot);
  const pendingSummary = summarize(pendingProduct);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onCloseAction?.()}>
        <DialogContent className="flex max-h-[min(90dvh,900px)] w-[calc(100vw-1.5rem)] max-w-5xl flex-col overflow-hidden border border-slate-800 bg-slate-950/95 p-0 text-slate-100">
          <DialogHeader className="border-b border-slate-800 px-4 py-4 sm:px-6 sm:py-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                Product Data
              </span>
              {source === "mock" && (
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-amber-200">
                  Demo data · offline
                </span>
              )}
              {source === "firestore" && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-emerald-200">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />
                  Cloud Firestore · live sync
                </span>
              )}
            </div>
            <DialogTitle className="text-xl font-semibold text-white">Production lots</DialogTitle>
            <DialogDescription className="text-sm text-slate-400">
              {source === "live"
                ? "Lot records from the MES database (Go API, MySQL)."
                : source === "firestore"
                  ? "Lot records stored in Cloud Firestore, updated live across viewers."
                  : "Lot records for this production line."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 py-4 sm:px-6 sm:py-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-slate-400">
                {isLoading ? "Loading product data…" : `${sortedProducts.length} lots`}
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => setAddOpen(true)}>
                  Add lot
                </Button>
                <Button variant="outline" size="sm" onClick={() => void loadProducts(true)} disabled={isLoading}>
                  {isLoading ? "Loading…" : "Refresh"}
                </Button>
              </div>
            </div>

            {error && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                <span className="min-w-0 flex-1">{error}</span>
                <Button size="sm" variant="outline" onClick={() => void loadProducts(true)} disabled={isLoading}>
                  Retry
                </Button>
              </div>
            )}

            <div className="relative min-h-[200px] flex-1 overflow-auto rounded-2xl border border-slate-800/80 bg-slate-900/60">
              {sortedProducts.length === 0 && !isLoading ? (
                <div className="flex h-full items-center justify-center p-10 text-sm text-slate-400">
                  {error ? "Nothing to show." : "No lots yet."}
                </div>
              ) : (
                <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
                  <thead className="sticky top-0 z-20">
                    <tr className="text-left text-xs uppercase tracking-[0.18em] text-slate-400">
                      {[
                        "Lot",
                        "Status",
                        "Active machine",
                        "Operation time",
                        "Good",
                        "Defects",
                        "Conclusion",
                        "Sensor averages",
                        "Last update",
                        "Actions",
                      ].map((label, index) => (
                        <th
                          key={label}
                          className={`whitespace-nowrap border-b border-slate-800 bg-slate-900 px-4 py-3 font-semibold ${
                            index === 0 ? "sticky left-0 z-30 border-r" : ""
                          }`}
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedProducts.map((product) => {
                      const status = product.status?.toLowerCase() ?? "default";
                      const badgeClass = statusVisuals[status] ?? statusVisuals.default;
                      const averageEntries = Object.entries(product.averages ?? {});
                      return (
                        <tr
                          key={`${product.lot}-${product.updatedAt ?? "na"}`}
                          className="group text-slate-200"
                        >
                          <td className="sticky left-0 z-10 whitespace-nowrap border-b border-r border-slate-800/80 bg-slate-950 px-4 py-3 font-semibold text-white group-hover:bg-slate-900">
                            {product.lot ?? "-"}
                          </td>
                          <td className="border-b border-slate-800/80 px-4 py-3 group-hover:bg-slate-800/40">
                            <span className={`inline-flex items-center whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold capitalize ${badgeClass}`}>
                              {product.status ?? "-"}
                            </span>
                          </td>
                          <td className="whitespace-nowrap border-b border-slate-800/80 px-4 py-3 text-slate-300 group-hover:bg-slate-800/40">
                            {product.activeMachineId ?? "-"}
                          </td>
                          <td className="whitespace-nowrap border-b border-slate-800/80 px-4 py-3 text-slate-300 group-hover:bg-slate-800/40">
                            {typeof product.operationHour === "number"
                              ? `${formatNumber(product.operationHour)} h`
                              : product.operationHour ?? "-"}
                          </td>
                          <td className="border-b border-slate-800/80 px-4 py-3 text-emerald-300 group-hover:bg-slate-800/40">
                            {formatNumber(product.goodProduct, 0)}
                          </td>
                          <td className="border-b border-slate-800/80 px-4 py-3 text-rose-300 group-hover:bg-slate-800/40">
                            {formatNumber(product.defectProduct, 0)}
                          </td>
                          <td className="min-w-[220px] max-w-[320px] border-b border-slate-800/80 px-4 py-3 group-hover:bg-slate-800/40">
                            {product.conclusion?.trim() ? (
                              <span
                                title={product.conclusion}
                                className="line-clamp-2 text-xs leading-relaxed text-slate-300"
                              >
                                {product.conclusion}
                              </span>
                            ) : (
                              <span className="text-slate-500">-</span>
                            )}
                          </td>
                          <td className="min-w-[240px] border-b border-slate-800/80 px-4 py-3 group-hover:bg-slate-800/40">
                            {averageEntries.length ? (
                              <div className="flex flex-wrap gap-1">
                                {averageEntries.map(([key, value]) => (
                                  <Badge
                                    key={`${product.lot}-${key}`}
                                    variant="secondary"
                                    className="whitespace-nowrap rounded-full bg-slate-800/80 px-2 py-1 text-[11px] font-medium text-slate-200"
                                  >
                                    {indicatorLabel(key)}: {key.includes("energy") ? `${formatNumber(value, 1)} kWh` : formatIndicator(key, value)}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap border-b border-slate-800/80 px-4 py-3 text-slate-400 group-hover:bg-slate-800/40">
                            {formatDateTime(product.updatedAt)}
                          </td>
                          <td className="border-b border-slate-800/80 px-4 py-3 group-hover:bg-slate-800/40">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void deleteLot(product.lot)}
                              disabled={deletingLot === product.lot || isLoading}
                            >
                              {deletingLot === product.lot ? "Deleting…" : "Delete"}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
          <DialogFooter className="border-t border-slate-800 px-4 py-3 sm:px-6 sm:py-4">
            <Button variant="ghost" onClick={() => onCloseAction?.()} className="px-4">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProductDataModal
        isOpen={addOpen}
        onCloseAction={() => setAddOpen(false)}
        onSuccess={() => void loadProducts()}
      />

      {/* Validation: confirm the lot's numbers before acknowledging it. */}
      <Dialog open={showValidationModal} onOpenChange={(open) => !open && setShowValidationModal(false)}>
        <DialogContent className="flex max-h-[90dvh] w-[calc(100vw-1.5rem)] max-w-lg flex-col overflow-hidden border border-slate-800 bg-slate-900 p-0 text-white">
          <DialogHeader className="border-b border-slate-800 px-6 py-5">
            <span className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">Validate data</span>
            <DialogTitle className="text-lg font-semibold text-white">Lot {pendingLot}</DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Check the summary for this lot. Mark it correct if every value looks right, or incorrect if
              something does not match.
            </DialogDescription>
          </DialogHeader>
          <div className="google-scroll min-h-0 flex-1 overflow-y-auto px-6 py-6">
            <dl className="grid grid-cols-2 gap-4 text-sm text-slate-200">
              {[
                ["Operation time", pendingSummary.operationHour, ""],
                ["Good products", formatNumber(pendingProduct?.goodProduct, 0), "text-emerald-300"],
                ["Defects", formatNumber(pendingProduct?.defectProduct, 0), "text-rose-300"],
                ["Energy usage", pendingSummary.energy, ""],
                ["Avg temperature", pendingSummary.temperature, ""],
              ].map(([label, value, tone]) => (
                <div key={label}>
                  <dt className="text-xs text-slate-400">{label}</dt>
                  <dd className={`mt-1 text-lg font-semibold ${tone}`}>{value}</dd>
                </div>
              ))}
            </dl>
            {pendingProduct?.conclusion && (
              <p className="mt-4 text-sm text-slate-300">{pendingProduct.conclusion}</p>
            )}
          </div>
          <DialogFooter className="border-t border-slate-800 px-6 py-4">
            <Button variant="outline" className="bg-slate-800/60 text-slate-200" onClick={() => setShowValidationModal(false)}>
              Close
            </Button>
            <Button
              variant="outline"
              className="bg-rose-700 text-white"
              onClick={() => {
                setShowValidationModal(false);
                alert("Marked as incorrect. Please correct the source data or contact an administrator.");
              }}
            >
              Data incorrect
            </Button>
            <Button
              variant="outline"
              className="bg-blue-500 text-white"
              onClick={() => void acknowledgePending()}
              disabled={isSubmittingConclusion}
            >
              {isSubmittingConclusion ? "Validating…" : "Data correct"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Conclusion: acknowledge a completed lot once. */}
      <Dialog
        open={showConclusionModal && !showValidationModal}
        onOpenChange={(open) => {
          if (!open) setShowConclusionModal(false);
        }}
      >
        <DialogContent className="flex max-h-[90dvh] w-[calc(100vw-1.5rem)] max-w-lg flex-col overflow-hidden border border-slate-800 bg-slate-900 p-0 text-white">
          <DialogHeader className="border-b border-slate-800 px-6 py-5">
            <span className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">Lot conclusion</span>
            <DialogTitle className="text-lg font-semibold text-white">Lot {pendingLot}</DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Acknowledge this completed lot. Once saved, it will not ask again.
            </DialogDescription>
          </DialogHeader>
          <div className="google-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-6 text-sm text-slate-200">
            <div>
              <div className="text-xs text-slate-400">Operation time</div>
              <div className="mt-1 text-lg font-semibold">{pendingSummary.operationHour}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Energy usage</div>
              <div className="mt-1 text-lg font-semibold">{pendingSummary.energy}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Average temperature</div>
              <div className="mt-1 text-lg font-semibold">{pendingSummary.temperature}</div>
            </div>
            <p className="text-xs text-slate-500">
              Values are the lot&apos;s sensor averages and its latest recorded operation time.
            </p>
            {actionError && <p className="text-xs text-rose-300">{actionError}</p>}
          </div>
          <DialogFooter className="border-t border-slate-800 px-6 py-4">
            <Button
              variant="outline"
              className="bg-slate-800/60 text-slate-200"
              onClick={() => setShowConclusionModal(false)}
              disabled={isSubmittingConclusion}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              className="bg-blue-500 text-white"
              onClick={() => void acknowledgePending()}
              disabled={!pendingLot || isSubmittingConclusion}
            >
              {isSubmittingConclusion ? "Saving…" : "Acknowledge"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
