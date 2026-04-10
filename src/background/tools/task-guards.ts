import type { CommerceTaskSpec, DirectAnswerTaskSpec, PublicResearchTaskSpec, TaskSpec } from "../../shared/types";

export function isCommerceTask(taskSpec: TaskSpec | undefined): taskSpec is CommerceTaskSpec {
  return !!taskSpec && taskSpec.taskType === "commerce_search";
}

export function isResearchTask(taskSpec: TaskSpec | undefined): taskSpec is PublicResearchTaskSpec {
  return !!taskSpec && taskSpec.taskType === "public_research";
}

export function isDirectAnswerTask(taskSpec: TaskSpec | undefined): taskSpec is DirectAnswerTaskSpec {
  return !!taskSpec && taskSpec.taskType === "direct_answer";
}
