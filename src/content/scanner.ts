import { JD_SELECTORS } from "../shared/selectors";
import type { InteractiveElement, PageFacts, PageReadyState, PageType, SnapshotData } from "../shared/types";
import { collectResultListState } from "./extractor";

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

function createInteractiveElement(agentId: string, role: InteractiveElement["role"], element: HTMLElement): InteractiveElement {
  return {
    agentId,
    role,
    text: (element as HTMLInputElement).value || textOf(element),
    tagName: element.tagName.toLowerCase(),
    isVisible: isVisible(element),
    rect: createRect(element),
  };
}

function findFallbackSearchInput() {
  return Array.from(document.querySelectorAll<HTMLInputElement>("input")).find((input) => {
    const placeholder = input.placeholder || "";
    const name = input.name || "";
    const id = input.id || "";
    return (
      isVisible(input) &&
      (placeholder.includes("搜索") ||
        placeholder.toLowerCase().includes("search") ||
        name.includes("keyword") ||
        id.includes("key"))
    );
  }) ?? null;
}

function findFallbackSearchButton() {
  return Array.from(document.querySelectorAll<HTMLElement>("button, a")).find((element) => {
    const text = textOf(element);
    return isVisible(element) && (text.includes("搜索") || text.toLowerCase().includes("search"));
  }) ?? null;
}

function findSearchElements(pageType: PageType) {
  const inputSelectors = pageType === "search" ? JD_SELECTORS.searchInput : JD_SELECTORS.homeSearchInput;
  const buttonSelectors = pageType === "search" ? JD_SELECTORS.searchButton : JD_SELECTORS.homeSearchButton;

  return {
    input: pickFirst(inputSelectors) ?? findFallbackSearchInput(),
    button: pickFirst(buttonSelectors) ?? findFallbackSearchButton(),
  };
}

function buildInteractiveElements(pageType: PageType) {
  const { input, button } = findSearchElements(pageType);
  const items: InteractiveElement[] = [];

  if (input) {
    items.push(createInteractiveElement("el_search_input", "input", input));
  }

  if (button) {
    items.push(createInteractiveElement("el_search_submit", "button", button));
  }

  return items;
}

function buildPageFacts(pageType: PageType): PageFacts {
  const { input, button } = findSearchElements(pageType);
  const resultList = pageType === "search" ? collectResultListState(document) : undefined;

  return {
    searchBox: {
      present: !!input,
      visible: !!input && isVisible(input),
      text: input instanceof HTMLInputElement ? input.value : textOf(input),
    },
    searchSubmit: {
      present: !!button,
      visible: !!button && isVisible(button),
      text: textOf(button),
    },
    resultList,
  };
}

function buildPageReady(pageType: PageType, facts: PageFacts): PageReadyState {
  const checks: string[] = [];

  if (document.readyState !== "complete") {
    checks.push("document 未完成加载");
  }

  if (pageType === "home") {
    if (!facts.searchBox.present || !facts.searchBox.visible) {
      checks.push("首页搜索框未就绪");
    }

    return {
      ready: checks.length === 0,
      reason: checks.length === 0 ? "首页搜索入口已就绪" : "首页搜索入口尚未就绪",
      checks,
    };
  }

  if (pageType === "search") {
    if (!facts.searchBox.present || !facts.searchBox.visible) {
      checks.push("搜索页搜索框未识别");
    }

    const resultList = facts.resultList;
    if (!resultList?.present) {
      checks.push("搜索结果容器未出现");
    } else if (!resultList.loaded) {
      checks.push("搜索结果仍在加载");
    } else if (resultList.cardCount === 0 && !resultList.emptyState) {
      checks.push("搜索结果卡片尚未出现");
    }

    return {
      ready: checks.length === 0,
      reason: checks.length === 0 ? "搜索结果页已就绪" : "搜索结果页尚未就绪",
      checks,
    };
  }

  if (checks.length === 0) {
    checks.push("当前页面不在支持范围内");
  }

  return {
    ready: false,
    reason: "当前页面暂不支持",
    checks,
  };
}

export function resolveAgentElement(agentId: string): HTMLElement | null {
  const pageType = getPageType(new URL(window.location.href));
  const { input, button } = findSearchElements(pageType);

  if (agentId === "el_search_input") {
    return input ?? null;
  }

  if (agentId === "el_search_submit") {
    return button ?? null;
  }

  return null;
}

export function scanPage(): SnapshotData {
  const url = new URL(window.location.href);
  const pageType = getPageType(url);
  const interactiveElements = buildInteractiveElements(pageType);
  const pageFacts = buildPageFacts(pageType);
  const pageReady = buildPageReady(pageType, pageFacts);

  return {
    url: window.location.href,
    title: document.title,
    pageType,
    interactiveElements,
    productCandidates: [],
    pageReady,
    pageFacts,
    timestamp: Date.now(),
  };
}
