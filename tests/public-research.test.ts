import { beforeEach, describe, expect, it, vi } from "vitest";
import { filterResearchCandidates } from "../src/background/result-filter";
import { getToolDefinition } from "../src/background/tools";
import { extractGoogleSearchResults, extractPageFacts } from "../src/content/research";
import type { SessionMemory } from "../src/shared/types";

const { generateSourceFactCardMock, reorderResearchCandidatesMock } = vi.hoisted(() => ({
  generateSourceFactCardMock: vi.fn(),
  reorderResearchCandidatesMock: vi.fn(),
}));

vi.mock("../src/background/llm-client", async () => {
  const actual = await vi.importActual<typeof import("../src/background/llm-client")>("../src/background/llm-client");
  return {
    ...actual,
    generateSourceFactCard: generateSourceFactCardMock,
    reorderResearchCandidates: reorderResearchCandidatesMock,
  };
});

beforeEach(() => {
  generateSourceFactCardMock.mockReset();
  reorderResearchCandidatesMock.mockReset();
});

function createResearchMemory(overrides: Partial<SessionMemory> = {}): SessionMemory {
  const memory: SessionMemory = {
    goal: "Research the difference between Playwright and Selenium",
    taskType: "public_research",
    searchPreference: "auto",
    conversationTurns: [],
    plan: [],
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
      status: "running",
      currentTool: undefined,
      currentStepId: undefined,
      currentStep: 1,
      actionRetryCount: 0,
      recoveryCount: 0,
      pageWaitRecoveryCount: 0,
      dialogCloseRecoveryCount: 0,
      searchReopenRecoveryCount: 0,
      queryRefineTried: false,
      sameToolRetryCount: 0,
      sameToolRetryTool: undefined,
      consecutiveNoProgressCount: 0,
      currentRound: 1,
      maxRounds: 2,
      startedAt: Date.now(),
    },
    ...overrides,
  };
  memory.searchPreference = overrides.searchPreference ?? "auto";
  memory.conversationTurns = overrides.conversationTurns ?? [];
  return memory;
}

describe("public research candidate handling", () => {
  it("reorders filtered first-page candidates before reading sources", async () => {
    reorderResearchCandidatesMock.mockResolvedValueOnce({
      candidates: [
        { title: "Official guide", url: "https://example.com/official", rank: 2 },
        { title: "Blog summary", url: "https://example.com/blog", rank: 1 },
      ],
      reason: "prefer official source first",
      source: "llm-lite",
    });

    const tool = getToolDefinition("collectResearchCandidates");
    const memory = createResearchMemory({
      taskSpec: {
        taskType: "public_research",
        originalGoal: "Research AI agents",
        outputMode: "inline",
        searchQuery: "AI agents",
        querySource: "llm-lite",
        notes: [],
        searchEngine: "google",
        candidateLimit: 5,
        sourceTargetCount: 3,
      },
    });

    const result = await tool.run({
      memory,
      signal: new AbortController().signal,
      scanPage: vi.fn().mockResolvedValue({
        url: "https://www.google.com/search?q=ai+agents",
        title: "ai agents - Google Search",
        pageType: "google_search",
        interactiveElements: [],
        semanticSnapshot: {
          version: 1,
          url: "https://www.google.com/search?q=ai+agents",
          title: "ai agents - Google Search",
          nodeCount: 1,
          truncated: false,
          root: { ref: "sem_root", role: "unknown", name: "", children: [] },
        },
        productCandidates: [],
        pageReady: { ready: true, reason: "ok", checks: [] },
        pageFacts: {
          searchBox: { present: true, visible: true, text: "ai agents" },
          searchSubmit: { present: true, visible: true, text: "Search" },
          searchResults: {
            present: true,
            loaded: true,
            resultCount: 2,
            naturalCount: 2,
            adCount: 0,
          },
        },
        timestamp: Date.now(),
      }),
      ensureUsableSnapshot: vi.fn().mockResolvedValue({
        url: "https://www.google.com/search?q=ai+agents",
        title: "ai agents - Google Search",
        pageType: "google_search",
        interactiveElements: [],
        semanticSnapshot: {
          version: 1,
          url: "https://www.google.com/search?q=ai+agents",
          title: "ai agents - Google Search",
          nodeCount: 1,
          truncated: false,
          root: { ref: "sem_root", role: "unknown", name: "", children: [] },
        },
        productCandidates: [],
        pageReady: { ready: true, reason: "ok", checks: [] },
        pageFacts: {
          searchBox: { present: true, visible: true, text: "ai agents" },
          searchSubmit: { present: true, visible: true, text: "Search" },
          searchResults: {
            present: true,
            loaded: true,
            resultCount: 2,
            naturalCount: 2,
            adCount: 0,
          },
        },
        timestamp: Date.now(),
      }),
      executeAction: vi.fn().mockResolvedValue({
        success: true,
        actionType: "EXTRACT_SEARCH_RESULTS",
        message: "Extracted 2 source candidates.",
        researchCandidates: [
          { title: "Blog summary", url: "https://example.com/blog", rank: 1 },
          { title: "Official guide", url: "https://example.com/official", rank: 2 },
        ],
      }),
      settleAfterAction: vi.fn(),
      appendLog: vi.fn(),
      recordStep: vi.fn(),
      pushState: vi.fn().mockResolvedValue(undefined),
    });

    expect(result.status).toBe("success");
    expect(memory.researchCandidates.map((candidate) => candidate.title)).toEqual(["Official guide", "Blog summary"]);
    expect(reorderResearchCandidatesMock).toHaveBeenCalledOnce();
  });

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
    expect(result.bodyExcerpt.length).toBeGreaterThan(0);
    expect(result.textLength).toBeGreaterThan(200);
  });

  it("marks login walls as partial", () => {
    document.title = "Members only";
    document.body.innerHTML = `
      <main>
        <h1>Login required</h1>
        <p>Please log in to continue reading.</p>
        <input type="password" />
      </main>
    `;

    const result = extractPageFacts();

    expect(result.status).toBe("partial");
    expect(result.reason).toBeTruthy();
  });
});

describe("public research aggregation", () => {
  it("keeps reading when only partial sources have been collected", async () => {
    const tool = getToolDefinition("readResearchSourceFacts");
    const memory = createResearchMemory({
      taskSpec: {
        taskType: "public_research",
        originalGoal: "Research the difference between Playwright and Selenium",
        outputMode: "inline",
        searchQuery: "Playwright Selenium difference",
        querySource: "llm-lite",
        notes: [],
        searchEngine: "google",
        candidateLimit: 5,
        sourceTargetCount: 3,
      },
      researchCandidates: [
        { title: "Blocked source", url: "https://example.com/a", rank: 1 },
        { title: "Readable source", url: "https://example.com/b", rank: 2 },
      ],
    });

    const executeAction = vi
      .fn()
      .mockResolvedValueOnce({
        success: true,
        actionType: "NAVIGATE",
        message: "navigated",
      })
      .mockResolvedValueOnce({
        success: true,
        actionType: "EXTRACT_PAGE_FACTS",
        message: "partial",
        pageFactsResult: {
          status: "partial",
          pageTitle: "Blocked source",
          bodyExcerpt: "",
          textLength: 0,
          extractionStrategy: "fallback",
          reason: "login wall",
        },
      });

    const result = await tool.run({
      memory,
      signal: new AbortController().signal,
      scanPage: vi.fn().mockResolvedValue({
        url: "https://example.com/a",
        title: "Blocked source",
        pageType: "content",
        interactiveElements: [],
        semanticSnapshot: {
          version: 1,
          url: "https://example.com/a",
          title: "Blocked source",
          nodeCount: 1,
          truncated: false,
          root: {
            ref: "sem_root",
            role: "unknown",
            name: "",
            children: [],
          },
        },
        productCandidates: [],
        pageReady: { ready: true, reason: "ok", checks: [] },
        pageFacts: {
          searchBox: { present: false, visible: false, text: "" },
          searchSubmit: { present: false, visible: false, text: "" },
          pageContent: {
            readable: false,
            textLength: 0,
            paragraphCount: 0,
            hasPasswordInput: false,
            hasBlockingOverlay: false,
            likelyLoginWall: true,
            likelySpa: false,
            reason: "login wall",
          },
        },
        timestamp: Date.now(),
      }),
      ensureUsableSnapshot: vi.fn(),
      executeAction,
      settleAfterAction: vi.fn(),
      appendLog: vi.fn(),
      recordStep: vi.fn(),
      pushState: vi.fn().mockResolvedValue(undefined),
    });

    expect(result.stepStatus).toBe("running");
    expect(memory.researchSources).toHaveLength(1);
    expect(memory.researchSources[0]?.status).toBe("partial");
    expect(memory.activeSourceIndex).toBe(1);
  });

  it("skips a failed source immediately when navigation fails", async () => {
    const tool = getToolDefinition("readResearchSourceFacts");
    const appendLog = vi.fn();
    const memory = createResearchMemory({
      taskSpec: {
        taskType: "public_research",
        originalGoal: "Compare Playwright and Selenium",
        searchQuery: "Playwright Selenium difference",
        querySource: "llm-lite",
        notes: [],
        searchEngine: "google",
        candidateLimit: 5,
        sourceTargetCount: 2,
      },
      researchCandidates: [
        { title: "Broken source", url: "https://example.com/broken", rank: 1 },
        { title: "Readable source", url: "https://example.com/readable", rank: 2 },
      ],
    });

    const result = await tool.run({
      memory,
      signal: new AbortController().signal,
      scanPage: vi.fn(),
      ensureUsableSnapshot: vi.fn(),
      executeAction: vi.fn().mockResolvedValue({
        success: false,
        actionType: "NAVIGATE",
        message: "navigation failed",
        errorCode: "NAVIGATION_FAILED",
      }),
      settleAfterAction: vi.fn().mockResolvedValue(undefined),
      appendLog,
      recordStep: vi.fn(),
      pushState: vi.fn().mockResolvedValue(undefined),
    });

    expect(result.stepStatus).toBe("running");
    expect(memory.researchSources).toHaveLength(1);
    expect(memory.researchSources[0]).toMatchObject({
      status: "partial",
      sourceUrl: "https://example.com/broken",
    });
    expect(memory.activeSourceIndex).toBe(1);
    expect(appendLog).toHaveBeenCalledWith(
      "runtime",
      "warn",
      "Research source skipped after a single failure.",
      expect.objectContaining({
        failureKind: "navigation_failed",
      }),
    );
  });

  it("builds partial final output with unresolved issues when sources are insufficient", async () => {
    const tool = getToolDefinition("finalizeResearchResult");
    const memory = createResearchMemory({
      taskSpec: {
        taskType: "public_research",
        originalGoal: "Research the difference between Playwright and Selenium",
        searchQuery: "Playwright Selenium difference",
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
          bodyExcerpt: "Playwright has built-in auto-waiting. It also uses browser contexts for isolation.",
          sourceUrl: "https://example.com/a",
          unresolvedIssues: [],
          textLength: 320,
        },
        {
          candidate: { title: "Locked article", url: "https://example.com/b", rank: 2 },
          status: "partial",
          pageTitle: "Locked article",
          bodyExcerpt: "",
          sourceUrl: "https://example.com/b",
          unresolvedIssues: ["login wall"],
          textLength: 0,
        },
      ],
      unresolvedIssues: ["Research candidates were exhausted before reaching the source target."],
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

    expect(memory.finalResult?.status).toBe("partial");
    expect(memory.finalResult?.outputMode).toBe("inline");
    expect(memory.finalResult?.markdown).toContain("## 有限结果");
    expect(memory.finalResult?.markdown).toContain("## 已读来源");
    expect(memory.finalResult?.markdown).toContain("## 未解决问题");
    expect(memory.finalResult?.markdown).not.toContain("## Source Excerpts");
    expect(memory.finalResult?.artifacts).toHaveLength(0);
  });

  it("does not dump full source excerpts in deterministic fallback output", async () => {
    const tool = getToolDefinition("finalizeResearchResult");
    const repeatedOriginal = "This sentence is extracted from the source page and should not be dumped in full. ".repeat(30);
    const memory = createResearchMemory({
      taskSpec: {
        taskType: "public_research",
        originalGoal: "Research browser automation",
        searchQuery: "browser automation",
        querySource: "llm-lite",
        notes: [],
        searchEngine: "google",
        candidateLimit: 5,
        sourceTargetCount: 1,
      },
      researchSources: [
        {
          candidate: { title: "Long source", url: "https://example.com/long", rank: 1 },
          status: "success",
          pageTitle: "Long source",
          bodyExcerpt: repeatedOriginal,
          sourceUrl: "https://example.com/long",
          unresolvedIssues: [],
          textLength: repeatedOriginal.length,
        },
      ],
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

    expect(memory.finalResult?.markdown).toContain("## 已读来源");
    expect(memory.finalResult?.markdown).not.toContain("## Source Excerpts");
    expect(memory.finalResult?.markdown.length ?? 0).toBeLessThan(repeatedOriginal.length);
    expect(memory.finalResult?.markdown).not.toContain(repeatedOriginal);
  });

  it("returns no reliable information when no sources are available", async () => {
    const tool = getToolDefinition("finalizeResearchResult");
    const memory = createResearchMemory({
      taskSpec: {
        taskType: "public_research",
        originalGoal: "Research the difference between Playwright and Selenium",
        outputMode: "artifact",
        searchQuery: "Playwright Selenium difference",
        querySource: "rule",
        notes: [],
        searchEngine: "google",
        candidateLimit: 5,
        sourceTargetCount: 3,
      },
      researchSources: [],
      unresolvedIssues: ["No usable research sources remained after filtering the first Google results page."],
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

    expect(memory.finalResult?.status).toBe("failed");
    expect(memory.finalResult?.outputMode).toBe("artifact");
    expect(memory.finalResult?.summary).toContain("未收集到");
    expect(memory.finalResult?.markdown).toBe("");
    expect(memory.finalResult?.artifacts[0]).toMatchObject({
      kind: "markdown",
      fileName: "research-result.md",
    });
    expect(memory.finalResult?.artifacts[0]?.content).toContain("## 有限结果");
  });
});
