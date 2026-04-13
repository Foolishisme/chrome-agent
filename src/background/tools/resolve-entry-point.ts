import { RuntimeError } from "../../shared/errors";
import type { ResearchCandidate } from "../../shared/types";
import { filterResearchCandidates } from "../result-filter";
import { createToolResult, type AgentToolDefinition } from "./shared";
import { ensureUsableSnapshotWithDialogRecovery } from "./search-flow";
import { isSiteOverviewTask } from "./task-guards";

function normalizeDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function buildOfficialSearchUrl(query: string) {
  const url = new URL("https://www.google.com/search");
  url.searchParams.set("q", query);
  url.searchParams.set("hl", "zh-CN");
  return url.toString();
}

export const resolveEntryPointTool: AgentToolDefinition = {
  name: "resolveEntryPoint",
  async run(context) {
    if (!isSiteOverviewTask(context.memory.taskSpec)) {
      throw new RuntimeError("Entry-point resolution requires a site overview task.", "INVALID_SITE_OVERVIEW_TASK");
    }

    const taskSpec = context.memory.taskSpec;
    let entryUrl = taskSpec.entryUrl;
    let resolvedFromSearch = false;

    if (!entryUrl) {
      const searchAction = {
        type: "NAVIGATE" as const,
        url: buildOfficialSearchUrl(taskSpec.officialSearchQuery ?? taskSpec.originalGoal),
      };
      const searchResult = await context.executeAction(searchAction, `Resolve official site entry for "${taskSpec.siteName ?? taskSpec.originalGoal}".`);
      await context.settleAfterAction(searchAction);
      const searchSnapshot = await ensureUsableSnapshotWithDialogRecovery(context, "Official site search page blocked by an overlay.");

      if (!searchResult.success || searchSnapshot.pageType !== "google_search") {
        return createToolResult({
          status: "fatal_error",
          summary: "Could not open a Google page to resolve the official site entry.",
          outputs: {
            url: searchSnapshot.url,
            pageType: searchSnapshot.pageType,
          },
          facts: {
            pageType: searchSnapshot.pageType,
          },
          stepStatus: "failed",
          errorCode: "SITE_ENTRY_SEARCH_FAILED",
        });
      }

      const extractAction = {
        type: "EXTRACT_SEARCH_RESULTS" as const,
        limit: 5,
      };
      const extractResult = await context.executeAction(extractAction, "Extract official site entry candidates.");
      const candidates = filterResearchCandidates(extractResult.researchCandidates ?? [], 3).candidates;
      const firstCandidate: ResearchCandidate | undefined = candidates[0];
      if (!firstCandidate) {
        return createToolResult({
          status: "fatal_error",
          summary: "No usable official site entry candidate was found.",
          outputs: {
            extractedCount: extractResult.researchCandidates?.length ?? 0,
          },
          facts: {
            resolvedEntryPoint: false,
          },
          stepStatus: "failed",
          errorCode: "SITE_ENTRY_NOT_FOUND",
        });
      }

      entryUrl = firstCandidate.url;
      resolvedFromSearch = true;
    }

    if (!entryUrl) {
      throw new RuntimeError("Site entry URL is empty after resolution.", "SITE_ENTRY_EMPTY");
    }

    const action = {
      type: "NAVIGATE" as const,
      url: entryUrl,
    };
    const result = await context.executeAction(action, `Open site entry: ${entryUrl}`);
    await context.settleAfterAction(action);
    const snapshot = await ensureUsableSnapshotWithDialogRecovery(context, "Site entry page blocked by an overlay.");
    const targetDomain = normalizeDomain(snapshot.url) ?? normalizeDomain(entryUrl);

    context.memory.taskSpec = {
      ...taskSpec,
      entryUrl: snapshot.url,
      targetDomain,
    };
    context.memory.researchCandidates = [];
    context.memory.researchSources = [];
    context.memory.activeSourceIndex = 0;
    context.memory.currentFacts = {
      ...context.memory.currentFacts,
      siteEntryUrl: snapshot.url,
      targetDomain,
    };
    context.memory.nextIntent = "Collect high-value navigation pages from the site homepage.";
    context.memory.recoveryHint = undefined;
    context.memory.lastError = result.success ? undefined : result.message;

    context.recordStep({
      stepSummary: "Site entry resolved.",
      nextIntent: context.memory.nextIntent,
      expectedOutcome: "The homepage is ready for navigation candidate extraction.",
      action,
      actionResult: result,
      snapshot,
    });

    if (!result.success || snapshot.pageType !== "content") {
      return createToolResult({
        status: "partial",
        summary: `Site entry opened with limited confidence: ${snapshot.title || snapshot.url}`,
        outputs: {
          entryUrl: snapshot.url,
          targetDomain,
          resolvedFromSearch,
          pageType: snapshot.pageType,
        },
        facts: {
          siteEntryUrl: snapshot.url,
          targetDomain,
        },
        stepStatus: "succeeded",
      });
    }

    return createToolResult({
      status: "success",
      summary: `Resolved site entry: ${snapshot.url}`,
      outputs: {
        entryUrl: snapshot.url,
        targetDomain,
        resolvedFromSearch,
      },
      facts: {
        siteEntryUrl: snapshot.url,
        targetDomain,
      },
      stepStatus: "succeeded",
    });
  },
};
