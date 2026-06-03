import { z } from "zod";
import { LIMITS } from "../../shared/agent-runtime-config";
import { RuntimeError } from "../../shared/runtime-error";
import {
  queryRefinementSchema,
  researchCandidateReorderSchema,
  roundDecisionSchema,
  taskPlannerSchema,
  taskRouteSchema,
} from "../../shared/llm-runtime-contract-schemas";
import type {
  ConversationTurn,
  ExtractedItem,
  FinalSynthesisInput,
  LlmProfile,
  PublicResearchTaskSpec,
  ResearchCandidate,
  ResearchEvidenceBundle,
  ResearchSourceResult,
  SearchTaskSpec,
  SiteOverviewTaskSpec,
  TaskType,
} from "../../shared/agent-domain-model";
import {
  buildCommerceQueryRefinementPrompt,
  buildFinalMarkdownPrompt,
  buildRoundDecisionPrompt,
  buildResearchCandidateReorderPrompt,
  buildResearchQueryRefinementPrompt,
  buildTaskPlannerPromptWithContext,
  buildTaskPlanOrDirectAnswerPrompt,
  buildSiteCandidateReorderPrompt,
  buildTaskRoutePromptWithContext,
} from "./llm-prompt-builders";

type ProviderName = "gemini" | "openai-compatible";

const env = import.meta.env as Record<string, string | undefined>;


const DEFAULT_OPENAI_COMPATIBLE_BASE_URL = "https://api.deepseek.com";
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

import type { UserLlmConfigs } from "../../shared/agent-domain-model";



let userLlmConfigsCache: UserLlmConfigs = {
  external: {
    apiKey: "",
    baseUrl: "https://api.deepseek.com",
    modelPro: "deepseek-v4-pro",
    modelFlash: "deepseek-v4-flash"
  },
  local: {
    apiKey: "",
    baseUrl: "http://localhost:11434/v1",
    modelPro: "deepseek-r1:70b",
    modelFlash: "qwen2.5:14b"
  }
};

// Initialize and listen to storage changes
if (typeof chrome !== "undefined" && chrome.storage) {
  chrome.storage.local.get(["userLlmConfigs"], (res) => {
    if (res.userLlmConfigs) {
      userLlmConfigsCache = {
        external: { ...userLlmConfigsCache.external, ...res.userLlmConfigs.external },
        local: { ...userLlmConfigsCache.local, ...res.userLlmConfigs.local }
      };
    }
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.userLlmConfigs) {
      const newVal = changes.userLlmConfigs.newValue;
      if (newVal) {
        userLlmConfigsCache = {
          external: { ...userLlmConfigsCache.external, ...newVal.external },
          local: { ...userLlmConfigsCache.local, ...newVal.local }
        };
      }
    }
  });
}

function resolveInitialLlmProfile(): LlmProfile {
  return normalizeLlmProfile(readEnv("VITE_LLM_PROFILE", "VITE_LLM_DEFAULT_PROFILE")) ?? DEFAULT_LLM_PROFILE;
}

let activeLlmProfile: LlmProfile = resolveInitialLlmProfile();

export function setActiveLlmProfile(profile: LlmProfile | undefined) {
  activeLlmProfile = normalizeLlmProfile(profile) ?? activeLlmProfile;
}

interface LlmConfig {
  apiKey?: string;
  baseUrl: string;
  modelPro: string;
  modelFlash: string;
}

function resolveLlmConfig(profile: LlmProfile = activeLlmProfile): LlmConfig {
  const custom = userLlmConfigsCache[profile];
  // Fallback to environment variables if storage is empty
  const envPrefix = profile === "local" ? "LOCAL" : "EXTERNAL";
  const apiKey = custom.apiKey || readEnv(
    `VITE_LLM_${envPrefix}_API_KEY`,
    "VITE_LLM_API_KEY",
    "VITE_OPENAI_API_KEY",
    "VITE_DEEPSEEK_API_KEY",
    "deep-seek-api-key"
  );
  const baseUrl = custom.baseUrl || normalizeBaseUrl(readEnv(
    `VITE_LLM_${envPrefix}_BASE_URL`,
    "VITE_LLM_BASE_URL",
    "VITE_OPENAI_BASE_URL",
    "VITE_DEEPSEEK_BASE_URL"
  )) || (profile === "local" ? "http://localhost:11434/v1" : DEFAULT_OPENAI_COMPATIBLE_BASE_URL);

  const modelPro = custom.modelPro || readEnv(`VITE_LLM_${envPrefix}_MODEL`, "VITE_LLM_MODEL") || (profile === "local" ? "deepseek-r1:70b" : "deepseek-v4-pro");
  const modelFlash = custom.modelFlash || readEnv(`VITE_LLM_${envPrefix}_SIMPLE_MODEL`, "VITE_LLM_SIMPLE_MODEL") || (profile === "local" ? "qwen2.5:14b" : "deepseek-v4-flash");

  return {
    apiKey,
    baseUrl,
    modelPro,
    modelFlash
  };
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

interface RequestBodyOptions {
  jsonMode?: boolean;
  stream?: boolean;
}

interface StreamMarkdownOptions extends RequestOptions {
  onDelta?: (delta: string) => void | Promise<void>;
}

export function buildOpenAiCompatibleRequestBody(prompt: string, model: string, options: RequestBodyOptions = {}) {
  const jsonMode = options.jsonMode ?? true;
  const body: Record<string, any> = {
    model,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  };

  if (options.stream) {
    body.stream = true;
  }

  // deepseek reasoning models (e.g. deepseek-reasoner, deepseek-v4-pro) do not support response_format = json_object and custom temperature.
  // We exclude these parameters dynamically to avoid API 400 validation failures.
  if (
    model !== "deepseek-reasoner" &&
    model !== "deepseek-v4-pro" &&
    !model.includes("reasoner") &&
    !model.includes("v4-pro")
  ) {
    body.temperature = 0.2;
    if (jsonMode) {
      body.response_format = {
        type: "json_object",
      };
    }
  }

  return body;
}

export function extractOpenAiCompatibleJsonText(response: OpenAiCompatibleResponse): string {
  const text = response.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new RuntimeError("Model returned an empty response.", "EMPTY_LLM_RESPONSE");
  }
  return text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
}

export function extractFirstJsonBlock(raw: string): string {
  const text = raw.trim();
  const startIndex = text.search(/[[{]/);
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

export function getModelCandidates(task: "simple" | "default") {
  const config = resolveLlmConfig();
  if (task === "simple") {
    return [config.modelFlash];
  }
  return [config.modelPro];
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

async function requestOpenAiCompatible(prompt: string, modelCandidates: string[], options: RequestOptions = {}) {
  const config = resolveLlmConfig();
  if (!config.apiKey && activeLlmProfile === "external") {
    throw new RuntimeError("Missing LLM API key.", "MISSING_API_KEY");
  }

  throwIfAborted(options.signal);

  let lastError: unknown;

  for (const model of modelCandidates) {
    const controller = new AbortController();
    // Allow extended 60s timeout for deep reasoning Pro models, 30s for fast Flash models
    const isPro = model === config.modelPro;
    const timeoutMs = isPro ? 60_000 : LIMITS.LLM_TIMEOUT_MS;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const abortListener = () => controller.abort();
    options.signal?.addEventListener("abort", abortListener, { once: true });

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (config.apiKey) {
        headers.Authorization = `Bearer ${config.apiKey}`;
      }

      const response = await fetch(joinUrl(config.baseUrl, "chat/completions"), {
        method: "POST",
        headers,
        body: JSON.stringify(buildOpenAiCompatibleRequestBody(prompt, model)),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        const error = new RuntimeError(`Model request failed: ${response.status}`, "LLM_HTTP_ERROR");
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
        throw new RuntimeError("Model request timed out.", "LLM_TIMEOUT");
      }

      lastError = error;
      if (model === modelCandidates.at(-1)) {
        throw new RuntimeError(error instanceof Error ? error.message : "Model request failed.", "LLM_UNKNOWN_ERROR");
      }
    } finally {
      clearTimeout(timeoutId);
      options.signal?.removeEventListener("abort", abortListener);
    }
  }

  throw lastError instanceof RuntimeError
    ? lastError
    : new RuntimeError(lastError instanceof Error ? lastError.message : "Model request failed.", "LLM_UNKNOWN_ERROR");
}

export function parseOpenAiCompatibleStreamEvent(eventText: string): { done: boolean; delta: string } {
  const data = eventText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.replace(/^data:\s*/, ""))
    .join("\n")
    .trim();

  if (!data) {
    return { done: false, delta: "" };
  }

  if (data === "[DONE]") {
    return { done: true, delta: "" };
  }

  try {
    const parsed = JSON.parse(data) as {
      choices?: Array<{
        delta?: { content?: string | null };
        message?: { content?: string | null };
      }>;
    };
    return {
      done: false,
      delta: parsed.choices?.[0]?.delta?.content ?? parsed.choices?.[0]?.message?.content ?? "",
    };
  } catch {
    return { done: false, delta: "" };
  }
}

async function readOpenAiCompatibleTextStream(response: Response, options: StreamMarkdownOptions) {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new RuntimeError("Model stream response body is empty.", "EMPTY_LLM_RESPONSE");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let markdown = "";
  let streamDone = false;

  const handleEvent = async (eventText: string) => {
    const event = parseOpenAiCompatibleStreamEvent(eventText);
    if (event.done) {
      streamDone = true;
      return;
    }

    if (!event.delta) {
      return;
    }

    markdown += event.delta;
    await options.onDelta?.(event.delta);
  };

  try {
    for (;;) {
      throwIfAborted(options.signal);
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() ?? "";

      for (const eventText of events) {
        await handleEvent(eventText);
      }

      if (done || streamDone) {
        break;
      }
    }

    if (buffer.trim()) {
      await handleEvent(buffer);
    }
  } finally {
    reader.releaseLock();
  }

  const trimmedMarkdown = markdown.trim();
  if (!trimmedMarkdown) {
    throw new RuntimeError("Model returned an empty streamed response.", "EMPTY_LLM_RESPONSE");
  }

  return trimmedMarkdown;
}

async function requestOpenAiCompatibleTextStream(prompt: string, modelCandidates: string[], options: StreamMarkdownOptions = {}) {
  const config = resolveLlmConfig();
  if (!config.apiKey && activeLlmProfile === "external") {
    throw new RuntimeError("Missing LLM API key.", "MISSING_API_KEY");
  }

  throwIfAborted(options.signal);
  let lastError: unknown;

  for (const model of modelCandidates) {
    const controller = new AbortController();
    const isPro = model === config.modelPro;
    const timeoutMs = isPro ? 60_000 : LIMITS.LLM_TIMEOUT_MS;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const abortListener = () => controller.abort();
    options.signal?.addEventListener("abort", abortListener, { once: true });

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (config.apiKey) {
        headers.Authorization = `Bearer ${config.apiKey}`;
      }

      const response = await fetch(joinUrl(config.baseUrl, "chat/completions"), {
        method: "POST",
        headers,
        body: JSON.stringify(buildOpenAiCompatibleRequestBody(prompt, model, { jsonMode: false, stream: true })),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        const error = new RuntimeError(`Model request failed: ${response.status}`, "LLM_HTTP_ERROR");
        (error as RuntimeError & { cause?: string }).cause = body;
        throw error;
      }

      return {
        markdown: await readOpenAiCompatibleTextStream(response, options),
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
        throw new RuntimeError("Model request timed out.", "LLM_TIMEOUT");
      }

      lastError = error;
      if (model === modelCandidates.at(-1)) {
        throw new RuntimeError(error instanceof Error ? error.message : "Model request failed.", "LLM_UNKNOWN_ERROR");
      }
    } finally {
      clearTimeout(timeoutId);
      options.signal?.removeEventListener("abort", abortListener);
    }
  }

  throw lastError instanceof RuntimeError
    ? lastError
    : new RuntimeError(lastError instanceof Error ? lastError.message : "Model request failed.", "LLM_UNKNOWN_ERROR");
}

async function requestProvider(prompt: string, task: "simple" | "default", options: RequestOptions = {}) {
  const candidates = getModelCandidates(task);
  return requestOpenAiCompatible(prompt, candidates, options);
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
    provider: "openai-compatible" as const,
  };
}

export async function refineCommerceSearchQuery(
  goal: string,
  options: RequestOptions & {
    conversationContext?: string;
    currentTimeIso?: string;
    timezone?: string;
  } = {},
) {
  const response = await requestProviderJson(
    buildCommerceQueryRefinementPrompt(goal, {
      conversationContext: options.conversationContext,
      currentTimeIso: options.currentTimeIso,
      timezone: options.timezone,
    }),
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

export async function planTaskWithLiteModel(
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
  searchQuery?: string;
  officialSearchQuery?: string;
  entryUrl?: string;
  model: string;
  provider: ProviderName;
}> {
  const response = await requestProviderJson(
    buildTaskPlannerPromptWithContext(goal, {
      conversationContext: options.conversationContext,
      conversationTurns: options.conversationTurns,
      currentTimeIso: options.currentTimeIso,
      timezone: options.timezone,
      searchPreference: options.searchPreference,
    }),
    taskPlannerSchema,
    "simple",
    options,
  );

  return {
    ...response.data,
    model: response.model,
    provider: response.provider,
  };
}

function stripRoutingHeader(markdown: string, header: "DIRECT_ANSWER" | "TASK_PLAN") {
  return markdown.replace(new RegExp(`^\\s*${header}\\s*`, "i"), "").trim();
}

export async function streamTaskPlanOrDirectAnswer(
  goal: string,
  options: StreamMarkdownOptions & {
    conversationContext?: string;
    conversationTurns?: ConversationTurn[];
    currentTimeIso?: string;
    timezone?: string;
    searchPreference?: "auto" | "prefer_search";
    onDirectAnswerDelta?: (markdown: string) => void | Promise<void>;
  } = {},
): Promise<
  | {
      kind: "direct_answer";
      markdown: string;
      model: string;
      provider: ProviderName;
    }
  | {
      kind: "task_plan";
      taskType: Exclude<TaskType, "direct_answer">;
      reason: string;
      confidence?: number;
      decisionSignals?: string[];
      searchQuery?: string;
      officialSearchQuery?: string;
      entryUrl?: string;
      model: string;
      provider: ProviderName;
    }
> {
  let mode: "unknown" | "direct_answer" | "task_plan" = "unknown";
  let headerBuffer = "";

  const response = await requestOpenAiCompatibleTextStream(
    buildTaskPlanOrDirectAnswerPrompt(goal, {
      conversationContext: options.conversationContext,
      conversationTurns: options.conversationTurns,
      currentTimeIso: options.currentTimeIso,
      timezone: options.timezone,
      searchPreference: options.searchPreference,
    }),
    getModelCandidates("simple"),
    {
      signal: options.signal,
      onDelta: async (delta) => {
        if (mode === "direct_answer") {
          await options.onDirectAnswerDelta?.(delta);
          return;
        }
        if (mode === "task_plan") {
          return;
        }

        headerBuffer += delta;
        const directMatch = headerBuffer.match(/^\s*DIRECT_ANSWER\s*(?:\r?\n)?/i);
        if (directMatch) {
          mode = "direct_answer";
          const rest = headerBuffer.slice(directMatch[0].length);
          if (rest) {
            await options.onDirectAnswerDelta?.(rest);
          }
          return;
        }

        if (/^\s*TASK_PLAN\b/i.test(headerBuffer)) {
          mode = "task_plan";
        }
      },
    },
  );

  const markdown = response.markdown.trim();
  if (/^DIRECT_ANSWER\b/i.test(markdown)) {
    return {
      kind: "direct_answer",
      markdown: stripRoutingHeader(markdown, "DIRECT_ANSWER"),
      model: response.model,
      provider: "openai-compatible",
    };
  }

  if (/^TASK_PLAN\b/i.test(markdown)) {
    const rawPlan = stripRoutingHeader(markdown, "TASK_PLAN");
    const parsed = taskPlannerSchema.parse(parseModelJson(rawPlan));
    if (parsed.taskType === "direct_answer") {
      throw new RuntimeError("TASK_PLAN must not return direct_answer.", "INVALID_TASK_PLAN");
    }
    return {
      kind: "task_plan",
      ...parsed,
      taskType: parsed.taskType,
      model: response.model,
      provider: "openai-compatible",
    };
  }

  return {
    kind: "direct_answer",
    markdown,
    model: response.model,
    provider: "openai-compatible",
  };
}

export async function refineResearchQuery(
  goal: string,
  options: RequestOptions & {
    conversationContext?: string;
    currentTimeIso?: string;
    timezone?: string;
  } = {},
) {
  const response = await requestProviderJson(
    buildResearchQueryRefinementPrompt(goal, {
      conversationContext: options.conversationContext,
      currentTimeIso: options.currentTimeIso,
      timezone: options.timezone,
    }),
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

export async function streamFinalMarkdown(input: FinalSynthesisInput, options: StreamMarkdownOptions = {}) {
  const response = await requestOpenAiCompatibleTextStream(
    buildFinalMarkdownPrompt(input),
    getModelCandidates("simple"),
    options,
  );

  return {
    markdown: response.markdown,
    model: response.model,
    provider: "openai-compatible" as const,
  };
}

interface RoundDecisionTaskSpecPatch {
  searchQuery?: string;
  officialSearchQuery?: string;
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
    researchEvidence?: ResearchEvidenceBundle;
    unresolvedIssues?: string[];
  },
  fallbackReason: string,
): RoundDecisionResult {
  const successSourceCount =
    input.researchEvidence?.coverage.readable ?? (input.sources ?? []).filter((source) => source.status === "success").length;
  const usableSourceCount =
    input.researchEvidence
      ? input.researchEvidence.coverage.readable + input.researchEvidence.coverage.partial
      : (input.sources ?? []).filter((source) => source.status !== "failed").length;
  const itemCount = input.items?.length ?? 0;
  const hasEvidence = itemCount > 0 || usableSourceCount > 0;
  const reachedMaxRounds = input.roundIndex >= input.maxRounds;
  const reasonPrefix = `fallback: ${fallbackReason}`;

  if (input.taskType === "commerce_search") {
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

  return {
    decision: "replan",
    reason: `${reasonPrefix}；先换一个更明确的查询继续补证据。`,
    nextRoundSummary: "调整查询词并继续补证据。",
    taskSpecPatch: {
      notesAppend: [`Fallback replan after insufficient ${input.taskType} evidence.`],
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
    researchEvidence?: ResearchEvidenceBundle;
    items?: ExtractedItem[];
  },
  options: RequestOptions = {},
): Promise<RoundDecisionResult> {
  try {
    const response = await requestProviderJson(
      buildRoundDecisionPrompt({
        ...input,
        sources: (input.sources ?? []).slice(0, 6).map((source) => ({
          title: source.pageTitle || source.candidate.title,
          url: source.sourceUrl,
          status: source.status,
          unresolvedIssues: source.unresolvedIssues.slice(0, 3),
        })),
        researchEvidence: input.researchEvidence
          ? {
              query: input.researchEvidence.query,
              pageCount: input.researchEvidence.pages.length,
              readable: input.researchEvidence.coverage.readable,
              partial: input.researchEvidence.coverage.partial,
              failed: input.researchEvidence.coverage.failed,
              limitations: input.researchEvidence.coverage.limitations.slice(0, 5),
              pages: input.researchEvidence.pages.slice(0, 6).map((page) => ({
                title: page.title,
                url: page.url,
                status: page.status,
                caveats: page.caveats.slice(0, 3),
              })),
            }
          : undefined,
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
