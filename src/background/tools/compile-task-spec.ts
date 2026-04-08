import { compileTaskSpec as compileInitialTaskSpec, buildPlanSteps } from "../query-compiler";
import { classifyTaskType, refineCommerceSearchQuery, refineResearchQuery } from "../llm-client";
import { createToolResult, type AgentToolDefinition } from "./shared";

export const compileTaskSpecTool: AgentToolDefinition = {
  name: "compileTaskSpec",
  async run(context) {
    await context.pushState("Compile the current goal into a structured task.");
    const conversationTurns = context.memory.conversationTurns ?? [];
    const conversationContext = conversationTurns
      .slice(-3)
      .map(
        (turn) =>
          `Turn ${turn.turnId} | savedAt: ${new Date(turn.savedAt).toISOString()}\nUser: ${turn.goal}\nAssistant final result: ${turn.answerSummary}`,
      )
      .join("\n\n");
    const routeReason =
      typeof context.memory.currentFacts.routeReason === "string" ? context.memory.currentFacts.routeReason : undefined;
    const currentTimeIso =
      typeof context.memory.currentFacts.routeEvaluatedAt === "string" ? context.memory.currentFacts.routeEvaluatedAt : new Date().toISOString();
    const timezone =
      typeof context.memory.currentFacts.routeTimezone === "string"
        ? context.memory.currentFacts.routeTimezone
        : Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

    const compiled = await compileInitialTaskSpec(context.memory.goal, {
      taskType: context.memory.taskType,
      searchPreference: context.memory.searchPreference,
      routeReason,
      currentTimeIso,
      timezone,
      conversationTurns,
      classifyTaskTypeWithLiteModel: async (goal) => {
        const refined = await classifyTaskType(goal, {
          signal: context.signal,
          conversationContext,
          conversationTurns,
          currentTimeIso,
          timezone,
          searchPreference: context.memory.searchPreference,
        });
        context.appendLog("llm", "info", "Classified the task type with the lite model.", {
          model: refined.model,
          provider: refined.provider,
          taskType: refined.taskType,
          reason: refined.reason,
        });
        return {
          taskType: refined.taskType,
          reason: refined.reason,
        };
      },
      refineCommerceWithLiteModel: async (goal) => {
        context.memory.runtimeMeta.queryRefineTried = true;
        const refined = await refineCommerceSearchQuery(goal, { signal: context.signal, conversationContext });
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
        const refined = await refineResearchQuery(goal, { signal: context.signal, conversationContext });
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
      compiled.taskType === "commerce_search"
        ? "Open the JD search results page."
        : compiled.taskType === "public_research"
          ? "Open the Google search results page."
          : "Generate the direct answer.";

    const taskSummary =
      compiled.taskType === "direct_answer"
        ? compiled.taskSpec.routeReason
        : compiled.taskSpec.searchQuery;

    context.recordStep({
      stepSummary: "Structured task compiled.",
      nextIntent: context.memory.nextIntent,
      expectedOutcome: "A stable query and task plan are available.",
      snapshotSummary: `${compiled.taskType} | ${taskSummary}`,
    });

    const facts =
      compiled.taskType === "direct_answer"
        ? {
            taskType: compiled.taskType,
            routeReason: compiled.taskSpec.routeReason,
            evidenceTurnCount: compiled.taskSpec.evidenceTurnCount,
          }
        : {
            taskType: compiled.taskType,
            searchQuery: compiled.taskSpec.searchQuery,
          };

    return createToolResult({
      status: "success",
      summary:
        compiled.taskType === "direct_answer"
          ? `Task spec ready: ${compiled.taskSpec.routeReason}`
          : `Task spec ready: ${compiled.taskSpec.searchQuery}`,
      outputs: {
        taskSpec: compiled.taskSpec,
      },
      facts,
      stepStatus: "succeeded",
    });
  },
};
