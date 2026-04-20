import type { BrowserCorePageState } from "../shared/types";

export function getBrowserCorePageState(doc: Document = document): BrowserCorePageState {
  return {
    url: doc.location?.href ?? "",
    title: doc.title || "",
    readyState: doc.readyState,
    visibilityState: doc.visibilityState,
    likelySpa: !!doc.querySelector("#app, #root, [data-reactroot]"),
    hasPasswordInput: !!doc.querySelector("input[type='password']"),
    hasBlockingOverlay: !!doc.querySelector("[role='dialog'], .modal, [class*='overlay']"),
  };
}
