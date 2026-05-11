import { describe, expect, it, vi } from "vitest";
import { MockBrowserDriver } from "../test-support/mock-browser-driver";
import type { BrowserObservation } from "../../src/shared/browser-capability";
import {
  createDefaultFirstPartyToolRegistry,
  createFirstPartyToolRegistry,
  executeFirstPartyTool,
  validateFirstPartyToolRegistry,
} from "../../src/background/tools";

function createObservation(overrides: Partial<BrowserObservation> = {}): BrowserObservation {
  return {
    tab: {
      tabId: 1,
      url: "https://example.com/",
      title: "Example",
      active: true,
      status: "complete",
    },
    url: "https://example.com/",
    title: "Example",
    mainText: "Example page body with enough detail to create a summary and a couple of facts.",
    links: [],
    controls: [],
    semanticSnapshot: undefined,
    targets: [],
    problems: [],
    truncated: false,
    coverage: {
      mainTextChars: 78,
      linkCount: 0,
      controlCount: 0,
      targetCount: 0,
    },
    ...overrides,
  };
}

describe("Browser Core V2 first-party tool registry", () => {
  it("validates the default registry shape and metadata completeness", () => {
    const registry = createDefaultFirstPartyToolRegistry();

    expect(() => validateFirstPartyToolRegistry(registry)).not.toThrow();
    expect(Object.keys(registry)).toEqual([
      "browser.search",
      "browser.webDetail",
      "browser.siteOverview",
      "skill.commerceResearch",
    ]);
  });

  it("rejects incomplete handler registration", () => {
    expect(() =>
      createFirstPartyToolRegistry({
        "browser.search": vi.fn(async () => ({
          status: "success" as const,
          results: [],
          searchPageUrl: "https://www.google.com/search?q=test",
          coverage: { scope: "test", limitations: [] },
          problems: [],
        })),
        "browser.webDetail": undefined as never,
        "browser.siteOverview": undefined as never,
        "skill.commerceResearch": undefined as never,
      }),
    ).toThrow();
  });

  it("executes a mock-registered handler with schema validation", async () => {
    const searchHandler = vi.fn(async () => ({
      status: "success" as const,
      results: [
        {
          title: "Example",
          url: "https://example.com/",
          rankOnPage: 1,
        },
      ],
      searchPageUrl: "https://www.google.com/search?q=example",
      coverage: {
        scope: "mock first page",
        limitations: [],
      },
      problems: [],
    }));

    const registry = createFirstPartyToolRegistry({
      "browser.search": searchHandler,
      "browser.webDetail": vi.fn(async () => ({
        status: "success" as const,
        pageTitle: "Example",
        pageSummary: "summary",
        keyFacts: [],
        coverage: { scope: "mock page", limitations: [] },
        links: [],
        problems: [],
      })),
      "browser.siteOverview": vi.fn(async () => ({
        status: "success" as const,
        siteSummary: "site",
        pagesRead: [],
        keyPages: [],
        gaps: [],
        coverage: { scope: "mock site", limitations: [] },
        problems: [],
      })),
      "skill.commerceResearch": vi.fn(async () => ({
        status: "success" as const,
        shortlist: [],
        evidence: [],
        gaps: [],
        coverage: { scope: "mock commerce", limitations: [] },
        problems: [],
      })),
    });

    const result = await executeFirstPartyTool(registry, "browser.search", {
      query: "example",
      scope: "web",
    }, {});

    expect(searchHandler).toHaveBeenCalledOnce();
    expect(result.results[0]?.url).toBe("https://example.com/");
    await expect(
      executeFirstPartyTool(registry, "browser.search", { query: "example", topK: 5 }, {}),
    ).rejects.toThrow();
  });

  it("integrates browser.search and browser.webDetail over a mock driver", async () => {
    const driver = new MockBrowserDriver({
      observations: {
        1: createObservation({
          tab: {
            tabId: 1,
            url: "https://www.google.com/search?q=openai",
            title: "openai - Google Search",
            active: true,
            status: "complete",
          },
          url: "https://www.google.com/search?q=openai",
          title: "openai - Google Search",
          mainText: "Search results page",
          links: [
            { text: "OpenAI", url: "https://openai.com/" },
            { text: "Docs", url: "https://platform.openai.com/docs" },
            { text: "Google internal", url: "https://www.google.com/preferences" },
          ],
          coverage: {
            mainTextChars: 18,
            linkCount: 3,
            controlCount: 0,
            targetCount: 0,
          },
        }),
        2: createObservation({
          tab: {
            tabId: 2,
            url: "https://openai.com/",
            title: "OpenAI",
            active: true,
            status: "complete",
          },
          url: "https://openai.com/",
          title: "OpenAI",
          mainText: "OpenAI builds products, platform tools, and research systems for general users and developers.",
          links: [{ text: "Pricing", url: "https://openai.com/pricing" }],
          coverage: {
            mainTextChars: 95,
            linkCount: 1,
            controlCount: 0,
            targetCount: 0,
          },
        }),
      },
    });
    const registry = createDefaultFirstPartyToolRegistry();

    const searchResult = await executeFirstPartyTool(registry, "browser.search", { query: "openai" }, { driver });
    const detailResult = await executeFirstPartyTool(
      registry,
      "browser.webDetail",
      { url: searchResult.results[0]?.url, goal: "看这个页面的产品定位" },
      { driver },
    );

    expect(searchResult.results.map((item) => item.title)).toEqual(["OpenAI", "Docs"]);
    expect(detailResult.status).toBe("success");
    expect(detailResult.pageSummary).toContain("OpenAI builds products");
    expect(driver.calls.map((call) => call.method)).toEqual([
      "openTab",
      "waitForStable",
      "observe",
      "openTab",
      "waitForStable",
      "observe",
    ]);
  });

  it("integrates siteOverview and commerceResearch over mock execution paths", async () => {
    const driver = new MockBrowserDriver({
      observations: {
        1: createObservation({
          tab: {
            tabId: 1,
            url: "https://openai.com/",
            title: "OpenAI",
            active: true,
            status: "complete",
          },
          url: "https://openai.com/",
          title: "OpenAI",
          mainText: "OpenAI home page",
          links: [
            { text: "Home", url: "https://openai.com/" },
            { text: "Products", url: "https://openai.com/products" },
            { text: "Pricing", url: "https://openai.com/pricing" },
            { text: "External", url: "https://example.com/" },
          ],
          coverage: {
            mainTextChars: 16,
            linkCount: 4,
            controlCount: 0,
            targetCount: 0,
          },
        }),
        2: createObservation({
          tab: {
            tabId: 2,
            url: "https://openai.com/products",
            title: "Products",
            active: false,
            status: "complete",
          },
          url: "https://openai.com/products",
          title: "Products",
          mainText: "Products page",
          links: [],
          coverage: {
            mainTextChars: 13,
            linkCount: 0,
            controlCount: 0,
            targetCount: 0,
          },
        }),
        3: createObservation({
          tab: {
            tabId: 3,
            url: "https://openai.com/pricing",
            title: "Pricing",
            active: false,
            status: "complete",
          },
          url: "https://openai.com/pricing",
          title: "Pricing",
          mainText: "Pricing page",
          links: [],
          coverage: {
            mainTextChars: 12,
            linkCount: 0,
            controlCount: 0,
            targetCount: 0,
          },
        }),
      },
    });
    const registry = createDefaultFirstPartyToolRegistry();

    const siteOverviewResult = await executeFirstPartyTool(
      registry,
      "browser.siteOverview",
      {
        entryUrl: "https://openai.com/",
        goal: "总结站点产品和定价入口",
        maxPages: 3,
      },
      { driver },
    );
    const commerceResult = await executeFirstPartyTool(
      registry,
      "skill.commerceResearch",
      {
        goal: "找 3000 元以内适合学生写论文的轻薄本",
      },
      {
        commerceResearchDelegate: vi.fn(async () => ({
          status: "success" as const,
          shortlist: [
            {
              title: "Mock Laptop",
              url: "https://item.jd.com/mock.html",
              priceText: "¥2999",
            },
          ],
          evidence: [
            {
              text: "Mock delegate kept one candidate under the budget.",
              evidenceUrl: "https://search.jd.com/Search?keyword=mock",
            },
          ],
          gaps: [],
          coverage: {
            scope: "Mock commerce delegate",
            limitations: [],
          },
          problems: [],
        })),
      },
    );

    expect(siteOverviewResult.status).toBe("success");
    expect(siteOverviewResult.pagesRead.map((page) => page.title)).toEqual(["OpenAI", "Products", "Pricing"]);
    expect(commerceResult.shortlist[0]?.title).toBe("Mock Laptop");
  });
});
