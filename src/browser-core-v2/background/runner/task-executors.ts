import type { BrowserDriver } from "../../../background/browser-capability/types";
import { decideRoundAction, type RoundDecisionResult } from "../../../background/llm-client";
import { appendLog } from "../../../background/runtime/shared";
import { ensureTerminalResult } from "../../../background/runtime/public-state";
import { filterResearchCandidates } from "../../../background/result-filter";
import { collectCommerceCandidatesTool } from "../../../background/tools/collect-commerce-candidates";
import { finalizeCommerceResultTool } from "../../../background/tools/finalize-commerce-result";
import { finalizeDirectAnswerTool } from "../../../background/tools/finalize-direct-answer";
import { finalizeResearchResultTool } from "../../../background/tools/finalize-research-result";
import { openSearchResultsTool } from "../../../background/tools/open-search-results";
import type { AgentToolDefinition, StepOptions } from "../../../background/tools/shared";
import type {
  FirstPartyToolHandlerContext,
  BrowserSearchResult,
  BrowserSiteOverviewToolOutput,
  BrowserWebDetailToolOutput,
  CommerceResearchToolInput,
  CommerceResearchToolOutput,
  FirstPartyToolRegistry,
} from "../tools";
import { executeFirstPartyTool } from "../tools";
import type {
  ActionResult,
  AgentAction,
  CommerceTaskSpec,
  FinalStatus,
  PlanStepStatus,
  PublicResearchTaskSpec,
  ResearchCandidate,
  ResearchSourceResult,
  SessionMemory,
  SnapshotData,
  SiteOverviewTaskSpec,
  ToolName,
  ToolResult,
} from "../../../shared/types";
import type { ActiveSession } from "../../../background/runtime/shared";
import { buildBrowserCoreV2DisplayPlan } from "./task-plan-builder";

export interface BrowserCoreRunnerDeps {
  publishState(session: ActiveSession, asError?: boolean): Promise<void>;
  scanPage(): Promise<SnapshotData>;
  ensureUsableSnapshot(): Promise<SnapshotData>;
  executeAction(action: AgentAction, stepSummary: string): Promise<ActionResult>;
  settleAfterAction(action: AgentAction): Promise<void>;
  recordStep(options: StepOptions): void;
  pushState(stepSummary?: string): Promise<void>;
}

export interface BrowserCoreTaskExecutorContext {
  session: ActiveSession;
  deps: BrowserCoreRunnerDeps;
  driver: BrowserDriver;
  registry: FirstPartyToolRegistry;
  ensureBudget(): Promise<void>;
}

const MAX_RUNTIME_ROUNDS = 2;

function getPlanStep(memory: SessionMemory, stepId: string) {
  return memory.plan.find((step) => step.stepId === stepId);
}

async function beginPlanStep(
  context: BrowserCoreTaskExecutorContext,
  stepId: string,
  toolName: ToolName,
  stepSummary: string,
) {
  const step = getPlanStep(context.session.memory, stepId);
  if (step) {
    step.status = "running";
  }
  context.session.memory.runtimeMeta.currentStepId = stepId;
  context.session.memory.runtimeMeta.currentTool = toolName;
  context.session.memory.runtimeMeta.currentStep += 1;
  context.session.memory.liveStepSummary = stepSummary;
  appendLog(context.session, "runtime", "info", "Running Browser Core V2 plan step.", {
    stepId,
    toolName,
    goal: step?.goal,
  });
  await context.deps.publishState(context.session);
}

async function finishPlanStep(
  context: BrowserCoreTaskExecutorContext,
  stepId: string,
  status: PlanStepStatus,
  summary: string,
) {
  const step = getPlanStep(context.session.memory, stepId);
  if (step) {
    step.status = status;
  }
  context.session.memory.runtimeMeta.currentStepId = stepId;
  context.session.memory.runtimeMeta.currentTool = undefined;
  context.session.memory.liveStepSummary = summary;
  await context.deps.publishState(context.session);
}

function toSourceCandidate(result: BrowserSearchResult, rank: number): ResearchCandidate {
  return {
    title: result.title,
    url: result.url,
    snippet: result.snippet,
    source: result.source,
    rank,
  };
}

function collectIssuesFromProblems(
  coverage: { limitations?: string[] } | undefined,
  problems: Array<{ message: string }>,
) {
  return [
    ...(coverage?.limitations ?? []),
    ...problems.map((problem) => problem.message),
  ].filter(Boolean);
}

function dedupeStrings(items: string[]) {
  return Array.from(new Set(items.filter(Boolean)));
}

function mergeResearchSources(existing: ResearchSourceResult[], incoming: ResearchSourceResult[]) {
  const merged = new Map<string, ResearchSourceResult>();

  for (const source of existing) {
    merged.set(source.sourceUrl, source);
  }

  for (const source of incoming) {
    const current = merged.get(source.sourceUrl);
    if (!current) {
      merged.set(source.sourceUrl, source);
      continue;
    }

    const nextIsBetter =
      (source.status === "success" && current.status !== "success") || source.textLength > current.textLength;

    merged.set(source.sourceUrl, {
      ...(nextIsBetter ? source : current),
      unresolvedIssues: dedupeStrings([...current.unresolvedIssues, ...source.unresolvedIssues]),
    });
  }

  return Array.from(merged.values());
}

function clampPositiveInt(value: number | undefined, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value) || !value) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

function appendTaskNotes(notes: string[], notesAppend?: string[]) {
  return dedupeStrings([...notes, ...(notesAppend ?? [])]);
}

function applyPublicResearchPatch(taskSpec: PublicResearchTaskSpec, decision: RoundDecisionResult): PublicResearchTaskSpec {
  const patch = decision.taskSpecPatch ?? {};
  return {
    ...taskSpec,
    searchQuery: patch.searchQuery?.trim() || taskSpec.searchQuery,
    candidateLimit: clampPositiveInt(patch.candidateLimit, taskSpec.candidateLimit, 1, 10),
    sourceTargetCount: clampPositiveInt(patch.sourceTargetCount, taskSpec.sourceTargetCount, 1, 5),
    notes: appendTaskNotes(taskSpec.notes, patch.notesAppend),
  };
}

function applySiteOverviewPatch(taskSpec: SiteOverviewTaskSpec, decision: RoundDecisionResult): SiteOverviewTaskSpec {
  const patch = decision.taskSpecPatch ?? {};
  const entryUrl = patch.entryUrl ?? taskSpec.entryUrl;
  const nextTaskSpec: SiteOverviewTaskSpec = {
    ...taskSpec,
    entryUrl,
    candidateLimit: clampPositiveInt(patch.candidateLimit, taskSpec.candidateLimit, 1, 10),
    sourceTargetCount: clampPositiveInt(patch.sourceTargetCount, taskSpec.sourceTargetCount, 1, 5),
    pageReadLimit: clampPositiveInt(patch.pageReadLimit, taskSpec.pageReadLimit, 1, 8),
    notes: appendTaskNotes(taskSpec.notes, patch.notesAppend),
  };

  if (patch.officialSearchQuery?.trim()) {
    nextTaskSpec.officialSearchQuery = patch.officialSearchQuery.trim();
  }

  if (entryUrl) {
    nextTaskSpec.entryMode = "explicit_url";
    try {
      nextTaskSpec.targetDomain = new URL(entryUrl).hostname.replace(/^www\./, "");
    } catch {
      nextTaskSpec.targetDomain = taskSpec.targetDomain;
    }
  }

  return nextTaskSpec;
}

function applyCommercePatch(taskSpec: CommerceTaskSpec, decision: RoundDecisionResult): CommerceTaskSpec {
  const patch = decision.taskSpecPatch ?? {};
  return {
    ...taskSpec,
    searchQuery: patch.searchQuery?.trim() || taskSpec.searchQuery,
    topK: clampPositiveInt(patch.topK, taskSpec.topK, 1, 8),
    llmInputLimit: clampPositiveInt(patch.llmInputLimit, taskSpec.llmInputLimit, 1, 10),
    extractLimit: clampPositiveInt(patch.extractLimit, taskSpec.extractLimit, 1, 20),
    notes: appendTaskNotes(taskSpec.notes, patch.notesAppend),
  };
}

function rebuildPlanForTaskSpec(context: BrowserCoreTaskExecutorContext, stepId: string) {
  const taskSpec = context.session.memory.taskSpec;
  if (!taskSpec) {
    return;
  }

  context.session.memory.plan = buildBrowserCoreV2DisplayPlan(taskSpec);
  context.session.memory.runtimeMeta.currentStepId = context.session.memory.plan[0]?.stepId;
  context.session.memory.runtimeMeta.currentTool = undefined;
  context.session.memory.liveStepSummary = `Round ${context.session.memory.runtimeMeta.currentRound} is ready.`;
  appendLog(context.session, "runtime", "info", "Prepared the next Browser Core V2 round.", {
    stepId,
    round: context.session.memory.runtimeMeta.currentRound,
    taskType: taskSpec.taskType,
    taskSpec,
  });
}

function toResearchSourceResult(candidate: ResearchCandidate, detail: BrowserWebDetailToolOutput): ResearchSourceResult {
  const unresolvedIssues = collectIssuesFromProblems(detail.coverage, detail.problems);
  const facts = detail.keyFacts.map((fact) => ({
    text: fact.text,
    evidenceUrl: fact.evidenceUrl ?? candidate.url,
    evidenceTitle: fact.evidenceTitle ?? detail.pageTitle,
  }));

  return {
    candidate,
    status: detail.status === "success" ? "success" : detail.status === "partial" ? "partial" : "failed",
    pageTitle: detail.pageTitle,
    bodyExcerpt: detail.pageSummary,
    sourceUrl: candidate.url,
    unresolvedIssues,
    textLength: detail.pageSummary.length,
    sourceFactCard: {
      title: detail.pageTitle,
      url: candidate.url,
      summary: detail.pageSummary,
      facts,
      caveats: unresolvedIssues,
      status: detail.status === "success" ? "success" : "partial",
    },
  };
}

function toSiteOverviewSources(result: BrowserSiteOverviewToolOutput): ResearchSourceResult[] {
  return result.pagesRead.map((page, index) => {
    const unresolvedIssues = [
      ...(page.status !== "success" ? [`${page.title} was only partially covered during site overview.`] : []),
      ...(index === 0 ? result.gaps : []),
    ];
    const summary =
      index === 0
        ? result.siteSummary
        : `${page.title} was included as the ${page.role} page during the same-site overview.`;

    return {
      candidate: {
        title: page.title,
        url: page.url,
        source: (() => {
          try {
            return new URL(page.url).hostname.replace(/^www\./, "");
          } catch {
            return undefined;
          }
        })(),
        rank: index + 1,
      },
      status: page.status,
      pageTitle: page.title,
      bodyExcerpt: summary,
      sourceUrl: page.url,
      unresolvedIssues,
      textLength: summary.length,
      sourceFactCard: {
        title: page.title,
        url: page.url,
        summary,
        facts: [
          {
            text: `${page.title} was classified as the ${page.role} page in the overview.`,
            evidenceUrl: page.url,
            evidenceTitle: page.title,
          },
        ],
        caveats: unresolvedIssues,
        status: page.status === "success" ? "success" : "partial",
      },
    };
  });
}

function toCommerceShortlist(memory: SessionMemory) {
  return memory.extractedItems.map((item) => ({
    title: item.title,
    url: item.url,
    priceText: item.priceText,
    shopText: item.shopText,
    summary: item.summary,
  }));
}

function toCommerceEvidence(memory: SessionMemory) {
  const evidence = [];
  if ("searchQuery" in (memory.taskSpec ?? {})) {
    evidence.push({
      text: `Candidates were collected for query "${(memory.taskSpec as { searchQuery?: string }).searchQuery ?? memory.goal}".`,
      evidenceTitle: "Legacy commerce search helper",
    });
  }
  if (memory.filterDiagnostics?.kind === "commerce") {
    evidence.push({
      text: `Filter kept ${memory.filterDiagnostics.finalCount} items out of ${memory.filterDiagnostics.inputCount}.`,
      evidenceTitle: "Commerce filter diagnostics",
    });
  }
  return evidence;
}

function mapLegacyToolStatus(result: ToolResult): CommerceResearchToolOutput["status"] {
  if (result.stepStatus === "blocked") {
    return "blocked";
  }
  if (result.status === "retryable_error" || result.status === "fatal_error") {
    return "failed";
  }
  if (result.status === "partial") {
    return "partial";
  }
  return "success";
}

async function runLegacyTool(
  context: BrowserCoreTaskExecutorContext,
  tool: AgentToolDefinition,
): Promise<ToolResult> {
  return tool.run({
    memory: context.session.memory,
    signal: context.session.abortController.signal,
    scanPage: () => context.deps.scanPage(),
    ensureUsableSnapshot: () => context.deps.ensureUsableSnapshot(),
    executeAction: (action, stepSummary) => context.deps.executeAction(action, stepSummary),
    settleAfterAction: (action) => context.deps.settleAfterAction(action),
    appendLog: (source, level, message, detail) => appendLog(context.session, source, level, message, detail),
    recordStep: (options) => context.deps.recordStep(options),
    pushState: (stepSummary) => context.deps.pushState(stepSummary),
  });
}

async function finalizeAndPublish(context: BrowserCoreTaskExecutorContext, stepId: string, tool: AgentToolDefinition) {
  await beginPlanStep(context, stepId, tool.name, getPlanStep(context.session.memory, stepId)?.goal ?? tool.name);
  const result = await runLegacyTool(context, tool);
  await finishPlanStep(context, stepId, result.stepStatus, result.summary);
  context.session.memory.runtimeMeta.status = "done";
  context.session.memory.runtimeMeta.currentTool = undefined;
  context.session.memory.liveStepSummary = "Final result is ready.";
  await context.deps.publishState(context.session);
}

async function executeSearchStep(
  context: BrowserCoreTaskExecutorContext,
  stepId: string,
  query: string,
  scope: "web" | "official_site",
) {
  await context.ensureBudget();
  await beginPlanStep(context, stepId, "browser.search", getPlanStep(context.session.memory, stepId)?.goal ?? "Search");
  const result = await executeFirstPartyTool(
    context.registry,
    "browser.search",
    { query, scope },
    {
      driver: context.driver,
      signal: context.session.abortController.signal,
      commerceResearchDelegate: (input, handlerContext) => runCommerceDelegate(context, input, handlerContext),
    },
  );

  context.session.memory.researchCandidates = result.results.map((item, index) => toSourceCandidate(item, index + 1));
  context.session.memory.currentFacts = {
    ...context.session.memory.currentFacts,
    searchPageUrl: result.searchPageUrl,
  };
  context.session.memory.unresolvedIssues = [
    ...context.session.memory.unresolvedIssues,
    ...collectIssuesFromProblems(result.coverage, result.problems),
  ];

  context.deps.recordStep({
    stepSummary: `browser.search completed with ${result.results.length} candidate(s).`,
    nextIntent: "Read the selected pages or resolve the official entry.",
    expectedOutcome: "A first-page result list is available.",
    snapshotSummary: `${result.status} | ${result.results.length} results`,
  });

  const stepStatus: PlanStepStatus =
    result.status === "blocked" ? "blocked" : result.status === "failed" ? "failed" : "succeeded";
  await finishPlanStep(context, stepId, stepStatus, `browser.search ${result.status}.`);
  return result;
}

function resolveOfficialEntry(
  candidates: ResearchCandidate[],
  taskSpec: Extract<SessionMemory["taskSpec"], { taskType: "site_overview" }>,
) {
  const domainHint = taskSpec.targetDomain?.toLowerCase();
  const siteNameHint = taskSpec.siteName?.toLowerCase().replace(/\s+/g, "");

  const official = candidates.find((candidate) => {
    const normalizedSource = candidate.source?.toLowerCase().replace(/^www\./, "");
    const normalizedTitle = candidate.title.toLowerCase().replace(/\s+/g, "");

    if (domainHint && normalizedSource && (normalizedSource === domainHint || normalizedSource.endsWith(`.${domainHint}`))) {
      return true;
    }

    if (siteNameHint && normalizedSource?.includes(siteNameHint)) {
      return true;
    }

    return siteNameHint ? normalizedTitle.includes(siteNameHint) : false;
  });

  return official ?? candidates[0];
}

async function executeWebDetailBatch(context: BrowserCoreTaskExecutorContext, stepId: string) {
  const taskSpec = context.session.memory.taskSpec;
  if (!taskSpec || taskSpec.taskType !== "public_research") {
    throw new Error("Public research detail execution requires a public research task spec.");
  }

  const filtered = filterResearchCandidates(context.session.memory.researchCandidates, taskSpec.candidateLimit);
  const candidates = filtered.candidates.slice(0, taskSpec.sourceTargetCount);
  context.session.memory.researchCandidates = filtered.candidates;
  context.session.memory.filterDiagnostics = filtered.diagnostics;

  await context.ensureBudget();
  await beginPlanStep(context, stepId, "browser.webDetail", getPlanStep(context.session.memory, stepId)?.goal ?? "Read pages");

  const sources: ResearchSourceResult[] = [];

  for (const candidate of candidates) {
    await context.ensureBudget();
    const detail = await executeFirstPartyTool(
      context.registry,
      "browser.webDetail",
      {
        url: candidate.url,
        goal: context.session.memory.goal,
      },
      {
        driver: context.driver,
        signal: context.session.abortController.signal,
        commerceResearchDelegate: (input, handlerContext) => runCommerceDelegate(context, input, handlerContext),
      },
    );

    if (detail.status !== "blocked" && detail.status !== "failed") {
      sources.push(toResearchSourceResult(candidate, detail));
    } else {
      context.session.memory.unresolvedIssues.push(...collectIssuesFromProblems(detail.coverage, detail.problems));
    }

    context.deps.recordStep({
      stepSummary: `browser.webDetail read ${candidate.title}.`,
      nextIntent: "Continue reading the next candidate or summarize.",
      expectedOutcome: "A trimmed single-page summary is available.",
      snapshotSummary: `${detail.status} | ${candidate.url}`,
    });
  }

  context.session.memory.researchSources = mergeResearchSources(context.session.memory.researchSources, sources);
  const status: PlanStepStatus = sources.length > 0 ? "succeeded" : "failed";
  await finishPlanStep(
    context,
    stepId,
    status,
    sources.length > 0 ? `Read ${sources.length} candidate page(s).` : "No readable candidate pages were collected.",
  );
}

async function executeSiteOverviewStep(context: BrowserCoreTaskExecutorContext, stepId: string) {
  const taskSpec = context.session.memory.taskSpec;
  if (!taskSpec || taskSpec.taskType !== "site_overview" || !taskSpec.entryUrl) {
    throw new Error("Site overview execution requires a resolved site entry URL.");
  }

  await context.ensureBudget();
  await beginPlanStep(context, stepId, "browser.siteOverview", getPlanStep(context.session.memory, stepId)?.goal ?? "Read site");
  const result = await executeFirstPartyTool(
    context.registry,
    "browser.siteOverview",
    {
      entryUrl: taskSpec.entryUrl,
      goal: context.session.memory.goal,
      maxPages: taskSpec.pageReadLimit,
      maxDepth: taskSpec.maxLinkDepth,
    },
    {
      driver: context.driver,
      signal: context.session.abortController.signal,
      commerceResearchDelegate: (input, handlerContext) => runCommerceDelegate(context, input, handlerContext),
    },
  );

  context.session.memory.researchSources = mergeResearchSources(
    context.session.memory.researchSources,
    toSiteOverviewSources(result),
  );
  context.session.memory.unresolvedIssues = [
    ...context.session.memory.unresolvedIssues,
    ...collectIssuesFromProblems(result.coverage, result.problems),
  ];

  context.deps.recordStep({
    stepSummary: `browser.siteOverview read ${result.pagesRead.length} same-site page(s).`,
    nextIntent: "Summarize the site overview.",
    expectedOutcome: "Site coverage and key pages are available.",
    snapshotSummary: `${result.status} | ${result.pagesRead.length} pages`,
  });

  const status: PlanStepStatus =
    result.status === "blocked" ? "blocked" : result.status === "failed" ? "failed" : "succeeded";
  await finishPlanStep(context, stepId, status, `browser.siteOverview ${result.status}.`);
  return result;
}

async function executeCommerceSkillStep(context: BrowserCoreTaskExecutorContext, stepId: string) {
  const taskSpec = context.session.memory.taskSpec;
  if (!taskSpec || taskSpec.taskType !== "commerce_search") {
    throw new Error("Commerce skill execution requires a commerce task spec.");
  }

  await context.ensureBudget();
  await beginPlanStep(context, stepId, "skill.commerceResearch", getPlanStep(context.session.memory, stepId)?.goal ?? "Commerce research");
  const result = await executeFirstPartyTool(
    context.registry,
    "skill.commerceResearch",
    {
      goal: context.session.memory.goal,
      budget:
        taskSpec.budgetMin !== undefined || taskSpec.budgetMax !== undefined
          ? {
              min: taskSpec.budgetMin,
              max: taskSpec.budgetMax,
            }
          : undefined,
    },
    {
      driver: context.driver,
      signal: context.session.abortController.signal,
      commerceResearchDelegate: (input, handlerContext) => runCommerceDelegate(context, input, handlerContext),
    },
  );

  if (context.session.memory.extractedItems.length === 0) {
    context.session.memory.extractedItems = result.shortlist.map((item) => ({
      title: item.title,
      url: item.url,
      priceText: item.priceText ?? "",
      shopText: item.shopText,
      summary: item.summary,
      tags: [],
    }));
  }

  context.session.memory.unresolvedIssues = [
    ...context.session.memory.unresolvedIssues,
    ...result.gaps,
    ...result.problems.map((problem) => problem.message),
  ];

  const status: PlanStepStatus =
    result.status === "blocked" ? "blocked" : result.status === "failed" ? "failed" : "succeeded";
  await finishPlanStep(context, stepId, status, `skill.commerceResearch ${result.status}.`);
  return result;
}

async function executeRoundDecisionStep(context: BrowserCoreTaskExecutorContext, stepId: string) {
  const taskSpec = context.session.memory.taskSpec;
  if (!taskSpec || taskSpec.taskType === "direct_answer") {
    throw new Error("Round decision requires a non-direct task spec.");
  }

  await context.ensureBudget();
  await beginPlanStep(
    context,
    stepId,
    "decideRoundAction",
    getPlanStep(context.session.memory, stepId)?.goal ?? "Decide whether to finalize or replan",
  );

  const decision = await decideRoundAction(
    {
      goal: context.session.memory.goal,
      taskType: taskSpec.taskType,
      taskSpec,
      roundIndex: context.session.memory.runtimeMeta.currentRound,
      maxRounds: context.session.memory.runtimeMeta.maxRounds,
      currentFacts: context.session.memory.currentFacts,
      unresolvedIssues: context.session.memory.unresolvedIssues,
      candidates: context.session.memory.researchCandidates,
      sources: context.session.memory.researchSources,
      items: context.session.memory.extractedItems,
      filterDiagnostics: context.session.memory.filterDiagnostics,
    },
    { signal: context.session.abortController.signal },
  );

  context.session.memory.currentFacts = {
    ...context.session.memory.currentFacts,
    lastRoundDecision: {
      round: context.session.memory.runtimeMeta.currentRound,
      decision: decision.decision,
      reason: decision.reason,
      source: decision.source,
      taskSpecPatch: decision.taskSpecPatch ?? {},
    },
  };

  context.deps.recordStep({
    stepSummary: `Round ${context.session.memory.runtimeMeta.currentRound} decision: ${decision.decision}.`,
    nextIntent:
      decision.decision === "replan"
        ? "Apply the patch and start the next round."
        : decision.decision === "finalize"
          ? "Generate the final result."
          : "Stop the session with a terminal status.",
    expectedOutcome:
      decision.decision === "replan"
        ? "The next round plan is prepared."
        : decision.decision === "finalize"
          ? "The session can safely finalize."
          : "The session should stop without another round.",
    snapshotSummary: decision.reason,
  });

  await finishPlanStep(context, stepId, "succeeded", `decideRoundAction -> ${decision.decision}.`);
  return decision;
}

async function runCommerceDelegate(
  context: BrowserCoreTaskExecutorContext,
  _input: CommerceResearchToolInput,
  _handlerContext: FirstPartyToolHandlerContext,
): Promise<CommerceResearchToolOutput> {
  const openResult = await runLegacyTool(context, openSearchResultsTool);
  if (openResult.stepStatus !== "succeeded") {
    return {
      status: mapLegacyToolStatus(openResult),
      shortlist: [],
      evidence: [],
      gaps: [openResult.summary],
      coverage: {
        scope: "Legacy commerce helper path inside Browser Core V2 runtime.",
        limitations: ["Search preparation failed before candidate extraction."],
      },
      problems: [
        {
          code: openResult.errorCode ?? "COMMERCE_SEARCH_PREP_FAILED",
          message: openResult.summary,
        },
      ],
    };
  }

  const collectResult = await runLegacyTool(context, collectCommerceCandidatesTool);
  const shortlist = toCommerceShortlist(context.session.memory);
  const evidence = toCommerceEvidence(context.session.memory);
  const gaps = shortlist.length > 0 ? [] : [collectResult.summary];

  return {
    status: shortlist.length > 0 ? (collectResult.status === "partial" ? "partial" : "success") : mapLegacyToolStatus(collectResult),
    shortlist,
    evidence,
    gaps,
    coverage: {
      scope: "Legacy commerce helper path inside Browser Core V2 runtime.",
      limitations: shortlist.length > 0 ? [] : ["No shortlisted items were preserved by the legacy commerce helper path."],
    },
    problems:
      shortlist.length > 0
        ? []
        : [
            {
              code: collectResult.errorCode ?? "NO_COMMERCE_SHORTLIST",
              message: collectResult.summary,
            },
          ],
  };
}

function applyRoundDecisionPatch(context: BrowserCoreTaskExecutorContext, decision: RoundDecisionResult) {
  const taskSpec = context.session.memory.taskSpec;
  if (!taskSpec || decision.decision !== "replan") {
    return;
  }

  if (taskSpec.taskType === "public_research") {
    context.session.memory.taskSpec = applyPublicResearchPatch(taskSpec, decision);
  } else if (taskSpec.taskType === "site_overview") {
    context.session.memory.taskSpec = applySiteOverviewPatch(taskSpec, decision);
  } else if (taskSpec.taskType === "commerce_search") {
    context.session.memory.taskSpec = applyCommercePatch(taskSpec, decision);
  }
}

function clearRoundStateForReplan(context: BrowserCoreTaskExecutorContext) {
  context.session.memory.researchCandidates = [];
  context.session.memory.filterDiagnostics = undefined;
  context.session.memory.runtimeMeta.currentRound += 1;
  rebuildPlanForTaskSpec(context, "decide-round-action");
}

function finishTerminalState(context: BrowserCoreTaskExecutorContext, summary: string, status: FinalStatus) {
  ensureTerminalResult(context.session.memory, summary, status === "success" ? "partial" : status);
  context.session.memory.runtimeMeta.status = "done";
  context.session.memory.runtimeMeta.currentTool = undefined;
  context.session.memory.liveStepSummary = status === "blocked" ? "Session stopped after a blocked step." : "Session completed with a terminal result.";
}

export async function executeDirectAnswerTask(context: BrowserCoreTaskExecutorContext) {
  await finalizeAndPublish(context, "finalize-direct-answer", finalizeDirectAnswerTool);
}

export async function executePublicResearchTask(context: BrowserCoreTaskExecutorContext) {
  context.session.memory.runtimeMeta.currentRound = Math.max(1, context.session.memory.runtimeMeta.currentRound || 1);
  context.session.memory.runtimeMeta.maxRounds = MAX_RUNTIME_ROUNDS;

  for (;;) {
    const taskSpec = context.session.memory.taskSpec;
    if (!taskSpec || taskSpec.taskType !== "public_research") {
      throw new Error("Public research executor requires a public research task spec.");
    }

    const searchResult = await executeSearchStep(context, "browser-search", taskSpec.searchQuery, "web");
    if (searchResult.status === "blocked") {
      finishTerminalState(context, searchResult.problems[0]?.message ?? "browser.search was blocked.", "blocked");
      await context.deps.publishState(context.session);
      return;
    }
    if (searchResult.results.length === 0) {
      finishTerminalState(context, searchResult.problems[0]?.message ?? "No usable search results were found.", "failed");
      await context.deps.publishState(context.session);
      return;
    }

    await executeWebDetailBatch(context, "browser-web-detail");
    const decision = await executeRoundDecisionStep(context, "decide-round-action");
    if (decision.decision === "finalize") {
      await finalizeAndPublish(context, "finalize-research-result", finalizeResearchResultTool);
      return;
    }
    if (decision.decision === "abort") {
      finishTerminalState(context, decision.reason, context.session.memory.researchSources.length > 0 ? "partial" : "failed");
      await context.deps.publishState(context.session);
      return;
    }

    applyRoundDecisionPatch(context, decision);
    clearRoundStateForReplan(context);
    context.session.memory.liveStepSummary = decision.nextRoundSummary ?? `Round ${context.session.memory.runtimeMeta.currentRound} is starting.`;
    await context.deps.publishState(context.session);
  }
}

export async function executeSiteOverviewTask(context: BrowserCoreTaskExecutorContext) {
  context.session.memory.runtimeMeta.currentRound = Math.max(1, context.session.memory.runtimeMeta.currentRound || 1);
  context.session.memory.runtimeMeta.maxRounds = MAX_RUNTIME_ROUNDS;

  for (;;) {
    const taskSpec = context.session.memory.taskSpec;
    if (!taskSpec || taskSpec.taskType !== "site_overview") {
      throw new Error("Site overview executor requires a site overview task spec.");
    }

    if (taskSpec.entryMode === "resolve_official_home" && !taskSpec.entryUrl) {
      const searchResult = await executeSearchStep(
        context,
        "browser-search",
        taskSpec.officialSearchQuery ?? taskSpec.originalGoal,
        "official_site",
      );
      if (searchResult.status === "blocked") {
        finishTerminalState(context, searchResult.problems[0]?.message ?? "Official-site search was blocked.", "blocked");
        await context.deps.publishState(context.session);
        return;
      }

      const officialCandidate = resolveOfficialEntry(context.session.memory.researchCandidates, taskSpec);
      if (!officialCandidate) {
        finishTerminalState(context, "No likely official site entry was found.", "failed");
        await context.deps.publishState(context.session);
        return;
      }

      context.session.memory.taskSpec = {
        ...taskSpec,
        entryUrl: officialCandidate.url,
        targetDomain: officialCandidate.source,
      };
    }

    const overviewResult = await executeSiteOverviewStep(context, "browser-site-overview");
    if (overviewResult.status === "blocked") {
      finishTerminalState(context, overviewResult.problems[0]?.message ?? "browser.siteOverview was blocked.", "blocked");
      await context.deps.publishState(context.session);
      return;
    }
    if (overviewResult.status === "failed") {
      finishTerminalState(context, overviewResult.problems[0]?.message ?? "browser.siteOverview failed.", "failed");
      await context.deps.publishState(context.session);
      return;
    }

    const decision = await executeRoundDecisionStep(context, "decide-round-action");
    if (decision.decision === "finalize") {
      await finalizeAndPublish(context, "finalize-research-result", finalizeResearchResultTool);
      return;
    }
    if (decision.decision === "abort") {
      finishTerminalState(context, decision.reason, context.session.memory.researchSources.length > 0 ? "partial" : "failed");
      await context.deps.publishState(context.session);
      return;
    }

    applyRoundDecisionPatch(context, decision);
    clearRoundStateForReplan(context);
    context.session.memory.liveStepSummary = decision.nextRoundSummary ?? `Round ${context.session.memory.runtimeMeta.currentRound} is starting.`;
    await context.deps.publishState(context.session);
  }
}

export async function executeCommerceTask(context: BrowserCoreTaskExecutorContext) {
  context.session.memory.runtimeMeta.currentRound = Math.max(1, context.session.memory.runtimeMeta.currentRound || 1);
  context.session.memory.runtimeMeta.maxRounds = MAX_RUNTIME_ROUNDS;

  for (;;) {
    const skillResult = await executeCommerceSkillStep(context, "commerce-research");
    if (skillResult.status === "blocked") {
      finishTerminalState(context, skillResult.problems[0]?.message ?? "Commerce research was blocked.", "blocked");
      await context.deps.publishState(context.session);
      return;
    }

    const decision = await executeRoundDecisionStep(context, "decide-round-action");
    if (decision.decision === "finalize") {
      await finalizeAndPublish(context, "finalize-commerce-result", finalizeCommerceResultTool);
      return;
    }
    if (decision.decision === "abort") {
      finishTerminalState(context, decision.reason, context.session.memory.extractedItems.length > 0 ? "partial" : "failed");
      await context.deps.publishState(context.session);
      return;
    }

    applyRoundDecisionPatch(context, decision);
    clearRoundStateForReplan(context);
    context.session.memory.liveStepSummary = decision.nextRoundSummary ?? `Round ${context.session.memory.runtimeMeta.currentRound} is starting.`;
    await context.deps.publishState(context.session);
  }
}
