import { RuntimeError } from "../../shared/errors";
import { createToolResult, type AgentToolDefinition } from "./shared";
import {
  buildSearchUrl,
  detectSearchBlocker,
  ensureUsableSnapshotWithDialogRecovery,
  hasMatchingQuery,
  isCommerceTask,
  isResearchTask,
  needsSearchReopen,
  reopenSearchResults,
} from "./helpers";

export const openSearchResultsTool: AgentToolDefinition = {
  name: "openSearchResults",
  async run(context) {
    if (!context.memory.taskSpec) {
      throw new RuntimeError("Task spec is missing before search.", "TASK_SPEC_MISSING");
    }

    if (!isCommerceTask(context.memory.taskSpec) && !isResearchTask(context.memory.taskSpec)) {
      throw new RuntimeError("Open-search-results only supports commerce or public research tasks.", "INVALID_SEARCH_TASK");
    }

    const taskSpec = context.memory.taskSpec;

    const expectedSearchPage = taskSpec.taskType === "commerce_search" ? "search" : "google_search";
    let snapshot = await ensureUsableSnapshotWithDialogRecovery(context, "Search page blocked before submission.");

    if (snapshot.pageType === expectedSearchPage && hasMatchingQuery(snapshot, taskSpec.searchQuery)) {
      context.memory.recoveryHint = undefined;
      context.memory.lastError = undefined;
      context.memory.nextIntent =
        taskSpec.taskType === "commerce_search"
          ? "Collect product candidates from the JD result page."
          : "Collect source candidates from the Google result page.";

      return createToolResult({
        status: "success",
        summary: "Search page already matched the current query.",
        outputs: {
          url: snapshot.url,
          pageType: snapshot.pageType,
          searchQueryMatched: true,
        },
        facts: {
          pageType: snapshot.pageType,
          searchQueryMatched: true,
        },
        stepStatus: "succeeded",
      });
    }

    const action = {
      type: "NAVIGATE" as const,
      url: buildSearchUrl(taskSpec),
    };
    const result = await context.executeAction(
      action,
      taskSpec.taskType === "commerce_search"
        ? `Open the JD search results for "${taskSpec.searchQuery}".`
        : `Open the Google search results for "${taskSpec.searchQuery}".`,
    );
    await context.settleAfterAction(action);
    snapshot = await ensureUsableSnapshotWithDialogRecovery(context, "Search results page stayed blocked after navigation.");

    context.memory.rawExtractedItems = [];
    context.memory.extractedItems = [];
    context.memory.researchCandidates = [];
    context.memory.researchSources = [];
    context.memory.activeSourceIndex = 0;
    context.memory.filterDiagnostics = undefined;
    context.memory.unresolvedIssues = [];
    context.memory.runtimeMeta.recoveryCount = 0;
    context.memory.nextIntent =
      taskSpec.taskType === "commerce_search"
        ? "Collect product candidates from the JD result page."
        : "Collect source candidates from the Google result page.";
    context.memory.recoveryHint = undefined;
    context.memory.lastError = result.success ? undefined : result.message;

    context.recordStep({
      stepSummary: "Search submitted.",
      nextIntent: context.memory.nextIntent,
      expectedOutcome: "The page navigates to the search results view.",
      action,
      actionResult: result,
      snapshot,
    });

    if (needsSearchReopen(snapshot, expectedSearchPage)) {
      const reopenedSnapshot = await reopenSearchResults(
        context,
        taskSpec,
        `Received ${snapshot.pageType} after opening search results.`,
      );
      if (reopenedSnapshot) {
        snapshot = reopenedSnapshot;
      }
    }

    const blockedReason = detectSearchBlocker(context.memory.taskType, snapshot);
    if (blockedReason) {
      return createToolResult({
        status: "fatal_error",
        summary: blockedReason,
        outputs: {
          url: snapshot.url,
          pageType: snapshot.pageType,
          searchQueryMatched: false,
        },
        facts: {
          pageType: snapshot.pageType,
          searchQueryMatched: false,
        },
        stepStatus: "blocked",
        errorCode: "SEARCH_BLOCKED",
      });
    }

    if (snapshot.pageType !== expectedSearchPage) {
      return createToolResult({
        status: "retryable_error",
        summary: `Unexpected search page: ${snapshot.pageType}`,
        outputs: {
          url: snapshot.url,
          pageType: snapshot.pageType,
          searchQueryMatched: false,
        },
        facts: {
          pageType: snapshot.pageType,
          searchQueryMatched: false,
        },
        stepStatus: "running",
        errorCode: "SEARCH_PAGE_UNEXPECTED",
        retryHint: "Reopen the canonical search results page.",
      });
    }

    const searchQueryMatched = hasMatchingQuery(snapshot, taskSpec.searchQuery);
    return createToolResult({
      status: searchQueryMatched ? "success" : "partial",
      summary: `Search page ready: ${taskSpec.searchQuery}`,
      outputs: {
        url: snapshot.url,
        pageType: snapshot.pageType,
        searchQueryMatched,
      },
      facts: {
        pageType: snapshot.pageType,
        searchQueryMatched,
      },
      stepStatus: "succeeded",
    });
  },
};
