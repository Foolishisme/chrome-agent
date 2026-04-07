import { RuntimeError } from "../../shared/errors";
import type { ResearchSourceResult } from "../../shared/types";
import { createToolResult, type AgentToolDefinition } from "./shared";
import { classifySourceFailure, countSuccessfulResearchSources, dedupeIssues, isResearchTask } from "./helpers";

export const readResearchSourceFactsTool: AgentToolDefinition = {
  name: "readResearchSourceFacts",
  async run(context) {
    if (!isResearchTask(context.memory.taskSpec)) {
      throw new RuntimeError("Research source reading requires a public research task.", "INVALID_RESEARCH_READ");
    }

    const successfulSourceCount = countSuccessfulResearchSources(context.memory.researchSources);
    const exhausted = context.memory.activeSourceIndex >= context.memory.researchCandidates.length;
    if (successfulSourceCount >= context.memory.taskSpec.sourceTargetCount || exhausted) {
      if (exhausted && successfulSourceCount < context.memory.taskSpec.sourceTargetCount) {
        context.memory.unresolvedIssues = dedupeIssues([
          ...context.memory.unresolvedIssues,
          "Research candidates were exhausted before reaching the source target.",
        ]);
      }

      return createToolResult({
        status: successfulSourceCount > 0 ? "success" : "partial",
        summary: exhausted ? "Research candidates were exhausted." : "Reached the target number of research sources.",
        outputs: {
          processedCount: context.memory.researchSources.length,
          successfulCount: successfulSourceCount,
          exhausted,
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

      sourceResult = {
        candidate,
        status: pageFacts.status,
        pageTitle: pageFacts.pageTitle || candidate.title,
        summary: pageFacts.summary || pageFacts.reason || "Only partial facts were extracted.",
        keyPoints: pageFacts.keyPoints,
        sourceUrl: candidate.url,
        unresolvedIssues: pageFacts.reason ? [pageFacts.reason] : [],
        textLength: pageFacts.textLength,
      };
    } catch (error) {
      const failure = classifySourceFailure(candidate.url, error);
      sourceResult = {
        candidate,
        status: "partial",
        pageTitle: candidate.title,
        summary: `This source could not be fully read: ${failure.reason}`,
        keyPoints: [],
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

    context.recordStep({
      stepSummary: `Source processed: ${sourceResult.pageTitle || candidate.title}`,
      nextIntent:
        nextSuccessfulSourceCount >= context.memory.taskSpec.sourceTargetCount || nextExhausted
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
      },
      facts: {
        readSourceCount: context.memory.researchSources.length,
        successfulSourceCount: nextSuccessfulSourceCount,
      },
      stepStatus:
        nextSuccessfulSourceCount >= context.memory.taskSpec.sourceTargetCount || nextExhausted ? "succeeded" : "running",
    });
  },
};
