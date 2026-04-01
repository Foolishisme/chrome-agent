import { KNOWN_CATEGORY_KEYWORDS } from "../shared/constants";
import type { SearchTaskSpec } from "../shared/types";

interface RefineSearchQuery {
  (goal: string, draftQuery: string): Promise<{ searchQuery: string; reason: string } | undefined>;
}

function extractBudget(goal: string) {
  const matched = goal.match(/(\d{3,6})\s*元/);
  return matched ? Number(matched[1]) : undefined;
}

function extractTopK(goal: string) {
  const matched = goal.match(/(?:前|TOP|top)\s*(\d{1,2})/);
  if (matched) {
    return Math.max(1, Number(matched[1]));
  }

  const compareMatched = goal.match(/对比\s*(\d{1,2})\s*个/);
  if (compareMatched) {
    return Math.max(1, Number(compareMatched[1]));
  }

  return 5;
}

function extractCategory(goal: string) {
  const matchedKeyword = KNOWN_CATEGORY_KEYWORDS.find((keyword) => goal.toLowerCase().includes(keyword.toLowerCase()));
  if (matchedKeyword) {
    return matchedKeyword;
  }

  const cleaned = goal
    .replace(/帮我|我想|推荐|搜索|找|一下|一下子|左右|价位|预算|对比前?\d+个推荐|对比\d+个推荐|对比/g, " ")
    .replace(/\d{3,6}\s*元/g, " ")
    .replace(/[，。,.\s]+/g, " ")
    .trim();

  return cleaned || "笔记本电脑";
}

function buildBudgetRange(budget?: number) {
  if (!budget) {
    return {};
  }

  return {
    budgetMin: Math.max(0, Math.floor(budget * 0.7)),
    budgetMax: Math.ceil(budget * 1.3),
  };
}

function buildRuleQuery(category: string, budget?: number) {
  if (!budget) {
    return category;
  }
  return `${category} ${budget}元`;
}

function needsLiteRefinement(goal: string, category: string, ruleQuery: string) {
  return category.length <= 2 || ruleQuery.length <= 4 || /送礼|办公|学生|剪辑|游戏/.test(goal);
}

export async function compileSearchTask(
  goal: string,
  options: {
    refineWithLiteModel?: RefineSearchQuery;
  } = {},
): Promise<SearchTaskSpec> {
  const budget = extractBudget(goal);
  const topK = extractTopK(goal);
  const category = extractCategory(goal);
  const notes = ["优先使用规则生成搜索词"];
  let querySource: SearchTaskSpec["querySource"] = "rule";
  let searchQuery = buildRuleQuery(category, budget);

  if (needsLiteRefinement(goal, category, searchQuery) && options.refineWithLiteModel) {
    const refined = await options.refineWithLiteModel(goal, searchQuery);
    if (refined?.searchQuery) {
      searchQuery = refined.searchQuery;
      querySource = "llm-lite";
      notes.push(`已使用小模型补全搜索词：${refined.reason}`);
    }
  }

  return {
    originalGoal: goal,
    category,
    budget,
    topK,
    searchQuery,
    querySource,
    notes,
    ...buildBudgetRange(budget),
  };
}
