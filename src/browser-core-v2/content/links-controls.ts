import type { BrowserControlObservation, BrowserLinkObservation, BrowserTargetRef } from "../../shared/browser-capability";
import { buildRefMap, toTargetRef } from "./element-refs";

function normalizeHref(anchor: HTMLAnchorElement) {
  try {
    const href = anchor.getAttribute("href") ?? anchor.href;
    const parsed = new URL(href, anchor.ownerDocument.location.href);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return "";
    }
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function targetText(target: BrowserTargetRef) {
  return target.name || target.text || target.refId;
}

function isFormControl(element: HTMLElement) {
  const tagName = element.tagName.toLowerCase();
  return tagName === "button" || tagName === "input" || tagName === "textarea" || tagName === "select";
}

function isValueControl(element: HTMLElement) {
  const tagName = element.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea";
}

function isRequiredControl(element: HTMLElement) {
  const tagName = element.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select";
}

export function getLinksAndControls(root: Document | HTMLElement = document, options: { tabId?: number; limit?: number } = {}) {
  const tabId = options.tabId ?? 0;
  const limit = options.limit ?? 80;
  const refs = buildRefMap(root);
  const targets: BrowserTargetRef[] = [];
  const links: BrowserLinkObservation[] = [];
  const controls: BrowserControlObservation[] = [];

  for (const ref of refs) {
    const targetRef = toTargetRef({
      tabId,
      refId: ref.refId,
      element: ref.element,
      role: ref.role,
      name: ref.name,
    });
    targets.push(targetRef);

    if (ref.element.tagName.toLowerCase() === "a") {
      const url = normalizeHref(ref.element as HTMLAnchorElement);
      if (url) {
        links.push({
          text: targetText(targetRef),
          url,
          targetRef,
        });
      }
    } else {
      controls.push({
        targetRef,
        value: isValueControl(ref.element) ? (ref.element as HTMLInputElement | HTMLTextAreaElement).value : undefined,
        disabled: isFormControl(ref.element) ? (ref.element as HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).disabled : undefined,
        required: isRequiredControl(ref.element) ? (ref.element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).required : undefined,
      });
    }

    if (targets.length >= limit) {
      break;
    }
  }

  return {
    links,
    controls,
    targets,
    coverage: {
      linkCount: links.length,
      controlCount: controls.length,
      targetCount: targets.length,
    },
  };
}
