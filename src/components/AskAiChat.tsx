"use client";

import {
  useCallback,
  useState,
  type FormEvent,
} from "react";
import { apiUrl } from "@/lib/api";
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

// Minimal, safe markdown -> HTML renderer for chatbot answers.
// Supports headings, bold, italic, inline code, code blocks, lists and links.
function escapeHtml(str: string) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function renderMarkdownToHtml(md: string | null) {
  if (!md) return "";
  // Normalize line endings
  let text = md.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Escape first to avoid HTML injection
  text = escapeHtml(text);

  // Code blocks: ```lang\n...``` --> <pre><code>...</code></pre>
  text = text.replace(/```([\s\S]*?)```/g, (_m, code) => {
    return `<pre class="rounded-md bg-slate-950/80 p-3 overflow-auto"><code>${code
      .replace(/&lt;/g, "&lt;")
      .replace(/&gt;/g, "&gt;")}</code></pre>`;
  });

  // Inline code: `code`
  text = text.replace(/`([^`]+)`/g, (_m, code) => {
    return `<code class="rounded px-1 bg-slate-800/60 text-xs">${code}</code>`;
  });

  // Headings: #### to <h4>
  text = text.replace(
    /^###### (.*)$/gm,
    '<h6 class="text-sm font-semibold">$1</h6>'
  );
  text = text.replace(
    /^##### (.*)$/gm,
    '<h5 class="text-base font-semibold">$1</h5>'
  );
  text = text.replace(
    /^#### (.*)$/gm,
    '<h4 class="text-lg font-semibold">$1</h4>'
  );
  text = text.replace(
    /^### (.*)$/gm,
    '<h3 class="text-lg font-semibold">$1</h3>'
  );
  text = text.replace(
    /^## (.*)$/gm,
    '<h2 class="text-lg font-semibold">$1</h2>'
  );
  text = text.replace(/^# (.*)$/gm, '<h1 class="text-xl font-semibold">$1</h1>');

  // Bold **text** and __text__
  text = text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/__(.*?)__/g, "<strong>$1</strong>");

  // Italic *text* or _text_
  text = text.replace(/\*(.*?)\*/g, "<em>$1</em>");
  text = text.replace(/_(.*?)_/g, "<em>$1</em>");

  // Links [text](url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, url) => {
    const safeUrl = url.replace(/"/g, "%22");
    return `<a class=\"text-blue-300 underline\" href=\"${safeUrl}\" target=\"_blank\" rel=\"noreferrer\">${label}</a>`;
  });

  // Unordered lists: lines starting with - or *
  // Convert consecutive list lines into a single <ul>
  text = text.replace(/(^|\n)(?:[ \t]*[-\*] .+(?:\n|$))+?/g, (block) => {
    const items = block
      .trim()
      .split(/\n/)
      .map((l) => l.replace(/^[ \t]*[-\*] /, ""))
      .map((li) => `<li class=\"ml-4 list-disc\">${li}</li>`)
      .join("");
    return `\n<ul class=\"mt-2\">${items}</ul>\n`;
  });

  // Paragraphs: separate by double newlines
  const parts = text.split(/\n{2,}/).map((p) => p.trim());
  const html = parts
    .map((p) => {
      if (p.startsWith("<h") || p.startsWith("<ul") || p.startsWith("<pre"))
        return p;
      return `<p class=\"mt-2\">${p.replace(/\n/g, "<br />")}</p>`;
    })
    .join("\n");

  return html;
}

export type ChatMsg = {
  id: number;
  role: "user" | "assistant";
  content: string;
  fluxQuery?: string | null;
  rawData?: string | null;
};

export function useAskAiChat() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setMessages([]);
    setError(null);
    setIsLoading(false);
  }, []);

  const ask = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setMessages((prev) => [
      ...prev,
      { id: Date.now(), role: "user", content: trimmed },
    ]);
    setIsLoading(true);
    setError(null);

    // Backend fetch must never hang forever — without a timeout a stalled
    // connection leaves the panel on the loading spinner indefinitely and
    // the Gemini fallback is never reached.
    const backendController = new AbortController();
    const backendTimeoutId = setTimeout(() => backendController.abort(), 20000);

    try {
      // Call backend workflow that translates natural language to Flux and analysis answer.
      const response = await fetch(apiUrl("/api/chatbot/query"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
        signal: backendController.signal,
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          typeof payload?.error === "string"
            ? payload.error
            : "Gagal memproses permintaan.";
        throw new Error(message);
      }

      const answerText =
        typeof payload?.answer === "string" ? payload.answer.trim() : "";
      const flux =
        typeof payload?.fluxQuery === "string" ? payload.fluxQuery.trim() : "";
      const dataText =
        typeof payload?.data === "string" ? payload.data.trim() : "";
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: "assistant",
          content: answerText ? answerText : "(Tidak ada jawaban)",
          fluxQuery: flux ? flux : null,
          rawData: dataText ? dataText : null,
        },
      ]);
    } catch (err) {
      // Backend unreachable/timed out — fall back to a direct Google AI
      // Studio call (gemma-4-31b-it with native factory function calling).
      // The fallback gets an overall timeout so the panel can never hang.
      const backendMessage = backendController.signal.aborted
        ? "backend timeout (20 detik)"
        : err instanceof Error
          ? err.message
          : "backend gagal";
      if (isGeminiConfigured()) {
        const fallbackController = new AbortController();
        const fallbackTimeoutId = setTimeout(
          () => fallbackController.abort(),
          120000
        );
        try {
          // Stream the answer token-by-token into a placeholder message.
          const assistantId = Date.now() + 1;
          let streamedText = "";
          setMessages((prev) => [
            ...prev,
            { id: assistantId, role: "assistant", content: "" },
          ]);
          const patchMessage = (content: string) =>
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantId ? { ...msg, content } : msg
              )
            );
          for await (const event of streamChatWithGeminiFunctions({
            prompt: trimmed,
            systemInstruction: FACTORY_SYSTEM_INSTRUCTION,
            functions: FACTORY_FUNCTIONS,
            signal: fallbackController.signal,
          })) {
            if (event.type === "delta") {
              streamedText += event.text;
              patchMessage(streamedText);
            } else if (event.type === "status") {
              // Show tool status only while no answer text arrived yet.
              if (!streamedText) patchMessage(`_${event.text}_`);
            } else {
              patchMessage(
                event.text ? event.text : "(Tidak ada jawaban)"
              );
            }
          }
          return;
        } catch (geminiErr) {
          const geminiMessage = fallbackController.signal.aborted
            ? "Gemini timeout (120 detik)"
            : friendlyGeminiError(geminiErr);
          setError(`Backend: ${backendMessage}. Gemini: ${geminiMessage}`);
          return;
        } finally {
          clearTimeout(fallbackTimeoutId);
        }
      }
      setError(backendMessage);
    } finally {
      clearTimeout(backendTimeoutId);
      setIsLoading(false);
    }
  }, []);

  return { messages, isLoading, error, ask, reset };
}

export type AskAiChatController = ReturnType<typeof useAskAiChat>;

function copyText(text: string) {
  try {
    void navigator.clipboard.writeText(text);
  } catch {
    /* ignore */
  }
}

// Panel chat tanpa overlay — ditujukan untuk ditempel (anchored) di atas
// prompt bar, selebar prompt bar, seperti referensi. Composer opsional:
// di factory shell input-nya adalah pill di bawah panel (showComposer=false),
// di dialog legacy composer ada di dalam panel (showComposer=true).
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
  const { messages, isLoading, error, ask, reset } = chat;
  const [draft, setDraft] = useState("");

  const submitDraft = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.trim() || isLoading) return;
    void ask(draft);
    setDraft("");
  };

  return (
    <div className="flex max-h-[52vh] w-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#212121] shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5">
        <button
          type="button"
          aria-label="Tutup panel chat"
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
          aria-label="Reset percakapan"
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
          <div className="rounded-2xl bg-white/5 px-4 py-3 text-sm leading-relaxed text-neutral-300">
            Ajukan pertanyaan tentang performa mesin. Sistem akan menyusun
            query Flux dan menjawab berdasarkan data InfluxDB.
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
                  aria-label="Salin pertanyaan"
                  onClick={() => copyText(msg.content)}
                  className="rounded-md p-1.5 text-neutral-500 transition hover:bg-white/5 hover:text-neutral-200"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div key={msg.id} className="space-y-2">
              <div
                className="prose prose-invert max-w-full text-[15px] leading-relaxed text-neutral-200"
                dangerouslySetInnerHTML={{
                  __html: renderMarkdownToHtml(msg.content),
                }}
              />
              {msg.fluxQuery && (
                <pre className="overflow-x-auto rounded-xl bg-black/50 p-3 text-xs text-blue-200">
                  <code>{msg.fluxQuery}</code>
                </pre>
              )}
              {msg.rawData && (
                <details className="group">
                  <summary className="cursor-pointer text-xs font-medium text-neutral-400 transition group-open:text-neutral-200">
                    Lihat Data Mentah
                  </summary>
                  <pre className="mt-2 max-h-48 overflow-auto rounded-xl bg-black/40 p-3 text-xs text-neutral-300">
                    <code>{msg.rawData}</code>
                  </pre>
                </details>
              )}
              <button
                type="button"
                aria-label="Salin jawaban"
                onClick={() => copyText(msg.content)}
                className="rounded-md p-1.5 text-neutral-500 transition hover:bg-white/5 hover:text-neutral-200"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
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
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}
      </div>

      {/* Composer di dalam panel (hanya untuk dialog legacy) */}
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
            placeholder="Tanyakan soal performa mesin..."
            disabled={isLoading}
            rows={2}
            className="max-h-40 min-h-[56px] resize-none border-0 bg-transparent p-0 text-[15px] text-neutral-100 placeholder:text-neutral-500 focus-visible:ring-0"
          />
          <div className="mt-2 flex items-center justify-between">
            <button
              type="button"
              aria-label="Tambah lampiran"
              className="rounded-full p-1.5 text-neutral-400 transition hover:bg-white/5 hover:text-white"
            >
              <Plus className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Input suara"
                className="rounded-full p-2 text-neutral-400 transition hover:bg-white/5 hover:text-white"
              >
                <Mic className="h-4 w-4" />
              </button>
              <button
                type="submit"
                disabled={isLoading || !draft.trim()}
                aria-label="Kirim pertanyaan"
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
