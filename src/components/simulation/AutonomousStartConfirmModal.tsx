"use client";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type Props = {
  isOpen: boolean;
  onConfirmAction: () => void;
  onCloseAction: () => void;
};

export default function AutonomousStartConfirmModal({
  isOpen,
  onConfirmAction,
  onCloseAction,
}: Props) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCloseAction()}>
      <DialogContent
        style={{ fontFamily: "Roboto, system-ui, -apple-system, sans-serif" }}
        className="rounded-[28px] border border-white/10 bg-[#212121] p-6 text-[#e8eaed] shadow-[0_8px_30px_rgba(0,0,0,0.5)] sm:max-w-md"
      >
        <DialogHeader className="space-y-1.5 text-left">
          <DialogTitle className="text-lg font-medium text-[#e8eaed]">
            Start Autonomous Mode?
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-[#9aa0a6]">
            Minerva will run the line autonomously using the current data
            accuracy, then compare the simulated result with real sensor
            data. Start now?
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="mt-6">
          <div className="flex w-full justify-end gap-1">
            <button
              type="button"
              onClick={onCloseAction}
              className="rounded-full px-4 py-2 text-sm font-medium text-[#8ab4f8] transition hover:bg-[rgba(138,180,248,0.12)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirmAction}
              className="rounded-full bg-[#8ab4f8] px-5 py-2 text-sm font-medium text-[#062e6f] transition hover:bg-[#aecbfa]"
            >
              Start Autonomous
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
