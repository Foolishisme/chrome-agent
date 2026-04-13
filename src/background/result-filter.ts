import type {
  CommerceFilterDiagnostics,
  ExtractedItem,
  ResearchCandidate,
  ResearchFilterDiagnostics,
  SearchTaskSpec,
  SiteOverviewTaskSpec,
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
  return /login|sign.?in|sign.?up|account|cookie|privacy|terms|policy|legal|careers?|jobs?|mailto:|facebook|twitter|x\.com|linkedin|instagram|youtube|weibo|wechat|github\.com|注册|登录|隐私|条款|法律|招聘|职位|社媒|联系我们|contact/.test(text);
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

  if (/products?|product|platform|solutions?|docs?|documentation|pricing|features?|developers?|api|产品|平台|解决方案|文档|价格|功能|开发者/.test(text)) {
    score += 30;
  }
  if (/about|company|customers?|case|blog|news|resources?|关于|公司|客户|案例|博客|新闻|资源/.test(text)) {
    score += 10;
  }
  if (/login|sign.?in|sign.?up|account|privacy|terms|legal|careers?|jobs?|注册|登录|隐私|条款|法律|招聘/.test(text)) {
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
    const scored = {
      ...candidate,
      url: normalizedUrl,
      source: getHostname(normalizedUrl),
      score: scoreSiteCandidate({ ...candidate, url: normalizedUrl }, options.goal),
    };
    scoredCandidates.push(scored);
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
