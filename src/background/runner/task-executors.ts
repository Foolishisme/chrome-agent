import type { BrowserDriver } from "../../shared/browser-capability-contract";
import { decideRoundAction, type RoundDecisionResult } from "../llm/llm-client";
import { appendLog } from "../runtime/runtime-session-state";
import { ensureTerminalResult } from "../runtime/public-state";
import { runCommerceResearchDelegate } from "../tools/commerce/run-commerce-research-delegate";
import type { StepOptions, ToolExecutionContext } from "../tools/tool-execution-context";
import type { FirstPartyToolRegistry } from "../tools/first-party-tool-registry";
import { executeFirstPartyTool } from "../tools/first-party-tool-registry";
import type {
  ActionResult,
  AgentAction,
  FinalStatus,
  PlanStepStatus,
  ResearchCandidate,
  ResearchSourceResult,
  SessionMemory,
  SnapshotData,
  ToolName,
} from "../../shared/agent-domain-model";
import type { ActiveSession } from "../runtime/runtime-session-state";
import {
  finalizeTaskResult,
} from "../tools/adapters/finalize-task-result";
import {
  preparePublicResearchCandidates,
} from "../tools/adapters/prepare-task-candidates";
import { buildRuntimeTaskPlan } from "./task-plan-builder";
import {
  collectIssuesFromProblems,
  dedupeStrings,
  mergeResearchSources,
  toResearchSourceResult,
  toSiteOverviewSources,
  toSourceCandidate,
} from "../tools/data-mappers";
import {
  applyCommercePatch,
  applyPublicResearchPatch,
  applySiteOverviewPatch,
} from "./task-spec-patch";

export interface RuntimeToolLoopDeps {
  publishState(session: ActiveSession, asError?: boolean): Promise<void>;
  scanPage(): Promise<SnapshotData>;
  ensureUsableSnapshot(): Promise<SnapshotData>;
  executeAction(action: AgentAction, stepSummary: string): Promise<ActionResult>;
  settleAfterAction(action: AgentAction): Promise<void>;
  recordStep(options: StepOptions): void;
  pushState(stepSummary?: string): Promise<void>;
}

export interface RuntimeToolExecutorContext {
  session: ActiveSession;
  deps: RuntimeToolLoopDeps;
  driver: BrowserDriver;
  registry: FirstPartyToolRegistry;
  ensureBudget(): Promise<void>;
}

const MAX_RUNTIME_ROUNDS = 2;
const RUNTIME_PAGE_READ_CONCURRENCY = 2;

function getPlanStep(memory: SessionMemory, stepId: string) {
  return memory.plan.find((step) => step.stepId === stepId);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await mapper(items[index]!, index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function beginPlanStep(
  context: RuntimeToolExecutorContext,
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
  appendLog(context.session, "runtime", "info", "Running runtime tool loop step.", {
    stepId,
    toolName,
    goal: step?.goal,
  });
  await context.deps.publishState(context.session);
}

async function finishPlanStep(
  context: RuntimeToolExecutorContext,
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

function rebuildPlanForTaskSpec(context: RuntimeToolExecutorContext, stepId: string) {
  const taskSpec = context.session.memory.taskSpec;
  if (!taskSpec) {
    return;
  }

  context.session.memory.plan = buildRuntimeTaskPlan(taskSpec);
  context.session.memory.runtimeMeta.currentStepId = context.session.memory.plan[0]?.stepId;
  context.session.memory.runtimeMeta.currentTool = undefined;
  context.session.memory.liveStepSummary = `Round ${context.session.memory.runtimeMeta.currentRound} is ready.`;
  appendLog(context.session, "runtime", "info", "Prepared the next runtime tool loop round.", {
    stepId,
    round: context.session.memory.runtimeMeta.currentRound,
    taskType: taskSpec.taskType,
    taskSpec,
  });
}

async function executeSearchStep(
  context: RuntimeToolExecutorContext,
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

async function executeWebDetailBatch(context: RuntimeToolExecutorContext, stepId: string) {
  const taskSpec = context.session.memory.taskSpec;
  if (!taskSpec || taskSpec.taskType !== "public_research") {
    throw new Error("Public research detail execution requires a public research task spec.");
  }

  const candidates = context.session.memory.researchCandidates.slice(0, taskSpec.sourceTargetCount);

  await context.ensureBudget();
  await beginPlanStep(context, stepId, "browser.webDetail", getPlanStep(context.session.memory, stepId)?.goal ?? "Read pages");

  const readResults = await mapWithConcurrency(candidates, RUNTIME_PAGE_READ_CONCURRENCY, async (candidate) => {
    await context.ensureBudget();
    const startedAt = Date.now();
    try {
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
        },
      );
      appendLog(context.session, "runtime", detail.status === "success" ? "info" : "warn", "Read public research candidate page.", {
        url: candidate.url,
        title: candidate.title,
        status: detail.status,
        elapsedMs: Date.now() - startedAt,
        problems: detail.problems,
      });
      return {
        candidate,
        detail,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown page read error.";
      appendLog(context.session, "runtime", "warn", "Public research candidate read failed.", {
        url: candidate.url,
        title: candidate.title,
        elapsedMs: Date.now() - startedAt,
        message,
      });
      return {
        candidate,
        error: message,
      };
    }
  });

  const sources: ResearchSourceResult[] = [];
  const pageIssues: string[] = [];
  let partialCount = 0;
  let failedCount = 0;

  for (const readResult of readResults) {
    if ("error" in readResult) {
      failedCount += 1;
      pageIssues.push(`${readResult.candidate.title}: ${readResult.error}`);
      continue;
    }

    if (readResult.detail.status !== "blocked" && readResult.detail.status !== "failed") {
      if (readResult.detail.status === "partial") {
        partialCount += 1;
      }
      sources.push(toResearchSourceResult(readResult.candidate, readResult.detail));
    } else {
      failedCount += 1;
      pageIssues.push(...collectIssuesFromProblems(readResult.detail.coverage, readResult.detail.problems));
    }
  }

  context.session.memory.researchSources = mergeResearchSources(context.session.memory.researchSources, sources);
  context.session.memory.unresolvedIssues = dedupeStrings([...context.session.memory.unresolvedIssues, ...pageIssues]);
  const successCount = sources.length - partialCount;
  const status: PlanStepStatus = sources.length > 0 ? "succeeded" : "failed";
  context.deps.recordStep({
    stepSummary: `browser.webDetail batch completed for ${candidates.length} candidate page(s).`,
    nextIntent: "Decide whether the collected evidence is enough to summarize.",
    expectedOutcome: "Trimmed single-page summaries are available.",
    snapshotSummary: JSON.stringify({
      requestedCount: candidates.length,
      successCount,
      partialCount,
      failedCount,
    }),
  });
  await finishPlanStep(
    context,
    stepId,
    status,
    sources.length > 0 ? `Read ${sources.length} candidate page(s).` : "No readable candidate pages were collected.",
  );
}

async function executePrepareTaskCandidatesStep(context: RuntimeToolExecutorContext, stepId: string) {
  const taskSpec = context.session.memory.taskSpec;
  if (!taskSpec || taskSpec.taskType !== "public_research") {
    throw new Error("Prepare-task-candidates currently requires a public research task spec.");
  }

  await context.ensureBudget();
  await beginPlanStep(
    context,
    stepId,
    "prepareTaskCandidates",
    getPlanStep(context.session.memory, stepId)?.goal ?? "Prepare candidates",
  );

  const prepared = await preparePublicResearchCandidates({
    goal: context.session.memory.goal,
    searchQuery: taskSpec.searchQuery,
    candidates: context.session.memory.researchCandidates,
    taskSpec,
    signal: context.session.abortController.signal,
  });

  context.session.memory.researchCandidates = prepared.candidates;
  context.session.memory.filterDiagnostics = prepared.diagnostics;
  if (prepared.candidates.length === 0) {
    context.session.memory.unresolvedIssues = dedupeStrings([
      ...context.session.memory.unresolvedIssues,
      "No usable research sources remained after filtering the first Google results page.",
    ]);
  }

  appendLog(
    context.session,
    prepared.source === "llm-lite" ? "llm" : "runtime",
    prepared.source === "llm-lite" ? "info" : "warn",
    prepared.source === "llm-lite"
      ? "Prepared first-page research candidates with the adapter."
      : "Kept the rule-filtered research candidate order.",
    {
      reason: prepared.reason,
      candidateCount: prepared.candidates.length,
    },
  );

  context.deps.recordStep({
    stepSummary: "Research candidates filtered and reordered.",
    nextIntent: prepared.candidates.length > 0 ? "Read the selected source pages." : "Stop after the current round.",
    expectedOutcome: "A ranked source list is available.",
    snapshotSummary: JSON.stringify(prepared.diagnostics),
  });

  await finishPlanStep(
    context,
    stepId,
    prepared.candidates.length > 0 ? "succeeded" : "failed",
    prepared.candidates.length > 0
      ? `Prepared ${prepared.candidates.length} research candidates.`
      : "No usable research candidates remained after filtering.",
  );
}

async function executeSiteOverviewStep(context: RuntimeToolExecutorContext, stepId: string) {
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

async function executeCommerceSkillStep(context: RuntimeToolExecutorContext, stepId: string) {
  const taskSpec = context.session.memory.taskSpec;
  if (!taskSpec || taskSpec.taskType !== "commerce_search") {
    throw new Error("Commerce skill execution requires a commerce task spec.");
  }

  await context.ensureBudget();
  await beginPlanStep(context, stepId, "skill.commerceResearch", getPlanStep(context.session.memory, stepId)?.goal ?? "Commerce research");
  const toolContext: ToolExecutionContext = {
    memory: context.session.memory,
    signal: context.session.abortController.signal,
    scanPage: () => context.deps.scanPage(),
    ensureUsableSnapshot: () => context.deps.ensureUsableSnapshot(),
    executeAction: (action, stepSummary) => context.deps.executeAction(action, stepSummary),
    settleAfterAction: (action) => context.deps.settleAfterAction(action),
    appendLog: (source, level, message, detail) => appendLog(context.session, source, level, message, detail),
    recordStep: (options) => context.deps.recordStep(options),
    pushState: (stepSummary) => context.deps.pushState(stepSummary),
  };
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
      commerceResearchDelegate: () => runCommerceResearchDelegate(toolContext, taskSpec),
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

async function executeRoundDecisionStep(context: RuntimeToolExecutorContext, stepId: string) {
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

async function executeFinalizeTaskResultStep(context: RuntimeToolExecutorContext, stepId: string) {
  await context.ensureBudget();
  await beginPlanStep(
    context,
    stepId,
    "finalizeTaskResult",
    getPlanStep(context.session.memory, stepId)?.goal ?? "Generate the final result",
  );
  const result = await finalizeTaskResult({
    memory: context.session.memory,
    signal: context.session.abortController.signal,
    appendLog: (source, level, message, detail) => appendLog(context.session, source, level, message, detail),
    recordStep: (options) => context.deps.recordStep(options),
    pushState: (stepSummary) => context.deps.pushState(stepSummary),
    publishFinalDraft: async (markdown) => {
      context.session.memory.streamingFinalDraft = {
        markdown,
        updatedAt: Date.now(),
      };
      await context.deps.publishState(context.session);
    },
  });
  await finishPlanStep(context, stepId, "succeeded", result.summary);
  context.session.memory.runtimeMeta.status = "done";
  context.session.memory.runtimeMeta.currentTool = undefined;
  context.session.memory.liveStepSummary = "Final result is ready.";
  await context.deps.publishState(context.session);
}

function applyRoundDecisionPatch(context: RuntimeToolExecutorContext, decision: RoundDecisionResult) {
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

function clearRoundStateForReplan(context: RuntimeToolExecutorContext) {
  context.session.memory.researchCandidates = [];
  context.session.memory.filterDiagnostics = undefined;
  context.session.memory.runtimeMeta.currentRound += 1;
  rebuildPlanForTaskSpec(context, "decide-round-action");
}

function finishTerminalState(context: RuntimeToolExecutorContext, summary: string, status: FinalStatus) {
  ensureTerminalResult(context.session.memory, summary, status === "success" ? "partial" : status);
  context.session.memory.runtimeMeta.status = "done";
  context.session.memory.runtimeMeta.currentTool = undefined;
  context.session.memory.liveStepSummary = status === "blocked" ? "Session stopped after a blocked step." : "Session completed with a terminal result.";
  context.session.memory.streamingFinalDraft = undefined;
}

function hasFinalizableEvidence(memory: SessionMemory) {
  return memory.extractedItems.length > 0 || memory.researchSources.some((source) => source.status !== "failed");
}

async function finishInsteadOfReplanAtMaxRounds(
  context: RuntimeToolExecutorContext,
  decision: RoundDecisionResult,
  finalizeStepId: string,
) {
  if (context.session.memory.runtimeMeta.currentRound < context.session.memory.runtimeMeta.maxRounds) {
    return false;
  }

  const summary = `Max runtime rounds reached; ignored an extra replan request. ${decision.reason}`;
  appendLog(context.session, "runtime", "warn", "Max runtime rounds reached; finishing instead of replanning.", {
    round: context.session.memory.runtimeMeta.currentRound,
    maxRounds: context.session.memory.runtimeMeta.maxRounds,
    decision,
  });
  context.session.memory.unresolvedIssues = dedupeStrings([...context.session.memory.unresolvedIssues, summary]);

  if (hasFinalizableEvidence(context.session.memory)) {
    await executeFinalizeTaskResultStep(context, finalizeStepId);
    return true;
  }

  finishTerminalState(context, summary, "failed");
  await context.deps.publishState(context.session);
  return true;
}

export async function executeDirectAnswerTask(context: RuntimeToolExecutorContext) {
  await executeFinalizeTaskResultStep(context, "finalize-direct-answer");
}

export async function executePublicResearchTask(context: RuntimeToolExecutorContext) {
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

    await executePrepareTaskCandidatesStep(context, "prepare-task-candidates");
    if (context.session.memory.researchCandidates.length === 0) {
      finishTerminalState(context, "No usable research candidates remained after filtering.", "failed");
      await context.deps.publishState(context.session);
      return;
    }

    await executeWebDetailBatch(context, "browser-web-detail");
    const decision = await executeRoundDecisionStep(context, "decide-round-action");
    if (decision.decision === "finalize") {
      await executeFinalizeTaskResultStep(context, "finalize-research-result");
      return;
    }
    if (decision.decision === "abort") {
      finishTerminalState(context, decision.reason, context.session.memory.researchSources.length > 0 ? "partial" : "failed");
      await context.deps.publishState(context.session);
      return;
    }

    if (await finishInsteadOfReplanAtMaxRounds(context, decision, "finalize-research-result")) {
      return;
    }
    applyRoundDecisionPatch(context, decision);
    clearRoundStateForReplan(context);
    context.session.memory.liveStepSummary = decision.nextRoundSummary ?? `Round ${context.session.memory.runtimeMeta.currentRound} is starting.`;
    await context.deps.publishState(context.session);
  }
}

export async function executeSiteOverviewTask(context: RuntimeToolExecutorContext) {
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
      await executeFinalizeTaskResultStep(context, "finalize-research-result");
      return;
    }
    if (decision.decision === "abort") {
      finishTerminalState(context, decision.reason, context.session.memory.researchSources.length > 0 ? "partial" : "failed");
      await context.deps.publishState(context.session);
      return;
    }

    if (await finishInsteadOfReplanAtMaxRounds(context, decision, "finalize-research-result")) {
      return;
    }
    applyRoundDecisionPatch(context, decision);
    clearRoundStateForReplan(context);
    context.session.memory.liveStepSummary = decision.nextRoundSummary ?? `Round ${context.session.memory.runtimeMeta.currentRound} is starting.`;
    await context.deps.publishState(context.session);
  }
}

export async function executeCommerceTask(context: RuntimeToolExecutorContext) {
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
      await executeFinalizeTaskResultStep(context, "finalize-commerce-result");
      return;
    }
    if (decision.decision === "abort") {
      finishTerminalState(context, decision.reason, context.session.memory.extractedItems.length > 0 ? "partial" : "failed");
      await context.deps.publishState(context.session);
      return;
    }

    if (await finishInsteadOfReplanAtMaxRounds(context, decision, "finalize-commerce-result")) {
      return;
    }
    applyRoundDecisionPatch(context, decision);
    clearRoundStateForReplan(context);
    context.session.memory.liveStepSummary = decision.nextRoundSummary ?? `Round ${context.session.memory.runtimeMeta.currentRound} is starting.`;
    await context.deps.publishState(context.session);
  }
}
