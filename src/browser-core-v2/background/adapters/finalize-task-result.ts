import { RuntimeError } from "../../../shared/errors";
import type { DebugLogEntry, DirectAnswerTaskSpec, FinalResult, PublicResearchTaskSpec, SearchTaskSpec, SessionMemory, SiteOverviewTaskSpec } from "../../../shared/types";
import { generateDirectAnswerResult, generateFinalResult } from "../../../background/llm-client";
import {
  buildCommerceFinalMarkdown,
  buildDirectAnswerFallbackSummary,
  buildDirectAnswerFinalMarkdown,
  buildResearchFallbackSummary,
  buildResearchFinalMarkdown,
  buildRuleBasedSummary,
  createFinalResult,
  dedupeIssues,
  getFinalStatusForResearch,
} from "../../../background/tools/result-builders";
import { isCommerceTask, isDirectAnswerTask, isReadableResearchTask } from "../../../background/tools/task-guards";
import type { StepOptions } from "../../../background/tools/shared";

export interface FinalizeTaskResultContext {
  memory: SessionMemory;
  signal: AbortSignal;
  appendLog(source: DebugLogEntry["source"], level: DebugLogEntry["level"], message: string, detail?: unknown): void;
  recordStep(options: StepOptions): void;
  pushState(stepSummary?: string): Promise<void>;
}

export interface FinalizeTaskResultOutput {
  finalResult: FinalResult;
  summary: string;
  finalStatus: FinalResult["status"];
}

async function finalizeDirectAnswer(
  context: FinalizeTaskResultContext,
  taskSpec: DirectAnswerTaskSpec,
): Promise<FinalizeTaskResultOutput> {
  await context.pushState("Generate the final direct answer.");

  const recentTurns = (context.memory.conversationTurns ?? []).slice(-3);
  let summary = "";
  let markdown = "";
  let keyResults: string[] = [];
  let finalStatus: "success" | "partial" | "failed" = "success";

  try {
    const response = await generateDirectAnswerResult(
      {
        goal: context.memory.goal,
        taskSpec,
        conversationTurns: recentTurns,
      },
      { signal: context.signal },
    );

    summary = response.summary;
    markdown = response.markdown;
    keyResults = response.keyResults ?? [];
    context.appendLog("llm", "info", "Generated the final direct answer.", {
      provider: response.provider,
      model: response.model,
      evidenceTurnCount: recentTurns.length,
    });
  } catch (error) {
    summary = buildDirectAnswerFallbackSummary(context.memory.goal, recentTurns);
    markdown = buildDirectAnswerFinalMarkdown(context.memory.goal, recentTurns, summary);
    keyResults = recentTurns.map((turn) => turn.answerSummary).filter(Boolean).slice(0, 3);
    finalStatus = recentTurns.length > 0 ? "partial" : "failed";
    context.appendLog("llm", "warn", "Fell back after direct-answer generation failed.", {
      message: error instanceof Error ? error.message : "Unknown direct-answer error",
      evidenceTurnCount: recentTurns.length,
    });
  }

  const finalResult = createFinalResult(context.memory, {
    status: finalStatus,
    summary,
    markdown,
    keyResults,
    errorsOrBlockers: finalStatus === "success" ? context.memory.unresolvedIssues : ["Direct answer relied on fallback output."],
    suggestedNextAction:
      finalStatus === "success"
        ? "缁х画杩介棶鍗冲彲锛涘鏋滀綘闇€瑕佹渶鏂板閮ㄤ俊鎭紝鍐嶆槑纭姹傛垜鎼滅储銆?"
        : "濡傛灉浣犻渶瑕佹洿鍙潬鎴栨洿鏂扮殑淇℃伅锛屼笅涓€杞鏄庣‘瑕佹眰鎼滅储銆?",
  });

  context.memory.finalResult = finalResult;
  context.memory.recoveryHint = undefined;
  context.memory.lastError = finalStatus === "success" ? undefined : summary;

  context.recordStep({
    stepSummary: "Final direct answer generated.",
    nextIntent: "Stop the session.",
    expectedOutcome: "A direct-answer result is ready for the side panel.",
    action: {
      type: "DONE",
      summary,
    },
    snapshotSummary: `${finalStatus} -> direct-answer`,
  });

  return {
    finalResult,
    summary: "Final direct answer generated.",
    finalStatus,
  };
}

function buildConversationContext(turns: SessionMemory["conversationTurns"]) {
  return (turns ?? [])
    .slice(-3)
    .map(
      (turn) =>
        `Turn ${turn.turnId}\nUser: ${turn.goal}\nAssistant final result: ${turn.answerSummary}`,
    )
    .join("\n\n");
}

async function finalizeResearch(
  context: FinalizeTaskResultContext,
  taskSpec: PublicResearchTaskSpec | SiteOverviewTaskSpec,
): Promise<FinalizeTaskResultOutput> {
  await context.pushState("Aggregate the structured task results into the final output.");

  const unresolvedIssues = dedupeIssues([
    ...context.memory.unresolvedIssues,
    ...context.memory.researchSources.flatMap((source) => source.unresolvedIssues),
  ]);
  const conversationContext = buildConversationContext(context.memory.conversationTurns);

  let summary = "";
  let markdown = "";
  let keyResults: string[] = [];

  if (context.memory.researchSources.some((source) => source.status === "success")) {
    try {
      const response = await generateFinalResult(
        {
          goal: context.memory.goal,
          taskType: context.memory.taskType,
          taskSpec,
          sources: context.memory.researchSources,
          unresolvedIssues,
          conversationContext,
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

  const finalStatus = getFinalStatusForResearch(taskSpec, context.memory.researchSources, unresolvedIssues);
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

  return {
    finalResult,
    summary: "Final research result generated.",
    finalStatus,
  };
}

async function finalizeCommerce(
  context: FinalizeTaskResultContext,
  taskSpec: SearchTaskSpec,
): Promise<FinalizeTaskResultOutput> {
  await context.pushState("Aggregate the structured task results into the final output.");

  let summary = "";
  let markdown = "";
  let keyResults: string[] = [];
  const conversationContext = buildConversationContext(context.memory.conversationTurns);
  const finalStatus =
    context.memory.extractedItems.length === 0 ? "failed" : context.memory.extractedItems.length < taskSpec.topK ? "partial" : "success";

  if (context.memory.extractedItems.length === 0) {
    summary = `No usable commerce candidates were collected for "${context.memory.goal}".`;
    markdown = buildCommerceFinalMarkdown(context.memory.goal, [], summary);
  } else {
    try {
      const response = await generateFinalResult(
        {
          goal: context.memory.goal,
          taskType: context.memory.taskType,
          taskSpec,
          items: context.memory.extractedItems,
          conversationContext,
        },
        { signal: context.signal },
      );
      summary = response.summary;
      markdown = response.markdown;
      keyResults = response.keyResults ?? [];
      context.appendLog("llm", "info", "Generated the final commerce recommendation.", {
        itemCount: context.memory.extractedItems.length,
        provider: response.provider,
        model: response.model,
      });
    } catch (error) {
      summary = buildRuleBasedSummary(context.memory.goal, context.memory.extractedItems);
      markdown = buildCommerceFinalMarkdown(context.memory.goal, context.memory.extractedItems, summary);
      keyResults = context.memory.extractedItems.slice(0, 3).map((item) => item.title);
      context.appendLog("llm", "warn", "Fell back to rule-based commerce output after LLM summary failed.", {
        message: error instanceof Error ? error.message : "Unknown final summary error",
      });
    }
  }

  const finalResult = createFinalResult(context.memory, {
    status: finalStatus,
    summary,
    markdown,
    keyResults,
    errorsOrBlockers: context.memory.unresolvedIssues,
    suggestedNextAction:
      finalStatus === "success"
        ? "Review the recommended items and open the product pages you want to compare further."
        : "Retry with a narrower budget, brand, or category if you need stronger candidates.",
  });

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
      items: context.memory.extractedItems,
    },
    snapshotSummary: `${finalStatus} -> markdown`,
  });

  return {
    finalResult,
    summary: "Final commerce result generated.",
    finalStatus,
  };
}

export async function finalizeTaskResult(
  context: FinalizeTaskResultContext,
  mode?: "direct_answer" | "research" | "commerce",
): Promise<FinalizeTaskResultOutput> {
  const taskSpec = context.memory.taskSpec;

  if (mode === "direct_answer" || (!mode && isDirectAnswerTask(taskSpec))) {
    if (!taskSpec || !isDirectAnswerTask(taskSpec)) {
      throw new RuntimeError("Direct-answer finalization requires a direct-answer task spec.", "INVALID_DIRECT_ANSWER_TASK");
    }
    return finalizeDirectAnswer(context, taskSpec);
  }

  if (mode === "commerce" || (!mode && isCommerceTask(taskSpec))) {
    if (!taskSpec || !isCommerceTask(taskSpec)) {
      throw new RuntimeError("Commerce finalization requires a commerce task spec.", "INVALID_COMMERCE_TASK");
    }
    return finalizeCommerce(context, taskSpec);
  }

  if (mode === "research" || (!mode && isReadableResearchTask(taskSpec))) {
    if (!taskSpec || !isReadableResearchTask(taskSpec)) {
      throw new RuntimeError("Research finalization requires a public or site research task spec.", "INVALID_RESEARCH_TASK");
    }
    return finalizeResearch(context, taskSpec);
  }

  throw new RuntimeError("Finalize task result requires a supported task spec.", "UNSUPPORTED_FINALIZE_TASK");
}
