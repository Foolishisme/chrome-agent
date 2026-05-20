import { computeAccessibleName } from "dom-accessibility-api";
import { roles } from "aria-query";
import { JD_SELECTORS } from "./jd-search-selectors";
import type {
  ElementRect,
  InteractiveElement,
  PageFacts,
  PageReadyState,
  PageType,
  SemanticNode,
  SemanticNodeState,
  SemanticRole,
  SemanticSnapshot,
  SnapshotData,
} from "../shared/agent-domain-model";
import { collectResultListState } from "./extractor";
import { collectGoogleSearchResultsState, collectPageContentState } from "./research";

const SEMANTIC_MAX_DEPTH = 6;
const SEMANTIC_MAX_NODES = 120;
const SEMANTIC_NAME_LIMIT = 120;
const SEMANTIC_TEXT_LIMIT = 200;
const SEMANTIC_STATEFUL_ROLES = new Set<SemanticRole>(["button", "input", "textarea", "checkbox", "radio", "tab", "tabpanel"]);
const SEMANTIC_INTERACTIVE_ROLES = new Set<SemanticRole>(["link", "button", "input", "textarea", "checkbox", "radio", "tab"]);
const SEMANTIC_CONTAINER_ROLES = new Set<SemanticRole>([
  "main",
  "navigation",
  "search",
  "form",
  "dialog",
  "alert",
  "section",
  "article",
  "list",
  "listitem",
  "tabpanel",
  "unknown",
]);
const EXPLICIT_ROLE_MAP: Record<string, SemanticRole> = {
  main: "main",
  navigation: "navigation",
  search: "search",
  form: "form",
  dialog: "dialog",
  alert: "alert",
  heading: "heading",
  article: "article",
  list: "list",
  listitem: "listitem",
  link: "link",
  button: "button",
  textbox: "input",
  searchbox: "input",
  checkbox: "checkbox",
  radio: "radio",
  tab: "tab",
  tabpanel: "tabpanel",
  img: "image",
};

interface SemanticBuildState {
  nextRef: number;
  nodeCount: number;
  truncated: boolean;
  seenTextLeaves: Set<string>;
}

function getPageType(url: URL): PageType {
  if (/\.pdf(?:$|[?#])/i.test(url.href)) {
    return "pdf";
  }

  if (url.hostname === "www.jd.com") {
    return "home";
  }

  if (url.hostname === "search.jd.com") {
    return "search";
  }

  if (url.hostname.endsWith("google.com") && url.pathname === "/search") {
    return "google_search";
  }

  if (["http:", "https:"].includes(url.protocol)) {
    return "content";
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

function truncateNormalized(value: string, limit: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  return normalized.length > limit ? `${normalized.slice(0, limit - 1)}…` : normalized;
}

function createRect(element: HTMLElement): ElementRect {
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
  return (
    Array.from(document.querySelectorAll<HTMLInputElement>("input")).find((input) => {
      const placeholder = input.placeholder || "";
      const name = input.name || "";
      const id = input.id || "";
      const ariaLabel = input.getAttribute("aria-label") || "";
      const className = input.className || "";

      return (
        isVisible(input) &&
        (placeholder.includes("搜索") ||
          placeholder.toLowerCase().includes("search") ||
          ariaLabel.includes("搜索") ||
          ariaLabel.toLowerCase().includes("search") ||
          name.includes("keyword") ||
          id.includes("key") ||
          className.includes("jd_pc_search_bar_react_search_input"))
      );
    }) ?? null
  );
}

function findFallbackSearchButton() {
  return (
    Array.from(document.querySelectorAll<HTMLElement>("button, a")).find((element) => {
      const text = textOf(element);
      const ariaLabel = element.getAttribute("aria-label") || "";
      const className = element.className || "";

      return (
        isVisible(element) &&
        (text.includes("搜索") ||
          text.toLowerCase().includes("search") ||
          ariaLabel.includes("搜索") ||
          ariaLabel.toLowerCase().includes("search") ||
          className.includes("jd_pc_search_bar_react_search_btn"))
      );
    }) ?? null
  );
}

function findSearchElements(pageType: PageType) {
  if (pageType === "search" || pageType === "home") {
    const inputSelectors = pageType === "search" ? JD_SELECTORS.searchInput : JD_SELECTORS.homeSearchInput;
    const buttonSelectors = pageType === "search" ? JD_SELECTORS.searchButton : JD_SELECTORS.homeSearchButton;

    return {
      input: pickFirst(inputSelectors) ?? findFallbackSearchInput(),
      button: pickFirst(buttonSelectors) ?? findFallbackSearchButton(),
    };
  }

  if (pageType === "google_search") {
    return {
      input: document.querySelector<HTMLElement>("textarea[name='q'], input[name='q']") ?? findFallbackSearchInput(),
      button:
        document.querySelector<HTMLElement>("button[aria-label*='Google Search'], button[aria-label*='搜索']") ??
        findFallbackSearchButton(),
    };
  }

  return {
    input: null,
    button: null,
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
  const searchResults = pageType === "google_search" ? collectGoogleSearchResultsState(document) : undefined;
  const pageContent = pageType === "content" || pageType === "pdf" ? collectPageContentState() : undefined;

  return {
    searchBox: {
      present: !!input,
      visible: !!input && isVisible(input),
      text: input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement ? input.value : textOf(input),
    },
    searchSubmit: {
      present: !!button,
      visible: !!button && isVisible(button),
      text: textOf(button),
    },
    resultList,
    searchResults,
    pageContent,
  };
}

function buildPageReady(pageType: PageType, facts: PageFacts): PageReadyState {
  const checks: string[] = [];

  if (pageType === "home") {
    if (!facts.searchBox.present || !facts.searchBox.visible) {
      checks.push("首页搜索框未识别");
    }

    return {
      ready: checks.length === 0,
      reason: checks.length === 0 ? "首页搜索入口可用" : "首页搜索入口尚未可用",
      checks,
    };
  }

  if (pageType === "search") {
    const resultList = facts.resultList;
    const hasExtractableResults =
      !!resultList &&
      resultList.present &&
      resultList.loaded &&
      (resultList.cardCount > 0 || resultList.productLinkCount > 0 || resultList.emptyState);

    if ((!facts.searchBox.present || !facts.searchBox.visible) && !hasExtractableResults) {
      checks.push("搜索页搜索框未识别");
    }

    if (!resultList?.present) {
      checks.push("搜索结果区未出现");
    } else if (!resultList.loaded) {
      checks.push("搜索结果仍在加载");
    } else if (resultList.cardCount === 0 && resultList.productLinkCount === 0 && !resultList.emptyState) {
      checks.push("搜索结果卡片或商品链接尚未出现");
    }

    return {
      ready: checks.length === 0,
      reason: checks.length === 0 ? "搜索结果页可用" : "搜索结果页尚未可用",
      checks,
    };
  }

  if (pageType === "google_search") {
    const searchResults = facts.searchResults;

    if (!searchResults?.present) {
      checks.push("Google 搜索结果未出现");
    } else if (!searchResults.loaded) {
      checks.push("Google 搜索结果仍在加载");
    } else if (searchResults.naturalCount === 0) {
      checks.push("Google 自然结果尚未出现");
    }

    return {
      ready: checks.length === 0,
      reason: checks.length === 0 ? "Google 搜索结果页可用" : "Google 搜索结果页尚未可用",
      checks,
    };
  }

  if (pageType === "content" || pageType === "pdf") {
    return {
      ready: true,
      reason: pageType === "pdf" ? "PDF 页面已加载" : "通用页面已加载",
      checks,
    };
  }

  return {
    ready: false,
    reason: "当前页面不在支持范围内",
    checks: ["当前页面不在支持范围内"],
  };
}

function resolveSemanticRoot() {
  return (
    document.querySelector<HTMLElement>("main") ??
    document.querySelector<HTMLElement>("article") ??
    document.querySelector<HTMLElement>("[role='main']") ??
    document.body
  );
}

function nextSemanticRef(state: SemanticBuildState, role: SemanticRole) {
  state.nextRef += 1;
  return `sem_${role}_${state.nextRef}`;
}

function canAppendSemanticNode(state: SemanticBuildState) {
  if (state.nodeCount >= SEMANTIC_MAX_NODES) {
    state.truncated = true;
    return false;
  }

  return true;
}

function isDecorativeImage(element: HTMLElement) {
  if (element.tagName.toLowerCase() !== "img") {
    return false;
  }

  const alt = element.getAttribute("alt");
  return alt !== null && alt.trim() === "";
}

function getExplicitSemanticRole(element: HTMLElement): SemanticRole | undefined {
  const explicitRole = element.getAttribute("role")?.trim().split(/\s+/)[0];
  if (!explicitRole || !roles.has(explicitRole)) {
    return undefined;
  }

  return EXPLICIT_ROLE_MAP[explicitRole] ?? "unknown";
}

function getImplicitSemanticRole(element: HTMLElement): SemanticRole | undefined {
  const tag = element.tagName.toLowerCase();

  if (/^h[1-6]$/.test(tag)) {
    return "heading";
  }

  if (tag === "main") {
    return "main";
  }

  if (tag === "nav") {
    return "navigation";
  }

  if (tag === "search") {
    return "search";
  }

  if (tag === "form") {
    return "form";
  }

  if (tag === "dialog") {
    return "dialog";
  }

  if (tag === "section") {
    return "section";
  }

  if (tag === "article") {
    return "article";
  }

  if (tag === "ul" || tag === "ol") {
    return "list";
  }

  if (tag === "li") {
    return "listitem";
  }

  if (tag === "a" && (element as HTMLAnchorElement).href) {
    return "link";
  }

  if (tag === "button") {
    return "button";
  }

  if (tag === "textarea") {
    return "textarea";
  }

  if (tag === "img") {
    return "image";
  }

  if (tag === "p" || tag === "label") {
    return "text";
  }

  if (tag === "input") {
    const type = ((element as HTMLInputElement).type || "text").toLowerCase();
    if (type === "checkbox") {
      return "checkbox";
    }
    if (type === "radio") {
      return "radio";
    }
    if (type === "button" || type === "submit" || type === "reset") {
      return "button";
    }
    return "input";
  }

  return undefined;
}

function inferSemanticRole(element: HTMLElement): SemanticRole | undefined {
  return getExplicitSemanticRole(element) ?? getImplicitSemanticRole(element);
}

function collectSemanticState(element: HTMLElement, role: SemanticRole): SemanticNodeState | undefined {
  if (!SEMANTIC_STATEFUL_ROLES.has(role)) {
    return undefined;
  }

  const parseBooleanish = (value: string | null) => {
    if (value === "true") {
      return true;
    }
    if (value === "false") {
      return false;
    }
    return undefined;
  };

  const input = element instanceof HTMLInputElement ? element : undefined;
  const state: SemanticNodeState = {
    expanded: parseBooleanish(element.getAttribute("aria-expanded")),
    selected: parseBooleanish(element.getAttribute("aria-selected")),
    checked:
      parseBooleanish(element.getAttribute("aria-checked")) ??
      (input?.type === "checkbox" || input?.type === "radio" ? input.checked : undefined),
    disabled: element.hasAttribute("disabled") || parseBooleanish(element.getAttribute("aria-disabled")),
    pressed: parseBooleanish(element.getAttribute("aria-pressed")),
    required: element.hasAttribute("required") || parseBooleanish(element.getAttribute("aria-required")),
    invalid:
      (element.getAttribute("aria-invalid") ? element.getAttribute("aria-invalid") !== "false" : undefined) ??
      (input ? !input.validity.valid : undefined),
  };

  return Object.values(state).some((value) => value !== undefined) ? state : undefined;
}

function computeSemanticName(element: HTMLElement, role: SemanticRole) {
  let name = "";

  try {
    name = computeAccessibleName(element);
  } catch {
    name = "";
  }

  if (!name && role === "heading") {
    name = textOf(element);
  }

  if (!name && role === "image") {
    name = element.getAttribute("alt") ?? "";
  }

  return truncateNormalized(name, SEMANTIC_NAME_LIMIT);
}

function getHeadingLevel(element: HTMLElement) {
  const tag = element.tagName.toLowerCase();
  if (/^h[1-6]$/.test(tag)) {
    return Number(tag[1]);
  }

  const ariaLevel = element.getAttribute("aria-level");
  if (ariaLevel && /^\d+$/.test(ariaLevel)) {
    return Number(ariaLevel);
  }

  return undefined;
}

function getSemanticText(element: HTMLElement, role: SemanticRole) {
  if (role !== "text") {
    return undefined;
  }

  const text = truncateNormalized(textOf(element), SEMANTIC_TEXT_LIMIT);
  return text || undefined;
}

function shouldSkipSemanticNode(role: SemanticRole, name: string, text: string | undefined, children: SemanticNode[]) {
  if (role === "image" && !name) {
    return true;
  }

  if (role === "text") {
    return !text;
  }

  if (SEMANTIC_CONTAINER_ROLES.has(role)) {
    return !name && children.length === 0;
  }

  return !name && children.length === 0;
}

function buildSemanticNode(element: HTMLElement, depth: number, state: SemanticBuildState): SemanticNode[] {
  if (depth > SEMANTIC_MAX_DEPTH || state.truncated || !isVisible(element) || isDecorativeImage(element)) {
    if (depth > SEMANTIC_MAX_DEPTH) {
      state.truncated = true;
    }
    return [];
  }

  const childNodes: SemanticNode[] = [];
  for (const child of Array.from(element.children)) {
    if (!(child instanceof HTMLElement)) {
      continue;
    }
    childNodes.push(...buildSemanticNode(child, depth + 1, state));
    if (state.truncated) {
      break;
    }
  }

  const role = inferSemanticRole(element);
  if (!role) {
    return childNodes;
  }

  const name = computeSemanticName(element, role);
  const text = getSemanticText(element, role);
  if (role === "text") {
    const dedupeKey = `${role}:${text ?? ""}`;
    if (!text || state.seenTextLeaves.has(dedupeKey)) {
      return [];
    }
    state.seenTextLeaves.add(dedupeKey);
  }

  if (shouldSkipSemanticNode(role, name, text, childNodes)) {
    return childNodes;
  }

  if (!canAppendSemanticNode(state)) {
    return childNodes;
  }

  const node: SemanticNode = {
    ref: nextSemanticRef(state, role),
    role,
    name,
  };

  if (text) {
    node.text = text;
  }

  const level = getHeadingLevel(element);
  if (level !== undefined) {
    node.level = level;
  }

  const semanticState = collectSemanticState(element, role);
  if (semanticState) {
    node.state = semanticState;
  }

  if (SEMANTIC_INTERACTIVE_ROLES.has(role)) {
    node.bounds = createRect(element);
  }

  if (childNodes.length > 0) {
    node.children = childNodes;
  }

  state.nodeCount += 1;
  return [node];
}

function buildSemanticSnapshot(urlText: string): SemanticSnapshot {
  const rootElement = resolveSemanticRoot();
  const state: SemanticBuildState = {
    nextRef: 0,
    nodeCount: 1,
    truncated: false,
    seenTextLeaves: new Set<string>(),
  };

  const root: SemanticNode = {
    ref: "sem_root",
    role: "unknown",
    name: "",
  };

  const children =
    rootElement === document.body ? Array.from(rootElement.children).flatMap((child) => {
      if (!(child instanceof HTMLElement)) {
        return [];
      }
      return buildSemanticNode(child, 1, state);
    }) : buildSemanticNode(rootElement, 1, state);

  root.children = children;

  return {
    version: 1,
    url: urlText,
    title: document.title,
    nodeCount: state.nodeCount,
    truncated: state.truncated,
    root,
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

export function scanPageAtUrl(urlText: string): SnapshotData {
  const url = new URL(urlText);
  const pageType = getPageType(url);
  const interactiveElements = buildInteractiveElements(pageType);
  const semanticSnapshot = buildSemanticSnapshot(url.href);
  const pageFacts = buildPageFacts(pageType);
  const pageReady = buildPageReady(pageType, pageFacts);

  return {
    url: url.href,
    title: document.title,
    pageType,
    interactiveElements,
    semanticSnapshot,
    productCandidates: [],
    pageReady,
    pageFacts,
    timestamp: Date.now(),
  };
}

export function scanPage(): SnapshotData {
  return scanPageAtUrl(window.location.href);
}
