import { SENSITIVE_KEYWORDS } from "../shared/constants";
import { RuntimeError } from "../shared/errors";
import type { ActionResult, AgentAction, SessionMemory, SnapshotData } from "../shared/types";

const FALLBACK_AGENT_IDS = new Set(["el_search_input", "el_search_submit"]);

export function ensureAgentExists(snapshot: SnapshotData | undefined, agentId: string) {
  if (!snapshot) {
    throw new RuntimeError("Current page snapshot is missing.", "SNAPSHOT_MISSING");
  }

  const matched = snapshot.interactiveElements.find((item) => item.agentId === agentId);
  if (matched) {
    return matched;
  }

  if (FALLBACK_AGENT_IDS.has(agentId) && (snapshot.pageType === "home" || snapshot.pageType === "search" || snapshot.pageType === "google_search")) {
    return {
      agentId,
      role: agentId === "el_search_input" ? "input" : "button",
      text: "",
      tagName: "",
      isVisible: true,
      rect: { x: 0, y: 0, width: 0, height: 0 },
    };
  }

  throw new RuntimeError(`agentId not found: ${agentId}`, "AGENT_ID_NOT_FOUND");
}

export function ensureActionAllowed(snapshot: SnapshotData | undefined, action: AgentAction) {
  if (action.type === "TYPE" || action.type === "CLICK") {
    const target = ensureAgentExists(snapshot, action.agentId);
    const combined = `${target.text} ${target.agentId}`.toLowerCase();
    if (SENSITIVE_KEYWORDS.some((keyword) => combined.includes(keyword.toLowerCase()))) {
      throw new RuntimeError("Blocked by a sensitive action rule.", "SENSITIVE_ACTION_BLOCKED");
    }
  }

  if (action.type === "EXTRACT_LIST" && snapshot?.pageType !== "search") {
    throw new RuntimeError("Product extraction is only allowed on JD search pages.", "INVALID_PAGE_FOR_EXTRACT");
  }

  if (action.type === "EXTRACT_SEARCH_RESULTS" && snapshot?.pageType !== "google_search") {
    throw new RuntimeError("Search-result extraction is only allowed on Google result pages.", "INVALID_PAGE_FOR_SEARCH_RESULTS");
  }
}

function actionFingerprint(action?: AgentAction): string {
  if (!action) {
    return "none";
  }

  return JSON.stringify(action);
}

export function isRepeatedAction(memory: SessionMemory, action: AgentAction): boolean {
  const recent = memory.stepHistory.slice(-3);
  if (recent.length < 2) {
    return false;
  }

  return recent.every(
    (step) =>
      actionFingerprint(step.action) === actionFingerprint(action) &&
      step.actionResult?.success === false,
  );
}

export function summarizeSnapshot(snapshot: SnapshotData): string {
  const resultList = snapshot.pageFacts.resultList;
  const ready = snapshot.pageReady.ready ? "ready" : "not-ready";
  const searchFacts = snapshot.pageFacts.searchBox.present ? "search-input" : "no-search-input";
  const searchResults = snapshot.pageFacts.searchResults;
  const contentFacts = snapshot.pageFacts.pageContent;
  const resultFacts = resultList
    ? `${resultList.cardCount} cards / ${resultList.productLinkCount} links`
    : searchResults
      ? `${searchResults.naturalCount} natural / ${searchResults.adCount} ads`
      : contentFacts
        ? `${contentFacts.textLength} chars`
        : "no-results";
  return `${snapshot.pageType} | ${ready} | ${searchFacts} | ${resultFacts}`;
}

export function compareExpectedOutcome(
  beforeSnapshot: SnapshotData | undefined,
  afterSnapshot: SnapshotData,
  expectedOutcome: string,
  action: AgentAction,
  actionResult?: ActionResult,
): {
  matched: boolean;
  reason: string;
} {
  if (action.type === "TYPE") {
    const before = beforeSnapshot?.pageFacts.searchBox.text ?? "";
    const after = afterSnapshot.pageFacts.searchBox.text ?? "";
    if (after.includes(action.text) || (before !== after && after.length > 0)) {
      return { matched: true, reason: "Search input content changed." };
    }
  }

  if (action.type === "CLICK") {
    if (beforeSnapshot?.url !== afterSnapshot.url || beforeSnapshot?.pageType !== afterSnapshot.pageType) {
      return { matched: true, reason: "The page changed after the click." };
    }
  }

  if (action.type === "SCROLL") {
    return { matched: true, reason: "The scroll action executed." };
  }

  if (action.type === "EXTRACT_LIST") {
    const extractedCount = actionResult?.items?.length ?? 0;
    if (extractedCount > 0) {
      return {
        matched: true,
        reason: extractedCount >= 3 ? "Enough products were extracted." : `Extracted ${extractedCount} product(s), which still counts as progress.`,
      };
    }

    if (!afterSnapshot.pageReady.ready) {
      return { matched: false, reason: "The page is not ready yet, so extraction is not meaningful." };
    }
  }

  if (action.type === "EXTRACT_SEARCH_RESULTS") {
    const extractedCount = actionResult?.researchCandidates?.length ?? 0;
    if (extractedCount > 0) {
      return {
        matched: true,
        reason: extractedCount >= 5 ? "Enough sources were extracted." : `Extracted ${extractedCount} source candidate(s), which still counts as progress.`,
      };
    }

    if (!afterSnapshot.pageReady.ready) {
      return { matched: false, reason: "The page is not ready yet, so Google extraction is not meaningful." };
    }
  }

  if (action.type === "EXTRACT_PAGE_FACTS" && actionResult?.pageFactsResult) {
    return {
      matched: true,
      reason: actionResult.pageFactsResult.status === "success" ? "Page facts were extracted." : "Only partial page facts were extracted.",
    };
  }

  if (expectedOutcome.trim().length > 0) {
    return { matched: false, reason: "No page change matched the expected outcome yet." };
  }

  return { matched: true, reason: "No additional expected outcome was configured." };
}
