import { RuntimeError } from "../../shared/errors";
import { filterExtractedItems } from "../result-filter";
import { createToolResult, type AgentToolDefinition } from "./shared";
import { ensureUsableSnapshotWithDialogRecovery, isCommerceTask, scrollForMoreCandidates } from "./helpers";

export const collectCommerceCandidatesTool: AgentToolDefinition = {
  name: "collectCommerceCandidates",
  async run(context) {
    if (!isCommerceTask(context.memory.taskSpec)) {
      throw new RuntimeError("Commerce candidate collection requires a commerce task spec.", "INVALID_COMMERCE_TASK");
    }

    let snapshot = await ensureUsableSnapshotWithDialogRecovery(context, "Extraction page blocked by an overlay.");
    if (snapshot.pageType !== "search") {
      return createToolResult({
        status: "retryable_error",
        summary: `Expected a JD search page, received ${snapshot.pageType}.`,
        outputs: {
          rawCount: 0,
          keptCount: 0,
          items: [],
        },
        facts: {
          pageType: snapshot.pageType,
        },
        stepStatus: "running",
        errorCode: "SEARCH_PAGE_UNEXPECTED",
        retryHint: "Return to the JD search results page before extracting items.",
      });
    }

    const extractAction = {
      type: "EXTRACT_LIST" as const,
      limit: context.memory.taskSpec.extractLimit,
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

    const filtered = filterExtractedItems(rawItems, context.memory.taskSpec);
    context.memory.rawExtractedItems = rawItems;
    context.memory.extractedItems = filtered.items;
    context.memory.filterDiagnostics = filtered.diagnostics;
    context.memory.recoveryHint = undefined;
    context.memory.lastError = undefined;

    const minimumSummaryCount = Math.max(1, Math.min(3, context.memory.taskSpec.topK));
    const keptCount = filtered.items.length;

    context.recordStep({
      stepSummary: "Candidate filtering completed.",
      nextIntent: "Generate the final recommendation.",
      expectedOutcome: "At least one clean candidate remains after filtering.",
      snapshotSummary: JSON.stringify(filtered.diagnostics),
    });

    if (keptCount === 0) {
      return createToolResult({
        status: "retryable_error",
        summary: "No usable product candidates remained after filtering.",
        outputs: {
          rawCount: rawItems.length,
          keptCount,
          items: [],
        },
        facts: {
          lastRawExtractedCount: rawItems.length,
          filteredCount: keptCount,
          budgetMatchedCount: filtered.diagnostics.budgetMatchedCount,
        },
        stepStatus: "running",
        errorCode: "NO_COMMERCE_CANDIDATES",
        retryHint: "Scroll once more or adjust the query before retrying.",
      });
    }

    return createToolResult({
      status: keptCount >= minimumSummaryCount ? "success" : "partial",
      summary: `Prepared ${keptCount} commerce candidates.`,
      outputs: {
        rawCount: rawItems.length,
        keptCount,
        items: filtered.items,
      },
      facts: {
        lastRawExtractedCount: rawItems.length,
        filteredCount: keptCount,
        budgetMatchedCount: filtered.diagnostics.budgetMatchedCount,
      },
      stepStatus: "succeeded",
    });
  },
};
