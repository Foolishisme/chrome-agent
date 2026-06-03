import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildOpenAiCompatibleRequestBody,
  decideRoundAction,
  extractOpenAiCompatibleJsonText,
  extractFirstJsonBlock,
  getModelCandidates,
  parseOpenAiCompatibleStreamEvent,
  parseModelJson,
  reorderResearchCandidates,
  reorderSiteCandidates,
  setActiveLlmProfile,
  streamFinalMarkdown,
} from "../src/background/llm/llm-client";
import {
  buildFinalMarkdownPrompt,
  buildResearchQueryRefinementPrompt,
} from "../src/background/llm/llm-prompt-builders";

afterEach(() => {
  setActiveLlmProfile("external");
  vi.unstubAllGlobals();
});

describe("llm client helpers", () => {
  it("prefers the simple task model for lightweight tasks", () => {
    const candidates = getModelCandidates("simple");
    expect(candidates[0]).toBe("deepseek-v4-flash");
  });

  it("builds a JSON-mode OpenAI-compatible request", () => {
    const body = buildOpenAiCompatibleRequestBody("hello", "deepseek-v4-flash");
    expect(body.response_format.type).toBe("json_object");
    expect(body.messages[0]?.content).toBe("hello");
    expect(body.model).toBe("deepseek-v4-flash");
  });

  it("builds a streaming markdown request without JSON mode", () => {
    const body = buildOpenAiCompatibleRequestBody("hello", "deepseek-v4-flash", {
      jsonMode: false,
      stream: true,
    });

    expect(body.stream).toBe(true);
    expect(body.response_format).toBeUndefined();
    expect(body.messages[0]?.content).toBe("hello");
  });

  it("includes current time in research query refinement prompts", () => {
    const prompt = buildResearchQueryRefinementPrompt("今天 OpenAI 有什么新闻", {
      currentTimeIso: "2026-06-03T04:00:00.000Z",
      timezone: "Asia/Shanghai",
    });

    expect(prompt).toContain("Current absolute time: 2026-06-03T04:00:00.000Z");
    expect(prompt).toContain("User timezone: Asia/Shanghai");
    expect(prompt).toContain("Resolve relative time words");
  });

  it("includes current time in final markdown prompts", () => {
    const prompt = buildFinalMarkdownPrompt({
      goal: "总结今天的新闻",
      taskType: "public_research",
      taskSpec: {
        taskType: "public_research",
        originalGoal: "总结今天的新闻",
        outputMode: "inline",
        currentTimeIso: "2026-06-03T04:00:00.000Z",
        timezone: "Asia/Shanghai",
        searchQuery: "OpenAI news June 3 2026",
        querySource: "llm-lite",
        notes: [],
        searchEngine: "google",
        candidateLimit: 5,
        sourceTargetCount: 3,
      },
      evidence: {
        kind: "public_research",
        sources: [],
      },
      unresolvedIssues: [],
    });

    expect(prompt).toContain("Current absolute time: 2026-06-03T04:00:00.000Z");
    expect(prompt).toContain("User timezone: Asia/Shanghai");
    expect(prompt).toContain("do not silently treat old evidence as current");
  });

  it("parses OpenAI-compatible stream events", () => {
    expect(parseOpenAiCompatibleStreamEvent('data: {"choices":[{"delta":{"content":"hello"}}]}')).toEqual({
      done: false,
      delta: "hello",
    });
    expect(parseOpenAiCompatibleStreamEvent("data: [DONE]")).toEqual({
      done: true,
      delta: "",
    });
    expect(parseOpenAiCompatibleStreamEvent("data: not-json")).toEqual({
      done: false,
      delta: "",
    });
  });

  it("extracts the first JSON block when extra text is appended", () => {
    const raw = `{"plan":["step1","step2"]}\nExtra explanation`;
    expect(extractFirstJsonBlock(raw)).toBe(`{"plan":["step1","step2"]}`);
    expect(parseModelJson(raw)).toEqual({ plan: ["step1", "step2"] });
  });

  it("reads JSON content from OpenAI-compatible chat completions", () => {
    const text = extractOpenAiCompatibleJsonText({
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

  it("streams final markdown chunks from an OpenAI-compatible response", async () => {
    setActiveLlmProfile("local");
    const deltas: string[] = [];
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"## 结论\\n"}}]}\n\n'));
        controller.enqueue(encoder.encode("data: malformed\n\n"));
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"已经完成。"}}]}\n\n'));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        body,
      }),
    );

    const result = await streamFinalMarkdown(
      {
        goal: "总结",
        taskType: "direct_answer",
        taskSpec: {
          taskType: "direct_answer",
          originalGoal: "总结",
          outputMode: "inline",
          routeReason: "test",
          currentTimeIso: "2026-06-03T00:00:00.000Z",
          timezone: "Asia/Shanghai",
          evidenceTurnCount: 0,
        },
        evidence: {
          kind: "direct_answer",
          recentTurns: [],
        },
        unresolvedIssues: [],
      },
      {
        onDelta: (delta) => {
          deltas.push(delta);
        },
      },
    );

    expect(result.markdown).toBe("## 结论\n已经完成。");
    expect(deltas).toEqual(["## 结论\n", "已经完成。"]);
    const requestBody = JSON.parse((vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit).body as string);
    expect(requestBody.stream).toBe(true);
    expect(requestBody.response_format).toBeUndefined();
  });

  it("falls back to a rule-based round decision when the model is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unavailable")));

    const result = await decideRoundAction({
      goal: "Research OpenAI pricing",
      taskType: "public_research",
      taskSpec: {
        taskType: "public_research",
        originalGoal: "Research OpenAI pricing",
        outputMode: "inline",
        searchQuery: "OpenAI pricing",
        querySource: "rule",
        notes: [],
        searchEngine: "google",
        candidateLimit: 4,
        sourceTargetCount: 1,
      },
      roundIndex: 1,
      maxRounds: 2,
      candidates: [],
      sources: [],
      unresolvedIssues: ["No usable candidate yet."],
    });

    expect(result.source).toBe("rule");
    expect(result.decision).toBe("replan");
  });

  it("reorders research candidates when the model returns a valid index order", async () => {
    setActiveLlmProfile("local");
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
    setActiveLlmProfile("local");
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
    setActiveLlmProfile("local");
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
