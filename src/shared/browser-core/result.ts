import type { BrowserActionResult, BrowserPageProblem } from "../browser-capability";

export function browserCoreSuccess(message: string, options: Partial<BrowserActionResult> = {}): BrowserActionResult {
  return {
    status: "success",
    message,
    problems: [],
    ...options,
  };
}

export function browserCoreBlocked(message: string, problem: BrowserPageProblem): BrowserActionResult {
  return {
    status: "blocked",
    message,
    problems: [problem],
    suggestedNextAction: problem.suggestedNextAction,
  };
}

export function browserCoreFailed(message: string, problem: BrowserPageProblem): BrowserActionResult {
  return {
    status: "failed",
    message,
    problems: [problem],
    suggestedNextAction: problem.suggestedNextAction,
  };
}

