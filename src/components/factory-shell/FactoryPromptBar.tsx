"use client";

import { useEffect, useState } from "react";
import { Mic, Search, Send } from "lucide-react";
import {
  AskAiChatPanel,
  SuggestedQuestionChips,
  useAskAiChat,
} from "@/components/AskAiChat";
import BottomBar from "@/components/bottom-bar";
import { useSimulation } from "@/components/simulation/SimulationProvider";
import { cn } from "@/lib/utils";

export default function FactoryPromptBar() {
  const [value, setValue] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const chat = useAskAiChat();
  const { isSimulationMode } = useSimulation();
  // Client-only capability check (after hydration) to avoid SSR mismatch:
  // `window` does not exist during prerender.
  const [voiceSupported, setVoiceSupported] = useState(false);
  useEffect(() => {
    setVoiceSupported(
      "webkitSpeechRecognition" in window || "SpeechRecognition" in window
    );
  }, []);

  // Global opener (top bar / left rail): open the anchored panel and send the
  // question if one was passed, without an overlay.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ question?: string }>).detail;
      setChatOpen(true);
      if (typeof detail?.question === "string" && detail.question.trim()) {
        void chat.ask(detail.question);
      }
    };
    window.addEventListener("__openAskAi", handler as EventListener);
    return () => window.removeEventListener("__openAskAi", handler as EventListener);
  }, [chat.ask]);

  const submit = () => {
    const q = value.trim();
    if (!q) return;
    setChatOpen(true);
    void chat.ask(q);
    setValue("");
  };

  return (
    <div className="pointer-events-none absolute bottom-3 left-0 right-0 z-20 flex justify-center px-3 transition-[right] duration-200 sm:bottom-6 sm:px-4 md:right-[max(var(--detail-panel-w,0px),var(--rail-panel-w,0px))]">
      <div className="pointer-events-auto flex w-full max-w-3xl flex-col gap-2">
        {/* Kept mounted (its dialogs must survive) but hidden while chatting,
            so it doesn't float over the middle of the 3D view. */}
        <div className={cn("flex w-full justify-center", chatOpen && !isSimulationMode && "hidden")}>
          <BottomBar embedded />
        </div>
        {chatOpen && (
          <AskAiChatPanel chat={chat} onClose={() => setChatOpen(false)} />
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex w-full items-center gap-1 rounded-full border border-[#3c4043] bg-[#303134] py-1.5 pl-4 pr-1.5 shadow-2xl sm:py-2 sm:pr-2"
        >
          <span className="shrink-0 text-[#9aa0a6]">
            <Search className="h-[18px] w-[18px]" />
          </span>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setChatOpen(true)}
            placeholder="Ask Minerva AI about the factory…"
            aria-label="Ask Minerva AI about the factory"
            className="min-w-0 flex-1 bg-transparent text-base text-[#e8eaed] sm:text-[15px] placeholder:text-[#9aa0a6] focus:outline-none"
          />
          <button
            type="button"
            title={voiceSupported ? "Voice search" : "Voice input not supported in this browser"}
            aria-label="Voice search"
            disabled={!voiceSupported}
            onClick={() => setChatOpen(true)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#8ab4f8] transition-all hover:scale-105 hover:bg-[rgba(138,180,248,0.1)] disabled:opacity-40 disabled:hover:scale-100 disabled:hover:bg-transparent"
          >
            <Mic className="h-[18px] w-[18px]" />
          </button>
          <button
            type="submit"
            title="Ask AI"
            aria-label="Ask AI"
            disabled={!value.trim()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#a8c8ff] text-[#202124] transition-all hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
        {chat.messages.length === 0 && (
          <SuggestedQuestionChips
            disabled={chat.isLoading}
            onPick={(question) => {
              setChatOpen(true);
              void chat.ask(question);
            }}
          />
        )}
      </div>
    </div>
  );
}
