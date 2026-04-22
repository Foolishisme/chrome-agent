import { describe, expect, it, vi, beforeEach } from "vitest";
import { filterSiteNavCandidates } from "../src/background/result-filter";
import { getToolDefinition } from "../src/background/tools";
import { extractSiteNavLinks } from "../src/content/research";
import type { SessionMemory, SiteOverviewTaskSpec, SnapshotData } from "../src/shared/types";

const { generateSourceFactCardMock, reorderSiteCandidatesMock } = vi.hoisted(() => ({
  generateSourceFactCardMock: vi.fn(),
  reorderSiteCandidatesMock: vi.fn(),
}));

vi.mock("../src/background/llm-client", async () => {
  const actual = await vi.importActual<typeof import("../src/background/llm-client")>("../src/background/llm-client");
  return {
    ...actual,
    generateSourceFactCard: generateSourceFactCardMock,
    reorderSiteCandidates: reorderSiteCandidatesMock,
  };
});

beforeEach(() => {
  generateSourceFactCardMock.mockReset();
  reorderSiteCandidatesMock.mockReset();
});

function createSiteTaskSpec(overrides: Partial<SiteOverviewTaskSpec> = {}): SiteOverviewTaskSpec {
  return {
    taskType: "site_overview",
    originalGoal: "OpenAI 的产品有哪些",
    outputMode: "inline",
    entryMode: "explicit_url",
    entryUrl: "https://openai.com/",
    siteName: "OpenAI",
    targetDomain: "openai.com",
    officialSearchQuery: "OpenAI official website",
    candidateLimit: 6,
    sourceTargetCount: 3,
    pageReadLimit: 5,
    maxLinkDepth: 1,
    minReadableTextLength: 200,
    notes: [],
    ...overrides,
  };
}

function createSiteMemory(overrides: Partial<SessionMemory> = {}): SessionMemory {
  const memory: SessionMemory = {
    goal: "OpenAI 的产品有哪些",
    taskType: "site_overview",
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
    taskSpec: createSiteTaskSpec(),
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
  };

  return {
    ...memory,
    ...overrides,
    searchPreference: overrides.searchPreference ?? memory.searchPreference,
    conversationTurns: overrides.conversationTurns ?? memory.conversationTurns,
  } as SessionMemory;
}

function createContentSnapshot(overrides: Partial<SnapshotData> = {}): SnapshotData {
  return {
    url: "https://openai.com/",
    title: "OpenAI",
    pageType: "content",
    interactiveElements: [],
    semanticSnapshot: {
      version: 1,
      url: "https://openai.com/",
      title: "OpenAI",
      nodeCount: 1,
      truncated: false,
      root: { ref: "sem_root", role: "unknown", name: "", children: [] },
    },
    productCandidates: [],
    pageReady: { ready: true, reason: "ok", checks: [] },
    pageFacts: {
      searchBox: { present: false, visible: false, text: "" },
      searchSubmit: { present: false, visible: false, text: "" },
      pageContent: {
        readable: true,
        textLength: 400,
        paragraphCount: 4,
        hasPasswordInput: false,
        hasBlockingOverlay: false,
        likelyLoginWall: false,
        likelySpa: false,
      },
    },
    timestamp: Date.now(),
    ...overrides,
  };
}

describe("site overview navigation candidates", () => {
  beforeEach(() => {
    generateSourceFactCardMock.mockReset();
    reorderSiteCandidatesMock.mockReset();
  });

  it("extracts site navigation links from prominent page regions", () => {
    document.body.innerHTML = `
      <header>
        <nav>
          <a href="/products">Products</a>
          <a href="/pricing">Pricing</a>
        </nav>
      </header>
      <footer>
        <a href="/privacy">Privacy</a>
      </footer>
    `;

    const result = extractSiteNavLinks(document, { baseUrl: "https://openai.com/" });

    expect(result.candidates.map((candidate) => candidate.url)).toContain("https://openai.com/products");
    expect(result.candidates[0]?.linkLocation).toBe("header");
  });

  it("filters and rule-ranks same-site navigation candidates before LLM reorder", () => {
    const result = filterSiteNavCandidates(
      [
        { title: "Privacy", url: "https://openai.com/privacy", rank: 1, linkLocation: "footer" },
        { title: "Products", url: "https://openai.com/products", rank: 2, linkLocation: "nav" },
        { title: "External", url: "https://example.com/products", rank: 3, linkLocation: "nav" },
        { title: "Docs", url: "https://platform.openai.com/docs", rank: 4, linkLocation: "header" },
      ],
      createSiteTaskSpec(),
      { homepageUrl: "https://openai.com/", goal: "OpenAI 的产品有哪些" },
    );

    expect(result.candidates.map((candidate) => candidate.title)).toEqual(["Products", "Docs"]);
    expect(result.diagnostics.skippedInternalCount).toBeGreaterThanOrEqual(2);
  });

  it("stores homepage plus reordered high-value candidates", async () => {
    reorderSiteCandidatesMock.mockResolvedValueOnce({
      candidates: [
        { title: "Docs", url: "https://platform.openai.com/docs", rank: 2, linkLocation: "header", score: 70 },
        { title: "Products", url: "https://openai.com/products", rank: 1, linkLocation: "nav", score: 80 },
      ],
      reason: "prefer docs for product detail",
      source: "llm-lite",
    });

    const tool = getToolDefinition("collectResearchCandidates");
    const memory = createSiteMemory();
    const snapshot = createContentSnapshot();

    const result = await tool.run({
      memory,
      signal: new AbortController().signal,
      scanPage: vi.fn().mockResolvedValue(snapshot),
      ensureUsableSnapshot: vi.fn().mockResolvedValue(snapshot),
      executeAction: vi.fn().mockResolvedValue({
        success: true,
        actionType: "EXTRACT_SITE_NAV_LINKS",
        message: "extracted",
        researchCandidates: [
          { title: "Products", url: "https://openai.com/products", rank: 1, linkLocation: "nav" },
          { title: "Docs", url: "https://platform.openai.com/docs", rank: 2, linkLocation: "header" },
        ],
      }),
      settleAfterAction: vi.fn(),
      appendLog: vi.fn(),
      recordStep: vi.fn(),
      pushState: vi.fn().mockResolvedValue(undefined),
    });

    expect(result.status).toBe("success");
    expect(memory.researchCandidates.map((candidate) => candidate.title)).toEqual(["OpenAI", "Docs", "Products"]);
    expect(reorderSiteCandidatesMock).toHaveBeenCalledOnce();
  });

  it("falls back to rule-ranked order when site reorder fails", async () => {
    reorderSiteCandidatesMock.mockResolvedValueOnce({
      candidates: [
        { title: "Products", url: "https://openai.com/products", rank: 1, linkLocation: "nav", score: 80 },
        { title: "Docs", url: "https://platform.openai.com/docs", rank: 2, linkLocation: "header", score: 70 },
      ],
      reason: "fallback",
      source: "rule",
    });

    const tool = getToolDefinition("collectResearchCandidates");
    const memory = createSiteMemory();
    const snapshot = createContentSnapshot();

    await tool.run({
      memory,
      signal: new AbortController().signal,
      scanPage: vi.fn().mockResolvedValue(snapshot),
      ensureUsableSnapshot: vi.fn().mockResolvedValue(snapshot),
      executeAction: vi.fn().mockResolvedValue({
        success: true,
        actionType: "EXTRACT_SITE_NAV_LINKS",
        message: "extracted",
        researchCandidates: [
          { title: "Products", url: "https://openai.com/products", rank: 1, linkLocation: "nav" },
          { title: "Docs", url: "https://platform.openai.com/docs", rank: 2, linkLocation: "header" },
        ],
      }),
      settleAfterAction: vi.fn(),
      appendLog: vi.fn(),
      recordStep: vi.fn(),
      pushState: vi.fn().mockResolvedValue(undefined),
    });

    expect(memory.researchCandidates.map((candidate) => candidate.title)).toEqual(["OpenAI", "Products", "Docs"]);
  });
});

describe("site overview entry resolution", () => {
  it("rejects search candidates that do not look like the official site", async () => {
    const tool = getToolDefinition("resolveEntryPoint");
    const memory = createSiteMemory({
      taskSpec: createSiteTaskSpec({
        entryMode: "resolve_official_home",
        entryUrl: undefined,
        siteName: "OpenAI",
        targetDomain: undefined,
      }),
    });
    const searchSnapshot = createContentSnapshot({
      url: "https://www.google.com/search?q=OpenAI+official+website",
      title: "OpenAI official website - Google Search",
      pageType: "google_search",
    });
    const executeAction = vi
      .fn()
      .mockResolvedValueOnce({ success: true, actionType: "NAVIGATE", message: "opened google" })
      .mockResolvedValueOnce({
        success: true,
        actionType: "EXTRACT_SEARCH_RESULTS",
        message: "extracted",
        researchCandidates: [
          { title: "OpenAI - Wikipedia", url: "https://en.wikipedia.org/wiki/OpenAI", source: "wikipedia.org", rank: 1 },
        ],
      });

    const result = await tool.run({
      memory,
      signal: new AbortController().signal,
      scanPage: vi.fn().mockResolvedValue(searchSnapshot),
      ensureUsableSnapshot: vi.fn().mockResolvedValue(searchSnapshot),
      executeAction,
      settleAfterAction: vi.fn(),
      appendLog: vi.fn(),
      recordStep: vi.fn(),
      pushState: vi.fn().mockResolvedValue(undefined),
    });

    expect(result.status).toBe("fatal_error");
    expect(result.errorCode).toBe("SITE_ENTRY_NOT_FOUND");
    expect(executeAction).toHaveBeenCalledTimes(2);
  });

  it("stops when an explicit entry URL opens a non-content page", async () => {
    const tool = getToolDefinition("resolveEntryPoint");
    const memory = createSiteMemory();
    const pdfSnapshot = createContentSnapshot({
      url: "https://openai.com/report.pdf",
      title: "OpenAI PDF",
      pageType: "pdf",
    });

    const result = await tool.run({
      memory,
      signal: new AbortController().signal,
      scanPage: vi.fn().mockResolvedValue(pdfSnapshot),
      ensureUsableSnapshot: vi.fn().mockResolvedValue(pdfSnapshot),
      executeAction: vi.fn().mockResolvedValue({ success: true, actionType: "NAVIGATE", message: "opened pdf" }),
      settleAfterAction: vi.fn(),
      appendLog: vi.fn(),
      recordStep: vi.fn(),
      pushState: vi.fn().mockResolvedValue(undefined),
    });

    expect(result.status).toBe("fatal_error");
    expect(result.stepStatus).toBe("failed");
    expect(result.errorCode).toBe("SITE_ENTRY_NOT_CONTENT");
  });
});

describe("site overview source fallback reading", () => {
  it("continues to replacement subpages when a secondary page is shorter than 200 characters", async () => {
    const tool = getToolDefinition("readResearchSourceFacts");
    const memory = createSiteMemory({
      activeSourceIndex: 1,
      researchCandidates: [
        { title: "OpenAI", url: "https://openai.com/", rank: 0 },
        { title: "Tiny page", url: "https://openai.com/tiny", rank: 1 },
        { title: "Products", url: "https://openai.com/products", rank: 2 },
      ],
      researchSources: [
        {
          candidate: { title: "OpenAI", url: "https://openai.com/", rank: 0 },
          status: "success",
          pageTitle: "OpenAI",
          bodyExcerpt: "Readable homepage",
          sourceUrl: "https://openai.com/",
          unresolvedIssues: [],
          textLength: 500,
        },
      ],
    });

    const result = await tool.run({
      memory,
      signal: new AbortController().signal,
      scanPage: vi.fn().mockResolvedValue(createContentSnapshot({ url: "https://openai.com/tiny", title: "Tiny page" })),
      ensureUsableSnapshot: vi.fn(),
      executeAction: vi
        .fn()
        .mockResolvedValueOnce({ success: true, actionType: "NAVIGATE", message: "navigated" })
        .mockResolvedValueOnce({
          success: true,
          actionType: "EXTRACT_PAGE_FACTS",
          message: "partial",
          pageFactsResult: {
            status: "success",
            pageTitle: "Tiny page",
            bodyExcerpt: "Too short",
            textLength: 20,
            extractionStrategy: "fallback",
          },
        }),
      settleAfterAction: vi.fn().mockResolvedValue(undefined),
      appendLog: vi.fn(),
      recordStep: vi.fn(),
      pushState: vi.fn().mockResolvedValue(undefined),
    });

    expect(result.stepStatus).toBe("running");
    expect(memory.activeSourceIndex).toBe(2);
    expect(memory.researchSources[1]?.status).toBe("partial");
    expect(memory.unresolvedIssues.join(" ")).toContain("shorter than 200");
  });

  it("continues to replacement subpages when a secondary page looks like 404", async () => {
    const tool = getToolDefinition("readResearchSourceFacts");
    const memory = createSiteMemory({
      activeSourceIndex: 1,
      researchCandidates: [
        { title: "OpenAI", url: "https://openai.com/", rank: 0 },
        { title: "Missing", url: "https://openai.com/missing", rank: 1 },
        { title: "Products", url: "https://openai.com/products", rank: 2 },
      ],
      researchSources: [
        {
          candidate: { title: "OpenAI", url: "https://openai.com/", rank: 0 },
          status: "success",
          pageTitle: "OpenAI",
          bodyExcerpt: "Readable homepage",
          sourceUrl: "https://openai.com/",
          unresolvedIssues: [],
          textLength: 500,
        },
      ],
    });

    const result = await tool.run({
      memory,
      signal: new AbortController().signal,
      scanPage: vi.fn().mockResolvedValue(createContentSnapshot({ url: "https://openai.com/missing", title: "404 Not Found" })),
      ensureUsableSnapshot: vi.fn(),
      executeAction: vi
        .fn()
        .mockResolvedValueOnce({ success: true, actionType: "NAVIGATE", message: "navigated" })
        .mockResolvedValueOnce({
          success: true,
          actionType: "EXTRACT_PAGE_FACTS",
          message: "success",
          pageFactsResult: {
            status: "success",
            pageTitle: "404 Not Found",
            bodyExcerpt: "This is not the page you are looking for.".repeat(10),
            textLength: 400,
            extractionStrategy: "fallback",
          },
        }),
      settleAfterAction: vi.fn().mockResolvedValue(undefined),
      appendLog: vi.fn(),
      recordStep: vi.fn(),
      pushState: vi.fn().mockResolvedValue(undefined),
    });

    expect(result.stepStatus).toBe("running");
    expect(memory.activeSourceIndex).toBe(2);
    expect(memory.researchSources[1]?.status).toBe("partial");
    expect(memory.unresolvedIssues.join(" ")).toContain("404");
  });

  it("returns partial when site candidates are exhausted before enough readable pages are collected", async () => {
    const tool = getToolDefinition("readResearchSourceFacts");
    const memory = createSiteMemory({
      activeSourceIndex: 1,
      researchCandidates: [{ title: "OpenAI", url: "https://openai.com/", rank: 0 }],
      researchSources: [
        {
          candidate: { title: "OpenAI", url: "https://openai.com/", rank: 0 },
          status: "success",
          pageTitle: "OpenAI",
          bodyExcerpt: "Readable homepage",
          sourceUrl: "https://openai.com/",
          unresolvedIssues: [],
          textLength: 500,
        },
      ],
    });

    const result = await tool.run({
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

    expect(result.stepStatus).toBe("succeeded");
    expect(memory.unresolvedIssues.join(" ")).toContain("exhausted");
  });
});
