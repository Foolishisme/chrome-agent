import type { ExtractedItem, FilterDiagnostics, SearchTaskSpec } from "../shared/types";

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

  const diagnostics: FilterDiagnostics = {
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
