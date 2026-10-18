"use client";

import {
  useCallback,
  useState,
  type FormEvent,
} from "react";
import ReactMarkdown from "react-markdown";
import { apiUrl } from "@/lib/api";
import {
  DATA_MODE,
  canUseMockFallback,
  checkBackend,
  fetchWithTimeout,
  markBackendOffline,
} from "@/lib/backend";
import { SUGGESTED_QUESTIONS, answerFromDemoData } from "@/lib/demo-answers";
import {
  FACTORY_FUNCTIONS,
  FACTORY_SYSTEM_INSTRUCTION,
  friendlyGeminiError,
  isGeminiConfigured,
  streamChatWithGeminiFunctions,
} from "@/lib/gemini";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowUp,
  ChevronDown,
  Copy,
  Mic,
  Plus,
  RotateCcw,
} from "lucide-react";

const MARKDOWN_CLASSES = [
  "max-w-full text-[15px] leading-relaxed text-neutral-200 [overflow-wrap:anywhere]",
  "[&_p]:mt-2 [&_p:first-child]:mt-0 [&_strong]:font-semibold [&_strong]:text-white",
  "[&_ul]:mt-2 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_ol]:mt-2 [&_ol]:list-decimal [&_ol]:pl-5",
  "[&_h1]:mt-3 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mt-3 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:font-semibold",
  "[&_code]:rounded [&_code]:bg-white/10 [&_code]:px-1 [&_code]:text-xs [&_pre]:mt-2 [&_pre]:overflow-auto [&_pre]:rounded-md [&_pre]:bg-black/50 [&_pre]:p-3",
  "[&_a]:text-blue-300 [&_a]:underline",
].join(" ");

export type ChatSource = "live" | "gemma" | "demo";

export type ChatMsg = {
  id: number;
  role: "user" | "assistant";
  content: string;
  fluxQuery?: string | null;
  rawData?: string | null;
  source?: ChatSource;
};

const BACKEND_TIMEOUT_MS = 8000;
const GEMMA_TIMEOUT_MS = 15000;

const SOURCE_LABEL: Record<ChatSource, string> = {
  live: "Live data · InfluxDB",
  gemma: "Gemma 4",
  demo: "Demo data",
};

export function useAskAiChat() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastQuestion, setLastQuestion] = useState<string | null>(null);

  const reset = useCallback(() => {
    setMessages([]);
    setError(null);
    setIsLoading(false);
    setLastQuestion(null);
  }, []);

  const run = useCallback(async (trimmed: string) => {
    setIsLoading(true);
    setError(null);
    setLastQuestion(trimmed);
    let nextId = Date.now() + 1;
    const pushAssistant = (content: string, source: ChatSource, extra: Partial<ChatMsg> = {}) => {
      const id = nextId++;
      setMessages((prev) => [...prev, { id, role: "assistant", content, source, ...extra }]);
      return id;
    };
    const failures: string[] = [];

    try {
      // 1) Backend workflow: natural language → Flux query → analysed answer.
      if (DATA_MODE !== "mock" && (await checkBackend()) === "online") {
        try {
          const response = await fetchWithTimeout(
            apiUrl("/api/chatbot/query"),
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ question: trimmed }),
            },
            BACKEND_TIMEOUT_MS
          );
          const payload = await response.json().catch(() => null);
          if (!response.ok) {
            throw new Error(
              typeof payload?.error === "string" ? payload.error : "The backend could not process the question."
            );
          }
          const answerText = typeof payload?.answer === "string" ? payload.answer.trim() : "";
          const flux = typeof payload?.fluxQuery === "string" ? payload.fluxQuery.trim() : "";
          const dataText = typeof payload?.data === "string" ? payload.data.trim() : "";
          pushAssistant(answerText || "(No answer)", "live", {
            fluxQuery: flux || null,
            rawData: dataText || null,
          });
          return;
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") {
            failures.push(`backend timed out (${BACKEND_TIMEOUT_MS / 1000} s)`);
          } else {
            failures.push(err instanceof Error ? err.message : "backend failed");
          }
          markBackendOffline();
        }
      } else if (DATA_MODE !== "mock") {
        failures.push("backend offline");
      }

      // 2) Gemma 4 via Google AI Studio, with native factory function calling.
      if (isGeminiConfigured()) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), GEMMA_TIMEOUT_MS);
        const assistantId = pushAssistant("", "gemma");
        const patch = (content: string) =>
          setMessages((prev) => prev.map((msg) => (msg.id === assistantId ? { ...msg, content } : msg)));
        let streamedText = "";
        try {
          for await (const event of streamChatWithGeminiFunctions({
            prompt: trimmed,
            systemInstruction: FACTORY_SYSTEM_INSTRUCTION,
            functions: FACTORY_FUNCTIONS,
            signal: controller.signal,
            statusText: "Checking machine data…",
          })) {
            if (event.type === "delta") {
              streamedText += event.text;
              patch(streamedText);
            } else if (event.type === "status") {
              if (!streamedText) patch(`_${event.text}_`);
            } else {
              patch(event.text || "(No answer)");
            }
          }
          return;
        } catch (err) {
          if (streamedText.trim()) return; // partial answer is already on screen
          setMessages((prev) => prev.filter((msg) => msg.id !== assistantId));
          failures.push(
            controller.signal.aborted
              ? `Gemma timed out (${GEMMA_TIMEOUT_MS / 1000} s)`
              : `Gemma: ${friendlyGeminiError(err)}`
          );
        } finally {
          clearTimeout(timeoutId);
        }
      }

      // 3) Offline demo answer from the dashboard's own data.
      if (canUseMockFallback) {
        pushAssistant(await answerFromDemoData(trimmed), "demo");
        if (failures.length) console.info("Ask AI fell back to demo data:", failures.join("; "));
        return;
      }

      setError(failures.length ? `Could not get an answer: ${failures.join("; ")}.` : "Could not get an answer.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const ask = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setMessages((prev) => [...prev, { id: Date.now(), role: "user", content: trimmed }]);
      await run(trimmed);
    },
    [run]
  );

  /** Re-run the last question after an error (does not duplicate the user bubble). */
  const retry = useCallback(async () => {
    if (!lastQuestion) return;
    await checkBackend(true);
    await run(lastQuestion);
  }, [lastQuestion, run]);

  return { messages, isLoading, error, ask, retry, reset };
}

export type AskAiChatController = ReturnType<typeof useAskAiChat>;

function copyText(text: string) {
  try {
    void navigator.clipboard.writeText(text);
  } catch {
    /* ignore */
  }
}

/** Three one-tap demo questions, shown as chips under the Ask AI input. */
export function SuggestedQuestionChips({
  onPick,
  disabled,
  className,
}: {
  onPick: (question: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] max-sm:[mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)] sm:flex-wrap sm:justify-center sm:overflow-visible ${className ?? ""}`}
    >
      {SUGGESTED_QUESTIONS.map((question) => (
        <button
          key={question}
          type="button"
          disabled={disabled}
          onClick={() => onPick(question)}
          className="shrink-0 whitespace-nowrap rounded-full border border-[#3c4043] bg-[#202124]/90 px-3 py-1.5 text-xs text-[#bdc1c6] backdrop-blur transition hover:border-[rgba(138,180,248,0.5)] hover:text-[#e8eaed] disabled:opacity-50"
        >
          {question}
        </button>
      ))}
    </div>
  );
}

// Overlay-free chat panel, anchored above the prompt bar at the same width.
// The composer is optional: on the factory shell the input is the pill below
// the panel (showComposer=false); the legacy dialog keeps it inside.
export function AskAiChatPanel({
  chat,
  onClose,
  title = "Ask Minerva AI",
  showComposer = false,
}: {
  chat: AskAiChatController;
  onClose?: () => void;
  title?: string;
  showComposer?: boolean;
}) {
  const { messages, isLoading, error, ask, retry, reset } = chat;
  const [draft, setDraft] = useState("");

  const submitDraft = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.trim() || isLoading) return;
    void ask(draft);
    setDraft("");
  };

  return (
    <div className="flex max-h-[40dvh] w-full flex-col sm:max-h-[52vh] overflow-hidden rounded-3xl border border-white/10 bg-[#212121] shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5">
        <button
          type="button"
          aria-label="Close chat panel"
          onClick={onClose}
          className="rounded-full p-1.5 text-neutral-400 transition hover:bg-white/5 hover:text-white"
        >
          <ChevronDown className="h-5 w-5" />
        </button>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-500">
          {title}
        </p>
        <button
          type="button"
          aria-label="Reset conversation"
          onClick={reset}
          className="rounded-full p-1.5 text-neutral-400 transition hover:bg-white/5 hover:text-white"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>
      <div className="mx-6 h-px bg-white/5" />

      {/* Riwayat chat */}
      <div className="google-scroll min-h-[120px] flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {messages.length === 0 && !isLoading && (
          <div className="space-y-3">
            <div className="rounded-2xl bg-white/5 px-4 py-3 text-sm leading-relaxed text-neutral-300">
              Ask about machine health, alarms, sensor readings or production
              yield. Minerva builds a query over the plant data and explains
              the result.
            </div>
            {showComposer && (
              <SuggestedQuestionChips onPick={(q) => void ask(q)} disabled={isLoading} />
            )}
          </div>
        )}

        {messages.map((msg) =>
          msg.role === "user" ? (
            <div key={msg.id} className="space-y-1">
              <div className="rounded-2xl bg-[#2e2e2e] px-4 py-3 text-[15px] leading-relaxed text-neutral-100">
                {msg.content}
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  aria-label="Copy question"
                  onClick={() => copyText(msg.content)}
                  className="rounded-md p-1.5 text-neutral-500 transition hover:bg-white/5 hover:text-neutral-200"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div key={msg.id} className="space-y-2">
              <div className={MARKDOWN_CLASSES}>
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              </div>
              {msg.fluxQuery && (
                <pre className="overflow-x-auto rounded-xl bg-black/50 p-3 text-xs text-blue-200">
                  <code>{msg.fluxQuery}</code>
                </pre>
              )}
              {msg.rawData && (
                <details className="group">
                  <summary className="cursor-pointer text-xs font-medium text-neutral-400 transition group-open:text-neutral-200">
                    View raw data
                  </summary>
                  <pre className="mt-2 max-h-48 overflow-auto rounded-xl bg-black/40 p-3 text-xs text-neutral-300">
                    <code>{msg.rawData}</code>
                  </pre>
                </details>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Copy answer"
                  onClick={() => copyText(msg.content)}
                  className="rounded-md p-1.5 text-neutral-500 transition hover:bg-white/5 hover:text-neutral-200"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                {msg.source && msg.content && (
                  <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-neutral-500">
                    {SOURCE_LABEL[msg.source]}
                  </span>
                )}
              </div>
            </div>
          )
        )}

        {isLoading && (
          <div className="flex items-center gap-1.5 py-2 text-neutral-400">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400 [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400 [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400" />
          </div>
        )}

        {error && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            <span className="min-w-0 flex-1">{error}</span>
            <button
              type="button"
              onClick={() => void retry()}
              disabled={isLoading}
              className="shrink-0 rounded-full bg-red-400/15 px-3 py-1 text-xs font-medium text-red-200 transition hover:bg-red-400/25 disabled:opacity-50"
            >
              Retry
            </button>
          </div>
        )}
      </div>

      {/* In-panel composer (legacy dialog only) */}
      {showComposer && (
      <div className="px-4 pb-4">
        <form
          onSubmit={submitDraft}
          className="rounded-3xl bg-[#2b2b2b] p-4"
        >
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (!draft.trim() || isLoading) return;
                void ask(draft);
                setDraft("");
              }
            }}
            placeholder="Ask about machine performance…"
            disabled={isLoading}
            rows={2}
            className="max-h-40 min-h-[56px] resize-none border-0 bg-transparent p-0 text-[15px] text-neutral-100 placeholder:text-neutral-500 focus-visible:ring-0"
          />
          <div className="mt-2 flex items-center justify-between">
            <button
              type="button"
              aria-label="Add attachment"
              className="rounded-full p-1.5 text-neutral-400 transition hover:bg-white/5 hover:text-white"
            >
              <Plus className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Voice input"
                className="rounded-full p-2 text-neutral-400 transition hover:bg-white/5 hover:text-white"
              >
                <Mic className="h-4 w-4" />
              </button>
              <button
                type="submit"
                disabled={isLoading || !draft.trim()}
                aria-label="Send question"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ArrowUp className="h-5 w-5" />
              </button>
            </div>
          </div>
        </form>
      </div>
      )}
    </div>
  );
}
