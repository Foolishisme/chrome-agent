import { RuntimeError } from "../../shared/errors";
import type { ResearchCandidate } from "../../shared/types";
import { reorderResearchCandidates, reorderSiteCandidates } from "../llm-client";
import { filterResearchCandidates, filterSiteNavCandidates } from "../result-filter";
import { createToolResult, type AgentToolDefinition } from "./shared";
import { dedupeIssues } from "./result-builders";
import { ensureUsableSnapshotWithDialogRecovery } from "./search-flow";
import { isResearchTask, isSiteOverviewTask } from "./task-guards";

function buildHomepageCandidate(snapshot: Awaited<ReturnType<typeof ensureUsableSnapshotWithDialogRecovery>>): ResearchCandidate {
  return {
    title: snapshot.title || "Homepage",
    url: snapshot.url,
    snippet: "Site homepage",
    source: (() => {
      try {
        return new URL(snapshot.url).hostname.replace(/^www\./, "");
      } catch {
        return undefined;
      }
    })(),
    displayUrl: snapshot.url,
    rank: 0,
    linkLocation: "header",
    score: 100,
  };
}

export const collectResearchCandidatesTool: AgentToolDefinition = {
  name: "collectResearchCandidates",
  async run(context) {
    if (!isResearchTask(context.memory.taskSpec) && !isSiteOverviewTask(context.memory.taskSpec)) {
      throw new RuntimeError("Research candidate collection requires a public or site research task spec.", "INVALID_RESEARCH_TASK");
    }

    if (isSiteOverviewTask(context.memory.taskSpec)) {
      const snapshot = await ensureUsableSnapshotWithDialogRecovery(context, "Site homepage blocked by an overlay.");
      const action = {
        type: "EXTRACT_SITE_NAV_LINKS" as const,
        limit: context.memory.taskSpec.candidateLimit * 4,
        baseUrl: snapshot.url,
      };
      const extractResult = await context.executeAction(action, "Extract same-site navigation candidates from the homepage.");
      const rawCandidates = extractResult.researchCandidates ?? [];
      const filtered = filterSiteNavCandidates(rawCandidates, context.memory.taskSpec, {
        homepageUrl: snapshot.url,
        goal: context.memory.goal,
      });
      const reordered = await reorderSiteCandidates(
        {
          goal: context.memory.goal,
          targetDomain: filtered.targetDomain,
          candidates: filtered.candidates,
        },
        { signal: context.signal },
      );

      const homepageCandidate = buildHomepageCandidate(snapshot);
      context.memory.researchCandidates = [
        homepageCandidate,
        ...reordered.candidates.map((candidate, index) => ({
          ...candidate,
          rank: index + 1,
        })),
      ].slice(0, context.memory.taskSpec.pageReadLimit);
      context.memory.filterDiagnostics = filtered.diagnostics;
      context.memory.activeSourceIndex = 0;
      context.memory.recoveryHint = undefined;
      context.memory.lastError = extractResult.success ? undefined : extractResult.message;
      context.memory.currentFacts = {
        ...context.memory.currentFacts,
        siteEntryUrl: snapshot.url,
        targetDomain: filtered.targetDomain,
        siteCandidateCount: context.memory.researchCandidates.length,
      };
      context.appendLog(
        reordered.source === "llm-lite" ? "llm" : "runtime",
        reordered.source === "llm-lite" ? "info" : "warn",
        reordered.source === "llm-lite"
          ? "Reordered same-site navigation candidates with the lite model."
          : "Kept the rule-ranked same-site navigation candidate order.",
        {
          reason: reordered.reason,
          before: filtered.candidates.map((candidate) => candidate.title),
          after: reordered.candidates.map((candidate) => candidate.title),
        },
      );

      context.recordStep({
        stepSummary: "Site homepage navigation extracted, filtered, and reordered.",
        nextIntent: context.memory.researchCandidates.length > 0 ? "Read the homepage and selected navigation pages." : "Generate a partial site overview.",
        expectedOutcome: "A ranked same-site source list is available.",
        action,
        actionResult: extractResult,
        snapshot,
      });

      if (reordered.candidates.length === 0) {
        context.memory.unresolvedIssues = dedupeIssues([
          ...context.memory.unresolvedIssues,
          "No usable same-site navigation pages remained after filtering the homepage links.",
        ]);
      }

      return createToolResult({
        status: context.memory.researchCandidates.length > 0 ? "success" : "partial",
        summary:
          context.memory.researchCandidates.length > 0
            ? `Prepared ${context.memory.researchCandidates.length} site overview candidates.`
            : "No usable site overview candidates remained after filtering.",
        outputs: {
          extractedCount: rawCandidates.length,
          keptCount: context.memory.researchCandidates.length,
          candidates: context.memory.researchCandidates,
          reorderReason: reordered.reason,
        },
        facts: {
          siteCandidateCount: context.memory.researchCandidates.length,
          targetDomain: filtered.targetDomain,
        },
        stepStatus: "succeeded",
      });
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
