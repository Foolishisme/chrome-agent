import { describe, expect, it } from "vitest";
import { buildGeminiRequestBody, extractFirstJsonBlock, extractJsonText, getModelCandidates, parseModelJson } from "../src/background/llm-client";

describe("llm client helpers", () => {
  it("builds a JSON-mode Gemini request", () => {
    const body = buildGeminiRequestBody("hello");
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.contents[0]?.parts[0]?.text).toBe("hello");
  });

  it("prefers the simple task model for lightweight tasks", () => {
    const candidates = getModelCandidates("simple");
    expect(candidates[0]).toBe("gemini-3.1-flash-lite-preview");
  });

  it("extracts JSON text from fenced responses", () => {
    const text = extractJsonText({
      candidates: [
        {
          content: {
            parts: [
              {
                text: "```json\n{\"ok\":true}\n```",
              },
            ],
          },
        },
      ],
    });

    expect(text).toBe("{\"ok\":true}");
  });

  it("extracts the first JSON block when extra text is appended", () => {
    const raw = `{"plan":["step1","step2"]}\n补充说明`;
    expect(extractFirstJsonBlock(raw)).toBe(`{"plan":["step1","step2"]}`);
    expect(parseModelJson(raw)).toEqual({ plan: ["step1", "step2"] });
  });
});
