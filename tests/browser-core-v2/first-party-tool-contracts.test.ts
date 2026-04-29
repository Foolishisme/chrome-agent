import { describe, expect, it } from "vitest";
import {
  FIRST_PARTY_LLM_VISIBLE_TOOL_CONTRACTS,
  FIRST_PARTY_LLM_VISIBLE_TOOL_NAMES,
  buildFirstPartyToolPromptCatalog,
  getFirstPartyToolContract,
  listFirstPartyToolContracts,
} from "../../src/background/tools";

describe("Browser Core V2 first-party tool contracts", () => {
  it("freezes the first LLM-visible tool set without exposing internal actions", () => {
    expect(FIRST_PARTY_LLM_VISIBLE_TOOL_NAMES).toEqual([
      "browser.search",
      "browser.webDetail",
      "browser.siteOverview",
      "skill.commerceResearch",
    ]);
    expect(Object.keys(FIRST_PARTY_LLM_VISIBLE_TOOL_CONTRACTS)).toEqual(FIRST_PARTY_LLM_VISIBLE_TOOL_NAMES);
    expect(buildFirstPartyToolPromptCatalog()).not.toContain("Tool: open");
    expect(buildFirstPartyToolPromptCatalog()).not.toContain("Tool: navigate");
    expect(buildFirstPartyToolPromptCatalog()).not.toContain("Tool: observe");
    expect(buildFirstPartyToolPromptCatalog()).not.toContain("Tool: extractLinksAndControls");
  });

  it("keeps browser.search on first-page rule-filtered results without topK", () => {
    const contract = getFirstPartyToolContract("browser.search");

    expect(() => contract.inputSchema.parse({ query: "OpenAI", topK: 5 })).toThrow();
    expect(contract.inputSchema.parse(contract.examples.minimalInput)).toEqual(contract.examples.minimalInput);
    expect(contract.outputSchema.parse(contract.examples.successOutput)).toMatchObject({
      status: "success",
      results: expect.arrayContaining([expect.objectContaining({ rankOnPage: 1 })]),
    });
    expect(contract.outputSchema.parse(contract.examples.partialOrBlockedOutput)).toMatchObject({
      status: "partial",
    });
    expect(contract.promptGuidance.whenNotToUse).toContain("详情");
  });

  it("keeps webDetail and siteOverview as separate tools with validated examples", () => {
    const webDetailContract = getFirstPartyToolContract("browser.webDetail");
    const siteOverviewContract = getFirstPartyToolContract("browser.siteOverview");

    expect(webDetailContract.outputSchema.parse(webDetailContract.examples.successOutput)).toMatchObject({
      status: "success",
      keyFacts: expect.any(Array),
    });
    expect(siteOverviewContract.outputSchema.parse(siteOverviewContract.examples.successOutput)).toMatchObject({
      status: "success",
      pagesRead: expect.any(Array),
      keyPages: expect.any(Array),
    });
    expect(webDetailContract.promptGuidance.whenNotToUse).toContain("siteOverview");
    expect(siteOverviewContract.promptGuidance.whenNotToUse).toContain("search");
  });

  it("marks commerce research as a black-box skill with navigation side effects", () => {
    const contract = getFirstPartyToolContract("skill.commerceResearch");

    expect(contract.sideEffectLevel).toBe("external_navigation");
    expect(contract.parallelPolicy).toBe("singleton");
    expect(contract.requires).toContain("legacy.commerce_search_workflow");
    expect(contract.outputSchema.parse(contract.examples.successOutput)).toMatchObject({
      status: "success",
      shortlist: expect.any(Array),
    });
    expect(contract.outputSchema.parse(contract.examples.partialOrBlockedOutput)).toMatchObject({
      status: "blocked",
    });
  });

  it("exposes complete metadata and prompt guidance for every first-party tool", () => {
    for (const contract of listFirstPartyToolContracts()) {
      expect(contract.description.length).toBeGreaterThan(0);
      expect(contract.sideEffectLevel).toMatch(/read_only|external_navigation/);
      expect(contract.parallelPolicy).toMatch(/same_resource_serial|singleton/);
      expect(contract.requires.length).toBeGreaterThan(0);
      expect(contract.produces.length).toBeGreaterThan(0);
      expect(contract.timeoutMs).toBeGreaterThan(0);
      expect(contract.failurePolicy.highRiskAction).toBe("blocked");
      expect(contract.promptGuidance.whenToUse.length).toBeGreaterThan(0);
      expect(contract.promptGuidance.whenNotToUse.length).toBeGreaterThan(0);
    }
  });
});
