import type {
  ConversationTurn,
  ExtractedItem,
  FinalResult,
  OutputMode,
  PublicResearchTaskSpec,
  ResearchSourceResult,
  ResultArtifact,
  SessionMemory,
  SiteOverviewTaskSpec,
  TaskSpec,
} from "../../shared/types";

export function buildRuleBasedSummary(goal: string, items: ExtractedItem[]) {
  const first = items[0];
  if (!first) {
    return `Completed the rule-based search for "${goal}", but not enough usable items were collected.`;
  }

  const highlights = items
    .slice(0, 3)
    .map((item, index) => `${index + 1}. ${item.title} (${item.priceText}${item.shopText ? `, ${item.shopText}` : ""})`)
    .join("; ");

  return `Completed the rule-based search for "${goal}" and kept ${items.length} candidates. Top picks: ${highlights}.`;
}

export function buildCommerceFinalMarkdown(goal: string, items: ExtractedItem[], summary: string) {
  const lines = [
    "## Goal",
    goal,
    "",
    "## Recommendations",
    ...(items.length > 0
      ? items.map((item, index) => {
          const parts = [`${index + 1}. [${item.title}](${item.url})`, `price: ${item.priceText}`];
          if (item.shopText) {
            parts.push(`shop: ${item.shopText}`);
          }
          if (item.summary) {
            parts.push(`note: ${item.summary}`);
          }
          return `- ${parts.join(" | ")}`;
        })
      : ["- No usable items"]),
    "",
    "## Summary",
    summary,
  ];

  return lines.join("\n");
}

export function buildDirectAnswerFallbackSummary(goal: string, conversationTurns: ConversationTurn[]) {
  if (conversationTurns.length === 0) {
    return `当前未能稳定生成“${goal}”的直接回答，建议改为搜索模式以获取更可靠信息。`;
  }

  return `基于当前会话已有信息，已直接整理“${goal}”的回答。`;
}

export function buildDirectAnswerFinalMarkdown(goal: string, conversationTurns: ConversationTurn[], summary: string) {
  const recentTurns = conversationTurns.slice(-3);
  const lines = ["## 直接回答", summary, "", "## 当前问题", goal];

  if (recentTurns.length > 0) {
    lines.push("", "## 当前会话依据");
    lines.push(
      ...recentTurns.map(
        (turn, index) =>
          `- ${index + 1}. ${new Date(turn.savedAt).toISOString()} | 用户：${turn.goal} | 回答摘要：${turn.answerSummary}`,
      ),
    );
  }

  return lines.join("\n");
}

export function dedupeIssues(issues: string[]) {
  return Array.from(new Set(issues.filter(Boolean)));
}

export function countSuccessfulResearchSources(sources: ResearchSourceResult[]) {
  return sources.filter((source) => source.status === "success").length;
}

export function buildResearchFallbackSummary(goal: string, sources: ResearchSourceResult[], unresolvedIssues: string[]) {
  if (countSuccessfulResearchSources(sources) === 0) {
    return `No reliable sources were collected for "${goal}".`;
  }

  const titles = sources.slice(0, 3).map((source) => source.pageTitle || source.candidate.title).join(", ");
  if (unresolvedIssues.length > 0) {
    return `Completed a partial research summary for "${goal}" based on ${sources.length} sources. Key references: ${titles}. ${unresolvedIssues.length} open issues remain.`;
  }

  return `Completed the research summary for "${goal}" based on ${sources.length} sources. Key references: ${titles}.`;
}

export function buildResearchFinalMarkdown(summary: string, sources: ResearchSourceResult[], unresolvedIssues: string[]) {
  const lines = [
    "## Summary",
    summary,
    "",
    "## Source Excerpts",
    ...(sources.length > 0
      ? sources.map((source, index) => {
          const title = source.pageTitle || source.candidate.title;
          const detail =
            source.status === "success"
              ? source.bodyExcerpt || "No excerpt was captured."
              : `${source.bodyExcerpt || "Only partial facts were extracted."}${source.unresolvedIssues.length > 0 ? ` (${source.unresolvedIssues.join("; ")})` : ""}`;
          return `- ${index + 1}. ${title}: ${detail}`;
        })
      : ["- No reliable sources"]),
    "",
    "## Source Links",
    ...(sources.length > 0
      ? sources.map((source, index) => `- ${index + 1}. [${source.pageTitle || source.candidate.title}](${source.sourceUrl})`)
      : ["- No reliable sources"]),
    "",
    "## Open Issues",
    ...(unresolvedIssues.length > 0 ? unresolvedIssues.map((issue) => `- ${issue}`) : ["- None"]),
  ];

  return lines.join("\n");
}

export function getFinalStatusForResearch(
  taskSpec: PublicResearchTaskSpec | SiteOverviewTaskSpec,
  sources: ResearchSourceResult[],
  unresolvedIssues: string[],
) {
  const successfulSourceCount = countSuccessfulResearchSources(sources);

  if (successfulSourceCount === 0) {
    return "failed" as const;
  }

  if (taskSpec.taskType === "site_overview") {
    const homepage = sources[0];
    if (!homepage || homepage.status !== "success") {
      return "partial" as const;
    }
  }

  if (
    successfulSourceCount < taskSpec.sourceTargetCount ||
    unresolvedIssues.length > 0 ||
    sources.some((source) => source.status !== "success")
  ) {
    return "partial" as const;
  }

  return "success" as const;
}

function createMarkdownArtifact(memory: SessionMemory, markdown: string, summary: string): ResultArtifact {
  return {
    id:
      memory.taskType === "commerce_search"
        ? "commerce-result-markdown"
        : memory.taskType === "site_overview"
          ? "site-overview-result-markdown"
        : memory.taskType === "public_research"
          ? "research-result-markdown"
          : "direct-answer-markdown",
    kind: "markdown",
    title:
      memory.taskType === "commerce_search"
        ? "Commerce Result Report"
        : memory.taskType === "site_overview"
          ? "Site Overview Report"
        : memory.taskType === "public_research"
          ? "Research Result Report"
          : "Direct Answer",
    fileName:
      memory.taskType === "commerce_search"
        ? "commerce-result.md"
        : memory.taskType === "site_overview"
          ? "site-overview-result.md"
        : memory.taskType === "public_research"
          ? "research-result.md"
          : "direct-answer.md",
    mimeType: "text/markdown",
    content: markdown,
    summary,
  };
}

export function getOutputMode(taskSpec: TaskSpec | undefined): OutputMode {
  return taskSpec?.outputMode ?? "inline";
}

export function createFinalResult(
  memory: SessionMemory,
  options: {
    status: FinalResult["status"];
    summary: string;
    markdown: string;
    keyResults?: string[];
    errorsOrBlockers?: string[];
    suggestedNextAction?: string;
  },
): FinalResult {
  const completedSteps = memory.plan.filter((step) => step.status === "succeeded").map((step) => step.stepId);
  const remainingOrFailedSteps = memory.plan.filter((step) => step.status !== "succeeded").map((step) => step.stepId);
  const outputMode = getOutputMode(memory.taskSpec);
  const artifacts = outputMode === "artifact" ? [createMarkdownArtifact(memory, options.markdown, options.summary)] : [];

  return {
    outputMode,
    status: options.status,
    summary: options.summary,
    markdown: outputMode === "inline" ? options.markdown : "",
    keyResults: options.keyResults ?? [],
    completedSteps,
    remainingOrFailedSteps,
    errorsOrBlockers: dedupeIssues(options.errorsOrBlockers ?? memory.unresolvedIssues),
    artifacts,
    suggestedNextAction:
      options.suggestedNextAction ??
      (options.status === "success"
        ? "Review the result and continue only if you need deeper follow-up."
        : "Retry with a narrower goal or manually open the target page before running again."),
  };
}

export function buildFallbackFinalResult(
  memory: SessionMemory,
  reason: string,
  status?: FinalResult["status"],
): FinalResult {
  const resolvedStatus =
    status ??
    (memory.taskType === "direct_answer"
      ? memory.conversationTurns.length > 0
        ? "partial"
        : "failed"
      : memory.taskType === "commerce_search"
        ? memory.extractedItems.length > 0
          ? "partial"
          : "failed"
        : memory.researchSources.length > 0
          ? "partial"
          : "failed");

  if (memory.taskType === "direct_answer") {
    const markdown = buildDirectAnswerFinalMarkdown(memory.goal, memory.conversationTurns, reason);
    const keyResults = memory.conversationTurns
      .slice(-3)
      .map((turn) => turn.answerSummary)
      .filter(Boolean)
      .slice(0, 3);
    return createFinalResult(memory, {
      status: resolvedStatus,
      summary: reason,
      markdown,
      keyResults,
      errorsOrBlockers: [...memory.unresolvedIssues, ...memory.failures.map((failure) => failure.message), reason],
    });
  }

  if (memory.taskType === "commerce_search") {
    const markdown = buildCommerceFinalMarkdown(memory.goal, memory.extractedItems, reason);
    const keyResults = memory.extractedItems.slice(0, 3).map((item) => item.title);
    return createFinalResult(memory, {
      status: resolvedStatus,
      summary: reason,
      markdown,
      keyResults,
      errorsOrBlockers: [...memory.unresolvedIssues, ...memory.failures.map((failure) => failure.message), reason],
    });
  }

  const unresolvedIssues = dedupeIssues([
    ...memory.unresolvedIssues,
    ...memory.researchSources.flatMap((source) => source.unresolvedIssues),
    ...memory.failures.map((failure) => failure.message),
    reason,
  ]);
  const markdown = buildResearchFinalMarkdown(reason, memory.researchSources, unresolvedIssues);
  const keyResults = memory.researchSources
    .filter((source) => source.status === "success")
    .slice(0, 3)
    .map((source) => source.pageTitle || source.candidate.title);

  return createFinalResult(memory, {
    status: resolvedStatus,
    summary: reason,
    markdown,
    keyResults,
    errorsOrBlockers: unresolvedIssues,
  });
}
