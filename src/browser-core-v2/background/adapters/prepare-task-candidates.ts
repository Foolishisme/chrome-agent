import { LIMITS } from "../../../shared/constants";
import { RuntimeError } from "../../../shared/errors";
import type {
  ActionResult,
  CommerceFilterDiagnostics,
  ExtractedItem,
  PublicResearchTaskSpec,
  ResearchCandidate,
  ResearchFilterDiagnostics,
  SearchTaskSpec,
  SessionMemory,
  SiteOverviewTaskSpec,
  SnapshotData,
} from "../../../shared/types";
import { reorderResearchCandidates, reorderSiteCandidates } from "../../../background/llm-client";
import { dedupeIssues } from "../../../background/tools/result-builders";
import { ensureUsableSnapshotWithDialogRecovery, scrollForMoreCandidates } from "../../../background/tools/search-flow";
import type { StepOptions, ToolExecutionContext } from "../../../background/tools/shared";

export interface CandidatePreparationContext {
  memory: SessionMemory;
  signal: AbortSignal;
  scanPage(): Promise<SnapshotData>;
  ensureUsableSnapshot(): Promise<SnapshotData>;
  executeAction(action: { type: "EXTRACT_LIST"; limit?: number } | { type: "EXTRACT_SEARCH_RESULTS"; limit?: number } | { type: "EXTRACT_SITE_NAV_LINKS"; limit?: number; baseUrl?: string } | { type: "SCROLL"; direction: "up" | "down"; amount?: number } | { type: "RECOVER_CLOSE_DIALOG" } | { type: "NAVIGATE"; url: string }, stepSummary: string): Promise<ActionResult>;
  settleAfterAction(action: { type: "EXTRACT_LIST"; limit?: number } | { type: "EXTRACT_SEARCH_RESULTS"; limit?: number } | { type: "EXTRACT_SITE_NAV_LINKS"; limit?: number; baseUrl?: string } | { type: "SCROLL"; direction: "up" | "down"; amount?: number } | { type: "RECOVER_CLOSE_DIALOG" } | { type: "NAVIGATE"; url: string }): Promise<void>;
  appendLog: ToolExecutionContext["appendLog"];
  recordStep(options: StepOptions): void;
  pushState(stepSummary?: string): Promise<void>;
}

export interface PreparedPublicResearchCandidates {
  candidates: ResearchCandidate[];
  diagnostics: ResearchFilterDiagnostics;
  reason: string;
  source: "llm-lite" | "rule";
}

export interface PreparedSiteOverviewCandidates {
  homepageCandidate: ResearchCandidate;
  candidates: ResearchCandidate[];
  diagnostics: ResearchFilterDiagnostics;
  reason: string;
  source: "llm-lite" | "rule";
  targetDomain: string;
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

function getHostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isSameOrTrustedSubdomain(url: string, targetDomain: string | undefined) {
  if (!targetDomain) {
    return true;
  }

  const hostname = getHostname(url);
  const normalizedTarget = targetDomain.replace(/^www\./, "");
  return hostname === normalizedTarget || hostname.endsWith(`.${normalizedTarget}`);
}

function isLowValueSiteLink(candidate: ResearchCandidate) {
  const text = `${candidate.title} ${candidate.linkText ?? ""} ${candidate.url}`.toLowerCase();
  return /login|sign.?in|sign.?up|account|cookie|privacy|terms|policy|legal|careers?|jobs?|mailto:|facebook|twitter|x\.com|linkedin|instagram|youtube|weibo|wechat|github\.com|濞夈劌鍞絴閻ц缍峾闂呮劗顫唡閺夆剝顑檤濞夋洖绶閹锋稖浠抾閼卞奔缍厊缁€鎯х崯|閼辨梻閮撮幋鎴滄粦|contact/.test(text);
}

function pathDepth(url: string) {
  try {
    return new URL(url).pathname.split("/").filter(Boolean).length;
  } catch {
    return 99;
  }
}

function scoreSiteCandidate(candidate: ResearchCandidate, goal: string) {
  const text = `${candidate.title} ${candidate.linkText ?? ""} ${candidate.url}`.toLowerCase();
  let score = 0;

  if (candidate.linkLocation === "header" || candidate.linkLocation === "nav") {
    score += 40;
  } else if (candidate.linkLocation === "main") {
    score += 20;
  } else if (candidate.linkLocation === "footer") {
    score -= 10;
  }

  if (/products?|product|platform|solutions?|docs?|documentation|pricing|features?|developers?|api/.test(text)) {
    score += 30;
  }
  if (/about|company|customers?|case|blog|news|resources?/.test(text)) {
    score += 10;
  }
  if (/login|sign.?in|sign.?up|account|privacy|terms|legal|careers?|jobs?/.test(text)) {
    score -= 60;
  }

  const normalizedGoal = goal.toLowerCase();
  for (const token of normalizedGoal.split(/\s+/).filter((item) => item.length >= 3)) {
    if (text.includes(token)) {
      score += 5;
    }
  }

  const depth = pathDepth(candidate.url);
  if (depth <= 1) {
    score += 12;
  } else if (depth === 2) {
    score += 6;
  } else if (depth >= 4) {
    score -= 10;
  }

  return score;
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

export function filterExtractedItems(items: ExtractedItem[], taskSpec: SearchTaskSpec) {
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

export function filterResearchCandidates(candidates: ResearchCandidate[], candidateLimit: number) {
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

export function filterSiteNavCandidates(
  candidates: ResearchCandidate[],
  taskSpec: SiteOverviewTaskSpec,
  options: {
    homepageUrl: string;
    goal: string;
  },
) {
  const seen = new Set<string>();
  let skippedExternalCount = 0;
  let skippedDuplicateCount = 0;
  let skippedPdfCount = 0;
  let skippedInvalidCount = 0;
  let skippedLowValueCount = 0;
  const targetDomain = taskSpec.targetDomain ?? getHostname(options.homepageUrl);

  const scoredCandidates: ResearchCandidate[] = [];

  for (const candidate of candidates) {
    const normalizedUrl = normalizeResearchUrl(candidate.url);
    if (!normalizedUrl) {
      skippedInvalidCount += 1;
      continue;
    }

    if (normalizedUrl === normalizeResearchUrl(options.homepageUrl)) {
      skippedDuplicateCount += 1;
      continue;
    }

    if (!isSameOrTrustedSubdomain(normalizedUrl, targetDomain)) {
      skippedExternalCount += 1;
      continue;
    }

    if (isPdfUrl(normalizedUrl)) {
      skippedPdfCount += 1;
      continue;
    }

    if (isLowValueSiteLink({ ...candidate, url: normalizedUrl })) {
      skippedLowValueCount += 1;
      continue;
    }

    if (seen.has(normalizedUrl)) {
      skippedDuplicateCount += 1;
      continue;
    }

    seen.add(normalizedUrl);
    scoredCandidates.push({
      ...candidate,
      url: normalizedUrl,
      source: getHostname(normalizedUrl),
      score: scoreSiteCandidate({ ...candidate, url: normalizedUrl }, options.goal),
    });
  }

  scoredCandidates.sort((left, right) => (right.score ?? 0) - (left.score ?? 0) || left.rank - right.rank);

  return {
    candidates: scoredCandidates.slice(0, taskSpec.candidateLimit),
    diagnostics: {
      kind: "research" as const,
      inputCount: candidates.length,
      dedupedCount: seen.size,
      finalCount: Math.min(scoredCandidates.length, taskSpec.candidateLimit),
      skippedAdCount: 0,
      skippedInternalCount: skippedExternalCount + skippedLowValueCount,
      skippedDuplicateCount,
      skippedPdfCount,
      skippedInvalidCount,
    } satisfies ResearchFilterDiagnostics,
    targetDomain,
  };
}

function buildHomepageCandidate(snapshot: SnapshotData): ResearchCandidate {
  return {
    title: snapshot.title || "Homepage",
    url: snapshot.url,
    snippet: "Site homepage",
    source: getHostname(snapshot.url) || undefined,
    displayUrl: snapshot.url,
    rank: 0,
    linkLocation: "header",
    score: 100,
  };
}

function toToolExecutionContext(context: CandidatePreparationContext): ToolExecutionContext {
  return {
    memory: context.memory,
    signal: context.signal,
    scanPage: context.scanPage,
    ensureUsableSnapshot: context.ensureUsableSnapshot,
    executeAction: context.executeAction,
    settleAfterAction: context.settleAfterAction,
    appendLog: context.appendLog,
    recordStep: context.recordStep,
    pushState: context.pushState,
  };
}

export async function preparePublicResearchCandidates(
  options: {
    goal: string;
    searchQuery: string;
    candidates: ResearchCandidate[];
    taskSpec: PublicResearchTaskSpec;
    signal: AbortSignal;
  },
): Promise<PreparedPublicResearchCandidates> {
  const filtered = filterResearchCandidates(options.candidates, options.taskSpec.candidateLimit);
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

export async function prepareSiteOverviewCandidates(
  options: {
    goal: string;
    homepageSnapshot: SnapshotData;
    candidates: ResearchCandidate[];
    taskSpec: SiteOverviewTaskSpec;
    signal: AbortSignal;
  },
): Promise<PreparedSiteOverviewCandidates> {
  const filtered = filterSiteNavCandidates(options.candidates, options.taskSpec, {
    homepageUrl: options.homepageSnapshot.url,
    goal: options.goal,
  });
  const reordered = await reorderSiteCandidates(
    {
      goal: options.goal,
      targetDomain: filtered.targetDomain,
      candidates: filtered.candidates,
    },
    { signal: options.signal },
  );

  return {
    homepageCandidate: buildHomepageCandidate(options.homepageSnapshot),
    candidates: reordered.candidates.map((candidate, index) => ({
      ...candidate,
      rank: index + 1,
    })),
    diagnostics: filtered.diagnostics,
    reason: reordered.reason,
    source: reordered.source,
    targetDomain: filtered.targetDomain,
  };
}

export async function prepareCommerceCandidates(
  context: CandidatePreparationContext,
  taskSpec: SearchTaskSpec,
): Promise<PrepareCommerceCandidatesResult> {
  const toolContext = toToolExecutionContext(context);
  let snapshot = await ensureUsableSnapshotWithDialogRecovery(toolContext, "Extraction page blocked by an overlay.");
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
    const recovery = await scrollForMoreCandidates(toolContext, snapshot, "No product items were extracted.");
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
