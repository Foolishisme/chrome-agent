import { RuntimeError } from "../../shared/errors";
import { reorderResearchCandidates } from "../llm-client";
import { filterResearchCandidates } from "../result-filter";
import { createToolResult, type AgentToolDefinition } from "./shared";
import { dedupeIssues } from "./result-builders";
import { ensureUsableSnapshotWithDialogRecovery } from "./search-flow";
import { isResearchTask } from "./task-guards";

export const collectResearchCandidatesTool: AgentToolDefinition = {
  name: "collectResearchCandidates",
  async run(context) {
    if (!isResearchTask(context.memory.taskSpec)) {
      throw new RuntimeError("Research candidate collection requires a public research task spec.", "INVALID_RESEARCH_TASK");
    }

    const snapshot = await ensureUsableSnapshotWithDialogRecovery(context, "Research search page blocked by an overlay.");
    if (snapshot.pageType !== "google_search") {
      return createToolResult({
        status: "retryable_error",
        summary: `Expected a Google search page, received ${snapshot.pageType}.`,
        outputs: {
          extractedCount: 0,
          keptCount: 0,
          candidates: [],
        },
        facts: {
          pageType: snapshot.pageType,
        },
        stepStatus: "running",
        errorCode: "SEARCH_PAGE_UNEXPECTED",
        retryHint: "Return to the Google search results page before collecting candidates.",
      });
    }

    const action = {
      type: "EXTRACT_SEARCH_RESULTS" as const,
      limit: context.memory.taskSpec.candidateLimit * 2,
    };
    const extractResult = await context.executeAction(action, "Extract natural results from the Google search page.");
    const snapshotAfter = await context.scanPage();
    const rawCandidates = extractResult.researchCandidates ?? [];
    const filtered = filterResearchCandidates(rawCandidates, context.memory.taskSpec.candidateLimit);
    const reordered = await reorderResearchCandidates(
      {
        goal: context.memory.goal,
        searchQuery: context.memory.taskSpec.searchQuery,
        candidates: filtered.candidates,
      },
      { signal: context.signal },
    );

    context.memory.researchCandidates = reordered.candidates;
    context.memory.filterDiagnostics = filtered.diagnostics;
    context.memory.recoveryHint = undefined;
    context.memory.lastError = extractResult.success ? undefined : extractResult.message;
    context.appendLog(
      reordered.source === "llm-lite" ? "llm" : "runtime",
      reordered.source === "llm-lite" ? "info" : "warn",
      reordered.source === "llm-lite"
        ? "Reordered first-page research candidates with the lite model."
        : "Kept the filtered research candidate order.",
      {
        reason: reordered.reason,
        before: filtered.candidates.map((candidate) => candidate.title),
        after: reordered.candidates.map((candidate) => candidate.title),
      },
    );

    context.recordStep({
      stepSummary: "Google results extracted, filtered, and reordered.",
      nextIntent: reordered.candidates.length > 0 ? "Read the selected source pages." : "Generate a partial research result.",
      expectedOutcome: "A ranked source list is available.",
      action,
      actionResult: extractResult,
      snapshot: snapshotAfter,
    });

    if (reordered.candidates.length === 0) {
      context.memory.unresolvedIssues = dedupeIssues([
        ...context.memory.unresolvedIssues,
        "No usable research sources remained after filtering the first Google results page.",
      ]);
    }

    return createToolResult({
      status: reordered.candidates.length > 0 ? "success" : "partial",
      summary:
        reordered.candidates.length > 0
          ? `Prepared ${reordered.candidates.length} research candidates.`
          : "No usable research candidates remained after filtering.",
      outputs: {
        extractedCount: rawCandidates.length,
        keptCount: reordered.candidates.length,
        candidates: reordered.candidates,
        reorderReason: reordered.reason,
      },
      facts: {
        lastResearchCandidateCount: rawCandidates.length,
        filteredSourceCount: reordered.candidates.length,
      },
      stepStatus: "succeeded",
    });
  },
};
