import type { BrowserPageProblem, BrowserPageProblemCode } from "../browser-capability";

export function createBrowserCoreProblem(
  code: BrowserPageProblemCode,
  message: string,
  options: {
    recoverable?: boolean;
    detail?: string;
    suggestedNextAction?: string;
  } = {},
): BrowserPageProblem {
  return {
    code,
    message,
    recoverable: options.recoverable ?? code !== "permission_denied",
    detail: options.detail,
    suggestedNextAction: options.suggestedNextAction,
  };
}

