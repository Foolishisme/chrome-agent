import { describe, expect, it, vi } from "vitest";
import { filterResearchCandidates } from "../src/background/result-filter";
import { getToolDefinition } from "../src/background/tools";
import { extractGoogleSearchResults, extractPageFacts } from "../src/content/research";
import type { SessionMemory } from "../src/shared/types";

function createResearchMemory(overrides: Partial<SessionMemory> = {}): SessionMemory {
  return {
    goal: "调研 Playwright 和 Selenium 的区别",
    taskType: "public_research",
    currentPhase: "aggregating",
    plan: [],
    subtaskResults: [],
    toolHistory: [],
    currentFacts: {},
    stepHistory: [],
    logs: [],
    rawExtractedItems: [],
    extractedItems: [],
    researchCandidates: [],
    researchSources: [],
    failures: [],
    unresolvedIssues: [],
    activeSourceIndex: 0,
    runtimeMeta: {
      sessionId: "session-1",
      tabId: 1,
      pageType: "content",
      status: "observing",
      currentTool: undefined,
      currentStep: 1,
      llmRetryCount: 0,
      actionRetryCount: 0,
      pageReadyRetryCount: 0,
      recoveryCount: 0,
      queryRefineTried: false,
      startedAt: Date.now(),
    },
    ...overrides,
  };
}

describe("public research candidate handling", () => {
  it("extracts Google-style results and keeps heading links", () => {
    document.body.innerHTML = `
      <div class="MjjYud">
        <a href="https://example.com/a"><h3>Playwright documentation</h3></a>
        <div>A browser automation framework for modern web apps.</div>
      </div>
      <div class="MjjYud">
        <a href="https://example.com/b"><h3>Selenium documentation</h3></a>
        <div>Browser automation across multiple drivers.</div>
      </div>
    `;

    const result = extractGoogleSearchResults(document, 10);

    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]).toMatchObject({
      title: "Playwright documentation",
      url: "https://example.com/a",
    });
  });

  it("filters ads, duplicates, Google internal urls, and pdf links", () => {
    const result = filterResearchCandidates(
      [
        { title: "Ad", url: "https://example.com/ad", rank: 1, isAd: true },
        { title: "Doc", url: "https://example.com/doc", rank: 2 },
        { title: "Doc duplicate", url: "https://example.com/doc#intro", rank: 3 },
        { title: "Google cache", url: "https://www.google.com/search?q=test", rank: 4 },
        { title: "Pdf", url: "https://example.com/file.pdf", rank: 5 },
        { title: "Guide", url: "https://example.com/guide", rank: 6 },
      ],
      5,
    );

    expect(result.candidates.map((candidate) => candidate.url)).toEqual([
      "https://example.com/doc",
      "https://example.com/guide",
    ]);
    expect(result.diagnostics.skippedAdCount).toBe(1);
    expect(result.diagnostics.skippedPdfCount).toBe(1);
    expect(result.diagnostics.skippedInternalCount).toBe(1);
    expect(result.diagnostics.skippedDuplicateCount).toBe(1);
  });
});

describe("public research page facts", () => {
  it("extracts success facts from readable articles", () => {
    document.title = "Playwright vs Selenium";
    document.body.innerHTML = `
      <article>
        <h1>Playwright vs Selenium</h1>
        <p>${"Playwright focuses on modern browser automation and provides auto-waiting. ".repeat(6)}</p>
        <p>${"Selenium remains strong in cross-browser ecosystems and grid support. ".repeat(5)}</p>
        <p>${"Teams often choose based on language support, legacy needs, and debugging workflows. ".repeat(4)}</p>
      </article>
    `;

    const result = extractPageFacts();

    expect(result.status).toBe("success");
    expect(result.pageTitle).toBe("Playwright vs Selenium");
    expect(result.keyPoints.length).toBeGreaterThan(0);
    expect(result.textLength).toBeGreaterThan(200);
  });

  it("marks login walls as partial", () => {
    document.title = "Members only";
    document.body.innerHTML = `
      <main>
        <h1>Login required</h1>
        <p>请登录后继续阅读。</p>
        <input type="password" />
      </main>
    `;

    const result = extractPageFacts();

    expect(result.status).toBe("partial");
    expect(result.reason).toContain("登录墙");
  });
});

describe("public research aggregation", () => {
  it("builds partial final output with unresolved issues when sources are insufficient", async () => {
    const tool = getToolDefinition("aggregateTaskResults");
    const memory = createResearchMemory({
      taskSpec: {
        taskType: "public_research",
        originalGoal: "调研 Playwright 和 Selenium 的区别",
        searchQuery: "Playwright Selenium 区别",
        querySource: "llm-lite",
        notes: [],
        searchEngine: "google",
        candidateLimit: 5,
        sourceTargetCount: 3,
      },
      researchSources: [
        {
          candidate: { title: "Playwright docs", url: "https://example.com/a", rank: 1 },
          status: "success",
          pageTitle: "Playwright docs",
          summary: "Playwright has built-in auto-waiting.",
          keyPoints: ["Auto-waiting", "Browser contexts"],
          sourceUrl: "https://example.com/a",
          unresolvedIssues: [],
          textLength: 320,
        },
        {
          candidate: { title: "Locked article", url: "https://example.com/b", rank: 2 },
          status: "partial",
          pageTitle: "Locked article",
          summary: "该来源未能完成正文提取：登录墙或订阅墙阻断",
          keyPoints: [],
          sourceUrl: "https://example.com/b",
          unresolvedIssues: ["登录墙或订阅墙阻断"],
          textLength: 0,
        },
      ],
      unresolvedIssues: ["候选来源已耗尽，未满足目标来源数"],
    });

    await tool.run({
      memory,
      signal: new AbortController().signal,
      scanPage: vi.fn(),
      ensureUsableSnapshot: vi.fn(),
      executeAction: vi.fn(),
      settleAfterAction: vi.fn(),
      appendLog: vi.fn(),
      recordStep: vi.fn(),
      pushState: vi.fn().mockResolvedValue(undefined),
    });

    expect(memory.finalResult?.overallStatus).toBe("partial");
    expect(memory.finalOutput).toContain("## 结论摘要");
    expect(memory.finalOutput).toContain("## 来源链接");
    expect(memory.finalOutput).toContain("## 未解决问题");
  });
});
