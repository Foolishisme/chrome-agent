import type { CommerceTaskSpec, DirectAnswerTaskSpec, PublicResearchTaskSpec, SiteOverviewTaskSpec, TaskSpec } from "../../shared/agent-domain-model";

export function isCommerceTask(taskSpec: TaskSpec | undefined): taskSpec is CommerceTaskSpec {
  return !!taskSpec && taskSpec.taskType === "commerce_search";
}

export function isResearchTask(taskSpec: TaskSpec | undefined): taskSpec is PublicResearchTaskSpec {
  return !!taskSpec && taskSpec.taskType === "public_research";
}

export function isSiteOverviewTask(taskSpec: TaskSpec | undefined): taskSpec is SiteOverviewTaskSpec {
  return !!taskSpec && taskSpec.taskType === "site_overview";
}

export function isReadableResearchTask(taskSpec: TaskSpec | undefined): taskSpec is PublicResearchTaskSpec | SiteOverviewTaskSpec {
  return isResearchTask(taskSpec) || isSiteOverviewTask(taskSpec);
}

export function isDirectAnswerTask(taskSpec: TaskSpec | undefined): taskSpec is DirectAnswerTaskSpec {
  return !!taskSpec && taskSpec.taskType === "direct_answer";
}
