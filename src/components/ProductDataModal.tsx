"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@heroui/react";
import { createProduct, type ProductDataRow, type ProductSource } from "@/lib/products";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ProductDataResponse = ProductDataRow & { source?: ProductSource };

type ProductDataModalProps = {
  isOpen: boolean;
  // name with Action suffix so Next.js client serialization accepts it
  onCloseAction: () => void;
  onSuccess?: (payload: ProductDataResponse) => void;
};

export default function ProductDataModal({
  isOpen,
  onCloseAction,
  onSuccess,
}: ProductDataModalProps) {
  const [lotNumber, setLotNumber] = useState("");
  const [isSubmitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = lotNumber.trim().length > 0;

  const resetForm = useCallback(() => {
    setLotNumber("");
    setError(null);
    setSubmitting(false);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || isSubmitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const result = await createProduct(lotNumber.trim());
      const json: ProductDataResponse = { ...result.data, source: result.source };
      onSuccess?.(json);
      resetForm();
      onCloseAction();
    } catch (err) {
      console.error("Failed to submit product data", err);
      setError(
        err instanceof Error ? err.message : "Could not save the product data."
      );
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, isSubmitting, lotNumber, onCloseAction, onSuccess, resetForm]);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onCloseAction();
        }
      }}
    >
      <DialogContent
        style={{ fontFamily: "Roboto, system-ui, -apple-system, sans-serif" }}
        className="flex max-h-[90dvh] w-[calc(100vw-1.5rem)] max-w-lg flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#212121] p-0 text-[#e8eaed] shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
      >
        <DialogHeader className="border-b border-white/10 px-6 py-5">
          <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#9aa0a6]">
            Add product data
          </span>
          <DialogTitle className="mt-1 text-xl font-medium text-[#e8eaed]">
            Register a production lot
          </DialogTitle>
          <DialogDescription className="mt-1 text-xs text-[#9aa0a6]">
            Enter a lot number; the system fills in the rest of the lot data
            automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="google-scroll flex-1 space-y-6 overflow-y-auto px-6 py-6">
          <section className="space-y-3">
            <div className="space-y-2">
              <label
                htmlFor="lot-number"
                className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#9aa0a6]"
              >
                Lot number<span className="ml-2 text-[#f28b82]">*</span>
              </label>
              <Input
                id="lot-number"
                required
                placeholder="e.g. LOT-6061-0419"
                value={lotNumber}
                onChange={(event) => setLotNumber(event.target.value)}
                className="border-white/10 bg-[#2b2b2b] text-[#e8eaed] placeholder:text-[#5f6368] focus-visible:ring-[#8ab4f8] focus-visible:ring-offset-[#212121]"
              />
            </div>
            <p className="text-xs text-[#9aa0a6]">
              Machine, performance and sensor metrics are attached to this lot
              as it moves through the line.
            </p>
          </section>

          {error && (
            <p className="rounded-2xl border border-[rgba(242,139,130,0.35)] bg-[rgba(242,139,130,0.12)] px-4 py-3 text-sm text-[#f28b82]">
              {error}
            </p>
          )}
        </div>
        <DialogFooter className="border-t border-white/10 px-6 py-4">
          <Button
            variant="flat"
            className="rounded-full bg-white/8 px-5 text-[#e8eaed]"
            onPress={onCloseAction}
            isDisabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            color="primary"
            className="rounded-full bg-[#8ab4f8] px-5 font-medium text-[#062e6f]"
            onPress={handleSubmit}
            isLoading={isSubmitting}
            isDisabled={!canSubmit}
          >
            Save lot
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
