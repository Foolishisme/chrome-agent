import { describe, expect, it } from "vitest";
import { filterExtractedItems } from "../src/background/tools/adapters/prepare-task-candidates";
import type { SearchTaskSpec } from "../src/shared/agent-domain-model";

const taskSpec: SearchTaskSpec = {
  taskType: "commerce_search",
  originalGoal: "帮我找 5000 元左右的笔记本电脑",
  category: "笔记本电脑",
  budget: 5000,
  budgetMin: 3500,
  budgetMax: 6500,
  topK: 5,
  llmInputLimit: 10,
  extractLimit: 20,
  searchQuery: "笔记本电脑 5000元",
  querySource: "rule",
  notes: [],
};

describe("filterExtractedItems", () => {
  it("dedupes items and applies the budget range first", () => {
    const result = filterExtractedItems(
      [
        { title: "A", priceText: "4999", url: "https://item.jd.com/a" },
        { title: "A", priceText: "4999", url: "https://item.jd.com/a" },
        { title: "B", priceText: "7999", url: "https://item.jd.com/b" },
        { title: "C", priceText: "4599", url: "https://item.jd.com/c" },
      ],
      taskSpec,
    );

    expect(result.items).toHaveLength(2);
    expect(result.diagnostics.dedupedCount).toBe(3);
    expect(result.diagnostics.budgetMatchedCount).toBe(2);
    expect(result.diagnostics.requestedTopK).toBe(5);
    expect(result.diagnostics.llmInputLimit).toBe(10);
    expect(result.items.map((item) => item.title)).toEqual(["A", "C"]);
  });

  it("falls back to deduped candidates when budget filtering removes everything", () => {
    const result = filterExtractedItems(
      [
        { title: "A", priceText: "8999", url: "https://item.jd.com/a" },
        { title: "B", priceText: "9999", url: "https://item.jd.com/b" },
      ],
      taskSpec,
    );

    expect(result.items).toHaveLength(2);
    expect(result.diagnostics.budgetMatchedCount).toBe(0);
  });
});
