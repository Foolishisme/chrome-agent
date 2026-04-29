import { createBrowserCoreProblem } from "../../shared/browser-core/page-problems";

export function detectBrowserCorePageProblems(doc: Document = document, mainText = "") {
  const problems = [];
  const url = doc.location?.href ?? "";

  if (/\.pdf(?:$|[?#])/i.test(url)) {
    problems.push(createBrowserCoreProblem("unsupported_page", "PDF extraction is not part of the Browser Core V2 store-safe first path."));
  }

  if (!!doc.querySelector("input[type='password']") && mainText.length < 300) {
    problems.push(
      createBrowserCoreProblem("login_wall", "Page may require login before useful content is available.", {
        recoverable: true,
        suggestedNextAction: "Ask the user before proceeding through login or account-specific pages.",
      }),
    );
  }

  if (!mainText.trim()) {
    problems.push(
      createBrowserCoreProblem("empty_content", "No readable page text was found.", {
        recoverable: true,
        suggestedNextAction: "Use links and controls to decide whether a low-risk interaction is needed.",
      }),
    );
  }

  return problems;
}

