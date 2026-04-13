import { z } from "zod";
import { LIMITS } from "../shared/constants";
import { RuntimeError } from "../shared/errors";
import { finalResultSynthesisSchema, nextToolSelectionSchema, queryRefinementSchema, researchCandidateReorderSchema, taskRouteSchema } from "../shared/schema";
import type {
  ConversationTurn,
  DirectAnswerTaskSpec,
  ExtractedItem,
  PlanStep,
  PublicResearchTaskSpec,
  ResearchCandidate,
  ResearchSourceResult,
  SearchTaskSpec,
  SiteOverviewTaskSpec,
  TaskType,
  ToolName,
} from "../shared/types";
import {
  buildDirectAnswerPrompt,
  buildFinalResultPrompt,
  buildCommerceQueryRefinementPrompt,
  buildNextToolPrompt,
  buildResearchCandidateReorderPrompt,
  buildResearchQueryRefinementPrompt,
  buildSiteCandidateReorderPrompt,
  buildTaskRoutePromptWithContext,
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

export async function refineCommerceSearchQuery(
  goal: string,
  options: RequestOptions & {
    conversationContext?: string;
  } = {},
) {
  const response = await requestProviderJson(
    buildCommerceQueryRefinementPrompt(goal, options.conversationContext),
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

export async function classifyTaskType(
  goal: string,
  options: RequestOptions & {
    conversationContext?: string;
    conversationTurns?: ConversationTurn[];
    currentTimeIso?: string;
    timezone?: string;
    searchPreference?: "auto" | "prefer_search";
  } = {},
): Promise<{
  taskType: TaskType;
  reason: string;
  model: string;
  provider: ProviderName;
}> {
  const response = await requestProviderJson(
    buildTaskRoutePromptWithContext(goal, {
      conversationContext: options.conversationContext,
      conversationTurns: options.conversationTurns,
      currentTimeIso: options.currentTimeIso,
      timezone: options.timezone,
      searchPreference: options.searchPreference,
    }),
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

export async function refineResearchQuery(
  goal: string,
  options: RequestOptions & {
    conversationContext?: string;
  } = {},
) {
  const response = await requestProviderJson(
    buildResearchQueryRefinementPrompt(goal, options.conversationContext),
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

export async function generateFinalResult(
  input: {
    goal: string;
    taskType: TaskType;
    taskSpec: SearchTaskSpec | PublicResearchTaskSpec | SiteOverviewTaskSpec;
    items?: ExtractedItem[];
    sources?: ResearchSourceResult[];
    unresolvedIssues?: string[];
    conversationContext?: string;
  },
  options: RequestOptions = {},
) {
  const response = await requestProviderJson(
    buildFinalResultPrompt(input),
    finalResultSynthesisSchema,
    "default",
    options,
  );

  return {
    ...response.data,
    model: response.model,
    provider: response.provider,
  };
}

export async function generateDirectAnswerResult(
  input: {
    goal: string;
    taskSpec: DirectAnswerTaskSpec;
    conversationTurns?: ConversationTurn[];
  },
  options: RequestOptions = {},
) {
  const response = await requestProviderJson(
    buildDirectAnswerPrompt(input),
    finalResultSynthesisSchema,
    "default",
    options,
  );

  return {
    ...response.data,
    model: response.model,
    provider: response.provider,
  };
}

export async function chooseNextTool(
  options: {
    goal: string;
    taskType: TaskType;
    currentStep: PlanStep;
    budgetLow?: boolean;
    currentFacts?: Record<string, unknown>;
    unresolvedIssues?: string[];
  },
  requestOptions: RequestOptions = {},
): Promise<{
  toolName: ToolName;
  reason: string;
  source: "llm-lite" | "rule";
  model?: string;
  provider?: ProviderName;
}> {
  const fallbackTool = options.currentStep.allowedTools[0];
  if (!fallbackTool) {
    throw new RuntimeError("Current plan step does not expose any allowed tools.", "NO_ALLOWED_TOOLS");
  }

  try {
    const response = await requestProviderJson(
      buildNextToolPrompt(options),
      nextToolSelectionSchema,
      "simple",
      requestOptions,
    );

    const selected = response.data.toolName as ToolName;
    if (!options.currentStep.allowedTools.includes(selected)) {
      throw new RuntimeError("The model selected a tool outside allowedTools.", "TOOL_NOT_ALLOWED");
    }

    return {
      toolName: selected,
      reason: response.data.reason,
      source: "llm-lite",
      model: response.model,
      provider: response.provider,
    };
  } catch (error) {
    return {
      toolName: fallbackTool,
      reason: error instanceof Error ? `fallback to first allowed tool: ${error.message}` : "fallback to first allowed tool",
      source: "rule",
    };
  }
}

export async function reorderResearchCandidates(
  options: {
    goal: string;
    searchQuery: string;
    candidates: ResearchCandidate[];
  },
  requestOptions: RequestOptions = {},
): Promise<{
  candidates: ResearchCandidate[];
  reason: string;
  source: "llm-lite" | "rule";
  model?: string;
  provider?: ProviderName;
}> {
  if (options.candidates.length <= 1) {
    return {
      candidates: options.candidates,
      reason: "skip reorder because there are not enough candidates",
      source: "rule",
    };
  }

  try {
    const response = await requestProviderJson(
      buildResearchCandidateReorderPrompt({
        goal: options.goal,
        searchQuery: options.searchQuery,
        candidates: options.candidates.map((candidate, index) => ({
          index,
          title: candidate.title,
          url: candidate.url,
          source: candidate.source,
          snippet: candidate.snippet,
          rank: candidate.rank,
        })),
      }),
      researchCandidateReorderSchema,
      "simple",
      requestOptions,
    );

    const orderedIndexes = response.data.orderedIndexes;
    const expectedIndexes = new Set(options.candidates.map((_, index) => index));
    if (
      orderedIndexes.length !== options.candidates.length ||
      orderedIndexes.some((index) => !expectedIndexes.has(index)) ||
      new Set(orderedIndexes).size !== options.candidates.length
    ) {
      throw new RuntimeError("The model returned an invalid research candidate reorder.", "INVALID_CANDIDATE_REORDER");
    }

    return {
      candidates: orderedIndexes.map((index) => options.candidates[index]!),
      reason: response.data.reason ?? "reordered first-page research candidates",
      source: "llm-lite",
      model: response.model,
      provider: response.provider,
    };
  } catch (error) {
    return {
      candidates: options.candidates,
      reason: error instanceof Error ? `fallback to filtered order: ${error.message}` : "fallback to filtered order",
      source: "rule",
    };
  }
}

export async function reorderSiteCandidates(
  options: {
    goal: string;
    targetDomain?: string;
    candidates: ResearchCandidate[];
  },
  requestOptions: RequestOptions = {},
): Promise<{
  candidates: ResearchCandidate[];
  reason: string;
  source: "llm-lite" | "rule";
  model?: string;
  provider?: ProviderName;
}> {
  if (options.candidates.length <= 1) {
    return {
      candidates: options.candidates,
      reason: "skip reorder because there are not enough site candidates",
      source: "rule",
    };
  }

  try {
    const response = await requestProviderJson(
      buildSiteCandidateReorderPrompt({
        goal: options.goal,
        targetDomain: options.targetDomain,
        candidates: options.candidates.map((candidate, index) => ({
          index,
          title: candidate.title,
          url: candidate.url,
          linkText: candidate.linkText,
          linkLocation: candidate.linkLocation,
          score: candidate.score,
          rank: candidate.rank,
        })),
      }),
      researchCandidateReorderSchema,
      "simple",
      requestOptions,
    );

    const orderedIndexes = response.data.orderedIndexes;
    const expectedIndexes = new Set(options.candidates.map((_, index) => index));
    if (
      orderedIndexes.length !== options.candidates.length ||
      orderedIndexes.some((index) => !expectedIndexes.has(index)) ||
      new Set(orderedIndexes).size !== options.candidates.length
    ) {
      throw new RuntimeError("The model returned an invalid site candidate reorder.", "INVALID_SITE_CANDIDATE_REORDER");
    }

    return {
      candidates: orderedIndexes.map((index) => options.candidates[index]!),
      reason: response.data.reason ?? "reordered same-site navigation candidates",
      source: "llm-lite",
      model: response.model,
      provider: response.provider,
    };
  } catch (error) {
    return {
      candidates: options.candidates,
      reason: error instanceof Error ? `fallback to rule-ranked order: ${error.message}` : "fallback to rule-ranked order",
      source: "rule",
    };
  }
}
