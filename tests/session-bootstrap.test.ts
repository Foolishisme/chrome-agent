import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialSession } from "../src/background/runtime/session-bootstrap";
import type { CommerceTaskSpec } from "../src/shared/agent-domain-model";

const { detectTaskTypeWithLiteModelMock, compileTaskSpecMock, planTaskWithLiteModelMock, streamTaskPlanOrDirectAnswerMock } = vi.hoisted(() => ({
  detectTaskTypeWithLiteModelMock: vi.fn(),
  compileTaskSpecMock: vi.fn(),
  planTaskWithLiteModelMock: vi.fn(),
  streamTaskPlanOrDirectAnswerMock: vi.fn(),
}));

vi.mock("../src/background/llm/query-compiler", async () => {
  const actual = await vi.importActual<typeof import("../src/background/llm/query-compiler")>("../src/background/llm/query-compiler");
  return {
    ...actual,
    detectTaskTypeWithLiteModel: detectTaskTypeWithLiteModelMock,
    compileTaskSpec: compileTaskSpecMock,
  };
});

vi.mock("../src/background/llm/llm-client", async () => {
  const actual = await vi.importActual<typeof import("../src/background/llm/llm-client")>("../src/background/llm/llm-client");
  return {
    ...actual,
    planTaskWithLiteModel: planTaskWithLiteModelMock,
    streamTaskPlanOrDirectAnswer: streamTaskPlanOrDirectAnswerMock,
    classifyTaskType: vi.fn(),
    refineCommerceSearchQuery: vi.fn(),
    refineResearchQuery: vi.fn(),
  };
});

describe("runtime bootstrap", () => {
  beforeEach(() => {
    detectTaskTypeWithLiteModelMock.mockReset();
    compileTaskSpecMock.mockReset();
    planTaskWithLiteModelMock.mockReset();
    streamTaskPlanOrDirectAnswerMock.mockReset();
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
    streamTaskPlanOrDirectAnswerMock.mockResolvedValue({
      kind: "task_plan",
      taskType: "commerce_search",
      reason: "commerce intent",
      confidence: 0.9,
      decisionSignals: [],
      searchQuery: "薄本 3000元",
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
    expect(detectTaskTypeWithLiteModelMock).not.toHaveBeenCalled();
    expect(compileTaskSpecMock).toHaveBeenCalledWith(
      taskSpec.originalGoal,
      expect.objectContaining({
        taskType: "commerce_search",
        plannedTask: expect.objectContaining({
          taskType: "commerce_search",
          searchQuery: "薄本 3000元",
          source: "llm-lite",
        }),
      }),
    );
    expect(result.navigatedToHome).toBe(true);
    expect(result.fromUrl).toBe("chrome://extensions/");
    expect(result.session.memory.runtimeMeta.tabId).toBe(7);
  });

  it("streams the direct answer from the lite router without compiling a runtime plan", async () => {
    streamTaskPlanOrDirectAnswerMock.mockImplementationOnce(async (_goal, options) => {
      await options.onDirectAnswerDelta?.("事件循环负责调度任务。");
      return {
        kind: "direct_answer",
        markdown: "事件循环负责调度任务。",
        model: "mock-lite",
        provider: "openai-compatible",
      };
    });

    const query = vi.fn(async () => [
      {
        id: 8,
        url: "https://example.com/",
        status: "complete",
        active: true,
      },
    ]);

    vi.stubGlobal("chrome", {
      tabs: {
        query,
        update: vi.fn(),
        get: vi.fn(),
        onUpdated: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
    });

    const publishBootstrapState = vi.fn(async () => undefined);
    const result = await createInitialSession("解释一下事件循环是什么", {
      signal: new AbortController().signal,
      publishBootstrapState,
    });

    expect(streamTaskPlanOrDirectAnswerMock).toHaveBeenCalledOnce();
    expect(planTaskWithLiteModelMock).not.toHaveBeenCalled();
    expect(detectTaskTypeWithLiteModelMock).not.toHaveBeenCalled();
    expect(compileTaskSpecMock).not.toHaveBeenCalled();
    expect(publishBootstrapState).toHaveBeenCalled();
    expect(result.session.memory.finalResult?.markdown).toBe("事件循环负责调度任务。");
    expect(result.session.memory.runtimeMeta.status).toBe("done");
    expect(result.session.memory.plan).toEqual([]);
  });
});
