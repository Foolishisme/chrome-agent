import { computeAccessibleName } from "dom-accessibility-api";
import type { BrowserTargetRef } from "../../shared/browser-capability";
import type { ElementRect, SemanticRole } from "../../shared/types";

const INTERACTIVE_SELECTOR = [
  "a[href]",
  "button",
  "input",
  "textarea",
  "select",
  "[role='button']",
  "[role='link']",
  "[role='tab']",
  "[contenteditable='true']",
].join(",");

function normalizeText(value: string, maxChars = 120) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxChars ? normalized.slice(0, maxChars - 1).trimEnd() : normalized;
}

export function getElementRect(element: HTMLElement): ElementRect {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

export function isElementVisible(element: HTMLElement) {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style?.display !== "none" && style?.visibility !== "hidden" && rect.width >= 0 && rect.height >= 0;
}

export function getCandidateElements(root: Document | HTMLElement = document) {
  return Array.from(root.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR)).filter((element) => {
    if (element.tagName.toLowerCase() === "input" && (element as HTMLInputElement).type === "hidden") {
      return false;
    }
    return isElementVisible(element);
  });
}

export function roleForElement(element: HTMLElement): SemanticRole {
  const explicitRole = element.getAttribute("role");
  if (explicitRole === "button" || explicitRole === "link" || explicitRole === "tab") {
    return explicitRole;
  }

  const tagName = element.tagName.toLowerCase();
  if (tagName === "a") {
    return "link";
  }
  if (tagName === "button") {
    return "button";
  }
  if (tagName === "textarea") {
    return "textarea";
  }
  if (tagName === "input") {
    const input = element as HTMLInputElement;
    if (input.type === "checkbox") {
      return "checkbox";
    }
    if (input.type === "radio") {
      return "radio";
    }
    return "input";
  }
  return "unknown";
}

function prefixForRole(role: SemanticRole) {
  if (role === "link") {
    return "link";
  }
  if (role === "button") {
    return "button";
  }
  if (role === "input" || role === "textarea" || role === "checkbox" || role === "radio") {
    return "input";
  }
  return "target";
}

export function getElementName(element: HTMLElement) {
  const name =
    computeAccessibleName(element) ||
    element.getAttribute("aria-label") ||
    element.getAttribute("title") ||
    (element.tagName.toLowerCase() === "input" ? (element as HTMLInputElement).placeholder || (element as HTMLInputElement).value : "") ||
    element.textContent ||
    "";
  return normalizeText(name);
}

export function buildRefMap(root: Document | HTMLElement = document) {
  const counts = new Map<string, number>();
  return getCandidateElements(root).map((element) => {
    const role = roleForElement(element);
    const prefix = prefixForRole(role);
    const next = (counts.get(prefix) ?? 0) + 1;
    counts.set(prefix, next);
    return {
      refId: `bcv2-${prefix}-${next}`,
      element,
      role,
      name: getElementName(element),
    };
  });
}

export function findElementByRefId(refId: string, root: Document | HTMLElement = document) {
  return buildRefMap(root).find((entry) => entry.refId === refId)?.element;
}

export function toTargetRef(input: {
  tabId: number;
  refId: string;
  element: HTMLElement;
  role: SemanticRole;
  name: string;
}): BrowserTargetRef {
  return {
    tabId: input.tabId,
    refId: input.refId,
    role: input.role,
    name: input.name,
    text: normalizeText(input.element.textContent ?? ""),
    bounds: getElementRect(input.element),
    source: "content_script",
  };
}

