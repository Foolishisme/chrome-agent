import { describe, expect, it } from "vitest";
import { llmDecisionSchema } from "../src/shared/schema";

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
});
