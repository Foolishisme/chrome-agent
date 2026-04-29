import type { ExecuteActionResponse, SnapshotResponse } from "../shared/protocol";
import type { ManualExtractionRecord } from "../shared/types";
import { sendMessageToTab } from "./runtime";

// Deprecated internal QA helper.
// Keep the backend path available temporarily for local debugging and offline review,
// but do not wire new side panel UI or product flows to this module.
const STORAGE_KEY = "manualExtractionHistory";
const MAX_HISTORY_ENTRIES = 20;

function normalizeHistory(value: unknown): ManualExtractionRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is ManualExtractionRecord => {
    return !!item && typeof item === "object" && "id" in item && "url" in item && "extraction" in item;
  });
}

export async function getManualExtractionHistory() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return normalizeHistory(stored[STORAGE_KEY]);
}

export async function clearManualExtractionHistory() {
  await chrome.storage.local.set({
    [STORAGE_KEY]: [],
  });
}

async function saveManualExtractionRecord(record: ManualExtractionRecord) {
  const history = await getManualExtractionHistory();
  const nextHistory = [record, ...history].slice(0, MAX_HISTORY_ENTRIES);
  await chrome.storage.local.set({
    [STORAGE_KEY]: nextHistory,
  });
  return nextHistory;
}

export async function extractCurrentPageForReview(tabId: number) {
  const snapshotResponse = await sendMessageToTab<SnapshotResponse>(tabId, {
    type: "REQUEST_SNAPSHOT",
  });

  if (!snapshotResponse.ok || !snapshotResponse.snapshot) {
    throw new Error(snapshotResponse.error ?? "Failed to scan the current page.");
  }

  const extractionResponse = await sendMessageToTab<ExecuteActionResponse>(tabId, {
    type: "EXECUTE_ACTION",
    action: { type: "EXTRACT_PAGE_FACTS" },
  });

  if (!extractionResponse.ok || !extractionResponse.result?.pageFactsResult) {
    throw new Error(extractionResponse.error ?? "Failed to extract facts from the current page.");
  }

  const snapshot = snapshotResponse.snapshot;
  const extraction = extractionResponse.result.pageFactsResult;

  const record: ManualExtractionRecord = {
    id: crypto.randomUUID(),
    url: snapshot.url,
    pageTitle: extraction.pageTitle || snapshot.title || snapshot.url,
    pageType: snapshot.pageType,
    extractedAt: Date.now(),
    extraction,
    contentState: snapshot.pageFacts.pageContent,
  };

  const history = await saveManualExtractionRecord(record);
  return {
    record,
    history,
  };
}
