import { describe, expect, it } from "vitest";
import {
  actionResultSchema,
  agentActionSchema,
  finalResultSynthesisSchema,
  roundDecisionSchema,
  taskRouteSchema,
} from "../src/shared/llm-runtime-contract-schemas";

describe("schema contracts", () => {
  it("accepts a valid NAVIGATE action", () => {
    const parsed = agentActionSchema.parse({
      type: "NAVIGATE",
      url: "https://search.jd.com/Search?keyword=macbook&enc=utf-8",
    });

    expect(parsed.type).toBe("NAVIGATE");
  });

  it("accepts the restricted dialog recovery action", () => {
    const parsed = agentActionSchema.parse({
      type: "RECOVER_CLOSE_DIALOG",
    });

    expect(parsed.type).toBe("RECOVER_CLOSE_DIALOG");
  });

  it("accepts a round-end finalize decision", () => {
    const parsed = roundDecisionSchema.parse({
      decision: "finalize",
      reason: "Current evidence is already enough.",
    });

    expect(parsed.decision).toBe("finalize");
  });

  it("accepts a replan decision with a minimal patch", () => {
    const parsed = roundDecisionSchema.parse({
      decision: "replan",
      reason: "Need another round.",
      taskSpecPatch: {
        searchQuery: "OpenAI pricing official",
      },
    });

    expect(parsed.taskSpecPatch?.searchQuery).toBe("OpenAI pricing official");
  });

  it("rejects runtime strategy fields in a round patch", () => {
    expect(() =>
      roundDecisionSchema.parse({
        decision: "replan",
        reason: "Need another round.",
        taskSpecPatch: {
          searchQuery: "OpenAI pricing official",
          candidateLimit: 5,
        },
      }),
    ).toThrow();
  });

  it("accepts the site overview route", () => {
    expect(taskRouteSchema.parse({
      taskType: "site_overview",
      confidence: 0.82,
      decisionSignals: ["explicit_site_scope"],
      reason: "The user asked for a specific official website overview.",
    }).taskType).toBe("site_overview");

    expect(taskRouteSchema.parse({
      taskType: "direct_answer",
      reason: "The user asked for stable knowledge.",
    }).decisionSignals).toEqual([]);
  });

  it("accepts the final-result synthesis payload", () => {
    const parsed = finalResultSynthesisSchema.parse({
      summary: "Collected enough results.",
      markdown: "## Summary\nCollected enough results.",
      keyResults: ["Result A", "Result B"],
      suggestedNextAction: "Open the cited pages if you need deeper confirmation.",
    });

    expect(parsed.keyResults).toHaveLength(2);
  });

  it("accepts an action-level extraction result", () => {
    const parsed = actionResultSchema.parse({
      success: true,
      actionType: "EXTRACT_SEARCH_RESULTS",
      message: "Extracted 3 source candidates.",
      researchCandidates: [
        { title: "A", url: "https://example.com/a", rank: 1 },
        { title: "B", url: "https://example.com/b", rank: 2 },
        { title: "C", url: "https://example.com/c", rank: 3 },
      ],
    });

    expect(parsed.researchCandidates).toHaveLength(3);
  });

  it("accepts site navigation extraction actions and results", () => {
    const action = agentActionSchema.parse({
      type: "EXTRACT_SITE_NAV_LINKS",
      limit: 6,
      baseUrl: "https://openai.com/",
    });

    expect(action.type).toBe("EXTRACT_SITE_NAV_LINKS");

    const result = actionResultSchema.parse({
      success: true,
      actionType: "EXTRACT_SITE_NAV_LINKS",
      message: "Extracted 2 site candidates.",
      researchCandidates: [
        { title: "Products", url: "https://openai.com/products", rank: 1, linkLocation: "nav", linkText: "Products", score: 80 },
        { title: "Pricing", url: "https://openai.com/pricing", rank: 2, linkLocation: "header", linkText: "Pricing", score: 76 },
      ],
    });

    expect(result.researchCandidates).toHaveLength(2);
  });
});
