import type { SnapshotData } from "../shared/agent-domain-model";

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
