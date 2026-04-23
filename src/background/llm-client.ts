import { z } from "zod";
import { LIMITS } from "../shared/constants";
import { RuntimeError } from "../shared/errors";
import {
  finalResultSynthesisSchema,
  queryRefinementSchema,
  researchCandidateReorderSchema,
  roundDecisionSchema,
  sourceFactCardSchema,
  taskRouteSchema,
} from "../shared/schema";
import type {
  ConversationTurn,
  DirectAnswerTaskSpec,
  ExtractedItem,
  LlmProfile,
  PublicResearchTaskSpec,
  ResearchCandidate,
  ResearchSourceResult,
  SearchTaskSpec,
  SiteOverviewTaskSpec,
  SourceFactCard,
  TaskType,
} from "../shared/types";
import {
  buildDirectAnswerPrompt,
  buildFinalResultPrompt,
  buildCommerceQueryRefinementPrompt,
  buildRoundDecisionPrompt,
  buildResearchCandidateReorderPrompt,
  buildResearchQueryRefinementPrompt,
  buildSourceFactCardPrompt,
  buildSiteCandidateReorderPrompt,
  buildTaskRoutePromptWithContext,
} from "./prompting";

type ProviderName = "gemini" | "openai-compatible";

const env = import.meta.env as Record<string, string | undefined>;

const DEFAULT_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_OPENAI_COMPATIBLE_BASE_URL = "https://api.deepseek.com";
const DEFAULT_OPENAI_COMPATIBLE_MODEL = "deepseek-chat";
const DEFAULT_LLM_PROFILE: LlmProfile = "external";

function readEnv(...keys: string[]) {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function normalizeLlmProfile(profile: string | undefined): LlmProfile | undefined {
  const normalized = profile?.trim().toLowerCase();
  if (normalized === "local") {
    return "local";
  }

  if (normalized === "external" || normalized === "remote") {
    return "external";
  }

  return undefined;
}

function normalizeProvider(provider: string | undefined): ProviderName | undefined {
  const normalized = provider?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  if (normalized === "gemini") {
    return "gemini";
  }

  if (normalized === "openai-compatible" || normalized === "openai" || normalized === "deepseek" || normalized === "api") {
    return "openai-compatible";
  }

  return undefined;
}

function normalizeBaseUrl(baseUrl: string | undefined, pathSuffix?: string) {
  if (!baseUrl) {
    return undefined;
  }

  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (pathSuffix && trimmed.endsWith(pathSuffix)) {
    return trimmed.slice(0, -pathSuffix.length);
  }

  return trimmed;
}

function resolveInitialLlmProfile(): LlmProfile {
  return normalizeLlmProfile(readEnv("VITE_LLM_PROFILE", "VITE_LLM_DEFAULT_PROFILE")) ?? DEFAULT_LLM_PROFILE;
}

let activeLlmProfile: LlmProfile = resolveInitialLlmProfile();

export function setActiveLlmProfile(profile: LlmProfile | undefined) {
  activeLlmProfile = normalizeLlmProfile(profile) ?? activeLlmProfile;
}

export function getActiveLlmProfile() {
  return activeLlmProfile;
}

interface LlmConfig {
  provider: ProviderName;
  apiKey?: string;
  baseUrl: string;
  model: string;
  simpleModel: string;
  simpleModelFallback?: string;
}

function resolveLlmConfig(profile: LlmProfile = activeLlmProfile): LlmConfig {
  if (profile === "local") {
    const provider = normalizeProvider(readEnv("VITE_LLM_LOCAL_PROVIDER", "LOCAL_MODEL_PROVIDER", "VITE_LLM_PROVIDER")) ?? "openai-compatible";
    const baseUrl = normalizeBaseUrl(
      readEnv(
        "VITE_LLM_LOCAL_BASE_URL",
        "VITE_LLM_LOCAL_API_URL",
        "LOCAL_MODEL_API_URL",
        "VITE_LLM_BASE_URL",
        "VITE_OPENAI_BASE_URL",
        "VITE_DEEPSEEK_BASE_URL",
      ),
      "/chat/completions",
    ) || DEFAULT_OPENAI_COMPATIBLE_BASE_URL;
    const apiKey = readEnv(
      "VITE_LLM_LOCAL_API_KEY",
      "LOCAL_MODEL_API_KEY",
      "VITE_LLM_API_KEY",
      "VITE_OPENAI_API_KEY",
      "VITE_DEEPSEEK_API_KEY",
      "deep-seek-api-key",
    );
    const model = readEnv("VITE_LLM_LOCAL_MODEL", "LOCAL_MODEL_NAME", "VITE_LLM_MODEL", "VITE_OPENAI_MODEL", "VITE_DEEPSEEK_MODEL") || DEFAULT_OPENAI_COMPATIBLE_MODEL;
    const simpleModel = readEnv(
      "VITE_LLM_LOCAL_SIMPLE_MODEL",
      "VITE_LLM_SIMPLE_MODEL",
      "VITE_OPENAI_SIMPLE_MODEL",
      "VITE_DEEPSEEK_SIMPLE_MODEL",
    ) || model;
    const simpleModelFallback = readEnv(
      "VITE_LLM_LOCAL_SIMPLE_MODEL_FALLBACK",
      "VITE_LLM_SIMPLE_MODEL_FALLBACK",
      "VITE_OPENAI_SIMPLE_MODEL_FALLBACK",
      "VITE_DEEPSEEK_SIMPLE_MODEL_FALLBACK",
    ) || model;
    return {
      provider,
      apiKey,
      baseUrl,
      model,
      simpleModel,
      simpleModelFallback,
    };
  }

  const provider =
    normalizeProvider(readEnv("VITE_LLM_EXTERNAL_PROVIDER", "VITE_LLM_PROVIDER")) ??
    (readEnv("VITE_GEMINI_API_KEY", "VITE_GEMINI_MODEL", "VITE_GEMINI_BASE_URL") ? "gemini" : "openai-compatible");

  if (provider === "gemini") {
    const baseUrl = normalizeBaseUrl(readEnv("VITE_LLM_EXTERNAL_BASE_URL", "VITE_GEMINI_BASE_URL", "VITE_LLM_BASE_URL"), "/chat/completions") || DEFAULT_GEMINI_BASE_URL;
    const apiKey = readEnv("VITE_LLM_EXTERNAL_API_KEY", "VITE_GEMINI_API_KEY", "VITE_LLM_API_KEY");
    const model = readEnv("VITE_LLM_EXTERNAL_MODEL", "VITE_GEMINI_MODEL", "VITE_LLM_MODEL") || "gemini-2.0-flash";
    const simpleModel = readEnv("VITE_LLM_EXTERNAL_SIMPLE_MODEL", "VITE_GEMINI_SIMPLE_MODEL", "VITE_LLM_SIMPLE_MODEL") || "gemini-3.1-flash-lite-preview";
    const simpleModelFallback = readEnv(
      "VITE_LLM_EXTERNAL_SIMPLE_MODEL_FALLBACK",
      "VITE_GEMINI_SIMPLE_MODEL_FALLBACK",
      "VITE_LLM_SIMPLE_MODEL_FALLBACK",
    ) || "gemini-2.5-flash-lite";
    return {
      provider,
      apiKey,
      baseUrl,
      model,
      simpleModel,
      simpleModelFallback,
    };
  }

  const baseUrl =
    normalizeBaseUrl(readEnv("VITE_LLM_EXTERNAL_BASE_URL", "VITE_LLM_BASE_URL", "VITE_OPENAI_BASE_URL", "VITE_DEEPSEEK_BASE_URL"), "/chat/completions") ||
    DEFAULT_OPENAI_COMPATIBLE_BASE_URL;
  const apiKey = readEnv(
    "VITE_LLM_EXTERNAL_API_KEY",
    "VITE_LLM_API_KEY",
    "VITE_OPENAI_API_KEY",
    "VITE_DEEPSEEK_API_KEY",
    "deep-seek-api-key",
  );
  const model = readEnv("VITE_LLM_EXTERNAL_MODEL", "VITE_LLM_MODEL", "VITE_OPENAI_MODEL", "VITE_DEEPSEEK_MODEL") || DEFAULT_OPENAI_COMPATIBLE_MODEL;
  const simpleModel = readEnv(
    "VITE_LLM_EXTERNAL_SIMPLE_MODEL",
    "VITE_LLM_SIMPLE_MODEL",
    "VITE_OPENAI_SIMPLE_MODEL",
    "VITE_DEEPSEEK_SIMPLE_MODEL",
  ) || model;
  const simpleModelFallback = readEnv(
    "VITE_LLM_EXTERNAL_SIMPLE_MODEL_FALLBACK",
    "VITE_LLM_SIMPLE_MODEL_FALLBACK",
    "VITE_OPENAI_SIMPLE_MODEL_FALLBACK",
    "VITE_DEEPSEEK_SIMPLE_MODEL_FALLBACK",
  ) || model;
  return {
    provider: "openai-compatible",
    apiKey,
    baseUrl,
    model,
    simpleModel,
    simpleModelFallback,
  };
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

interface OpenAiCompatibleResponse {
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
  return resolveLlmConfig().provider;
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

export function buildOpenAiCompatibleRequestBody(prompt: string, model = DEFAULT_OPENAI_COMPATIBLE_MODEL) {
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

export const buildDeepSeekRequestBody = buildOpenAiCompatibleRequestBody;

export function extractJsonText(response: GeminiResponse): string {
  const text = response.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!text) {
    throw new RuntimeError("Gemini returned an empty response.", "EMPTY_LLM_RESPONSE");
  }
  return text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
}

export function extractOpenAiCompatibleJsonText(response: OpenAiCompatibleResponse): string {
  const text = response.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new RuntimeError("OpenAI-compatible model returned an empty response.", "EMPTY_LLM_RESPONSE");
  }
  return text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
}

export const extractDeepSeekJsonText = extractOpenAiCompatibleJsonText;

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
  const config = provider === "gemini" ? resolveLlmConfig("external") : resolveLlmConfig();

  if (provider === "openai-compatible") {
    if (task === "simple") {
      return Array.from(new Set([config.simpleModel, config.model].filter(isDefined)));
    }

    return Array.from(new Set([config.model].filter(isDefined)));
  }

  if (task === "simple") {
    return Array.from(new Set([config.simpleModel, config.simpleModelFallback, config.model].filter(isDefined)));
  }

  return Array.from(new Set([config.model].filter(isDefined)));
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new RuntimeError("The session was stopped.", "SESSION_STOPPED");
  }
}

function joinUrl(baseUrl: string, path: string) {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  const normalizedPath = path.replace(/^\/+/, "");
  if (normalizedBaseUrl.endsWith(normalizedPath)) {
    return normalizedBaseUrl;
  }
  return `${normalizedBaseUrl}/${normalizedPath}`;
}

async function requestGemini(prompt: string, modelCandidates: string[], options: RequestOptions = {}) {
  const config = resolveLlmConfig("external");
  if (!config.apiKey) {
    throw new RuntimeError("Missing LLM API key.", "MISSING_API_KEY");
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
        `${joinUrl(config.baseUrl, model)}:generateContent?key=${config.apiKey}`,
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

async function requestOpenAiCompatible(prompt: string, modelCandidates: string[], options: RequestOptions = {}) {
  const config = resolveLlmConfig();
  if (!config.apiKey) {
    throw new RuntimeError("Missing LLM API key.", "MISSING_API_KEY");
  }

  throwIfAborted(options.signal);

  let lastError: unknown;

  for (const model of modelCandidates) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LIMITS.LLM_TIMEOUT_MS);
    const abortListener = () => controller.abort();
    options.signal?.addEventListener("abort", abortListener, { once: true });

    try {
      const response = await fetch(joinUrl(config.baseUrl, "chat/completions"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(buildOpenAiCompatibleRequestBody(prompt, model)),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        const error = new RuntimeError(`OpenAI-compatible request failed: ${response.status}`, "LLM_HTTP_ERROR");
        (error as RuntimeError & { cause?: string }).cause = body;
        throw error;
      }

      const data = (await response.json()) as OpenAiCompatibleResponse;
      return {
        raw: extractOpenAiCompatibleJsonText(data),
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
        throw new RuntimeError("OpenAI-compatible request timed out.", "LLM_TIMEOUT");
      }

      lastError = error;
      if (model === modelCandidates.at(-1)) {
        throw new RuntimeError(error instanceof Error ? error.message : "OpenAI-compatible request failed.", "LLM_UNKNOWN_ERROR");
      }
    } finally {
      clearTimeout(timeoutId);
      options.signal?.removeEventListener("abort", abortListener);
    }
  }

  throw lastError instanceof RuntimeError
    ? lastError
    : new RuntimeError(lastError instanceof Error ? lastError.message : "OpenAI-compatible request failed.", "LLM_UNKNOWN_ERROR");
}

async function requestProvider(prompt: string, task: "simple" | "default", options: RequestOptions = {}) {
  const provider = getConfiguredProvider();
  const candidates = getModelCandidates(task, provider);

  if (provider === "openai-compatible") {
    return requestOpenAiCompatible(prompt, candidates, options);
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
  confidence?: number;
  decisionSignals?: string[];
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

function compactText(text: string | undefined, maxLength: number) {
  const normalized = (text ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }

  return normalized.length > maxLength ? `${normalized.slice(0, Math.max(0, maxLength - 3))}...` : normalized;
}

function buildPromptFactCard(source: ResearchSourceResult): SourceFactCard {
  if (source.sourceFactCard) {
    return source.sourceFactCard;
  }

  const title = source.pageTitle || source.candidate.title;
  const compactFact = compactText(source.bodyExcerpt, 220);
  return {
    title,
    url: source.sourceUrl,
    summary: compactFact || `No readable facts were extracted from ${title}.`,
    facts: compactFact
      ? [
          {
            text: compactFact,
            evidenceUrl: source.sourceUrl,
            evidenceTitle: title,
          },
        ]
      : [],
    caveats: source.unresolvedIssues,
    status: source.status === "success" ? "success" : "partial",
  };
}

function buildFinalPromptSources(sources: ResearchSourceResult[] | undefined) {
  return (sources ?? []).map((source) => ({
    title: source.pageTitle || source.candidate.title,
    url: source.sourceUrl,
    status: source.status,
    textLength: source.textLength,
    unresolvedIssues: source.unresolvedIssues,
    sourceFactCard: buildPromptFactCard(source),
  }));
}

export async function generateSourceFactCard(
  input: {
    goal: string;
    title: string;
    url: string;
    text: string;
    unresolvedIssues?: string[];
  },
  options: RequestOptions = {},
) {
  const response = await requestProviderJson(
    buildSourceFactCardPrompt({
      ...input,
      text: compactText(input.text, LIMITS.SOURCE_FACT_MAX_INPUT_CHARS),
    }),
    sourceFactCardSchema,
    "simple",
    options,
  );

  return {
    ...response.data,
    title: response.data.title || input.title,
    url: input.url,
    facts: (response.data.facts ?? []).map((fact) => ({
      ...fact,
      evidenceUrl: input.url,
      evidenceTitle: fact.evidenceTitle || response.data.title || input.title,
    })),
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
    buildFinalResultPrompt({
      ...input,
      sources: buildFinalPromptSources(input.sources),
    }),
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

export interface RoundDecisionTaskSpecPatch {
  searchQuery?: string;
  officialSearchQuery?: string;
  entryUrl?: string;
  candidateLimit?: number;
  sourceTargetCount?: number;
  pageReadLimit?: number;
  topK?: number;
  llmInputLimit?: number;
  extractLimit?: number;
  notesAppend?: string[];
}

export interface RoundDecisionResult {
  decision: "finalize" | "replan" | "abort";
  reason: string;
  nextRoundSummary?: string;
  taskSpecPatch?: RoundDecisionTaskSpecPatch;
  source: "llm-lite" | "rule";
  model?: string;
  provider?: ProviderName;
}

function buildFallbackRoundDecision(
  input: {
    taskType: Exclude<TaskType, "direct_answer">;
    taskSpec: SearchTaskSpec | PublicResearchTaskSpec | SiteOverviewTaskSpec;
    roundIndex: number;
    maxRounds: number;
    items?: ExtractedItem[];
    sources?: ResearchSourceResult[];
    unresolvedIssues?: string[];
  },
  fallbackReason: string,
): RoundDecisionResult {
  const successSourceCount = (input.sources ?? []).filter((source) => source.status === "success").length;
  const usableSourceCount = (input.sources ?? []).filter((source) => source.status !== "failed").length;
  const itemCount = input.items?.length ?? 0;
  const hasEvidence = itemCount > 0 || usableSourceCount > 0;
  const reachedMaxRounds = input.roundIndex >= input.maxRounds;
  const reasonPrefix = `fallback: ${fallbackReason}`;

  if (input.taskType === "commerce_search") {
    const commerceTaskSpec = input.taskSpec as SearchTaskSpec;
    if (itemCount > 0) {
      return {
        decision: "finalize",
        reason: `${reasonPrefix}；已经有可汇总的候选商品。`,
        source: "rule",
      };
    }

    if (reachedMaxRounds) {
      return {
        decision: "abort",
        reason: `${reasonPrefix}；没有收集到可用商品且已到最大轮次。`,
        source: "rule",
      };
    }

    return {
      decision: "replan",
      reason: `${reasonPrefix}；先再尝试一轮更宽的商品收集。`,
      nextRoundSummary: "调整搜索词并扩大候选收集范围。",
      taskSpecPatch: {
        llmInputLimit: Math.min(commerceTaskSpec.llmInputLimit + 1, commerceTaskSpec.extractLimit + 2),
        extractLimit: commerceTaskSpec.extractLimit + 2,
        notesAppend: ["Fallback replan after insufficient commerce evidence."],
      },
      source: "rule",
    };
  }

  if (successSourceCount >= 2 || (hasEvidence && reachedMaxRounds)) {
    return {
      decision: "finalize",
      reason: `${reasonPrefix}；现有证据已足够进入最终总结。`,
      source: "rule",
    };
  }

  if (reachedMaxRounds) {
    return {
      decision: hasEvidence ? "finalize" : "abort",
      reason: hasEvidence
        ? `${reasonPrefix}；已到最大轮次，使用现有证据收尾。`
        : `${reasonPrefix}；没有新增有效证据且已到最大轮次。`,
      source: "rule",
    };
  }

  if (input.taskType === "site_overview") {
    const siteTaskSpec = input.taskSpec as SiteOverviewTaskSpec;
    return {
      decision: "replan",
      reason: `${reasonPrefix}；先补读更多站内页面再决定是否收尾。`,
      nextRoundSummary: "继续同站补读高价值页面。",
      taskSpecPatch: {
        pageReadLimit: Math.min(siteTaskSpec.pageReadLimit + 2, 8),
        notesAppend: ["Fallback replan after insufficient site coverage."],
      },
      source: "rule",
    };
  }

  const researchTaskSpec = input.taskSpec as PublicResearchTaskSpec;
  return {
    decision: "replan",
    reason: `${reasonPrefix}；先补读更多候选来源再决定是否收尾。`,
    nextRoundSummary: "扩大候选读取范围并继续补证据。",
    taskSpecPatch: {
      candidateLimit: Math.min(researchTaskSpec.candidateLimit + 2, 8),
      sourceTargetCount: Math.min(researchTaskSpec.sourceTargetCount + 1, 4),
      notesAppend: ["Fallback replan after insufficient research evidence."],
    },
    source: "rule",
  };
}

export async function decideRoundAction(
  input: {
    goal: string;
    taskType: Exclude<TaskType, "direct_answer">;
    taskSpec: SearchTaskSpec | PublicResearchTaskSpec | SiteOverviewTaskSpec;
    roundIndex: number;
    maxRounds: number;
    currentFacts?: Record<string, unknown>;
    unresolvedIssues?: string[];
    candidates?: ResearchCandidate[];
    sources?: ResearchSourceResult[];
    items?: ExtractedItem[];
    filterDiagnostics?: unknown;
  },
  options: RequestOptions = {},
): Promise<RoundDecisionResult> {
  try {
    const response = await requestProviderJson(
      buildRoundDecisionPrompt({
        ...input,
        candidates: (input.candidates ?? []).slice(0, 6).map((candidate) => ({
          title: candidate.title,
          url: candidate.url,
          source: candidate.source,
          rank: candidate.rank,
        })),
        sources: (input.sources ?? []).slice(0, 6).map((source) => ({
          title: source.pageTitle || source.candidate.title,
          url: source.sourceUrl,
          status: source.status,
          textLength: source.textLength,
          unresolvedIssues: source.unresolvedIssues.slice(0, 3),
        })),
        items: (input.items ?? []).slice(0, 6).map((item) => ({
          title: item.title,
          url: item.url,
          priceText: item.priceText,
          summary: item.summary,
        })),
      }),
      roundDecisionSchema,
      "simple",
      options,
    );

    return {
      ...response.data,
      source: "llm-lite",
      model: response.model,
      provider: response.provider,
    };
  } catch (error) {
    return buildFallbackRoundDecision(input, error instanceof Error ? error.message : "Round decision failed");
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
