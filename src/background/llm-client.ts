import { LIMITS } from "../shared/constants";
import { llmDecisionSchema, planningResultSchema } from "../shared/schema";
import type { LlmDecision, PlanningResult, SessionMemory } from "../shared/types";
import { RuntimeError } from "../shared/errors";
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
    throw new RuntimeError("Gemini returned an empty response.", "EMPTY_LLM_RESPONSE");
  }
  return text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
}

async function requestGemini(prompt: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new RuntimeError("Missing VITE_GEMINI_API_KEY in .env.local.", "MISSING_API_KEY");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LIMITS.LLM_TIMEOUT_MS);

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
      throw new RuntimeError(`Gemini request failed: ${response.status}`, "LLM_HTTP_ERROR");
    }

    const data = (await response.json()) as GeminiResponse;
    return extractJsonText(data);
  } catch (error) {
    if (error instanceof RuntimeError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new RuntimeError("Gemini request timed out.", "LLM_TIMEOUT");
    }

    throw new RuntimeError(
      error instanceof Error ? error.message : "Gemini request failed.",
      "LLM_UNKNOWN_ERROR",
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function requestPlan(memory: SessionMemory): Promise<PlanningResult> {
  const raw = await requestGemini(buildPlanningPrompt(memory));
  const parsed = planningResultSchema.parse(JSON.parse(raw));
  return normalizePlanningResult(parsed);
}

export async function requestDecision(memory: SessionMemory): Promise<LlmDecision> {
  const raw = await requestGemini(buildDecisionPrompt(memory));
  const parsed = llmDecisionSchema.parse(JSON.parse(raw));
  return parsed;
}
