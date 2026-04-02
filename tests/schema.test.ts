import { describe, expect, it } from "vitest";
import { agentActionSchema, llmDecisionSchema } from "../src/shared/schema";

describe("llmDecisionSchema", () => {
  it("accepts a valid TYPE decision", () => {
    const parsed = llmDecisionSchema.parse({
      stepSummary: "Type the search query",
      nextIntent: "Submit the search",
      expectedOutcome: "The input value changes",
      action: {
        type: "TYPE",
        agentId: "el_search_input",
        text: "5000元 笔记本电脑",
        submit: false,
      },
      done: false,
    });

    expect(parsed.action.type).toBe("TYPE");
  });

  it("rejects decisions with unsupported actions", () => {
    expect(() =>
      llmDecisionSchema.parse({
        stepSummary: "Do something unsafe",
        nextIntent: "Unknown",
        expectedOutcome: "Unknown",
        action: {
          type: "BUY_NOW",
        },
        done: false,
      }),
    ).toThrow();
  });

  it("accepts a valid NAVIGATE action", () => {
    const parsed = agentActionSchema.parse({
      type: "NAVIGATE",
      url: "https://search.jd.com/Search?keyword=500%E8%80%B3%E6%9C%BA&enc=utf-8",
    });

    expect(parsed.type).toBe("NAVIGATE");
  });
});
