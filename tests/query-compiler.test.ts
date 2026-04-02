import { describe, expect, it } from "vitest";
import { compileSearchTask } from "../src/background/query-compiler";

describe("compileSearchTask", () => {
  it("builds the search query directly from the lite model", async () => {
    const task = await compileSearchTask("帮我找 5000 元左右的笔记本电脑，对比前 5 个推荐", {
      refineWithLiteModel: async () => ({
        searchQuery: "轻薄本 5000元",
        reason: "保留预算并收敛到更适合站内搜索的商品词",
      }),
    });

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
});
