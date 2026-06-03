import type {
  CommerceFilterDiagnostics,
  ExtractedItem,
  ResearchCandidate,
  ResearchFilterDiagnostics,
  SearchTaskSpec,
} from "../../../shared/agent-domain-model";
import { reorderResearchCandidates } from "../../llm/llm-client";
import { dedupeIssues } from "../final-result-builders";
import { ensureUsableSnapshotWithDialogRecovery, scrollForMoreCandidates } from "../commerce-search-page-flow";
import type { ToolExecutionContext } from "../tool-execution-context";

export interface PreparedPublicResearchCandidates {
  candidates: ResearchCandidate[];
  diagnostics: ResearchFilterDiagnostics;
  reason: string;
  source: "llm-lite" | "rule";
}

export interface PrepareCommerceCandidatesResult {
  status: "success" | "partial" | "retryable_error";
  summary: string;
  items: ExtractedItem[];
  diagnostics: CommerceFilterDiagnostics;
  rawCount: number;
  errorCode?: string;
  retryHint?: string;
}

function normalizeResearchUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return "";
    }
    parsed.hash = "";
    const nextSearch = new URLSearchParams();
    Array.from(parsed.searchParams.entries())
      .filter(([key]) => !/^utm_/i.test(key) && !["gclid", "ved", "usg"].includes(key))
      .forEach(([key, value]) => nextSearch.append(key, value));
    parsed.search = nextSearch.toString();
    return parsed.toString();
  } catch {
    return "";
  }
}

function isGoogleInternal(url: string) {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./, "");
    return hostname === "google.com" || hostname.endsWith(".google.com");
  } catch {
    return true;
  }
}

function isPdfUrl(url: string) {
  return /\.pdf(?:$|[?#])/i.test(url);
}

function parsePrice(priceText: string) {
  const matched = priceText.replace(/,/g, "").match(/(\d{2,6}(?:\.\d{1,2})?)/);
  return matched ? Number(matched[1]) : undefined;
}

function dedupeItems(items: ExtractedItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.url}|${item.title}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function formatBudgetRange(spec: SearchTaskSpec) {
  if (!spec.budgetMin && !spec.budgetMax) {
    return undefined;
  }
  return `${spec.budgetMin ?? 0}-${spec.budgetMax ?? "max"} RMB`;
}

function filterExtractedItems(items: ExtractedItem[], taskSpec: SearchTaskSpec) {
  const dedupedItems = dedupeItems(items);
  const budgetMatchedItems =
    taskSpec.budgetMin || taskSpec.budgetMax
      ? dedupedItems.filter((item) => {
          const price = parsePrice(item.priceText);
          if (price === undefined) {
            return false;
          }
          if (taskSpec.budgetMin !== undefined && price < taskSpec.budgetMin) {
            return false;
          }
          if (taskSpec.budgetMax !== undefined && price > taskSpec.budgetMax) {
            return false;
          }
          return true;
        })
      : dedupedItems;

  const candidateItems = budgetMatchedItems.length > 0 ? budgetMatchedItems : dedupedItems;
  const finalItems = candidateItems.slice(0, taskSpec.llmInputLimit);

  const diagnostics: CommerceFilterDiagnostics = {
    kind: "commerce",
    inputCount: items.length,
    dedupedCount: dedupedItems.length,
    budgetMatchedCount: budgetMatchedItems.length,
    finalCount: finalItems.length,
    requestedTopK: taskSpec.topK,
    llmInputLimit: taskSpec.llmInputLimit,
    budgetRangeText: formatBudgetRange(taskSpec),
  };

  return {
    items: finalItems,
    diagnostics,
  };
}

function filterResearchCandidates(candidates: ResearchCandidate[], candidateLimit: number) {
  const seen = new Set<string>();
  let skippedAdCount = 0;
  let skippedInternalCount = 0;
  let skippedDuplicateCount = 0;
  let skippedPdfCount = 0;
  let skippedInvalidCount = 0;

  const finalCandidates: ResearchCandidate[] = [];

  for (const candidate of candidates) {
    const normalizedUrl = normalizeResearchUrl(candidate.url);
    if (!normalizedUrl) {
      skippedInvalidCount += 1;
      continue;
    }

    if (candidate.isAd) {
      skippedAdCount += 1;
      continue;
    }

    if (isGoogleInternal(normalizedUrl)) {
      skippedInternalCount += 1;
      continue;
    }

    if (isPdfUrl(normalizedUrl)) {
      skippedPdfCount += 1;
      continue;
    }

    if (seen.has(normalizedUrl)) {
      skippedDuplicateCount += 1;
      continue;
    }

    seen.add(normalizedUrl);
    finalCandidates.push({
      ...candidate,
      url: normalizedUrl,
    });

    if (finalCandidates.length >= candidateLimit) {
      break;
    }
  }

  const diagnostics: ResearchFilterDiagnostics = {
    kind: "research",
    inputCount: candidates.length,
    dedupedCount: seen.size,
    finalCount: finalCandidates.length,
    skippedAdCount,
    skippedInternalCount,
    skippedDuplicateCount,
    skippedPdfCount,
    skippedInvalidCount,
  };

  return {
    candidates: finalCandidates,
    diagnostics,
  };
}

export async function preparePublicResearchCandidates(
  options: {
    goal: string;
    searchQuery: string;
    candidates: ResearchCandidate[];
    candidateLimit: number;
    signal: AbortSignal;
  },
): Promise<PreparedPublicResearchCandidates> {
  const filtered = filterResearchCandidates(options.candidates, options.candidateLimit);
  const reordered = await reorderResearchCandidates(
    {
      goal: options.goal,
      searchQuery: options.searchQuery,
      candidates: filtered.candidates,
    },
    { signal: options.signal },
  );

  return {
    candidates: reordered.candidates,
    diagnostics: filtered.diagnostics,
    reason: reordered.reason,
    source: reordered.source,
  };
}

export async function prepareCommerceCandidates(
  context: ToolExecutionContext,
  taskSpec: SearchTaskSpec,
): Promise<PrepareCommerceCandidatesResult> {
  let snapshot = await ensureUsableSnapshotWithDialogRecovery(context, "Extraction page blocked by an overlay.");
  if (snapshot.pageType !== "search") {
    return {
      status: "retryable_error",
      summary: `Expected a JD search page, received ${snapshot.pageType}.`,
      items: [],
      diagnostics: {
        kind: "commerce",
        inputCount: 0,
        dedupedCount: 0,
        budgetMatchedCount: 0,
        finalCount: 0,
        requestedTopK: taskSpec.topK,
        llmInputLimit: taskSpec.llmInputLimit,
        budgetRangeText: formatBudgetRange(taskSpec),
      },
      rawCount: 0,
      errorCode: "SEARCH_PAGE_UNEXPECTED",
      retryHint: "Return to the JD search results page before extracting items.",
    };
  }

  const extractAction = {
    type: "EXTRACT_LIST" as const,
    limit: taskSpec.extractLimit,
  };

  const extractionResult = await context.executeAction(extractAction, "Extract structured search result items.");
  snapshot = await context.scanPage();

  context.recordStep({
    stepSummary: "Structured extraction completed.",
    nextIntent: "Filter the extracted candidates.",
    expectedOutcome: "At least a few structured product items are available.",
    action: extractAction,
    actionResult: extractionResult,
    snapshot,
  });

  let rawItems = extractionResult.items ?? [];
  if (rawItems.length === 0) {
    const recovery = await scrollForMoreCandidates(context, snapshot, "No product items were extracted.");
    snapshot = recovery.snapshot;

    const retryResult = await context.executeAction(extractAction, "Extract structured search result items after scroll recovery.");
    snapshot = await context.scanPage();
    context.recordStep({
      stepSummary: "Structured extraction retried after scroll recovery.",
      nextIntent: "Filter the extracted candidates.",
      expectedOutcome: "At least a few structured product items are available.",
      action: extractAction,
      actionResult: retryResult,
      snapshot,
    });
    rawItems = retryResult.items ?? [];
  }

  const filtered = filterExtractedItems(rawItems, taskSpec);
  context.memory.rawExtractedItems = rawItems;
  context.memory.extractedItems = filtered.items;
  context.memory.filterDiagnostics = filtered.diagnostics;
  context.memory.recoveryHint = undefined;
  context.memory.lastError = extractionResult.success ? undefined : extractionResult.message;

  const minimumSummaryCount = Math.max(1, Math.min(3, taskSpec.topK));
  const keptCount = filtered.items.length;

  context.recordStep({
    stepSummary: "Candidate filtering completed.",
    nextIntent: "Generate the final recommendation.",
    expectedOutcome: "At least one clean candidate remains after filtering.",
    snapshotSummary: JSON.stringify(filtered.diagnostics),
  });

  if (keptCount === 0) {
    context.memory.unresolvedIssues = dedupeIssues([
      ...context.memory.unresolvedIssues,
      "No usable product candidates remained after filtering.",
    ]);
    return {
      status: "retryable_error",
      summary: "No usable product candidates remained after filtering.",
      items: [],
      diagnostics: filtered.diagnostics,
      rawCount: rawItems.length,
      errorCode: "NO_COMMERCE_CANDIDATES",
      retryHint: "Scroll once more or adjust the query before retrying.",
    };
  }

  return {
    status: keptCount >= minimumSummaryCount ? "success" : "partial",
    summary: `Prepared ${keptCount} commerce candidates.`,
    items: filtered.items,
    diagnostics: filtered.diagnostics,
    rawCount: rawItems.length,
  };
}
