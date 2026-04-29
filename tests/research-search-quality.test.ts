import { beforeEach, describe, expect, it, vi } from "vitest";
import { preparePublicResearchCandidates } from "../src/background/tools/adapters";
import { extractGoogleSearchResults, extractPageFacts } from "../src/content/research";
import type { PublicResearchTaskSpec, SessionMemory, SnapshotData } from "../src/shared/types";

const { reorderResearchCandidatesMock } = vi.hoisted(() => ({
  reorderResearchCandidatesMock: vi.fn(),
}));

vi.mock("../src/background/llm/llm-client", async () => {
  const actual = await vi.importActual<typeof import("../src/background/llm/llm-client")>("../src/background/llm/llm-client");
  return {
    ...actual,
    reorderResearchCandidates: reorderResearchCandidatesMock,
  };
});

function createResearchMemory(overrides: Partial<SessionMemory> = {}): SessionMemory {
  const memory: SessionMemory = {
    goal: "Research AI agent development",
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
      pageType: "google_search",
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

function createGoogleSnapshot(): SnapshotData {
  return {
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
        resultCount: 4,
        naturalCount: 4,
        adCount: 0,
      },
    },
    timestamp: Date.now(),
  };
}

describe("research search quality pipeline", () => {
  beforeEach(() => {
    reorderResearchCandidatesMock.mockReset();
  });

  it("extracts first-page results, filters them, and stores the reordered candidate list", async () => {
    reorderResearchCandidatesMock.mockResolvedValueOnce({
      candidates: [
        { title: "Official AI guide", url: "https://example.org/official", rank: 2, source: "example.org" },
        { title: "Research blog", url: "https://example.com/blog", rank: 1, source: "example.com" },
      ],
      reason: "prefer the higher-signal official source first",
      source: "llm-lite",
    });

    const memory = createResearchMemory({
      taskSpec: {
        taskType: "public_research",
        originalGoal: "Research AI agent development",
        outputMode: "inline",
        searchQuery: "AI agent development",
        querySource: "llm-lite",
        notes: [],
        searchEngine: "google",
        candidateLimit: 5,
        sourceTargetCount: 3,
      },
    });
    const taskSpec = memory.taskSpec as PublicResearchTaskSpec;

    const result = await preparePublicResearchCandidates({
      goal: memory.goal,
      searchQuery: taskSpec.searchQuery,
      candidates: [
        { title: "Research blog", url: "https://example.com/blog", rank: 1, snippet: "A broad summary of AI agents." },
        { title: "Official AI guide", url: "https://example.org/official", rank: 2, snippet: "Official technical documentation." },
        { title: "Google cache", url: "https://www.google.com/search?q=ai+agents", rank: 3 },
        { title: "Pdf whitepaper", url: "https://example.net/whitepaper.pdf", rank: 4 },
      ],
      taskSpec,
      signal: new AbortController().signal,
    });

    memory.researchCandidates = result.candidates;

    expect(result.diagnostics.finalCount).toBe(2);
    expect(memory.researchCandidates.map((candidate) => candidate.title)).toEqual([
      "Official AI guide",
      "Research blog",
    ]);
    expect(result.reason).toContain("official source");
  });

  it("falls back to filtered order when reorder fails", async () => {
    reorderResearchCandidatesMock.mockResolvedValueOnce({
      candidates: [
        { title: "Research blog", url: "https://example.com/blog", rank: 1, source: "example.com" },
        { title: "Official AI guide", url: "https://example.org/official", rank: 2, source: "example.org" },
      ],
      reason: "fallback to filtered order",
      source: "rule",
    });

    const memory = createResearchMemory({
      taskSpec: {
        taskType: "public_research",
        originalGoal: "Research AI agent development",
        outputMode: "inline",
        searchQuery: "AI agent development",
        querySource: "llm-lite",
        notes: [],
        searchEngine: "google",
        candidateLimit: 5,
        sourceTargetCount: 3,
      },
    });
    const taskSpec = memory.taskSpec as PublicResearchTaskSpec;

    const result = await preparePublicResearchCandidates({
      goal: memory.goal,
      searchQuery: taskSpec.searchQuery,
      candidates: [
        { title: "Research blog", url: "https://example.com/blog", rank: 1, snippet: "A broad summary of AI agents." },
        { title: "Official AI guide", url: "https://example.org/official", rank: 2, snippet: "Official technical documentation." },
      ],
      taskSpec,
      signal: new AbortController().signal,
    });

    memory.researchCandidates = result.candidates;

    expect(memory.researchCandidates.map((candidate) => candidate.title)).toEqual([
      "Research blog",
      "Official AI guide",
    ]);
  });

  it("extracts page facts successfully from a readable source page", () => {
    document.title = "AI Agent Overview";
    document.body.innerHTML = `
      <article>
        <h1>AI Agent Overview</h1>
        <p>${"AI agents combine planning, tool use, and execution loops to solve multi-step tasks. ".repeat(5)}</p>
        <p>${"Teams use them for research, customer support automation, and developer workflows. ".repeat(4)}</p>
        <p>${"The main tradeoffs involve controllability, latency, and reliability under weak evidence. ".repeat(4)}</p>
        <section class="comments">
          <p>Comments</p>
          <p>This article is wrong.</p>
        </section>
        <div class="related-posts">
          <p>Related stories</p>
          <p>Read more about hype cycles.</p>
        </div>
        <div class="advertisement">
          <p>Sponsored</p>
          <p>Buy our premium AI course today.</p>
        </div>
      </article>
    `;

    const result = extractPageFacts();

    expect(result.status).toBe("success");
    expect(result.pageTitle).toBe("AI Agent Overview");
    expect(result.bodyExcerpt.length).toBeGreaterThan(200);
    expect(result.textLength).toBeGreaterThan(250);
    expect(result.extractionStrategy).toBe("readability");
    expect(result.bodyExcerpt).not.toContain("Comments");
    expect(result.bodyExcerpt).not.toContain("Related stories");
    expect(result.bodyExcerpt).not.toContain("Sponsored");
  });

  it("marks low-readability pages as partial extraction", () => {
    document.title = "Members only";
    document.body.innerHTML = `
      <main>
        <h1>Members only</h1>
        <p>Please sign in to continue reading.</p>
        <input type="password" />
      </main>
    `;

    const result = extractPageFacts();

    expect(result.status).toBe("partial");
    expect(result.reason).toBeTruthy();
    expect(result.extractionStrategy).toBe("fallback");
  });

  it("parses google-style result cards into research candidates", () => {
    document.body.innerHTML = `
      <div class="MjjYud">
        <a href="https://example.com/a"><h3>AI agent market overview</h3></a>
        <div>Market overview and ecosystem analysis for AI agents in 2026.</div>
      </div>
      <div class="MjjYud">
        <a href="https://example.com/b"><h3>Official AI agent docs</h3></a>
        <div>Technical documentation for planning, tool use, and memory.</div>
      </div>
    `;

    const result = extractGoogleSearchResults(document, 10);

    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]?.snippet).toContain("Market overview");
    expect(result.candidates[1]).toMatchObject({
      title: "Official AI agent docs",
      url: "https://example.com/b",
    });
  });
});
