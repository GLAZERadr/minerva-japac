"use client";

import { useEffect, useState, type SVGProps } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AskAiChatPanel, useAskAiChat } from "@/components/AskAiChat";
import { cn } from "@/lib/utils";

const SparklesIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    role="img"
    aria-hidden="true"
    focusable="false"
    {...props}
  >
    <path
      d="m12 3 1.3 3.5L17 8l-3.7 1.5L12 13l-1.3-3.5L7 8l3.7-1.5L12 3Zm7 8 0.9 2.4 2.1 0.8-2.1 0.9L19 17l-0.9-2.3L16 14l2.1-0.8L19 11Zm-14 0 0.9 2.4 2.1 0.8-2.1 0.9L5 17l-0.9-2.3L2 14l2.1-0.8L5 11Z"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </svg>
);

export function AskAiButton({ className, hideTrigger }: { className?: string; hideTrigger?: boolean }) {
  const [open, setOpen] = useState(false);
  const chat = useAskAiChat();

  // External opener: dispatch `window.__openAskAi` with `{ question? }`.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ question?: string }>).detail;
      setOpen(true);
      if (typeof detail?.question === "string" && detail.question.trim()) {
        void chat.ask(detail.question);
      }
    };
    window.addEventListener("__openAskAi", handler as EventListener);
    return () => window.removeEventListener("__openAskAi", handler as EventListener);
  }, [chat.ask]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="lg"
            className={cn(
              "min-w-[120px] items-center gap-2 text-sm font-semibold tracking-wide",
              className
            )}
          >
            <SparklesIcon className="h-4 w-4" />
            Ask AI
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="gap-0 border-white/10 bg-transparent p-0 shadow-none sm:max-w-2xl">
        <DialogTitle className="sr-only">Ask AI</DialogTitle>
        <DialogDescription className="sr-only">
          Ask about machine performance. Minerva builds a Flux query and
          answers from the InfluxDB plant data.
        </DialogDescription>
        <AskAiChatPanel chat={chat} onClose={() => setOpen(false)} showComposer />
      </DialogContent>
    </Dialog>
  );
}
