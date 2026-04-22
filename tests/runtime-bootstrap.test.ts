import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialSession } from "../src/background/runtime/bootstrap";
import type { CommerceTaskSpec } from "../src/shared/types";

const { detectTaskTypeWithLiteModelMock, compileTaskSpecMock } = vi.hoisted(() => ({
  detectTaskTypeWithLiteModelMock: vi.fn(),
  compileTaskSpecMock: vi.fn(),
}));

vi.mock("../src/background/query-compiler", async () => {
  const actual = await vi.importActual<typeof import("../src/background/query-compiler")>("../src/background/query-compiler");
  return {
    ...actual,
    detectTaskTypeWithLiteModel: detectTaskTypeWithLiteModelMock,
    compileTaskSpec: compileTaskSpecMock,
  };
});

vi.mock("../src/background/llm-client", async () => {
  const actual = await vi.importActual<typeof import("../src/background/llm-client")>("../src/background/llm-client");
  return {
    ...actual,
    classifyTaskType: vi.fn(),
    refineCommerceSearchQuery: vi.fn(),
    refineResearchQuery: vi.fn(),
  };
});

describe("runtime bootstrap", () => {
  beforeEach(() => {
    detectTaskTypeWithLiteModelMock.mockReset();
    compileTaskSpecMock.mockReset();
  });

  it("prepares a scriptable JD tab before commerce sessions start", async () => {
    const taskSpec: CommerceTaskSpec = {
      taskType: "commerce_search",
      originalGoal: "Find a thin laptop under 3000 RMB",
      outputMode: "inline",
      budgetMax: 3000,
      topK: 3,
      llmInputLimit: 3,
      extractLimit: 6,
      searchQuery: "薄本 3000元",
      querySource: "rule",
      notes: [],
    };
    detectTaskTypeWithLiteModelMock.mockResolvedValue({
      taskType: "commerce_search",
      reason: "commerce intent",
      confidence: 0.9,
      decisionSignals: [],
      source: "rule",
    });
    compileTaskSpecMock.mockResolvedValue({
      taskType: "commerce_search",
      taskSpec,
    });

    const query = vi.fn(async () => [
      {
        id: 7,
        url: "chrome://extensions/",
        status: "complete",
        active: true,
      },
    ]);
    const update = vi.fn(async () => ({
      id: 7,
      url: "https://www.jd.com/",
      status: "complete",
      active: true,
    }));
    const get = vi.fn(async () => ({
      id: 7,
      url: "https://www.jd.com/",
      status: "complete",
      active: true,
    }));

    vi.stubGlobal("chrome", {
      tabs: {
        query,
        update,
        get,
        onUpdated: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
    });

    const result = await createInitialSession(taskSpec.originalGoal, {
      signal: new AbortController().signal,
    });

    expect(update).toHaveBeenCalledWith(7, { url: "https://www.jd.com/" });
    expect(result.navigatedToHome).toBe(true);
    expect(result.fromUrl).toBe("chrome://extensions/");
    expect(result.session.memory.runtimeMeta.tabId).toBe(7);
  });
});
