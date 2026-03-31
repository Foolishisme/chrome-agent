import { JD_SELECTORS } from "../shared/selectors";
import type { ExtractedItem, InteractiveElement, PageType, SnapshotData } from "../shared/types";

function getPageType(url: URL): PageType {
  if (url.hostname === "www.jd.com") {
    return "home";
  }

  if (url.hostname === "search.jd.com") {
    return "search";
  }

  return "unknown";
}

function pickFirst(selectors: string[]): HTMLElement | null {
  for (const selector of selectors) {
    const matched = document.querySelector<HTMLElement>(selector);
    if (matched) {
      return matched;
    }
  }
  return null;
}

function pickAll(selectors: string[]): HTMLElement[] {
  for (const selector of selectors) {
    const matched = Array.from(document.querySelectorAll<HTMLElement>(selector));
    if (matched.length > 0) {
      return matched;
    }
  }
  return [];
}

function textOf(element: Element | null | undefined): string {
  return element?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function createRect(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

function isVisible(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
}

function buildSearchElements(pageType: PageType): InteractiveElement[] {
  const inputSelectors = pageType === "search" ? JD_SELECTORS.searchInput : JD_SELECTORS.homeSearchInput;
  const buttonSelectors = pageType === "search" ? JD_SELECTORS.searchButton : JD_SELECTORS.homeSearchButton;
  const input = pickFirst(inputSelectors);
  const button = pickFirst(buttonSelectors);
  const items: InteractiveElement[] = [];

  if (input) {
    items.push({
      agentId: "el_search_input",
      role: "input",
      text: (input as HTMLInputElement).value || textOf(input),
      tagName: input.tagName.toLowerCase(),
      isVisible: isVisible(input),
      rect: createRect(input),
    });
  }

  if (button) {
    items.push({
      agentId: "el_search_submit",
      role: "button",
      text: textOf(button) || "搜索",
      tagName: button.tagName.toLowerCase(),
      isVisible: isVisible(button),
      rect: createRect(button),
    });
  }

  return items;
}

export function extractProducts(root: Document | HTMLElement = document): ExtractedItem[] {
  const cards = (() => {
    for (const selector of JD_SELECTORS.resultCards) {
      const found = Array.from(root.querySelectorAll<HTMLElement>(selector));
      if (found.length > 0) {
        return found;
      }
    }
    return [];
  })();

  return cards.slice(0, 10).map((card) => {
    const titleNode = pickWithin(card, JD_SELECTORS.resultTitle);
    const linkNode = pickWithin(card, JD_SELECTORS.resultLink) as HTMLAnchorElement | null;
    const priceNode = pickWithin(card, JD_SELECTORS.resultPrice);
    const shopNode = pickWithin(card, JD_SELECTORS.resultShop);
    const summaryNode = pickWithin(card, JD_SELECTORS.resultSummary);
    const tagNodes = pickAllWithin(card, JD_SELECTORS.resultTagSpans);

    return {
      title: textOf(titleNode),
      priceText: textOf(priceNode),
      url: linkNode?.href ?? "",
      shopText: textOf(shopNode) || undefined,
      tags: tagNodes.map((node) => textOf(node)).filter(Boolean).slice(0, 3),
      summary: textOf(summaryNode) || undefined,
    };
  }).filter((item) => item.title && item.priceText && item.url);
}

function pickWithin(root: ParentNode, selectors: string[]) {
  for (const selector of selectors) {
    const matched = root.querySelector<HTMLElement>(selector);
    if (matched) {
      return matched;
    }
  }
  return null;
}

function pickAllWithin(root: ParentNode, selectors: string[]) {
  for (const selector of selectors) {
    const matched = Array.from(root.querySelectorAll<HTMLElement>(selector));
    if (matched.length > 0) {
      return matched;
    }
  }
  return [];
}

export function resolveAgentElement(agentId: string): HTMLElement | null {
  const pageType = getPageType(new URL(window.location.href));
  const searchElements = buildSearchElements(pageType);
  const target = searchElements.find((item) => item.agentId === agentId);
  if (!target) {
    return null;
  }

  if (agentId === "el_search_input") {
    return pickFirst(pageType === "search" ? JD_SELECTORS.searchInput : JD_SELECTORS.homeSearchInput);
  }

  if (agentId === "el_search_submit") {
    return pickFirst(pageType === "search" ? JD_SELECTORS.searchButton : JD_SELECTORS.homeSearchButton);
  }

  return null;
}

export function scanPage(): SnapshotData {
  const url = new URL(window.location.href);
  const pageType = getPageType(url);
  return {
    url: window.location.href,
    title: document.title,
    pageType,
    interactiveElements: buildSearchElements(pageType),
    productCandidates: pageType === "search" ? extractProducts(document).slice(0, 10) : [],
    timestamp: Date.now(),
  };
}
