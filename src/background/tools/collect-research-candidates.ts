import { RuntimeError } from "../../shared/errors";
import { filterResearchCandidates } from "../result-filter";
import { createToolResult, type AgentToolDefinition } from "./shared";
import { dedupeIssues, ensureUsableSnapshotWithDialogRecovery, isResearchTask } from "./helpers";

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

    context.memory.researchCandidates = filtered.candidates;
    context.memory.filterDiagnostics = filtered.diagnostics;
    context.memory.recoveryHint = undefined;
    context.memory.lastError = extractResult.success ? undefined : extractResult.message;

    context.recordStep({
      stepSummary: "Google results extracted and filtered.",
      nextIntent: filtered.candidates.length > 0 ? "Read the selected source pages." : "Generate a partial research result.",
      expectedOutcome: "A deduped source list is available.",
      action,
      actionResult: extractResult,
      snapshot: snapshotAfter,
    });

    if (filtered.candidates.length === 0) {
      context.memory.unresolvedIssues = dedupeIssues([
        ...context.memory.unresolvedIssues,
        "No usable research sources remained after filtering the first Google results page.",
      ]);
    }

    return createToolResult({
      status: filtered.candidates.length > 0 ? "success" : "partial",
      summary:
        filtered.candidates.length > 0
          ? `Prepared ${filtered.candidates.length} research candidates.`
          : "No usable research candidates remained after filtering.",
      outputs: {
        extractedCount: rawCandidates.length,
        keptCount: filtered.candidates.length,
        candidates: filtered.candidates,
      },
      facts: {
        lastResearchCandidateCount: rawCandidates.length,
        filteredSourceCount: filtered.candidates.length,
      },
      stepStatus: "succeeded",
    });
  },
};
