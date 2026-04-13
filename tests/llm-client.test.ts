import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildDeepSeekRequestBody,
  buildGeminiRequestBody,
  chooseNextTool,
  extractDeepSeekJsonText,
  extractFirstJsonBlock,
  extractJsonText,
  getModelCandidates,
  parseModelJson,
  reorderResearchCandidates,
  reorderSiteCandidates,
} from "../src/background/llm-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("llm client helpers", () => {
  it("builds a JSON-mode Gemini request", () => {
    const body = buildGeminiRequestBody("hello");
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.contents[0]?.parts[0]?.text).toBe("hello");
  });

  it("prefers the simple task model for lightweight tasks", () => {
    const candidates = getModelCandidates("simple", "gemini");
    expect(candidates[0]).toBe("gemini-3.1-flash-lite-preview");
  });

  it("builds a JSON-mode DeepSeek request", () => {
    const body = buildDeepSeekRequestBody("hello", "deepseek-chat");
    expect(body.response_format.type).toBe("json_object");
    expect(body.messages[0]?.content).toBe("hello");
    expect(body.model).toBe("deepseek-chat");
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
    const raw = `{"plan":["step1","step2"]}\nExtra explanation`;
    expect(extractFirstJsonBlock(raw)).toBe(`{"plan":["step1","step2"]}`);
    expect(parseModelJson(raw)).toEqual({ plan: ["step1", "step2"] });
  });

  it("reads JSON content from DeepSeek chat completions", () => {
    const text = extractDeepSeekJsonText({
      choices: [
        {
          message: {
            content: '{"ok":true}',
          },
        },
      ],
    });

    expect(text).toBe('{"ok":true}');
  });

  it("falls back to the first allowed tool when tool selection cannot call the model", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unavailable")));

    const result = await chooseNextTool({
      goal: "Research the difference between Playwright and Selenium",
      taskType: "public_research",
      currentStep: {
        stepId: "open-search-results",
        goal: "Open the Google search results page.",
        allowedTools: ["openSearchResults", "collectResearchCandidates"],
        successCriteria: ["The search results page is open."],
        status: "running",
      },
    });

    expect(result.toolName).toBe("openSearchResults");
    expect(result.source).toBe("rule");
  });

  it("reorders research candidates when the model returns a valid index order", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '{"orderedIndexes":[1,0],"reason":"prefer the official source first"}',
              },
            },
          ],
        }),
      }),
    );

    const result = await reorderResearchCandidates({
      goal: "Research AI agent development",
      searchQuery: "AI agent development",
      candidates: [
        { title: "Commentary", url: "https://example.com/commentary", rank: 1 },
        { title: "Official docs", url: "https://example.com/docs", rank: 2 },
      ],
    });

    expect(result.source).toBe("llm-lite");
    expect(result.candidates.map((candidate) => candidate.title)).toEqual(["Official docs", "Commentary"]);
  });

  it("falls back to the filtered order when candidate reorder is invalid", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '{"orderedIndexes":[1,1],"reason":"bad reorder"}',
              },
            },
          ],
        }),
      }),
    );

    const result = await reorderResearchCandidates({
      goal: "Research AI agent development",
      searchQuery: "AI agent development",
      candidates: [
        { title: "Commentary", url: "https://example.com/commentary", rank: 1 },
        { title: "Official docs", url: "https://example.com/docs", rank: 2 },
      ],
    });

    expect(result.source).toBe("rule");
    expect(result.candidates.map((candidate) => candidate.title)).toEqual(["Commentary", "Official docs"]);
  });

  it("reorders site candidates when the model returns a valid index order", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '{"orderedIndexes":[1,0],"reason":"prefer docs first"}',
              },
            },
          ],
        }),
      }),
    );

    const result = await reorderSiteCandidates({
      goal: "OpenAI 的产品有哪些",
      targetDomain: "openai.com",
      candidates: [
        { title: "Products", url: "https://openai.com/products", rank: 1, linkLocation: "nav" },
        { title: "Docs", url: "https://platform.openai.com/docs", rank: 2, linkLocation: "header" },
      ],
    });

    expect(result.source).toBe("llm-lite");
    expect(result.candidates.map((candidate) => candidate.title)).toEqual(["Docs", "Products"]);
  });
});
