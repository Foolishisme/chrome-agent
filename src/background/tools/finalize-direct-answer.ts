import { RuntimeError } from "../../shared/errors";
import { generateDirectAnswerResult } from "../llm-client";
import { createToolResult, type AgentToolDefinition } from "./shared";
import {
  buildDirectAnswerFallbackSummary,
  buildDirectAnswerFinalMarkdown,
  createFinalResult,
} from "./result-builders";
import { isDirectAnswerTask } from "./task-guards";

export const finalizeDirectAnswerTool: AgentToolDefinition = {
  name: "finalizeDirectAnswer",
  async run(context) {
    if (!isDirectAnswerTask(context.memory.taskSpec)) {
      throw new RuntimeError("Direct-answer finalization requires a direct-answer task spec.", "INVALID_DIRECT_ANSWER_TASK");
    }

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
          taskSpec: context.memory.taskSpec,
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
          ? "继续追问即可；如果你需要最新外部信息，再明确要求我搜索。"
          : "如果你需要更可靠或更新的信息，下一轮请明确要求搜索。",
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

    return createToolResult({
      status: "success",
      summary: "Final direct answer generated.",
      outputs: {
        finalResult,
      },
      artifacts: finalResult.artifacts,
      facts: {
        finalStatus,
        evidenceTurnCount: recentTurns.length,
      },
      stepStatus: "succeeded",
      terminal: true,
    });
  },
};
