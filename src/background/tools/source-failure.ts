function getBlockedReason(url: string, error?: string) {
  if (/\.pdf(?:$|[?#])/i.test(url)) {
    return "PDF extraction is not supported yet.";
  }

  if (error?.includes("Could not establish connection")) {
    return "The page could not be reached or the content script was not available.";
  }

  return error || "The page could not be read.";
}

export function classifySourceFailure(url: string, error?: unknown) {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : undefined;

  if (/\.pdf(?:$|[?#])/i.test(url)) {
    return {
      kind: "pdf",
      reason: "PDF extraction is not supported yet.",
    };
  }

  if (message?.includes("Could not establish connection")) {
    return {
      kind: "content_script_unavailable",
      reason: "The page could not be reached or the content script was not available.",
    };
  }

  if (message?.includes("PAGE_FACTS_EMPTY")) {
    return {
      kind: "page_facts_empty",
      reason: "Page fact extraction returned an empty payload.",
    };
  }

  if (message?.includes("login") || message?.toLowerCase().includes("login")) {
    return {
      kind: "login_wall",
      reason: message,
    };
  }

  if (
    message?.includes("NAVIGATION_FAILED") ||
    message?.includes("ACTION_EXECUTION_ERROR") ||
    message?.toLowerCase().includes("navigation failed")
  ) {
    return {
      kind: "navigation_failed",
      reason: message,
    };
  }

  return {
    kind: "not_readable",
    reason: getBlockedReason(url, message),
  };
}
