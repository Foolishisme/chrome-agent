import { RuntimeError } from "../../../shared/runtime-error";
import type {
  DirectAnswerTaskSpec,
  FinalResult,
  FinalSynthesisInput,
  PublicResearchTaskSpec,
  ResearchEvidenceBundle,
  ResearchSourceResult,
  SearchTaskSpec,
  SessionMemory,
  SiteOverviewTaskSpec,
  SourceFactCard,
} from "../../../shared/agent-domain-model";
import { streamFinalMarkdown } from "../../llm/llm-client";
import {
  buildCommerceFinalMarkdown,
  buildDirectAnswerFallbackSummary,
  buildDirectAnswerFinalMarkdown,
  buildResearchFallbackSummary,
  buildResearchFinalMarkdown,
  buildRuleBasedSummary,
  createFinalResult,
  dedupeIssues,
  deriveKeyResultsFromMarkdown,
  deriveSummaryFromMarkdown,
  getFinalStatusForResearch,
} from "../final-result-builders";
import { isCommerceTask, isDirectAnswerTask, isReadableResearchTask } from "../task-spec-guards";
import type { ToolExecutionContext } from "../tool-execution-context";

type FinalizeTaskResultContext = Pick<ToolExecutionContext, "memory" | "signal" | "appendLog" | "recordStep" | "pushState"> & {
  publishFinalDraft?: (markdown: string) => Promise<void>;
};

export interface FinalizeTaskResultOutput {
  finalResult: FinalResult;
  summary: string;
  finalStatus: FinalResult["status"];
}

const FINAL_DRAFT_FLUSH_INTERVAL_MS = 250;
const FINAL_DRAFT_FLUSH_CHAR_DELTA = 80;

function compactText(text: string | undefined, maxLength: number) {
  const normalized = (text ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }

  return normalized.length > maxLength ? `${normalized.slice(0, Math.max(0, maxLength - 3))}...` : normalized;
}

function buildPromptFactCard(source: ResearchSourceResult): SourceFactCard {
  if (source.sourceFactCard) {
    return source.sourceFactCard;
  }

  const title = source.pageTitle || source.candidate.title;
  const compactFact = compactText(source.bodyExcerpt, 220);
  return {
    title,
    url: source.sourceUrl,
    summary: compactFact || `No readable facts were extracted from ${title}.`,
    facts: compactFact
      ? [
          {
            text: compactFact,
            evidenceUrl: source.sourceUrl,
            evidenceTitle: title,
          },
        ]
      : [],
    caveats: source.unresolvedIssues,
    status: source.status === "success" ? "success" : "partial",
  };
}

function buildResearchEvidenceSources(sources: ResearchSourceResult[]) {
  return sources.map((source) => ({
    title: source.pageTitle || source.candidate.title,
    url: source.sourceUrl,
    status: source.status,
    textLength: source.textLength,
    unresolvedIssues: source.unresolvedIssues,
    sourceFactCard: buildPromptFactCard(source),
  }));
}

function buildResearchEvidenceForPrompt(
  taskSpec: PublicResearchTaskSpec | SiteOverviewTaskSpec,
  evidence: ResearchEvidenceBundle | undefined,
  sources: ResearchSourceResult[],
) {
  if (taskSpec.taskType === "public_research" && evidence) {
    return {
      kind: "public_research",
      query: evidence.query,
      pages: evidence.pages.map((page) => ({
        title: page.title,
        url: page.url,
        status: page.status,
        trimmedSummary: page.trimmedSummary,
        keyFacts: page.keyFacts,
        caveats: page.caveats,
      })),
    };
  }

  return {
    kind: taskSpec.taskType,
    sources: buildResearchEvidenceSources(sources),
  };
}

function buildConversationContext(turns: SessionMemory["conversationTurns"]) {
  return (turns ?? [])
    .slice(-3)
    .map((turn) => `Turn ${turn.turnId}\nUser: ${turn.goal}\nAssistant final result: ${turn.answerSummary}`)
    .join("\n\n");
}

function buildDirectAnswerInput(
  memory: SessionMemory,
  taskSpec: DirectAnswerTaskSpec,
  recentTurns: SessionMemory["conversationTurns"],
): FinalSynthesisInput {
  return {
    goal: memory.goal,
    taskType: memory.taskType,
    taskSpec,
    evidence: {
      kind: "direct_answer",
      recentTurns: recentTurns.map((turn) => ({
        turnId: turn.turnId,
        savedAt: new Date(turn.savedAt).toISOString(),
        userGoal: turn.goal,
        assistantSummary: turn.answerSummary,
        assistantMarkdown: compactText(turn.answerMarkdown, 600),
      })),
    },
    unresolvedIssues: memory.unresolvedIssues,
    conversationContext: buildConversationContext(memory.conversationTurns),
  };
}

function buildResearchInput(
  memory: SessionMemory,
  taskSpec: PublicResearchTaskSpec | SiteOverviewTaskSpec,
  unresolvedIssues: string[],
): FinalSynthesisInput {
  return {
    goal: memory.goal,
    taskType: memory.taskType,
    taskSpec,
    evidence: buildResearchEvidenceForPrompt(taskSpec, memory.researchEvidence, memory.researchSources),
    unresolvedIssues,
    conversationContext: buildConversationContext(memory.conversationTurns),
  };
}

function buildCommerceInput(memory: SessionMemory, taskSpec: SearchTaskSpec): FinalSynthesisInput {
  return {
    goal: memory.goal,
    taskType: memory.taskType,
    taskSpec,
    evidence: {
      kind: "commerce_search",
      items: memory.extractedItems.map((item) => ({
        title: item.title,
        url: item.url,
        priceText: item.priceText,
        shopText: item.shopText,
        summary: item.summary,
      })),
    },
    unresolvedIssues: memory.unresolvedIssues,
    conversationContext: buildConversationContext(memory.conversationTurns),
  };
}

function capAtPartial(status: FinalResult["status"]) {
  return status === "success" ? "partial" : status;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown final summary error";
}

async function synthesizeStreamingMarkdown(context: FinalizeTaskResultContext, input: FinalSynthesisInput) {
  let draft = "";
  let lastPublishedDraft = "";
  let lastPublishedAt = 0;

  const publishDraft = async (force = false) => {
    if (!context.publishFinalDraft || !draft.trim()) {
      return;
    }

    const now = Date.now();
    if (
      !force &&
      now - lastPublishedAt < FINAL_DRAFT_FLUSH_INTERVAL_MS &&
      draft.length - lastPublishedDraft.length < FINAL_DRAFT_FLUSH_CHAR_DELTA
    ) {
      return;
    }

    lastPublishedAt = now;
    lastPublishedDraft = draft;
    await context.publishFinalDraft(draft);
  };

  try {
    const response = await streamFinalMarkdown(input, {
      signal: context.signal,
      onDelta: async (delta) => {
        draft += delta;
        await publishDraft();
      },
    });

    draft = response.markdown || draft;
    await publishDraft(true);
    return {
      markdown: draft.trim(),
      interrupted: false,
      provider: response.provider,
      model: response.model,
    };
  } catch (error) {
    if (draft.trim()) {
      await publishDraft(true);
      return {
        markdown: draft.trim(),
        interrupted: true,
        errorMessage: getErrorMessage(error),
      };
    }

    throw error;
  }
}

function clearStreamingDraft(memory: SessionMemory) {
  memory.streamingFinalDraft = undefined;
}

function commitFinalResult(
  context: FinalizeTaskResultContext,
  options: {
    status: FinalResult["status"];
    summary: string;
    markdown: string;
    keyResults: string[];
    errorsOrBlockers: string[];
    suggestedNextAction: string;
    recordSummary: string;
    recordSnapshot: string;
  },
) {
  clearStreamingDraft(context.memory);
  const finalResult = createFinalResult(context.memory, {
    status: options.status,
    summary: options.summary,
    markdown: options.markdown,
    keyResults: options.keyResults,
    errorsOrBlockers: options.errorsOrBlockers,
    suggestedNextAction: options.suggestedNextAction,
  });

  context.memory.finalResult = finalResult;
  context.memory.recoveryHint = undefined;
  context.memory.lastError = options.status === "failed" ? options.summary : undefined;

  context.recordStep({
    stepSummary: "Final output generated.",
    nextIntent: "Stop the session.",
    expectedOutcome: "A Markdown result is ready for the side panel.",
    action: {
      type: "DONE",
      summary: options.summary,
      ...(context.memory.taskType === "commerce_search" ? { items: context.memory.extractedItems } : {}),
    },
    snapshotSummary: options.recordSnapshot,
  });

  return {
    finalResult,
    summary: options.recordSummary,
    finalStatus: options.status,
  };
}

async function finalizeDirectAnswer(
  context: FinalizeTaskResultContext,
  taskSpec: DirectAnswerTaskSpec,
): Promise<FinalizeTaskResultOutput> {
  await context.pushState("Generate the final direct answer.");

  const recentTurns = (context.memory.conversationTurns ?? []).slice(-3);
  const fallbackSummary = buildDirectAnswerFallbackSummary(context.memory.goal, recentTurns);
  const fallbackMarkdown = buildDirectAnswerFinalMarkdown(context.memory.goal, recentTurns, fallbackSummary);
  const fallbackKeyResults = recentTurns.map((turn) => turn.answerSummary).filter(Boolean).slice(0, 3);

  let summary = fallbackSummary;
  let markdown = fallbackMarkdown;
  let keyResults = fallbackKeyResults;
  let finalStatus: FinalResult["status"] = "success";
  let errorsOrBlockers = context.memory.unresolvedIssues;

  try {
    const streamed = await synthesizeStreamingMarkdown(context, buildDirectAnswerInput(context.memory, taskSpec, recentTurns));
    markdown = streamed.markdown;
    summary = deriveSummaryFromMarkdown(markdown, fallbackSummary);
    keyResults = deriveKeyResultsFromMarkdown(markdown, fallbackKeyResults);
    if (streamed.interrupted) {
      finalStatus = "partial";
      errorsOrBlockers = dedupeIssues([...context.memory.unresolvedIssues, `Final answer streaming was interrupted: ${streamed.errorMessage}`]);
      context.appendLog("llm", "warn", "Used partial streamed final direct answer after interruption.", {
        message: streamed.errorMessage,
        evidenceTurnCount: recentTurns.length,
      });
    } else {
      context.appendLog("llm", "info", "Streamed the final direct answer.", {
        provider: streamed.provider,
        model: streamed.model,
        evidenceTurnCount: recentTurns.length,
      });
    }
  } catch (error) {
    finalStatus = recentTurns.length > 0 ? "partial" : "failed";
    errorsOrBlockers = ["Direct answer relied on fallback output."];
    context.appendLog("llm", "warn", "Fell back after direct-answer streaming failed.", {
      message: getErrorMessage(error),
      evidenceTurnCount: recentTurns.length,
    });
  }

  return commitFinalResult(context, {
    status: finalStatus,
    summary,
    markdown,
    keyResults,
    errorsOrBlockers,
    suggestedNextAction:
      finalStatus === "success"
        ? "继续追问即可；如需最新外部信息，请明确要求联网搜索。"
        : "如果需要更可靠或更新的信息，请改用联网搜索。",
    recordSummary: "Final direct answer generated.",
    recordSnapshot: `${finalStatus} -> direct-answer`,
  });
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
  const fallbackSummary = buildResearchFallbackSummary(context.memory.goal, context.memory.researchSources, unresolvedIssues);
  const fallbackMarkdown = buildResearchFinalMarkdown(fallbackSummary, context.memory.researchSources, unresolvedIssues);
  const fallbackKeyResults = context.memory.researchSources
    .filter((source) => source.status === "success")
    .slice(0, 3)
    .map((source) => source.pageTitle || source.candidate.title);

  let summary = fallbackSummary;
  let markdown = fallbackMarkdown;
  let keyResults = fallbackKeyResults;
  let finalStatus: FinalResult["status"] = getFinalStatusForResearch(taskSpec, context.memory.researchSources, unresolvedIssues);
  let errorsOrBlockers = unresolvedIssues;

  if (context.memory.researchSources.some((source) => source.status === "success")) {
    try {
      const streamed = await synthesizeStreamingMarkdown(context, buildResearchInput(context.memory, taskSpec, unresolvedIssues));
      markdown = streamed.markdown;
      summary = deriveSummaryFromMarkdown(markdown, fallbackSummary);
      keyResults = deriveKeyResultsFromMarkdown(markdown, fallbackKeyResults);
      if (streamed.interrupted) {
        finalStatus = capAtPartial(finalStatus);
        errorsOrBlockers = dedupeIssues([...unresolvedIssues, `Final answer streaming was interrupted: ${streamed.errorMessage}`]);
        context.appendLog("llm", "warn", "Used partial streamed research summary after interruption.", {
          message: streamed.errorMessage,
          sourceCount: context.memory.researchSources.length,
        });
      } else {
        context.appendLog("llm", "info", "Streamed the final research summary.", {
          sourceCount: context.memory.researchSources.length,
          provider: streamed.provider,
          model: streamed.model,
        });
      }
    } catch (error) {
      context.appendLog("llm", "warn", "Fell back to deterministic research output after streamed summary failed.", {
        message: getErrorMessage(error),
      });
    }
  }

  context.memory.unresolvedIssues = unresolvedIssues;
  return commitFinalResult(context, {
    status: finalStatus,
    summary,
    markdown,
    keyResults,
    errorsOrBlockers,
    suggestedNextAction:
      finalStatus === "success"
        ? "Review the cited sources if you need deeper follow-up."
        : "Retry with a narrower query or open a few candidate sources manually before running again.",
    recordSummary: "Final research result generated.",
    recordSnapshot: `${finalStatus} -> markdown`,
  });
}

async function finalizeCommerce(
  context: FinalizeTaskResultContext,
  taskSpec: SearchTaskSpec,
): Promise<FinalizeTaskResultOutput> {
  await context.pushState("Aggregate the structured task results into the final output.");

  const fallbackSummary =
    context.memory.extractedItems.length === 0
      ? `No usable commerce candidates were collected for "${context.memory.goal}".`
      : buildRuleBasedSummary(context.memory.goal, context.memory.extractedItems);
  const fallbackMarkdown = buildCommerceFinalMarkdown(context.memory.goal, context.memory.extractedItems, fallbackSummary);
  const fallbackKeyResults = context.memory.extractedItems.slice(0, 3).map((item) => item.title);

  let summary = fallbackSummary;
  let markdown = fallbackMarkdown;
  let keyResults = fallbackKeyResults;
  let finalStatus: FinalResult["status"] =
    context.memory.extractedItems.length === 0 ? "failed" : context.memory.extractedItems.length < taskSpec.topK ? "partial" : "success";
  let errorsOrBlockers = context.memory.unresolvedIssues;

  if (context.memory.extractedItems.length > 0) {
    try {
      const streamed = await synthesizeStreamingMarkdown(context, buildCommerceInput(context.memory, taskSpec));
      markdown = streamed.markdown;
      summary = deriveSummaryFromMarkdown(markdown, fallbackSummary);
      keyResults = deriveKeyResultsFromMarkdown(markdown, fallbackKeyResults);
      if (streamed.interrupted) {
        finalStatus = capAtPartial(finalStatus);
        errorsOrBlockers = dedupeIssues([...context.memory.unresolvedIssues, `Final answer streaming was interrupted: ${streamed.errorMessage}`]);
        context.appendLog("llm", "warn", "Used partial streamed commerce recommendation after interruption.", {
          message: streamed.errorMessage,
          itemCount: context.memory.extractedItems.length,
        });
      } else {
        context.appendLog("llm", "info", "Streamed the final commerce recommendation.", {
          itemCount: context.memory.extractedItems.length,
          provider: streamed.provider,
          model: streamed.model,
        });
      }
    } catch (error) {
      context.appendLog("llm", "warn", "Fell back to rule-based commerce output after streamed summary failed.", {
        message: getErrorMessage(error),
      });
    }
  }

  return commitFinalResult(context, {
    status: finalStatus,
    summary,
    markdown,
    keyResults,
    errorsOrBlockers,
    suggestedNextAction:
      finalStatus === "success"
        ? "Review the recommended items and open the product pages you want to compare further."
        : "Retry with a narrower budget, brand, or category if you need stronger candidates.",
    recordSummary: "Final commerce result generated.",
    recordSnapshot: `${finalStatus} -> markdown`,
  });
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
