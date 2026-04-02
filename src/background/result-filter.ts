import type {
  CommerceFilterDiagnostics,
  ExtractedItem,
  ResearchCandidate,
  ResearchFilterDiagnostics,
  SearchTaskSpec,
} from "../shared/types";

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
  return `${spec.budgetMin ?? 0}-${spec.budgetMax ?? "∞"} 元`;
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
