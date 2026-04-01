import { describe, expect, it } from "vitest";
import { compileSearchTask } from "../src/background/query-compiler";

describe("compileSearchTask", () => {
  it("builds a rule-based query from a normal shopping goal", async () => {
    const task = await compileSearchTask("帮我找 5000 元左右的笔记本电脑，对比前 5 个推荐");

    expect(task.category).toBe("笔记本电脑");
    expect(task.budget).toBe(5000);
    expect(task.topK).toBe(5);
    expect(task.searchQuery).toContain("笔记本电脑");
    expect(task.searchQuery).toContain("5000元");
    expect(task.querySource).toBe("rule");
  });

  it("uses the lite-model hook when refinement is needed", async () => {
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
