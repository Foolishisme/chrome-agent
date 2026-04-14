import { RuntimeError } from "../../shared/errors";
import type { ResearchSourceResult, SiteOverviewTaskSpec } from "../../shared/types";
import { createToolResult, type AgentToolDefinition } from "./shared";
import { countSuccessfulResearchSources, dedupeIssues } from "./result-builders";
import { classifySourceFailure } from "./source-failure";
import { isReadableResearchTask, isSiteOverviewTask } from "./task-guards";

function reachedReadLimit(taskSpec: SiteOverviewTaskSpec, processedCount: number) {
  return processedCount >= taskSpec.pageReadLimit;
}

function isLikelyNotFound(snapshotSummary: string | undefined, url: string) {
  return /(^|\s)(404|not found|page not found|页面不存在|找不到页面)(\s|$)/i.test(`${snapshotSummary ?? ""} ${url}`);
}

export const readResearchSourceFactsTool: AgentToolDefinition = {
  name: "readResearchSourceFacts",
  async run(context) {
    if (!isReadableResearchTask(context.memory.taskSpec)) {
      throw new RuntimeError("Research source reading requires a public or site research task.", "INVALID_RESEARCH_READ");
    }

    const taskSpec = context.memory.taskSpec;
    const successfulSourceCount = countSuccessfulResearchSources(context.memory.researchSources);
    const exhausted = context.memory.activeSourceIndex >= context.memory.researchCandidates.length;
    const limitReached = isSiteOverviewTask(taskSpec) && reachedReadLimit(taskSpec, context.memory.researchSources.length);
    if (successfulSourceCount >= taskSpec.sourceTargetCount || exhausted || limitReached) {
      if (exhausted && successfulSourceCount < taskSpec.sourceTargetCount) {
        context.memory.unresolvedIssues = dedupeIssues([
          ...context.memory.unresolvedIssues,
          "Research candidates were exhausted before reaching the source target.",
        ]);
      }
      if (limitReached && successfulSourceCount < taskSpec.sourceTargetCount) {
        context.memory.unresolvedIssues = dedupeIssues([
          ...context.memory.unresolvedIssues,
          "The site overview page read limit was reached before enough readable pages were collected.",
        ]);
      }

      return createToolResult({
        status: successfulSourceCount > 0 ? "success" : "partial",
        summary: exhausted
          ? "Research candidates were exhausted."
          : limitReached
            ? "Reached the site overview page read limit."
            : "Reached the target number of research sources.",
        outputs: {
          processedCount: context.memory.researchSources.length,
          successfulCount: successfulSourceCount,
          exhausted,
          limitReached,
        },
        facts: {
          readSourceCount: context.memory.researchSources.length,
          successfulSourceCount,
        },
        stepStatus: "succeeded",
      });
    }

    const candidate = context.memory.researchCandidates[context.memory.activeSourceIndex];
    if (!candidate) {
      context.memory.unresolvedIssues = dedupeIssues([
        ...context.memory.unresolvedIssues,
        "Research candidates were exhausted before reaching the source target.",
      ]);

      return createToolResult({
        status: "partial",
        summary: "Research candidates were exhausted.",
        outputs: {
          processedCount: context.memory.researchSources.length,
          successfulCount: successfulSourceCount,
          exhausted: true,
        },
        facts: {
          readSourceCount: context.memory.researchSources.length,
          successfulSourceCount,
        },
        stepStatus: "succeeded",
      });
    }

    const action = {
      type: "NAVIGATE" as const,
      url: candidate.url,
    };
    const navigationResult = await context.executeAction(action, `Open source ${context.memory.activeSourceIndex + 1}: ${candidate.title}`);
    await context.settleAfterAction(action);

    let sourceResult: ResearchSourceResult;
    let snapshotSummary: string | undefined;

    try {
      if (!navigationResult.success) {
        throw new RuntimeError(navigationResult.message, navigationResult.errorCode ?? "NAVIGATION_FAILED");
      }

      const snapshot = await context.scanPage();
      snapshotSummary = `${snapshot.pageType} | ${snapshot.title}`;
      const extractionResult = await context.executeAction(
        { type: "EXTRACT_PAGE_FACTS" },
        `Extract facts from ${candidate.title}.`,
      );

      const pageFacts = extractionResult.pageFactsResult;
      if (!pageFacts) {
        throw new RuntimeError("Page fact extraction returned an empty payload.", "PAGE_FACTS_EMPTY");
      }

      const unresolvedIssues: string[] = [];
      const minReadableTextLength = isSiteOverviewTask(taskSpec) ? taskSpec.minReadableTextLength : undefined;
      const notFound = isLikelyNotFound(snapshotSummary, candidate.url);
      const tooShort = minReadableTextLength !== undefined && pageFacts.textLength < minReadableTextLength;
      if (notFound) {
        unresolvedIssues.push("The page looked like a 404 or not-found page.");
      }
      if (tooShort) {
        unresolvedIssues.push(`The page readable text was shorter than ${minReadableTextLength} characters.`);
      }
      if (pageFacts.reason) {
        unresolvedIssues.push(pageFacts.reason);
      }

      sourceResult = {
        candidate,
        status: pageFacts.status === "success" && !notFound && !tooShort ? "success" : "partial",
        pageTitle: pageFacts.pageTitle || candidate.title,
        bodyExcerpt: pageFacts.bodyExcerpt,
        sourceUrl: candidate.url,
        unresolvedIssues,
        textLength: pageFacts.textLength,
      };
    } catch (error) {
      const failure = classifySourceFailure(candidate.url, error);
      sourceResult = {
        candidate,
        status: "partial",
        pageTitle: candidate.title,
        bodyExcerpt: "",
        sourceUrl: candidate.url,
        unresolvedIssues: [failure.reason],
        textLength: 0,
      };
      context.appendLog("runtime", "warn", "Research source skipped after a single failure.", {
        title: candidate.title,
        failureKind: failure.kind,
        reason: failure.reason,
      });
    }

    context.memory.researchSources = [...context.memory.researchSources, sourceResult];
    context.memory.unresolvedIssues = dedupeIssues([
      ...context.memory.unresolvedIssues,
      ...sourceResult.unresolvedIssues,
    ]);
    context.memory.activeSourceIndex += 1;

    const nextSuccessfulSourceCount = countSuccessfulResearchSources(context.memory.researchSources);
    const nextExhausted = context.memory.activeSourceIndex >= context.memory.researchCandidates.length;
    const nextLimitReached = isSiteOverviewTask(taskSpec) && reachedReadLimit(taskSpec, context.memory.researchSources.length);

    context.recordStep({
      stepSummary: `Source processed: ${sourceResult.pageTitle || candidate.title}`,
      nextIntent:
        nextSuccessfulSourceCount >= taskSpec.sourceTargetCount || nextExhausted || nextLimitReached
          ? "Generate the final research result."
          : "Open the next source candidate.",
      expectedOutcome: "A structured source summary is recorded.",
      action,
      actionResult: navigationResult,
      snapshotSummary,
    });

    return createToolResult({
      status: sourceResult.status === "success" ? "success" : "partial",
      summary: `Processed source ${context.memory.researchSources.length}.`,
      outputs: {
        processedCount: context.memory.researchSources.length,
        successfulCount: nextSuccessfulSourceCount,
        exhausted: nextExhausted,
        limitReached: nextLimitReached,
      },
      facts: {
        readSourceCount: context.memory.researchSources.length,
        successfulSourceCount: nextSuccessfulSourceCount,
      },
      stepStatus:
        nextSuccessfulSourceCount >= taskSpec.sourceTargetCount || nextExhausted || nextLimitReached ? "succeeded" : "running",
    });
  },
};
