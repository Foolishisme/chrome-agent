import { LIMITS } from "../shared/constants";
import type { PageContentState, PageFactExtraction, ResearchCandidate, SearchResultsState } from "../shared/types";

function textOf(node: Element | null | undefined) {
  return node?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function normalizeGoogleHref(rawHref: string) {
  try {
    const href = rawHref.startsWith("/") ? new URL(rawHref, window.location.origin).toString() : rawHref;
    const parsed = new URL(href);
    if (parsed.hostname.endsWith("google.com") && parsed.pathname === "/url") {
      const target = parsed.searchParams.get("q");
      if (target) {
        return target;
      }
    }
    return parsed.toString();
  } catch {
    return rawHref;
  }
}

function getGoogleResultContainers(root: Document | HTMLElement) {
  const selectors = ["div[data-snc]", ".MjjYud", ".g", ".ezO2md", ".hlcw0c"];
  for (const selector of selectors) {
    const matched = Array.from(root.querySelectorAll<HTMLElement>(selector));
    if (matched.length > 0) {
      return matched;
    }
  }
  return Array.from(root.querySelectorAll<HTMLElement>("a[href]")).map((anchor) => anchor.parentElement).filter(Boolean) as HTMLElement[];
}

function isLikelyAd(container: HTMLElement, anchor: HTMLAnchorElement) {
  const containerText = textOf(container).toLowerCase();
  return (
    /(^|\s)(ad|ads|sponsored)(\s|$)/i.test(containerText) ||
    anchor.href.includes("/aclk?") ||
    container.closest("[data-text-ad]") !== null
  );
}

function findSnippet(container: HTMLElement, title: string) {
  const candidates = Array.from(container.querySelectorAll<HTMLElement>("div, span"))
    .map((node) => textOf(node))
    .filter((text) => text.length >= 30 && text !== title);

  return candidates[0];
}

export function extractGoogleSearchResults(root: Document | HTMLElement = document, limit = 10) {
  const containers = getGoogleResultContainers(root);
  const candidates: ResearchCandidate[] = [];

  for (const container of containers) {
    const anchor = container.querySelector<HTMLAnchorElement>("a[href]");
    const heading = container.querySelector<HTMLElement>("h3");
    if (!anchor || !heading) {
      continue;
    }

    const title = textOf(heading);
    const normalizedUrl = normalizeGoogleHref(anchor.href);
    if (!title || !normalizedUrl) {
      continue;
    }

    candidates.push({
      title,
      url: normalizedUrl,
      snippet: findSnippet(container, title),
      source: (() => {
        try {
          return new URL(normalizedUrl).hostname.replace(/^www\./, "");
        } catch {
          return undefined;
        }
      })(),
      displayUrl: textOf(container.querySelector("cite")),
      rank: candidates.length + 1,
      isAd: isLikelyAd(container, anchor),
    });

    if (candidates.length >= limit) {
      break;
    }
  }

  return {
    candidates,
    diagnostics: {
      resultCount: containers.length,
      naturalCount: candidates.filter((candidate) => !candidate.isAd).length,
      adCount: candidates.filter((candidate) => candidate.isAd).length,
    },
  };
}

export function collectGoogleSearchResultsState(root: Document | HTMLElement = document): SearchResultsState {
  const { candidates, diagnostics } = extractGoogleSearchResults(root, 20);

  return {
    present: candidates.length > 0,
    loaded: candidates.length > 0 || (root instanceof Document ? root.readyState === "complete" : true),
    resultCount: diagnostics.resultCount,
    naturalCount: diagnostics.naturalCount,
    adCount: diagnostics.adCount,
  };
}

function buildTextSegments(root: ParentNode) {
  return Array.from(root.querySelectorAll<HTMLElement>("h1, h2, h3, p, li"))
    .map((node) => textOf(node))
    .filter((text) => text.length >= 24);
}

function cloneReadableRoot(root: HTMLElement) {
  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("script, style, noscript, nav, footer, header, aside, form, button, input, svg, canvas").forEach((node) => {
    node.remove();
  });
  return clone;
}

function resolveReadableRoot() {
  return (
    document.querySelector<HTMLElement>("article") ??
    document.querySelector<HTMLElement>("main") ??
    document.querySelector<HTMLElement>("[role='main']") ??
    document.body
  );
}

function detectBlockingReason(text: string, hasPasswordInput: boolean, textLength: number) {
  const normalizedText = text || "";
  const loginSignal =
    hasPasswordInput ||
    /(登录|登入|注册|订阅|subscribe|sign in|log in|continue reading|join to read)/i.test(normalizedText);

  if (loginSignal && textLength < LIMITS.PAGE_TEXT_MIN_LENGTH) {
    return "登录墙或订阅墙阻断";
  }

  if (textLength < LIMITS.PAGE_TEXT_MIN_LENGTH && document.querySelector("#app, #root, [data-reactroot]")) {
    return "强交互页面，可读正文不足";
  }

  if (textLength < LIMITS.PAGE_TEXT_MIN_LENGTH) {
    return "可读正文不足";
  }

  if (/\.pdf(?:$|[?#])/i.test(window.location.href)) {
    return "PDF 页面未做正文提取";
  }

  return undefined;
}

export function collectPageContentState(): PageContentState {
  const root = resolveReadableRoot();
  const clone = cloneReadableRoot(root);
  const segments = buildTextSegments(clone);
  const textLength = segments.join(" ").length;
  const hasPasswordInput = !!document.querySelector("input[type='password']");
  const hasBlockingOverlay = !!document.querySelector("[role='dialog'], .modal, [class*='overlay']");
  const reason = detectBlockingReason(document.body.innerText || document.body.textContent || "", hasPasswordInput, textLength);
  const likelyLoginWall = reason === "登录墙或订阅墙阻断";
  const likelySpa = reason === "强交互页面，可读正文不足";

  return {
    readable: !reason,
    textLength,
    paragraphCount: segments.length,
    hasPasswordInput,
    hasBlockingOverlay,
    likelyLoginWall,
    likelySpa,
    reason,
  };
}

export function extractPageFacts(): PageFactExtraction {
  if (/\.pdf(?:$|[?#])/i.test(window.location.href)) {
    return {
      status: "partial",
      pageTitle: document.title || "PDF",
      summary: "当前页面为 PDF，未执行正文提取。",
      keyPoints: [],
      textLength: 0,
      reason: "PDF 页面未做正文提取",
    };
  }

  const root = cloneReadableRoot(resolveReadableRoot());
  const segments = buildTextSegments(root);
  const textLength = segments.join(" ").length;
  const reason = detectBlockingReason(
    document.body.innerText || document.body.textContent || "",
    !!document.querySelector("input[type='password']"),
    textLength,
  );
  const summary = segments[0] ?? "";
  const keyPoints = segments.slice(0, 3);

  if (reason) {
    return {
      status: "partial",
      pageTitle: document.title || "Untitled",
      summary: summary || reason,
      keyPoints,
      textLength,
      reason,
    };
  }

  return {
    status: "success",
    pageTitle: document.title || "Untitled",
    summary,
    keyPoints,
    textLength,
  };
}
