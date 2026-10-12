"use client";

// Official Google AI Studio (Gemini Developer API) client for Minerva.
// Model: gemma-4-31b-it — https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api
//
// Uses the official `google-genai` SDK (`@google/genai`):
//   import { GoogleGenAI } from "@google/genai";
// REST equivalent (stateless):
//   POST https://generativelanguage.googleapis.com/v1beta/models/gemma-4-31b-it:generateContent
//   -H "x-goog-api-key: $GEMINI_API_KEY"
//
// NOTE: this app is a static export (Firebase Hosting, `output: "export"`),
// so there are no Next.js API routes — calls go directly from the browser.
// Restrict your API key in Google AI Studio (HTTP referrers) and move to a
// backend proxy before production use.

import {
  GoogleGenAI,
  ThinkingLevel,
  Type,
  type Content,
  type FunctionDeclaration,
  type GenerateContentConfig,
} from "@google/genai";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Hosted Gemma 4 instruction-tuned model (Text + Image in → Text out). */
export const GEMMA_MODEL_ID = "gemma-4-31b-it";

/**
 * Gemma 4 thinking is a strict on/off toggle on the Gemini API:
 * `"high"` = thinking enabled (deep reasoning), `"minimal"` = disabled
 * (fast, low-latency). Maps to `ThinkingLevel.HIGH / MINIMAL`.
 */
export type ThinkingLevelOption = "high" | "minimal";

export const DEFAULT_THINKING_LEVEL: ThinkingLevelOption = "minimal";

const toSdkThinkingLevel = (level: ThinkingLevelOption) =>
  level === "high" ? ThinkingLevel.HIGH : ThinkingLevel.MINIMAL;

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_GEMINI_API_KEY?.trim());
}

let cachedClient: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "NEXT_PUBLIC_GEMINI_API_KEY belum diisi. Buat key di Google AI Studio (aistudio.google.com) lalu isi di .env.local."
    );
  }
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({ apiKey });
  }
  return cachedClient;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GroundingSource = { title: string; uri: string };

export type GeminiAnswer = {
  text: string;
  groundingSources: GroundingSource[];
};

/** Image/video attachment for multimodal prompts (file bytes as base64). */
export type GeminiAttachment = {
  mimeType: string;
  base64Data: string;
};

export type GeminiTextOptions = {
  prompt: string;
  systemInstruction?: string;
  thinkingLevel?: ThinkingLevelOption;
  /** Enable Google Search grounding (`tools: [{ googleSearch: {} }]`). */
  useSearch?: boolean;
  signal?: AbortSignal;
};

export type GeminiMultimodalOptions = GeminiTextOptions & {
  attachments: GeminiAttachment[];
};

export type GeminiFunctionHandler = (
  args: Record<string, unknown>
) => Promise<unknown> | unknown;

export type GeminiFunction = {
  declaration: FunctionDeclaration;
  handler: GeminiFunctionHandler;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function extractGroundingSources(response: {
  candidates?: Array<{
    groundingMetadata?: {
      groundingChunks?: Array<{
        web?: { uri?: string; title?: string };
      }>;
    };
  }> | null;
}): GroundingSource[] {
  const chunks =
    response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const seen = new Set<string>();
  const sources: GroundingSource[] = [];
  for (const chunk of chunks) {
    const uri = chunk?.web?.uri;
    if (!uri || seen.has(uri)) continue;
    seen.add(uri);
    sources.push({ title: chunk.web?.title || uri, uri });
  }
  return sources;
}

/** Convert a browser File/Blob to a GeminiAttachment (base64, no prefix). */
export function fileToGeminiAttachment(file: Blob): Promise<GeminiAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve({ mimeType: file.type || "image/png", base64Data: base64 });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function buildConfig(options: {
  systemInstruction?: string;
  thinkingLevel?: ThinkingLevelOption;
  useSearch?: boolean;
  signal?: AbortSignal;
}): GenerateContentConfig {
  const config: GenerateContentConfig = {
    thinkingConfig: {
      thinkingLevel: toSdkThinkingLevel(
        options.thinkingLevel ?? DEFAULT_THINKING_LEVEL
      ),
    },
  };
  if (options.systemInstruction) {
    config.systemInstruction = options.systemInstruction;
  }
  if (options.useSearch) {
    config.tools = [{ googleSearch: {} }];
  }
  if (options.signal) {
    config.abortSignal = options.signal;
  }
  return config;
}

// ---------------------------------------------------------------------------
// Resilience: gemma-4-31b-it occasionally returns transient 500 INTERNAL /
// 503 / 429 errors — retry with exponential backoff before surfacing.
// ---------------------------------------------------------------------------

const RETRYABLE_STATUS = [408, 429, 500, 502, 503, 504];

export function isRetryableGeminiError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (/INTERNAL|UNAVAILABLE|RESOURCE_EXHAUSTED|DEADLINE_EXCEEDED|overloaded/i.test(message)) {
    return true;
  }
  try {
    const parsed = JSON.parse(message) as {
      error?: { code?: number; status?: string };
    };
    const code = parsed?.error?.code;
    if (typeof code === "number" && RETRYABLE_STATUS.includes(code)) return true;
    const status = parsed?.error?.status ?? "";
    if (/INTERNAL|UNAVAILABLE|RESOURCE_EXHAUSTED|DEADLINE_EXCEEDED/i.test(status)) {
      return true;
    }
  } catch {
    /* not JSON — fall through */
  }
  return false;
}

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function withGeminiRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 6
): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !isRetryableGeminiError(error)) {
        throw error;
      }
      // 1s → 2s → 4s → 8s (capped) + jitter — same persistence as the
      // terminal repro, which needed up to 7 attempts during 500 flakiness.
      const delay =
        Math.min(8000, 1000 * 2 ** (attempt - 1)) + Math.random() * 500;
      await sleep(delay);
    }
  }
  throw lastError;
}

/** Turn raw SDK/REST errors (often JSON blobs) into a readable message. */
export function friendlyGeminiError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  // Unwrap up to two levels of {"error": {"message": ...}} nesting — the
  // streaming path wraps transport errors this way.
  let message: string | undefined;
  let current = raw;
  for (let depth = 0; depth < 2; depth++) {
    try {
      const parsed = JSON.parse(current) as { error?: { message?: unknown } };
      const inner = parsed?.error?.message;
      if (typeof inner !== "string" || !inner.trim()) break;
      current = inner.trim();
      message = current;
    } catch {
      break;
    }
  }
  const text = (message ?? raw).trim();
  if (/internal error/i.test(text)) {
    return "Server AI sedang sibuk (internal error). Coba lagi sebentar.";
  }
  return text || "Terjadi kesalahan tak terduga.";
}

// ---------------------------------------------------------------------------
// Text + multimodal generation
// ---------------------------------------------------------------------------

export async function generateGeminiText(
  options: GeminiTextOptions
): Promise<GeminiAnswer> {
  const ai = getGeminiClient();
  const response = await withGeminiRetry(() =>
    ai.models.generateContent({
      model: GEMMA_MODEL_ID,
      contents: options.prompt,
      config: buildConfig(options),
    })
  );
  return {
    text: (response.text ?? "").trim(),
    groundingSources: extractGroundingSources(response),
  };
}

export async function generateGeminiMultimodal(
  options: GeminiMultimodalOptions
): Promise<GeminiAnswer> {
  const ai = getGeminiClient();
  const parts: Array<
    { text: string } | { inlineData: { mimeType: string; data: string } }
  > = [{ text: options.prompt }];
  for (const attachment of options.attachments) {
    parts.push({
      inlineData: {
        mimeType: attachment.mimeType,
        data: attachment.base64Data,
      },
    });
  }
  const response = await withGeminiRetry(() =>
    ai.models.generateContent({
      model: GEMMA_MODEL_ID,
      contents: [{ role: "user", parts }],
      config: buildConfig(options),
    })
  );
  return {
    text: (response.text ?? "").trim(),
    groundingSources: extractGroundingSources(response),
  };
}

/** Streaming variant — yields text chunks as they arrive. */
export async function* streamGeminiText(
  options: GeminiTextOptions
): AsyncGenerator<string, void, void> {
  const ai = getGeminiClient();
  const stream = await withGeminiRetry(() =>
    ai.models.generateContentStream({
      model: GEMMA_MODEL_ID,
      contents: options.prompt,
      config: buildConfig(options),
    })
  );
  for await (const chunk of stream) {
    const text = chunk.text;
    if (text) yield text;
  }
}

export type GeminiStreamEvent =
  | { type: "status"; text: string }
  | { type: "delta"; text: string }
  | { type: "done"; text: string };

/**
 * Function-calling chat with streaming final output.
 * Each turn streams via `generateContentStream`: text chunks are yielded as
 * `delta` immediately; if the model requests function calls instead, a
 * `status` event is yielded, the handlers run, and the loop continues.
 */
export async function* streamChatWithGeminiFunctions(args: {
  prompt: string;
  systemInstruction?: string;
  thinkingLevel?: ThinkingLevelOption;
  functions: GeminiFunction[];
  maxTurns?: number;
  signal?: AbortSignal;
  statusText?: string;
}): AsyncGenerator<GeminiStreamEvent, void, void> {
  const ai = getGeminiClient();
  const declarations = args.functions.map((fn) => fn.declaration);
  const handlers = new Map(
    args.functions.map((fn) => [fn.declaration.name as string, fn.handler])
  );

  const config: GenerateContentConfig = buildConfig(args);
  config.tools = [{ functionDeclarations: declarations }];

  const contents: Content[] = [
    { role: "user", parts: [{ text: args.prompt }] },
  ];
  const maxTurns = Math.max(1, args.maxTurns ?? 5);
  const statusText = args.statusText ?? "Mengecek data mesin…";
  let fullText = "";

  for (let turn = 0; turn < maxTurns; turn++) {
    // Consume one streamed turn. Retried silently while nothing arrived yet;
    // if the stream breaks AFTER partial text was shown, finish gracefully
    // instead of retrying (a retry would duplicate the visible text).
    type TurnCall = { name: string; args: Record<string, unknown> };
    let turnCalls: TurnCall[] | null = null;
    for (let tAttempt = 1; tAttempt <= 3; tAttempt++) {
      const turnStartLen = fullText.length;
      try {
        const stream = await ai.models.generateContentStream({
          model: GEMMA_MODEL_ID,
          contents,
          config,
        });
        const collected: TurnCall[] = [];
        for await (const chunk of stream) {
          const text = chunk.text;
          if (text) {
            fullText += text;
            yield { type: "delta", text } as GeminiStreamEvent;
          }
          for (const call of chunk.functionCalls ?? []) {
            collected.push({
              name: call.name ?? "",
              args: (call.args ?? {}) as Record<string, unknown>,
            });
          }
        }
        turnCalls = collected;
        break;
      } catch (error) {
        if (args.signal?.aborted) throw error;
        if (fullText.length > turnStartLen) {
          yield { type: "done", text: fullText.trim() } as GeminiStreamEvent;
          return;
        }
        if (tAttempt >= 3) throw error;
        await sleep(1000 * 2 ** (tAttempt - 1) + Math.random() * 500);
      }
    }
    const calls = turnCalls ?? [];

    if (calls.length === 0) {
      yield { type: "done", text: fullText.trim() };
      return;
    }

    yield { type: "status", text: statusText };

    const modelParts: Content["parts"] = [];
    if (fullText) {
      // Keep streamed prefix in history so follow-up turns stay coherent.
      modelParts.push({ text: fullText });
      fullText = "";
    }
    const functionResponseParts: Content["parts"] = [];

    for (const call of calls) {
      modelParts.push({ functionCall: { name: call.name, args: call.args } });
      const handler = handlers.get(call.name);
      let result: unknown;
      try {
        result = handler
          ? await handler(call.args)
          : { error: `Unknown function: ${call.name}` };
      } catch (error) {
        result = {
          error: error instanceof Error ? error.message : String(error),
        };
      }
      functionResponseParts.push({
        functionResponse: {
          name: call.name,
          response: { result: result as Record<string, unknown> },
        },
      });
    }

    contents.push({ role: "model", parts: modelParts });
    contents.push({ role: "user", parts: functionResponseParts });
  }

  yield {
    type: "done",
    text: fullText.trim() || "Batas langkah function calling tercapai tanpa jawaban akhir.",
  };
}

// ---------------------------------------------------------------------------
// Native function calling (declare → call → respond loop)
// ---------------------------------------------------------------------------

export async function chatWithGeminiFunctions(args: {
  prompt: string;
  systemInstruction?: string;
  thinkingLevel?: ThinkingLevelOption;
  functions: GeminiFunction[];
  maxTurns?: number;
  signal?: AbortSignal;
}): Promise<GeminiAnswer> {
  const ai = getGeminiClient();
  const declarations = args.functions.map((fn) => fn.declaration);
  const handlers = new Map(
    args.functions.map((fn) => [fn.declaration.name as string, fn.handler])
  );

  const config: GenerateContentConfig = buildConfig(args);
  config.tools = [{ functionDeclarations: declarations }];

  const contents: Content[] = [
    { role: "user", parts: [{ text: args.prompt }] },
  ];
  const maxTurns = Math.max(1, args.maxTurns ?? 5);

  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await withGeminiRetry(() =>
      ai.models.generateContent({
        model: GEMMA_MODEL_ID,
        contents,
        config,
      })
    );

    const calls = response.functionCalls ?? [];
    if (calls.length === 0) {
      return {
        text: (response.text ?? "").trim(),
        groundingSources: extractGroundingSources(response),
      };
    }

    // Model turn may also carry text — keep it in history for coherence.
    const modelParts: Content["parts"] = [];
    if (response.text) modelParts.push({ text: response.text });
    const functionResponseParts: Content["parts"] = [];

    for (const call of calls) {
      const name = call.name ?? "";
      modelParts.push({
        functionCall: { name, args: call.args ?? {} },
      });
      const handler = handlers.get(name);
      let result: unknown;
      try {
        result = handler
          ? await handler((call.args ?? {}) as Record<string, unknown>)
          : { error: `Unknown function: ${name}` };
      } catch (error) {
        result = {
          error: error instanceof Error ? error.message : String(error),
        };
      }
      functionResponseParts.push({
        functionResponse: {
          name,
          response: { result: result as Record<string, unknown> },
        },
      });
    }

    contents.push({ role: "model", parts: modelParts });
    contents.push({ role: "user", parts: functionResponseParts });
  }

  return {
    text: "Batas langkah function calling tercapai tanpa jawaban akhir.",
    groundingSources: [],
  };
}

// ---------------------------------------------------------------------------
// Factory example function: machine overview from local data
// ---------------------------------------------------------------------------

export const getFactoryMachinesDeclaration: FunctionDeclaration = {
  name: "getFactoryMachines",
  description:
    "Return the list of factory machines in the Minerva digital twin with id, title, location, health score and active alarms. Use this when the user asks about machines, health, alarms, or maintenance.",
  parametersJsonSchema: {
    type: Type.OBJECT,
    properties: {
      onlyWithAlarms: {
        type: Type.BOOLEAN,
        description: "If true, return only machines with active alarms.",
      },
    },
  },
};

export async function handleGetFactoryMachines(
  args: Record<string, unknown>
): Promise<unknown> {
  const { loadMachines } = await import("@/lib/machines");
  const machines = await loadMachines();
  const onlyWithAlarms = args.onlyWithAlarms === true;
  return machines
    .filter((m) => !onlyWithAlarms || (m.alarms?.active ?? 0) > 0)
    .map((m) => ({
      id: m.id,
      title: m.title,
      location: m.location,
      healthScore: m.healthScore,
      activeAlarms: m.alarms?.active ?? 0,
      alarms: (m.alarms?.list ?? []).slice(0, 5),
    }));
}

export const FACTORY_FUNCTIONS: GeminiFunction[] = [
  {
    declaration: getFactoryMachinesDeclaration,
    handler: handleGetFactoryMachines,
  },
];

/** Factory-aware system prompt for the Ask-AI panel. */
export const FACTORY_SYSTEM_INSTRUCTION = [
  "You are Minerva AI, the assistant for a sustainable-manufacturing digital twin.",
  "Answer in Indonesian (Bahasa Indonesia), concisely, with markdown formatting.",
  "You know the factory line: furnace, rod-feeder, casting-machine, UT, CT, homogenizing, charging-machine, swarf, sawing, weighing.",
  "If the user asks about machine health, alarms, or maintenance, use the getFactoryMachines function.",
].join(" ");
