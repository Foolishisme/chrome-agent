import { compileTaskSpec as compileInitialTaskSpec, buildPlanSteps } from "../query-compiler";
import { refineCommerceSearchQuery, refineResearchQuery } from "../llm-client";
import { createToolResult, type AgentToolDefinition } from "./shared";

export const compileTaskSpecTool: AgentToolDefinition = {
  name: "compileTaskSpec",
  async run(context) {
    await context.pushState("Compile the current goal into a structured task.");

    const compiled = await compileInitialTaskSpec(context.memory.goal, {
      taskType: context.memory.taskType,
      refineCommerceWithLiteModel: async (goal) => {
        context.memory.runtimeMeta.queryRefineTried = true;
        const refined = await refineCommerceSearchQuery(goal, { signal: context.signal });
        context.appendLog("llm", "info", "Refined the commerce query with the lite model.", {
          model: refined.model,
          provider: refined.provider,
          searchQuery: refined.searchQuery,
          reason: refined.reason,
        });
        return {
          searchQuery: refined.searchQuery,
          reason: refined.reason,
        };
      },
      refineResearchWithLiteModel: async (goal) => {
        context.memory.runtimeMeta.queryRefineTried = true;
        const refined = await refineResearchQuery(goal, { signal: context.signal });
        context.appendLog("llm", "info", "Refined the research query with the lite model.", {
          model: refined.model,
          provider: refined.provider,
          searchQuery: refined.searchQuery,
          reason: refined.reason,
        });
        return {
          searchQuery: refined.searchQuery,
          reason: refined.reason,
        };
      },
    });

    context.memory.taskType = compiled.taskType;
    context.memory.taskSpec = compiled.taskSpec;
    context.memory.plan = buildPlanSteps(compiled.taskType);
    context.memory.recoveryHint = undefined;
    context.memory.lastError = undefined;
    context.memory.nextIntent =
      compiled.taskType === "commerce_search" ? "Open the JD search results page." : "Open the Google search results page.";

    context.recordStep({
      stepSummary: "Structured task compiled.",
      nextIntent: context.memory.nextIntent,
      expectedOutcome: "A stable query and task plan are available.",
      snapshotSummary: `${compiled.taskType} | ${compiled.taskSpec.searchQuery}`,
    });

    return createToolResult({
      status: "success",
      summary: `Task spec ready: ${compiled.taskSpec.searchQuery}`,
      outputs: {
        taskSpec: compiled.taskSpec,
      },
      facts: {
        taskType: compiled.taskType,
        searchQuery: compiled.taskSpec.searchQuery,
      },
      stepStatus: "succeeded",
    });
  },
};
