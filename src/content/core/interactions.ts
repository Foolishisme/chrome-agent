import { createBrowserCoreProblem } from "../../shared/browser-core/page-problems";
import { browserCoreFailed, browserCoreSuccess } from "../../shared/browser-core/result";
import { findElementByRefId } from "./element-refs";
import type { BrowserActionResult } from "../../shared/browser-capability";

function dispatchInputEvents(element: HTMLElement) {
  element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function dispatchKeyEvents(target: HTMLElement | Document, key: string) {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  target.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
}

function missingRef(refId: string): BrowserActionResult {
  return browserCoreFailed(
    `Target ref ${refId} is stale or missing.`,
    createBrowserCoreProblem("stale_target", "Element reference was not found in the current DOM.", {
      recoverable: true,
      suggestedNextAction: "Refresh the page observation and retry with a fresh ref.",
    }),
  );
}

export async function clickRef(refId: string, root: Document | HTMLElement = document): Promise<BrowserActionResult> {
  const element = findElementByRefId(refId, root);
  if (!element) {
    return missingRef(refId);
  }

  element.click();
  return browserCoreSuccess("Clicked low-risk DOM target.");
}

export async function typeIntoRef(
  refId: string,
  text: string,
  options: { submit?: boolean; root?: Document | HTMLElement } = {},
): Promise<BrowserActionResult> {
  const element = findElementByRefId(refId, options.root ?? document);
  if (!element) {
    return missingRef(refId);
  }

  const tagName = element.tagName.toLowerCase();
  if (tagName === "input" || tagName === "textarea") {
    const input = element as HTMLInputElement | HTMLTextAreaElement;
    element.focus();
    input.value = text;
    dispatchInputEvents(element);
    if (options.submit) {
      dispatchKeyEvents(element, "Enter");
    }
    return browserCoreSuccess("Typed text into DOM target.");
  }

  if (element.isContentEditable) {
    element.focus();
    element.textContent = text;
    dispatchInputEvents(element);
    return browserCoreSuccess("Typed text into contenteditable target.");
  }

  return browserCoreFailed(
    `Target ref ${refId} is not typeable.`,
    createBrowserCoreProblem("operation_failed", "Element is not an input, textarea, or contenteditable target."),
  );
}

export async function pressKey(key: string, refId?: string, root: Document | HTMLElement = document): Promise<BrowserActionResult> {
  const target = refId ? findElementByRefId(refId, root) : root.ownerDocument ?? document;
  if (!target) {
    return missingRef(refId ?? "");
  }

  dispatchKeyEvents(target, key);
  return browserCoreSuccess(`Pressed ${key}.`);
}

export async function scrollPage(direction: "up" | "down", amount = 600, win: Window = window): Promise<BrowserActionResult> {
  const delta = direction === "down" ? amount : -amount;
  win.scrollBy({ top: delta, behavior: "auto" });
  return browserCoreSuccess(`Scrolled ${direction}.`);
}

