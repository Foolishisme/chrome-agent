import type { PlanStep, TaskSpec, ToolName } from "../../../shared/types";

function createPlanStep(stepId: string, goal: string, toolName: ToolName): PlanStep {
  return {
    stepId,
    goal,
    allowedTools: [toolName],
    successCriteria: [goal],
    status: "pending",
  };
}

export function buildBrowserCoreV2DisplayPlan(taskSpec: TaskSpec): PlanStep[] {
  if (taskSpec.taskType === "direct_answer") {
    return [createPlanStep("finalize-direct-answer", "Generate the direct answer.", "finalizeDirectAnswer")];
  }

  if (taskSpec.taskType === "commerce_search") {
    return [
      createPlanStep("commerce-research", "Collect shortlisted commerce candidates.", "skill.commerceResearch"),
      createPlanStep("decide-round-action", "Decide whether to finalize or run another round.", "decideRoundAction"),
      createPlanStep("finalize-commerce-result", "Summarize the commerce shortlist.", "finalizeCommerceResult"),
    ];
  }

  if (taskSpec.taskType === "site_overview") {
    const steps: PlanStep[] = [];
    if (taskSpec.entryMode === "resolve_official_home") {
      steps.push(createPlanStep("browser-search", "Resolve the official site entry from search.", "browser.search"));
    }
    steps.push(createPlanStep("browser-site-overview", "Read the site entry and same-site key pages.", "browser.siteOverview"));
    steps.push(createPlanStep("decide-round-action", "Decide whether to finalize or run another round.", "decideRoundAction"));
    steps.push(createPlanStep("finalize-research-result", "Summarize the site overview coverage.", "finalizeResearchResult"));
    return steps;
  }

  return [
    createPlanStep("browser-search", "Collect first-page source candidates.", "browser.search"),
    createPlanStep("browser-web-detail", "Read the selected candidate pages.", "browser.webDetail"),
    createPlanStep("decide-round-action", "Decide whether to finalize or run another round.", "decideRoundAction"),
    createPlanStep("finalize-research-result", "Summarize the research sources.", "finalizeResearchResult"),
  ];
}
