import { RuntimeError } from "../../shared/errors";
import { generateFinalResult } from "../llm-client";
import { createToolResult, type AgentToolDefinition } from "./shared";
import {
  buildResearchFallbackSummary,
  buildResearchFinalMarkdown,
  createFinalResult,
  dedupeIssues,
  getFinalStatusForResearch,
  isResearchTask,
} from "./helpers";

export const finalizeResearchResultTool: AgentToolDefinition = {
  name: "finalizeResearchResult",
  async run(context) {
    if (!isResearchTask(context.memory.taskSpec)) {
      throw new RuntimeError("Research finalization requires a public research task spec.", "INVALID_RESEARCH_TASK");
    }

    await context.pushState("Aggregate the structured task results into the final output.");

    const unresolvedIssues = dedupeIssues([
      ...context.memory.unresolvedIssues,
      ...context.memory.researchSources.flatMap((source) => source.unresolvedIssues),
    ]);

    let summary = "";
    let markdown = "";
    let keyResults: string[] = [];

    if (context.memory.researchSources.some((source) => source.status === "success")) {
      try {
        const response = await generateFinalResult(
          {
            goal: context.memory.goal,
            taskType: context.memory.taskType,
            taskSpec: context.memory.taskSpec,
            sources: context.memory.researchSources,
            unresolvedIssues,
          },
          { signal: context.signal },
        );
        summary = response.summary;
        markdown = response.markdown;
        keyResults = response.keyResults ?? [];
        context.appendLog("llm", "info", "Generated the final research summary.", {
          sourceCount: context.memory.researchSources.length,
          provider: response.provider,
          model: response.model,
        });
      } catch (error) {
        summary = buildResearchFallbackSummary(context.memory.goal, context.memory.researchSources, unresolvedIssues);
        markdown = buildResearchFinalMarkdown(summary, context.memory.researchSources, unresolvedIssues);
        keyResults = context.memory.researchSources
          .filter((source) => source.status === "success")
          .slice(0, 3)
          .map((source) => source.pageTitle || source.candidate.title);
        context.appendLog("llm", "warn", "Fell back to deterministic research output after LLM summary failed.", {
          message: error instanceof Error ? error.message : "Unknown final summary error",
        });
      }
    } else {
      summary = buildResearchFallbackSummary(context.memory.goal, context.memory.researchSources, unresolvedIssues);
      markdown = buildResearchFinalMarkdown(summary, context.memory.researchSources, unresolvedIssues);
    }

    const finalStatus = getFinalStatusForResearch(context.memory.taskSpec, context.memory.researchSources, unresolvedIssues);
    const finalResult = createFinalResult(context.memory, {
      status: finalStatus,
      summary,
      markdown,
      keyResults,
      errorsOrBlockers: unresolvedIssues,
      suggestedNextAction:
        finalStatus === "success"
          ? "Review the cited sources if you need deeper follow-up."
          : "Retry with a narrower query or open a few candidate sources manually before running again.",
    });

    context.memory.unresolvedIssues = unresolvedIssues;
    context.memory.finalResult = finalResult;
    context.memory.recoveryHint = undefined;
    context.memory.lastError = undefined;

    context.recordStep({
      stepSummary: "Final output generated.",
      nextIntent: "Stop the session.",
      expectedOutcome: "A Markdown result is ready for the side panel.",
      action: {
        type: "DONE",
        summary,
      },
      snapshotSummary: `${finalStatus} -> markdown`,
    });

    return createToolResult({
      status: "success",
      summary: "Final research result generated.",
      outputs: {
        finalResult,
      },
      facts: {
        finalStatus,
      },
      stepStatus: "succeeded",
      terminal: true,
    });
  },
};
