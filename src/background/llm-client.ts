import { z } from "zod";
import { LIMITS } from "../shared/constants";
import { RuntimeError } from "../shared/errors";
import { queryRefinementSchema, summaryResultSchema, taskRouteSchema } from "../shared/schema";
import type { ExtractedItem, PublicResearchTaskSpec, ResearchSourceResult, SearchTaskSpec, TaskType } from "../shared/types";
import {
  buildTaskRoutePrompt,
  buildCommerceQueryRefinementPrompt,
  buildCommerceSummaryPrompt,
  buildResearchQueryRefinementPrompt,
  buildResearchSummaryPrompt,
} from "./prompting";

type ProviderName = "gemini" | "deepseek";

const env = import.meta.env as Record<string, string | undefined>;

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_MODEL = import.meta.env.VITE_GEMINI_MODEL || "gemini-2.0-flash";
const GEMINI_SIMPLE_MODEL = import.meta.env.VITE_GEMINI_SIMPLE_MODEL || "gemini-3.1-flash-lite-preview";
const GEMINI_SIMPLE_MODEL_FALLBACK = import.meta.env.VITE_GEMINI_SIMPLE_MODEL_FALLBACK || "gemini-2.5-flash-lite";

const DEEPSEEK_API_KEY = import.meta.env.VITE_DEEPSEEK_API_KEY || env["deep-seek-api-key"];
const DEEPSEEK_MODEL = import.meta.env.VITE_DEEPSEEK_MODEL || "deepseek-chat";
const DEEPSEEK_SIMPLE_MODEL = import.meta.env.VITE_DEEPSEEK_SIMPLE_MODEL || DEEPSEEK_MODEL;
const CONFIGURED_PROVIDER = (import.meta.env.VITE_LLM_PROVIDER || "").trim().toLowerCase();

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

interface DeepSeekResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
}

interface RequestOptions {
  signal?: AbortSignal;
}

export function getConfiguredProvider(): ProviderName {
  if (CONFIGURED_PROVIDER === "deepseek") {
    return "deepseek";
  }

  if (CONFIGURED_PROVIDER === "gemini") {
    return "gemini";
  }

  return DEEPSEEK_API_KEY ? "deepseek" : "gemini";
}

export function buildGeminiRequestBody(prompt: string) {
  return {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
  };
}

export function buildDeepSeekRequestBody(prompt: string, model = DEEPSEEK_MODEL) {
  return {
    model,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0.2,
    response_format: {
      type: "json_object",
    },
  };
}

export function extractJsonText(response: GeminiResponse): string {
  const text = response.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!text) {
    throw new RuntimeError("Gemini returned an empty response.", "EMPTY_LLM_RESPONSE");
  }
  return text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
}

export function extractDeepSeekJsonText(response: DeepSeekResponse): string {
  const text = response.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new RuntimeError("DeepSeek returned an empty response.", "EMPTY_LLM_RESPONSE");
  }
  return text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
}

export function extractFirstJsonBlock(raw: string): string {
  const text = raw.trim();
  const startIndex = text.search(/[\[{]/);
  if (startIndex < 0) {
    throw new RuntimeError("No JSON payload was found in the model response.", "LLM_JSON_NOT_FOUND");
  }

  const openChar = text[startIndex];
  const closeChar = openChar === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === openChar) {
      depth += 1;
    } else if (char === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return text.slice(startIndex, index + 1);
      }
    }
  }

  throw new RuntimeError("The model returned an incomplete JSON payload.", "LLM_JSON_INCOMPLETE");
}

export function parseModelJson(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    const extracted = extractFirstJsonBlock(raw);
    return JSON.parse(extracted);
  }
}

export function getModelCandidates(task: "simple" | "default", provider: ProviderName = getConfiguredProvider()) {
  if (provider === "deepseek") {
    if (task === "simple") {
      return Array.from(new Set([DEEPSEEK_SIMPLE_MODEL, DEEPSEEK_MODEL].filter(Boolean)));
    }

    return Array.from(new Set([DEEPSEEK_MODEL].filter(Boolean)));
  }

  if (task === "simple") {
    return Array.from(new Set([GEMINI_SIMPLE_MODEL, GEMINI_SIMPLE_MODEL_FALLBACK, GEMINI_MODEL].filter(Boolean)));
  }

  return Array.from(new Set([GEMINI_MODEL].filter(Boolean)));
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new RuntimeError("The session was stopped.", "SESSION_STOPPED");
  }
}

async function requestGemini(prompt: string, modelCandidates: string[], options: RequestOptions = {}) {
  if (!GEMINI_API_KEY) {
    throw new RuntimeError("Missing VITE_GEMINI_API_KEY.", "MISSING_API_KEY");
  }

  throwIfAborted(options.signal);

  let lastError: unknown;

  for (const model of modelCandidates) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LIMITS.LLM_TIMEOUT_MS);
    const abortListener = () => controller.abort();
    options.signal?.addEventListener("abort", abortListener, { once: true });

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(buildGeminiRequestBody(prompt)),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        const body = await response.text();
        const error = new RuntimeError(`Gemini request failed: ${response.status}`, "LLM_HTTP_ERROR");
        (error as RuntimeError & { cause?: string }).cause = body;

        if ((response.status === 400 || response.status === 404) && model !== modelCandidates.at(-1)) {
          lastError = error;
          continue;
        }

        throw error;
      }

      const data = (await response.json()) as GeminiResponse;
      return {
        raw: extractJsonText(data),
        model,
      };
    } catch (error) {
      if (error instanceof RuntimeError) {
        lastError = error;
        if (error.code === "LLM_HTTP_ERROR" && model !== modelCandidates.at(-1)) {
          continue;
        }
        throw error;
      }

      throwIfAborted(options.signal);

      if (error instanceof Error && error.name === "AbortError") {
        throw new RuntimeError("Gemini request timed out.", "LLM_TIMEOUT");
      }

      lastError = error;
      if (model === modelCandidates.at(-1)) {
        throw new RuntimeError(error instanceof Error ? error.message : "Gemini request failed.", "LLM_UNKNOWN_ERROR");
      }
    } finally {
      clearTimeout(timeoutId);
      options.signal?.removeEventListener("abort", abortListener);
    }
  }

  throw lastError instanceof RuntimeError
    ? lastError
    : new RuntimeError(lastError instanceof Error ? lastError.message : "Gemini request failed.", "LLM_UNKNOWN_ERROR");
}

async function requestDeepSeek(prompt: string, modelCandidates: string[], options: RequestOptions = {}) {
  if (!DEEPSEEK_API_KEY) {
    throw new RuntimeError("Missing VITE_DEEPSEEK_API_KEY.", "MISSING_API_KEY");
  }

  throwIfAborted(options.signal);

  let lastError: unknown;

  for (const model of modelCandidates) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LIMITS.LLM_TIMEOUT_MS);
    const abortListener = () => controller.abort();
    options.signal?.addEventListener("abort", abortListener, { once: true });

    try {
      const response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify(buildDeepSeekRequestBody(prompt, model)),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        const error = new RuntimeError(`DeepSeek request failed: ${response.status}`, "LLM_HTTP_ERROR");
        (error as RuntimeError & { cause?: string }).cause = body;
        throw error;
      }

      const data = (await response.json()) as DeepSeekResponse;
      return {
        raw: extractDeepSeekJsonText(data),
        model,
      };
    } catch (error) {
      if (error instanceof RuntimeError) {
        lastError = error;
        throw error;
      }

      throwIfAborted(options.signal);

      if (error instanceof Error && error.name === "AbortError") {
        throw new RuntimeError("DeepSeek request timed out.", "LLM_TIMEOUT");
      }

      lastError = error;
      if (model === modelCandidates.at(-1)) {
        throw new RuntimeError(error instanceof Error ? error.message : "DeepSeek request failed.", "LLM_UNKNOWN_ERROR");
      }
    } finally {
      clearTimeout(timeoutId);
      options.signal?.removeEventListener("abort", abortListener);
    }
  }

  throw lastError instanceof RuntimeError
    ? lastError
    : new RuntimeError(lastError instanceof Error ? lastError.message : "DeepSeek request failed.", "LLM_UNKNOWN_ERROR");
}

async function requestProvider(prompt: string, task: "simple" | "default", options: RequestOptions = {}) {
  const provider = getConfiguredProvider();
  const candidates = getModelCandidates(task, provider);

  if (provider === "deepseek") {
    return requestDeepSeek(prompt, candidates, options);
  }

  return requestGemini(prompt, candidates, options);
}

async function requestProviderJson<T>(
  prompt: string,
  schema: z.ZodType<T>,
  task: "simple" | "default",
  options: RequestOptions = {},
) {
  const response = await requestProvider(prompt, task, options);
  const parsed = schema.parse(parseModelJson(response.raw));
  return {
    data: parsed,
    model: response.model,
    provider: getConfiguredProvider(),
  };
}

export async function refineCommerceSearchQuery(goal: string, options: RequestOptions = {}) {
  const response = await requestProviderJson(
    buildCommerceQueryRefinementPrompt(goal),
    queryRefinementSchema,
    "simple",
    options,
  );

  return {
    ...response.data,
    model: response.model,
    provider: response.provider,
  };
}

export async function classifyTaskType(goal: string, options: RequestOptions = {}): Promise<{
  taskType: TaskType;
  reason: string;
  model: string;
  provider: ProviderName;
}> {
  const response = await requestProviderJson(
    buildTaskRoutePrompt(goal),
    taskRouteSchema,
    "simple",
    options,
  );

  return {
    ...response.data,
    model: response.model,
    provider: response.provider,
  };
}

export async function refineResearchQuery(goal: string, options: RequestOptions = {}) {
  const response = await requestProviderJson(
    buildResearchQueryRefinementPrompt(goal),
    queryRefinementSchema,
    "simple",
    options,
  );

  return {
    ...response.data,
    model: response.model,
    provider: response.provider,
  };
}

export async function generateCommerceSummary(
  goal: string,
  taskSpec: SearchTaskSpec,
  items: ExtractedItem[],
  options: RequestOptions = {},
) {
  const response = await requestProviderJson(
    buildCommerceSummaryPrompt(goal, taskSpec, items),
    summaryResultSchema,
    "default",
    options,
  );

  return {
    ...response.data,
    model: response.model,
    provider: response.provider,
  };
}

export async function generateResearchSummary(
  goal: string,
  taskSpec: PublicResearchTaskSpec,
  sources: ResearchSourceResult[],
  unresolvedIssues: string[],
  options: RequestOptions = {},
) {
  const response = await requestProviderJson(
    buildResearchSummaryPrompt(goal, taskSpec, sources, unresolvedIssues),
    summaryResultSchema,
    "default",
    options,
  );

  return {
    ...response.data,
    model: response.model,
    provider: response.provider,
  };
}
