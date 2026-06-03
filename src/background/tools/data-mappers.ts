import type {
  ResearchEvidenceBundle,
  ResearchCandidate,
  ResearchSourceResult,
  SessionMemory,
} from "../../shared/agent-domain-model";
import type {
  BrowserSearchResult,
  BrowserSiteOverviewToolOutput,
  BrowserWebDetailToolOutput,
} from "./first-party-tool-contracts";

export function toSourceCandidate(result: BrowserSearchResult, rank: number): ResearchCandidate {
  return {
    title: result.title,
    url: result.url,
    snippet: result.snippet,
    source: result.source,
    rank,
  };
}

export function collectIssuesFromProblems(
  coverage: { limitations?: string[] } | undefined,
  problems: Array<{ message: string }>,
) {
  return [
    ...(coverage?.limitations ?? []),
    ...problems.map((problem) => problem.message),
  ].filter(Boolean);
}

export function dedupeStrings(items: string[]) {
  return Array.from(new Set(items.filter(Boolean)));
}

export function mergeResearchSources(existing: ResearchSourceResult[], incoming: ResearchSourceResult[]) {
  const merged = new Map<string, ResearchSourceResult>();

  for (const source of existing) {
    merged.set(source.sourceUrl, source);
  }

  for (const source of incoming) {
    const current = merged.get(source.sourceUrl);
    if (!current) {
      merged.set(source.sourceUrl, source);
      continue;
    }

    const nextIsBetter =
      (source.status === "success" && current.status !== "success") || source.textLength > current.textLength;

    merged.set(source.sourceUrl, {
      ...(nextIsBetter ? source : current),
      unresolvedIssues: dedupeStrings([...current.unresolvedIssues, ...source.unresolvedIssues]),
    });
  }

  return Array.from(merged.values());
}

export function toResearchSourceResult(candidate: ResearchCandidate, detail: BrowserWebDetailToolOutput): ResearchSourceResult {
  const unresolvedIssues = collectIssuesFromProblems(detail.coverage, detail.problems);
  const facts = detail.keyFacts.map((fact) => ({
    text: fact.text,
    evidenceUrl: fact.evidenceUrl ?? candidate.url,
    evidenceTitle: fact.evidenceTitle ?? detail.pageTitle,
  }));

  return {
    candidate,
    status: detail.status === "success" ? "success" : detail.status === "partial" ? "partial" : "failed",
    pageTitle: detail.pageTitle,
    bodyExcerpt: detail.pageSummary,
    sourceUrl: candidate.url,
    unresolvedIssues,
    textLength: detail.pageSummary.length,
    sourceFactCard: {
      title: detail.pageTitle,
      url: candidate.url,
      summary: detail.pageSummary,
      facts,
      caveats: unresolvedIssues,
      status: detail.status === "success" ? "success" : "partial",
    },
  };
}

export function toResearchEvidenceBundle(query: string, sources: ResearchSourceResult[]): ResearchEvidenceBundle {
  const readable = sources.filter((source) => source.status === "success").length;
  const partial = sources.filter((source) => source.status === "partial").length;
  const failed = sources.filter((source) => source.status === "failed").length;
  return {
    query,
    pages: sources.map((source) => {
      const factCard = source.sourceFactCard;
      return {
        title: source.pageTitle || source.candidate.title,
        url: source.sourceUrl,
        source: source.candidate.source,
        rank: source.candidate.rank,
        status: source.status,
        trimmedSummary: factCard?.summary ?? source.bodyExcerpt,
        keyFacts: factCard?.facts ?? [],
        caveats: source.unresolvedIssues,
      };
    }),
    coverage: {
      readable,
      partial,
      failed,
      limitations: dedupeStrings(sources.flatMap((source) => source.unresolvedIssues)),
    },
  };
}

export function toSiteOverviewSources(result: BrowserSiteOverviewToolOutput): ResearchSourceResult[] {
  return result.pagesRead.map((page, index) => {
    const unresolvedIssues = [
      ...(page.status !== "success" ? [`${page.title} was only partially covered during site overview.`] : []),
      ...(index === 0 ? result.gaps : []),
    ];
    const summary =
      index === 0
        ? result.siteSummary
        : `${page.title} was included as the ${page.role} page during the same-site overview.`;

    return {
      candidate: {
        title: page.title,
        url: page.url,
        source: (() => {
          try {
            return new URL(page.url).hostname.replace(/^www\./, "");
          } catch {
            return undefined;
          }
        })(),
        rank: index + 1,
      },
      status: page.status,
      pageTitle: page.title,
      bodyExcerpt: summary,
      sourceUrl: page.url,
      unresolvedIssues,
      textLength: summary.length,
      sourceFactCard: {
        title: page.title,
        url: page.url,
        summary,
        facts: [
          {
            text: `${page.title} was classified as the ${page.role} page in the overview.`,
            evidenceUrl: page.url,
            evidenceTitle: page.title,
          },
        ],
        caveats: unresolvedIssues,
        status: page.status === "success" ? "success" : "partial",
      },
    };
  });
}

export function toCommerceShortlist(memory: SessionMemory) {
  return memory.extractedItems.map((item) => ({
    title: item.title,
    url: item.url,
    priceText: item.priceText,
    shopText: item.shopText,
    summary: item.summary,
  }));
}

export function toCommerceEvidence(memory: SessionMemory) {
  const evidence = [];
  if ("searchQuery" in (memory.taskSpec ?? {})) {
    evidence.push({
      text: `Candidates were collected for query "${(memory.taskSpec as { searchQuery?: string }).searchQuery ?? memory.goal}".`,
      evidenceTitle: "Commerce search helper",
    });
  }
  if (memory.filterDiagnostics?.kind === "commerce") {
    evidence.push({
      text: `Filter kept ${memory.filterDiagnostics.finalCount} items out of ${memory.filterDiagnostics.inputCount}.`,
      evidenceTitle: "Commerce filter diagnostics",
    });
  }
  return evidence;
}
