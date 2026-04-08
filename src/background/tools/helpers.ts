import { LIMITS } from "../../shared/constants";
import { RuntimeError } from "../../shared/errors";
import type {
  ActionResult,
  AgentAction,
  CommerceTaskSpec,
  ConversationTurn,
  DirectAnswerTaskSpec,
  ExtractedItem,
  FinalResult,
  OutputMode,
  PublicResearchTaskSpec,
  ResultArtifact,
  ResearchSourceResult,
  SessionMemory,
  SnapshotData,
  TaskSpec,
} from "../../shared/types";
import type { ToolExecutionContext } from "./shared";

function normalizeText(text: string | undefined) {
  return (text ?? "").replace(/\s+/g, "").toLowerCase();
}

function getSearchPageSignals(snapshot: SnapshotData) {
  const signals = [snapshot.pageFacts.searchBox.text, snapshot.title];

  try {
    const parsed = new URL(snapshot.url);
    signals.push(parsed.searchParams.get("keyword") ?? undefined);
    signals.push(parsed.searchParams.get("q") ?? undefined);
  } catch {
    // Ignore malformed URLs.
  }

  return signals.filter((signal): signal is string => !!signal && signal.trim().length > 0);
}

export function hasMatchingQuery(snapshot: SnapshotData, searchQuery: string) {
  const normalizedQuery = normalizeText(searchQuery);
  if (!normalizedQuery) {
    return false;
  }

  const queryTokens = searchQuery
    .split(/\s+/)
    .map((token) => normalizeText(token))
    .filter((token) => token.length >= 2);

  return getSearchPageSignals(snapshot).some((signal) => {
    const normalizedSignal = normalizeText(signal);
    return (
      normalizedSignal.includes(normalizedQuery) ||
      (queryTokens.length > 0 && queryTokens.every((token) => normalizedSignal.includes(token)))
    );
  });
}

export function buildSearchUrl(taskSpec: TaskSpec) {
  if (taskSpec.taskType === "commerce_search") {
    const url = new URL("https://search.jd.com/Search");
    url.searchParams.set("keyword", taskSpec.searchQuery);
    url.searchParams.set("enc", "utf-8");
    return url.toString();
  }

  if (taskSpec.taskType !== "public_research") {
    throw new RuntimeError("Direct answers do not have a search URL.", "DIRECT_ANSWER_NO_SEARCH_URL");
  }

  const url = new URL("https://www.google.com/search");
  url.searchParams.set("q", taskSpec.searchQuery);
  url.searchParams.set("hl", "zh-CN");
  return url.toString();
}

export function detectSearchBlocker(taskType: TaskSpec["taskType"], snapshot: SnapshotData) {
  try {
    const parsed = new URL(snapshot.url);

    if (
      taskType === "commerce_search" &&
      (parsed.hostname === "passport.jd.com" || parsed.hostname === "plogin.m.jd.com" || parsed.pathname.includes("/new/login"))
    ) {
      return "JD redirected the search to a login page.";
    }

    if (taskType === "public_research" && parsed.hostname.endsWith("google.com") && parsed.pathname.startsWith("/sorry")) {
      return "Google returned a verification page and blocked the search results.";
    }
  } catch {
    // Ignore malformed URLs.
  }

  return undefined;
}

function walkSemanticNodes(node: SnapshotData["semanticSnapshot"]["root"]): Array<SnapshotData["semanticSnapshot"]["root"]> {
  const nodes = [node];
  for (const child of node.children ?? []) {
    nodes.push(...walkSemanticNodes(child));
  }
  return nodes;
}

function hasSemanticRole(snapshot: SnapshotData, role: SnapshotData["semanticSnapshot"]["root"]["role"]) {
  return walkSemanticNodes(snapshot.semanticSnapshot.root).some((node) => node.role === role);
}

function hasRecoverableDialog(snapshot: SnapshotData) {
  return hasSemanticRole(snapshot, "dialog") || hasSemanticRole(snapshot, "alert");
}

function hasSearchPageStructureIssue(snapshot: SnapshotData) {
  if (snapshot.pageReady.ready) {
    return false;
  }

  const hasMain = hasSemanticRole(snapshot, "main");
  const hasSearch = hasSemanticRole(snapshot, "search");
  const hasList = hasSemanticRole(snapshot, "list");
  const hasHighValueNode =
    hasList || hasSemanticRole(snapshot, "heading") || hasSemanticRole(snapshot, "link") || hasSemanticRole(snapshot, "button") || hasSemanticRole(snapshot, "input");

  return !hasMain && !hasSearch && !hasHighValueNode;
}

async function attemptDialogCloseRecovery(
  context: ToolExecutionContext,
  snapshot: SnapshotData,
  reason: string,
): Promise<SnapshotData | undefined> {
  if (!hasRecoverableDialog(snapshot) || context.memory.runtimeMeta.dialogCloseRecoveryCount >= 1) {
    return undefined;
  }

  context.memory.runtimeMeta.dialogCloseRecoveryCount += 1;
  context.memory.runtimeMeta.recoveryCount += 1;
  context.memory.runtimeMeta.lastRecoveryAction = "RECOVER_CLOSE_DIALOG";
  context.memory.recoveryHint = `Recovery ${context.memory.runtimeMeta.dialogCloseRecoveryCount}/1: close dialog once.`;
  context.appendLog("runtime", "warn", "Triggering tool-local dialog-close recovery.", {
    reason,
    dialogCloseRecoveryCount: context.memory.runtimeMeta.dialogCloseRecoveryCount,
  });

  const action: AgentAction = { type: "RECOVER_CLOSE_DIALOG" };
  const result = await context.executeAction(action, "Close the blocking dialog once.");
  await context.settleAfterAction(action);
  const snapshotAfter = await context.scanPage();

  context.recordStep({
    stepSummary: "Dialog close recovery attempted.",
    nextIntent: "Rescan the current page state.",
    expectedOutcome: "The blocking dialog disappears or the page becomes usable.",
    action,
    actionResult: result,
    snapshot: snapshotAfter,
  });

  context.appendLog("runtime", result.success ? "info" : "warn", "Dialog close recovery finished.", {
    success: result.success,
    recoveryTarget: result.recoveryTarget,
    pageReady: snapshotAfter.pageReady,
  });

  if (!result.success) {
    return undefined;
  }

  if (!hasRecoverableDialog(snapshotAfter) || snapshotAfter.pageReady.ready) {
    context.memory.recoveryHint = undefined;
    return snapshotAfter;
  }

  return undefined;
}

export async function ensureUsableSnapshotWithDialogRecovery(
  context: ToolExecutionContext,
  reason: string,
): Promise<SnapshotData> {
  const snapshot = await context.scanPage();
  if (snapshot.pageReady.ready) {
    return snapshot;
  }

  const recoveredBeforeWait = await attemptDialogCloseRecovery(context, snapshot, reason);
  if (recoveredBeforeWait?.pageReady.ready) {
    return recoveredBeforeWait;
  }

  try {
    return await context.ensureUsableSnapshot();
  } catch (error) {
    if (error instanceof RuntimeError && error.code === "PAGE_NOT_READY") {
      const latestSnapshot = context.memory.pageSnapshot;
      if (latestSnapshot) {
        const recoveredAfterWait = await attemptDialogCloseRecovery(context, latestSnapshot, reason);
        if (recoveredAfterWait) {
          if (recoveredAfterWait.pageReady.ready) {
            return recoveredAfterWait;
          }
          return await context.ensureUsableSnapshot();
        }
      }
    }

    throw error;
  }
}

export async function reopenSearchResults(
  context: ToolExecutionContext,
  taskSpec: TaskSpec,
  reason: string,
): Promise<SnapshotData | undefined> {
  if (context.memory.runtimeMeta.searchReopenRecoveryCount >= 1) {
    return undefined;
  }

  context.memory.runtimeMeta.searchReopenRecoveryCount += 1;
  context.memory.runtimeMeta.recoveryCount += 1;
  context.memory.runtimeMeta.lastRecoveryAction = "NAVIGATE";
  context.memory.recoveryHint = `Recovery ${context.memory.runtimeMeta.searchReopenRecoveryCount}/1: reopen canonical search page.`;
  context.appendLog("runtime", "warn", "Triggering canonical search reopen recovery.", {
    reason,
    searchReopenRecoveryCount: context.memory.runtimeMeta.searchReopenRecoveryCount,
    url: buildSearchUrl(taskSpec),
  });

  const action: AgentAction = {
    type: "NAVIGATE",
    url: buildSearchUrl(taskSpec),
  };
  const result = await context.executeAction(action, "Reopen the canonical search results page once.");
  await context.settleAfterAction(action);
  const snapshotAfter = await ensureUsableSnapshotWithDialogRecovery(context, "Recover from an unusable search page.");

  context.recordStep({
    stepSummary: "Canonical search reopen attempted.",
    nextIntent: "Validate the search results page again.",
    expectedOutcome: "The canonical search results page becomes usable.",
    action,
    actionResult: result,
    snapshot: snapshotAfter,
  });

  return snapshotAfter;
}

export async function scrollForMoreCandidates(
  context: ToolExecutionContext,
  snapshot: SnapshotData,
  reason: string,
): Promise<{
  snapshot: SnapshotData;
  actionResult: ActionResult;
}> {
  const resultList = snapshot.pageFacts.resultList;
  if (!resultList?.present || resultList.emptyState) {
    throw new RuntimeError(reason, "NO_RECOVERABLE_RESULTS");
  }

  if (context.memory.runtimeMeta.recoveryCount >= LIMITS.MAX_RUNTIME_RECOVERY) {
    throw new RuntimeError(`${reason} Recovery limit reached.`, "RECOVERY_EXHAUSTED");
  }

  context.memory.runtimeMeta.recoveryCount += 1;
  context.memory.runtimeMeta.lastRecoveryAction = "SCROLL";
  context.memory.recoveryHint = `Recovery ${context.memory.runtimeMeta.recoveryCount}: scroll for more candidates.`;
  context.appendLog("runtime", "warn", "Triggering tool-local scroll recovery.", {
    reason,
    recoveryCount: context.memory.runtimeMeta.recoveryCount,
    resultList,
  });

  const action: AgentAction = { type: "SCROLL", direction: "down", amount: 920 };
  const actionResult = await context.executeAction(action, "Scroll to load more result cards.");
  await context.settleAfterAction(action);
  const snapshotAfter = await context.scanPage();

  context.recordStep({
    stepSummary: "Scroll recovery completed.",
    nextIntent: "Extract the refreshed result list again.",
    expectedOutcome: "More product cards become visible.",
    action,
    actionResult,
    snapshot: snapshotAfter,
  });

  return {
    snapshot: snapshotAfter,
    actionResult,
  };
}

export function buildRuleBasedSummary(goal: string, items: ExtractedItem[]) {
  const first = items[0];
  if (!first) {
    return `Completed the rule-based search for "${goal}", but not enough usable items were collected.`;
  }

  const highlights = items
    .slice(0, 3)
    .map((item, index) => `${index + 1}. ${item.title} (${item.priceText}${item.shopText ? `, ${item.shopText}` : ""})`)
    .join("; ");

  return `Completed the rule-based search for "${goal}" and kept ${items.length} candidates. Top picks: ${highlights}.`;
}

export function buildCommerceFinalMarkdown(goal: string, items: ExtractedItem[], summary: string) {
  const lines = [
    "## Goal",
    goal,
    "",
    "## Recommendations",
    ...(items.length > 0
      ? items.map((item, index) => {
          const parts = [`${index + 1}. [${item.title}](${item.url})`, `price: ${item.priceText}`];
          if (item.shopText) {
            parts.push(`shop: ${item.shopText}`);
          }
          if (item.summary) {
            parts.push(`note: ${item.summary}`);
          }
          return `- ${parts.join(" | ")}`;
        })
      : ["- No usable items"]),
    "",
    "## Summary",
    summary,
  ];

  return lines.join("\n");
}

export function buildDirectAnswerFallbackSummary(goal: string, conversationTurns: ConversationTurn[]) {
  if (conversationTurns.length === 0) {
    return `当前未能稳定生成“${goal}”的直接回答，建议改为搜索模式以获取更可靠信息。`;
  }

  return `基于当前会话已有信息，已直接整理“${goal}”的回答。`;
}

export function buildDirectAnswerFinalMarkdown(goal: string, conversationTurns: ConversationTurn[], summary: string) {
  const recentTurns = conversationTurns.slice(-3);
  const lines = [
    "## 直接回答",
    summary,
    "",
    "## 当前问题",
    goal,
  ];

  if (recentTurns.length > 0) {
    lines.push("", "## 当前会话依据");
    lines.push(
      ...recentTurns.map(
        (turn, index) =>
          `- ${index + 1}. ${new Date(turn.savedAt).toISOString()} | 用户：${turn.goal} | 回答摘要：${turn.answerSummary}`,
      ),
    );
  }

  return lines.join("\n");
}

export function dedupeIssues(issues: string[]) {
  return Array.from(new Set(issues.filter(Boolean)));
}

export function countSuccessfulResearchSources(sources: ResearchSourceResult[]) {
  return sources.filter((source) => source.status === "success").length;
}

export function buildResearchFallbackSummary(goal: string, sources: ResearchSourceResult[], unresolvedIssues: string[]) {
  if (countSuccessfulResearchSources(sources) === 0) {
    return `No reliable sources were collected for "${goal}".`;
  }

  const titles = sources.slice(0, 3).map((source) => source.pageTitle || source.candidate.title).join(", ");
  if (unresolvedIssues.length > 0) {
    return `Completed a partial research summary for "${goal}" based on ${sources.length} sources. Key references: ${titles}. ${unresolvedIssues.length} open issues remain.`;
  }

  return `Completed the research summary for "${goal}" based on ${sources.length} sources. Key references: ${titles}.`;
}

export function buildResearchFinalMarkdown(summary: string, sources: ResearchSourceResult[], unresolvedIssues: string[]) {
  const lines = [
    "## Summary",
    summary,
    "",
    "## Source Excerpts",
    ...(sources.length > 0
      ? sources.map((source, index) => {
          const title = source.pageTitle || source.candidate.title;
          const detail =
            source.status === "success"
              ? source.bodyExcerpt || "No excerpt was captured."
              : `${source.bodyExcerpt || "Only partial facts were extracted."}${source.unresolvedIssues.length > 0 ? ` (${source.unresolvedIssues.join("; ")})` : ""}`;
          return `- ${index + 1}. ${title}: ${detail}`;
        })
      : ["- No reliable sources"]),
    "",
    "## Source Links",
    ...(sources.length > 0
      ? sources.map((source, index) => `- ${index + 1}. [${source.pageTitle || source.candidate.title}](${source.sourceUrl})`)
      : ["- No reliable sources"]),
    "",
    "## Open Issues",
    ...(unresolvedIssues.length > 0 ? unresolvedIssues.map((issue) => `- ${issue}`) : ["- None"]),
  ];

  return lines.join("\n");
}

export function getFinalStatusForResearch(
  taskSpec: PublicResearchTaskSpec,
  sources: ResearchSourceResult[],
  unresolvedIssues: string[],
) {
  const successfulSourceCount = countSuccessfulResearchSources(sources);

  if (successfulSourceCount === 0) {
    return "failed" as const;
  }

  if (
    successfulSourceCount < taskSpec.sourceTargetCount ||
    unresolvedIssues.length > 0 ||
    sources.some((source) => source.status !== "success")
  ) {
    return "partial" as const;
  }

  return "success" as const;
}

function getBlockedReason(url: string, error?: string) {
  if (/\.pdf(?:$|[?#])/i.test(url)) {
    return "PDF extraction is not supported yet.";
  }

  if (error?.includes("Could not establish connection")) {
    return "The page could not be reached or the content script was not available.";
  }

  return error || "The page could not be read.";
}

export function classifySourceFailure(url: string, error?: unknown) {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : undefined;

  if (/\.pdf(?:$|[?#])/i.test(url)) {
    return {
      kind: "pdf",
      reason: "PDF extraction is not supported yet.",
    };
  }

  if (message?.includes("Could not establish connection")) {
    return {
      kind: "content_script_unavailable",
      reason: "The page could not be reached or the content script was not available.",
    };
  }

  if (message?.includes("PAGE_FACTS_EMPTY")) {
    return {
      kind: "page_facts_empty",
      reason: "Page fact extraction returned an empty payload.",
    };
  }

  if (message?.includes("login") || message?.toLowerCase().includes("login")) {
    return {
      kind: "login_wall",
      reason: message,
    };
  }

  if (
    message?.includes("NAVIGATION_FAILED") ||
    message?.includes("ACTION_EXECUTION_ERROR") ||
    message?.toLowerCase().includes("navigation failed")
  ) {
    return {
      kind: "navigation_failed",
      reason: message,
    };
  }

  return {
    kind: "not_readable",
    reason: getBlockedReason(url, message),
  };
}

export function isCommerceTask(taskSpec: TaskSpec | undefined): taskSpec is CommerceTaskSpec {
  return !!taskSpec && taskSpec.taskType === "commerce_search";
}

export function isResearchTask(taskSpec: TaskSpec | undefined): taskSpec is PublicResearchTaskSpec {
  return !!taskSpec && taskSpec.taskType === "public_research";
}

export function isDirectAnswerTask(taskSpec: TaskSpec | undefined): taskSpec is DirectAnswerTaskSpec {
  return !!taskSpec && taskSpec.taskType === "direct_answer";
}

function createMarkdownArtifact(memory: SessionMemory, markdown: string, summary: string): ResultArtifact {
  return {
    id:
      memory.taskType === "commerce_search"
        ? "commerce-result-markdown"
        : memory.taskType === "public_research"
          ? "research-result-markdown"
          : "direct-answer-markdown",
    kind: "markdown",
    title:
      memory.taskType === "commerce_search"
        ? "Commerce Result Report"
        : memory.taskType === "public_research"
          ? "Research Result Report"
          : "Direct Answer",
    fileName:
      memory.taskType === "commerce_search"
        ? "commerce-result.md"
        : memory.taskType === "public_research"
          ? "research-result.md"
          : "direct-answer.md",
    mimeType: "text/markdown",
    content: markdown,
    summary,
  };
}

export function getOutputMode(taskSpec: TaskSpec | undefined): OutputMode {
  return taskSpec?.outputMode ?? "inline";
}

export function createFinalResult(
  memory: SessionMemory,
  options: {
    status: FinalResult["status"];
    summary: string;
    markdown: string;
    keyResults?: string[];
    errorsOrBlockers?: string[];
    suggestedNextAction?: string;
  },
): FinalResult {
  const completedSteps = memory.plan.filter((step) => step.status === "succeeded").map((step) => step.stepId);
  const remainingOrFailedSteps = memory.plan.filter((step) => step.status !== "succeeded").map((step) => step.stepId);
  const outputMode = getOutputMode(memory.taskSpec);
  const artifacts = outputMode === "artifact" ? [createMarkdownArtifact(memory, options.markdown, options.summary)] : [];

  return {
    outputMode,
    status: options.status,
    summary: options.summary,
    markdown: outputMode === "inline" ? options.markdown : "",
    keyResults: options.keyResults ?? [],
    completedSteps,
    remainingOrFailedSteps,
    errorsOrBlockers: dedupeIssues(options.errorsOrBlockers ?? memory.unresolvedIssues),
    artifacts,
    suggestedNextAction:
      options.suggestedNextAction ??
      (options.status === "success"
        ? "Review the result and continue only if you need deeper follow-up."
        : "Retry with a narrower goal or manually open the target page before running again."),
  };
}

export function buildFallbackFinalResult(
  memory: SessionMemory,
  reason: string,
  status?: FinalResult["status"],
): FinalResult {
  const resolvedStatus =
    status ??
    (memory.taskType === "direct_answer"
      ? memory.conversationTurns.length > 0
        ? "partial"
        : "failed"
      : memory.taskType === "commerce_search"
      ? memory.extractedItems.length > 0
        ? "partial"
        : "failed"
      : memory.researchSources.length > 0
        ? "partial"
        : "failed");

  if (memory.taskType === "direct_answer") {
    const markdown = buildDirectAnswerFinalMarkdown(memory.goal, memory.conversationTurns, reason);
    const keyResults = memory.conversationTurns
      .slice(-3)
      .map((turn) => turn.answerSummary)
      .filter(Boolean)
      .slice(0, 3);
    return createFinalResult(memory, {
      status: resolvedStatus,
      summary: reason,
      markdown,
      keyResults,
      errorsOrBlockers: [...memory.unresolvedIssues, ...memory.failures.map((failure) => failure.message), reason],
    });
  }

  if (memory.taskType === "commerce_search") {
    const markdown = buildCommerceFinalMarkdown(memory.goal, memory.extractedItems, reason);
    const keyResults = memory.extractedItems.slice(0, 3).map((item) => item.title);
    return createFinalResult(memory, {
      status: resolvedStatus,
      summary: reason,
      markdown,
      keyResults,
      errorsOrBlockers: [...memory.unresolvedIssues, ...memory.failures.map((failure) => failure.message), reason],
    });
  }

  const unresolvedIssues = dedupeIssues([
    ...memory.unresolvedIssues,
    ...memory.researchSources.flatMap((source) => source.unresolvedIssues),
    ...memory.failures.map((failure) => failure.message),
    reason,
  ]);
  const markdown = buildResearchFinalMarkdown(reason, memory.researchSources, unresolvedIssues);
  const keyResults = memory.researchSources
    .filter((source) => source.status === "success")
    .slice(0, 3)
    .map((source) => source.pageTitle || source.candidate.title);

  return createFinalResult(memory, {
    status: resolvedStatus,
    summary: reason,
    markdown,
    keyResults,
    errorsOrBlockers: unresolvedIssues,
  });
}

export function needsSearchReopen(snapshot: SnapshotData, expectedPageType: SnapshotData["pageType"]) {
  return snapshot.pageType !== expectedPageType || hasSearchPageStructureIssue(snapshot);
}
