import { Readability } from "@mozilla/readability";
import { LIMITS } from "../shared/constants";
import type { PageContentState, PageFactExtraction, ResearchCandidate, SearchResultsState } from "../shared/types";

const MAX_EXCERPT_CHARS = 2_000;
const NOISE_ATTRIBUTE_PATTERNS = [
  /\bcomment(s|ing)?\b/i,
  /\breply\b/i,
  /\bdiscussion\b/i,
  /\brelated\b/i,
  /\brecommend(ed|ation)?\b/i,
  /\bsuggest(ed|ion)?\b/i,
  /\bpopular\b/i,
  /\bpromo\b/i,
  /\bsponsored\b/i,
  /\badvert(isement|orial)?\b/i,
  /\bnewsletter\b/i,
  /\bsubscribe\b/i,
  /\bshare\b/i,
  /评论|回复|相关阅读|相关推荐|推荐阅读|广告|赞助|订阅|分享/,
];
const NOISE_SEGMENT_PATTERNS = [
  /^(comments?|replies|discussion|related|recommended|popular|sponsored|advertisement)\b/i,
  /^(subscribe|sign up|share|read more|continue reading)\b/i,
  /^(评论|回复|相关阅读|相关推荐|推荐阅读|广告|赞助|订阅|分享)/,
];

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

function normalizeHref(rawHref: string, baseUrl = window.location.href) {
  try {
    const parsed = new URL(rawHref, baseUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return "";
    }
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function getLinkLocation(anchor: HTMLAnchorElement): ResearchCandidate["linkLocation"] {
  if (anchor.closest("header")) {
    return "header";
  }
  if (anchor.closest("nav, [role='navigation']")) {
    return "nav";
  }
  if (anchor.closest("main, article, [role='main']")) {
    return "main";
  }
  if (anchor.closest("footer")) {
    return "footer";
  }
  return "unknown";
}

function titleFromAnchor(anchor: HTMLAnchorElement) {
  return (
    textOf(anchor) ||
    anchor.getAttribute("aria-label") ||
    anchor.getAttribute("title") ||
    anchor.href
  ).trim();
}

export function extractSiteNavLinks(root: Document | HTMLElement = document, options: { limit?: number; baseUrl?: string } = {}) {
  const limit = options.limit ?? 40;
  const baseUrl = options.baseUrl ?? window.location.href;
  const candidates: ResearchCandidate[] = [];
  const seen = new Set<string>();
  const anchors = Array.from(root.querySelectorAll<HTMLAnchorElement>("header a[href], nav a[href], [role='navigation'] a[href], main a[href], footer a[href], a[href]"));

  for (const anchor of anchors) {
    const url = normalizeHref(anchor.getAttribute("href") ?? anchor.href, baseUrl);
    if (!url || seen.has(url)) {
      continue;
    }

    seen.add(url);
    const linkText = titleFromAnchor(anchor);
    candidates.push({
      title: linkText,
      url,
      linkText,
      linkLocation: getLinkLocation(anchor),
      rank: candidates.length + 1,
      source: (() => {
        try {
          return new URL(url).hostname.replace(/^www\./, "");
        } catch {
          return undefined;
        }
      })(),
    });

    if (candidates.length >= limit) {
      break;
    }
  }

  return {
    candidates,
    diagnostics: {
      linkCount: anchors.length,
      dedupedCount: seen.size,
      finalCount: candidates.length,
    },
  };
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
    .filter((text) => text.length >= 24)
    .filter((text) => !NOISE_SEGMENT_PATTERNS.some((pattern) => pattern.test(text)));
}

function buildSegmentsFromText(text: string) {
  return text
    .split(/\n+/)
    .map((segment) => segment.replace(/\s+/g, " ").trim())
    .filter((segment) => segment.length >= 24)
    .filter((segment) => !NOISE_SEGMENT_PATTERNS.some((pattern) => pattern.test(segment)));
}

function buildExcerptFromSegments(segments: string[], maxChars = MAX_EXCERPT_CHARS) {
  const picked: string[] = [];
  let total = 0;

  for (const segment of segments) {
    const nextLength = total + segment.length + (picked.length > 0 ? 2 : 0);
    if (picked.length > 0 && nextLength > maxChars) {
      break;
    }

    if (picked.length === 0 && segment.length > maxChars) {
      picked.push(segment.slice(0, maxChars));
      break;
    }

    picked.push(segment);
    total = nextLength;
  }

  return picked.join("\n\n").trim();
}

function cloneReadableRoot(root: HTMLElement) {
  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("script, style, noscript, nav, footer, header, aside, form, button, input, svg, canvas").forEach((node) => {
    node.remove();
  });
  removeNoiseContainers(clone);
  return clone;
}

function isLikelyNoiseContainer(node: Element) {
  const values = [
    node.getAttribute("id"),
    node.getAttribute("class"),
    node.getAttribute("role"),
    node.getAttribute("aria-label"),
    node.getAttribute("data-testid"),
    node.getAttribute("data-component"),
  ]
    .filter(Boolean)
    .join(" ");

  if (!values) {
    return false;
  }

  return NOISE_ATTRIBUTE_PATTERNS.some((pattern) => pattern.test(values));
}

function removeNoiseContainers(root: ParentNode) {
  const elements = Array.from(root.querySelectorAll<HTMLElement>("section, div, aside, ul, ol"));
  for (const element of elements) {
    if (!element.parentElement) {
      continue;
    }

    if (!isLikelyNoiseContainer(element)) {
      continue;
    }

    element.remove();
  }
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

function extractWithReadability() {
  try {
    const clonedDocument = document.cloneNode(true) as Document;
    removeNoiseContainers(clonedDocument);
    const parsed = new Readability(clonedDocument).parse();
    if (!parsed?.textContent) {
      return undefined;
    }

    const cleanedText = parsed.textContent.replace(/\s+/g, " ").trim();
    const segments = buildSegmentsFromText(parsed.textContent);
    if (cleanedText.length < LIMITS.PAGE_TEXT_MIN_LENGTH || segments.length < 2) {
      return undefined;
    }

      return {
        pageTitle: parsed.title?.trim() || document.title || "Untitled",
        bodyExcerpt: buildExcerptFromSegments(segments),
        textLength: cleanedText.length,
      };
  } catch {
    return undefined;
  }
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
      bodyExcerpt: "",
      textLength: 0,
      extractionStrategy: "fallback",
      reason: "PDF 页面未做正文提取",
    };
  }

  const readabilityResult = extractWithReadability();
  if (readabilityResult) {
    return {
      status: "success",
      pageTitle: readabilityResult.pageTitle,
      bodyExcerpt: readabilityResult.bodyExcerpt,
      textLength: readabilityResult.textLength,
      extractionStrategy: "readability",
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
  const bodyExcerpt = buildExcerptFromSegments(segments);

  if (reason) {
    return {
      status: "partial",
      pageTitle: document.title || "Untitled",
      bodyExcerpt,
      textLength,
      extractionStrategy: "fallback",
      reason,
    };
  }

  return {
    status: "success",
    pageTitle: document.title || "Untitled",
    bodyExcerpt,
    textLength,
    extractionStrategy: "fallback",
  };
}
