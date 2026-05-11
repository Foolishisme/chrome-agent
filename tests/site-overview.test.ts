import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  filterSiteNavCandidates,
  prepareSiteOverviewCandidates,
} from "../src/background/tools/adapters/prepare-task-candidates";
import { extractSiteNavLinks } from "../src/content/research";
import type { SessionMemory, SiteOverviewTaskSpec, SnapshotData } from "../src/shared/agent-domain-model";

const { reorderSiteCandidatesMock } = vi.hoisted(() => ({
  reorderSiteCandidatesMock: vi.fn(),
}));

vi.mock("../src/background/llm/llm-client", async () => {
  const actual = await vi.importActual<typeof import("../src/background/llm/llm-client")>("../src/background/llm/llm-client");
  return {
    ...actual,
    reorderSiteCandidates: reorderSiteCandidatesMock,
  };
});

beforeEach(() => {
  reorderSiteCandidatesMock.mockReset();
});

function createSiteTaskSpec(overrides: Partial<SiteOverviewTaskSpec> = {}): SiteOverviewTaskSpec {
  return {
    taskType: "site_overview",
    originalGoal: "OpenAI 鐨勪骇鍝佹湁鍝簺",
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

function createSiteMemory(overrides: Partial<SessionMemory> = {}): SessionMemory {
  const memory: SessionMemory = {
    goal: "OpenAI 鐨勪骇鍝佹湁鍝簺",
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

describe("site overview navigation candidates", () => {
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
      { homepageUrl: "https://openai.com/", goal: "OpenAI 鐨勪骇鍝佹湁鍝簺" },
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

    const prepared = await prepareSiteOverviewCandidates({
      goal: "OpenAI 鐨勪骇鍝佹湁鍝簺",
      homepageSnapshot: createContentSnapshot(),
      candidates: [
        { title: "Products", url: "https://openai.com/products", rank: 1, linkLocation: "nav" },
        { title: "Docs", url: "https://platform.openai.com/docs", rank: 2, linkLocation: "header" },
      ],
      taskSpec: createSiteTaskSpec(),
      signal: new AbortController().signal,
    });

    const memory = createSiteMemory({
      researchCandidates: [prepared.homepageCandidate, ...prepared.candidates],
      filterDiagnostics: prepared.diagnostics,
    });

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

    const prepared = await prepareSiteOverviewCandidates({
      goal: "OpenAI 鐨勪骇鍝佹湁鍝簺",
      homepageSnapshot: createContentSnapshot(),
      candidates: [
        { title: "Products", url: "https://openai.com/products", rank: 1, linkLocation: "nav" },
        { title: "Docs", url: "https://platform.openai.com/docs", rank: 2, linkLocation: "header" },
      ],
      taskSpec: createSiteTaskSpec(),
      signal: new AbortController().signal,
    });

    expect(prepared.candidates.map((candidate) => candidate.title)).toEqual(["Products", "Docs"]);
  });
});
