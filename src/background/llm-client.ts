import { LIMITS } from "../shared/constants";
import { RuntimeError } from "../shared/errors";
import { llmDecisionSchema, planningResultSchema } from "../shared/schema";
import type { LlmDecision, PlanningResult, SessionMemory } from "../shared/types";
import { buildDecisionPrompt, buildPlanningPrompt, normalizePlanningResult } from "./prompting";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_MODEL = import.meta.env.VITE_GEMINI_MODEL || "gemini-2.0-flash";

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

interface RequestOptions {
  signal?: AbortSignal;
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

export function extractJsonText(response: GeminiResponse): string {
  const text = response.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!text) {
    throw new RuntimeError("Gemini 返回内容为空。", "EMPTY_LLM_RESPONSE");
  }
  return text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
}

export function extractFirstJsonBlock(raw: string): string {
  const text = raw.trim();
  const startIndex = text.search(/[\[{]/);
  if (startIndex < 0) {
    throw new RuntimeError("模型返回中未找到 JSON 内容。", "LLM_JSON_NOT_FOUND");
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

  throw new RuntimeError("模型返回中的 JSON 结构不完整。", "LLM_JSON_INCOMPLETE");
}

export function parseModelJson(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    const extracted = extractFirstJsonBlock(raw);
    return JSON.parse(extracted);
  }
}

async function requestGemini(prompt: string, options: RequestOptions = {}): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new RuntimeError("缺少 VITE_GEMINI_API_KEY，请先配置环境变量。", "MISSING_API_KEY");
  }

  if (options.signal?.aborted) {
    throw new RuntimeError("任务已停止。", "SESSION_STOPPED");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LIMITS.LLM_TIMEOUT_MS);
  const abortListener = () => controller.abort();
  options.signal?.addEventListener("abort", abortListener, { once: true });

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
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
      throw new RuntimeError(`Gemini 请求失败：${response.status}`, "LLM_HTTP_ERROR");
    }

    const data = (await response.json()) as GeminiResponse;
    return extractJsonText(data);
  } catch (error) {
    if (error instanceof RuntimeError) {
      throw error;
    }

    if (options.signal?.aborted) {
      throw new RuntimeError("任务已停止。", "SESSION_STOPPED");
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new RuntimeError("Gemini 请求超时。", "LLM_TIMEOUT");
    }

    throw new RuntimeError(error instanceof Error ? error.message : "Gemini 请求失败。", "LLM_UNKNOWN_ERROR");
  } finally {
    clearTimeout(timeoutId);
    options.signal?.removeEventListener("abort", abortListener);
  }
}

export async function requestPlan(memory: SessionMemory, options: RequestOptions = {}): Promise<PlanningResult> {
  const raw = await requestGemini(buildPlanningPrompt(memory), options);
  const parsed = planningResultSchema.parse(parseModelJson(raw));
  return normalizePlanningResult(parsed);
}

export async function requestDecision(memory: SessionMemory, options: RequestOptions = {}): Promise<LlmDecision> {
  const raw = await requestGemini(buildDecisionPrompt(memory), options);
  const parsed = llmDecisionSchema.parse(parseModelJson(raw));
  return parsed;
}
