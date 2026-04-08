import { RuntimeError } from "../../shared/errors";
import { generateFinalResult } from "../llm-client";
import { createToolResult, type AgentToolDefinition } from "./shared";
import { buildCommerceFinalMarkdown, buildRuleBasedSummary, createFinalResult, isCommerceTask } from "./helpers";

export const finalizeCommerceResultTool: AgentToolDefinition = {
  name: "finalizeCommerceResult",
  async run(context) {
    if (!isCommerceTask(context.memory.taskSpec)) {
      throw new RuntimeError("Commerce finalization requires a commerce task spec.", "INVALID_COMMERCE_TASK");
    }

    await context.pushState("Aggregate the structured task results into the final output.");

    let summary = "";
    let markdown = "";
    let keyResults: string[] = [];
    const finalStatus =
      context.memory.extractedItems.length === 0 ? "failed" : context.memory.extractedItems.length < context.memory.taskSpec.topK ? "partial" : "success";

    if (context.memory.extractedItems.length === 0) {
      summary = `No usable commerce candidates were collected for "${context.memory.goal}".`;
      markdown = buildCommerceFinalMarkdown(context.memory.goal, [], summary);
    } else {
      try {
        const response = await generateFinalResult(
          {
            goal: context.memory.goal,
            taskType: context.memory.taskType,
            taskSpec: context.memory.taskSpec,
            items: context.memory.extractedItems,
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

    return createToolResult({
      status: "success",
      summary: "Final commerce result generated.",
      outputs: {
        finalResult,
      },
      artifacts: finalResult.artifacts,
      facts: {
        finalStatus,
      },
      stepStatus: "succeeded",
      terminal: true,
    });
  },
};
