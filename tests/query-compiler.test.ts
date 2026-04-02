import { describe, expect, it } from "vitest";
import { compileSearchTask, detectTaskType, detectTaskTypeWithLiteModel } from "../src/background/query-compiler";

describe("query compiler", () => {
  it("builds the search query directly from the lite model", async () => {
    const task = await compileSearchTask("帮我找 5000 元左右的笔记本电脑，对比前 5 个推荐", {
      refineWithLiteModel: async () => ({
        searchQuery: "轻薄本 5000元",
        reason: "保留预算并收敛到更适合站内搜索的商品词",
      }),
    });

    expect(task.taskType).toBe("commerce_search");
    expect(task.topK).toBe(5);
    expect(task.llmInputLimit).toBe(10);
    expect(task.extractLimit).toBeGreaterThanOrEqual(12);
    expect(task.searchQuery).toBe("轻薄本 5000元");
    expect(task.querySource).toBe("llm-lite");
  });

  it("requires the lite model planner to produce the final on-site query", async () => {
    const task = await compileSearchTask("推荐一个适合学生办公的电脑", {
      refineWithLiteModel: async () => ({
        searchQuery: "学生办公 笔记本电脑",
        reason: "补全办公场景关键词",
      }),
    });

    expect(task.querySource).toBe("llm-lite");
    expect(task.searchQuery).toBe("学生办公 笔记本电脑");
  });

  it("routes non-shopping goals to public research with the rule fallback", () => {
    expect(detectTaskType("调研 Playwright 和 Selenium 的区别")).toBe("public_research");
    expect(detectTaskType("帮我找 5000 元耳机")).toBe("commerce_search");
  });

  it("prefers lite-model routing when available", async () => {
    const routed = await detectTaskTypeWithLiteModel("3000 的手机推荐", {
      classifyWithLiteModel: async () => ({
        taskType: "commerce_search",
        reason: "contains product recommendation intent",
      }),
    });

    expect(routed).toEqual({
      taskType: "commerce_search",
      reason: "contains product recommendation intent",
      source: "llm-lite",
    });
  });

  it("falls back to rule-based routing when lite-model routing is unavailable", async () => {
    const routed = await detectTaskTypeWithLiteModel("调研 Playwright 和 Selenium 的区别");

    expect(routed.taskType).toBe("public_research");
    expect(routed.source).toBe("rule");
  });

  it("falls back to rules when lite-model routing throws", async () => {
    const routed = await detectTaskTypeWithLiteModel("调研 Playwright 和 Selenium 的区别", {
      classifyWithLiteModel: async () => {
        throw new Error("provider unavailable");
      },
    });

    expect(routed.taskType).toBe("public_research");
    expect(routed.source).toBe("rule");
    expect(routed.reason).toContain("fallback");
  });
});
