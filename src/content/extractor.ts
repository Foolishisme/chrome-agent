import { JD_SELECTORS } from "./jd-search-selectors";
import type { ExtractedItem, ExtractionDiagnostics, ResultListState } from "../shared/agent-domain-model";

const PRODUCT_LINK_SELECTOR = [
  "a[href*='item.jd.com/']",
  "a[href*='item.jd.hk/']",
  "a[href*='item.m.jd.com/product/']",
  ".gl-item a[href]",
  ".sku-name a[href]",
  ".p-name a[href]",
  "[class*='title'] a[href]",
  "article[data-sku] a[href]",
].join(", ");

const PRICE_PATTERN = /(?:¥|￥)?\s*(\d{2,6}(?:\.\d{1,2})?)/;

function textOf(element: Element | null | undefined): string {
  return element?.textContent?.replace(/\s+/g, " ").trim() ?? "";
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

function normalizeHref(href: string) {
  try {
    return new URL(href, window.location.href).href;
  } catch {
    return href;
  }
}

function isLikelyProductHref(href: string) {
  const normalized = normalizeHref(href);
  return (
    normalized.includes("item.jd.com/") ||
    normalized.includes("item.jd.hk/") ||
    normalized.includes("item.m.jd.com/product/")
  );
}

function findCards(root: Document | HTMLElement) {
  for (const selector of JD_SELECTORS.resultCards) {
    const found = Array.from(root.querySelectorAll<HTMLElement>(selector));
    if (found.length > 0) {
      return found;
    }
  }
  return [];
}

function hasEmptyState(root: Document | HTMLElement) {
  if (JD_SELECTORS.resultEmpty.some((selector) => root.querySelector(selector))) {
    return true;
  }

  const bodyText = textOf(root instanceof Document ? root.body : root);
  return bodyText.includes("没有找到") || bodyText.includes("抱歉");
}

export function collectResultListState(root: Document | HTMLElement = document): ResultListState {
  const cards = findCards(root);
  const productLinks = Array.from(root.querySelectorAll<HTMLAnchorElement>(PRODUCT_LINK_SELECTOR));
  const hasContainer = JD_SELECTORS.resultContainers.some((selector) => root.querySelector(selector));
  const isLoading = JD_SELECTORS.resultLoading.some((selector) => root.querySelector(selector));
  const emptyState = hasEmptyState(root);
  const readyState = root instanceof Document ? root.readyState : (root.ownerDocument?.readyState ?? document.readyState);

  return {
    present: hasContainer || cards.length > 0 || productLinks.length > 0 || emptyState,
    loaded: cards.length > 0 || productLinks.length > 0 || emptyState || (!isLoading && readyState === "complete"),
    cardCount: cards.length,
    productLinkCount: productLinks.length,
    emptyState,
  };
}

function uniqueItems(items: ExtractedItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.url}|${item.title}`;
    if (!item.title || !item.priceText || !item.url || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function extractPriceFromText(text: string) {
  return text.match(PRICE_PATTERN)?.[1] ?? "";
}

function findBestProductLink(card: HTMLElement): HTMLAnchorElement | null {
  const explicit = pickWithin(card, JD_SELECTORS.resultLink) as HTMLAnchorElement | null;
  if (explicit?.href && isLikelyProductHref(explicit.href)) {
    return explicit;
  }

  return (
    Array.from(card.querySelectorAll<HTMLAnchorElement>("a[href]")).find((anchor) => {
      const href = normalizeHref(anchor.getAttribute("href") ?? anchor.href);
      const text = textOf(anchor);
      return isLikelyProductHref(href) && (text.length >= 4 || !!anchor.querySelector("img"));
    }) ?? null
  );
}

function buildProductUrl(card: HTMLElement, link: HTMLAnchorElement | null) {
  if (link?.href && isLikelyProductHref(link.href)) {
    return normalizeHref(link.href);
  }

  const sku = card.dataset.sku ?? card.dataset.spu;
  if (sku && /^\d+$/.test(sku)) {
    return `https://item.jd.com/${sku}.html`;
  }

  return link?.href ? normalizeHref(link.href) : "";
}

function findProductContainer(anchor: HTMLAnchorElement): HTMLElement | null {
  let current: HTMLElement | null = anchor;
  for (let depth = 0; current && depth < 8; depth += 1) {
    const text = textOf(current);
    if (
      current.matches("[data-sku], [data-spu], .gl-item, li, .result-item, .goods-item, article") ||
      (text.length > 20 && PRICE_PATTERN.test(text))
    ) {
      return current;
    }
    current = current.parentElement;
  }
  return anchor.parentElement;
}

function findPriceText(container: HTMLElement | null) {
  if (!container) {
    return "";
  }

  const knownNode = pickWithin(container, JD_SELECTORS.resultPrice);
  const knownText = textOf(knownNode);
  if (knownText) {
    return knownText;
  }

  const texts = Array.from(container.querySelectorAll<HTMLElement>("div, span, strong, p, em"))
    .filter((node) => !node.closest("a"))
    .map((node) => textOf(node));

  for (const text of texts) {
    const matched = extractPriceFromText(text);
    if (matched) {
      return matched;
    }
  }

  return extractPriceFromText(textOf(container));
}

function findTitleText(container: HTMLElement | null, link: HTMLAnchorElement | null) {
  const linkText = textOf(link?.querySelector("em, span")) || textOf(link);
  if (linkText.length >= 4) {
    return linkText;
  }

  if (!container) {
    return linkText;
  }

  const knownNode = pickWithin(container, JD_SELECTORS.resultTitle);
  const knownText = textOf(knownNode);
  if (knownText) {
    return knownText;
  }

  const candidates = Array.from(container.querySelectorAll<HTMLElement>("div, span, p, em"))
    .map((node) => textOf(node))
    .filter((text) => text.length >= 8 && !PRICE_PATTERN.test(text) && !text.includes("已售"));

  return candidates[0] ?? linkText;
}

function findShopText(container: HTMLElement | null) {
  if (!container) {
    return "";
  }

  const knownNode = pickWithin(container, JD_SELECTORS.resultShop);
  const knownText = textOf(knownNode);
  if (knownText) {
    return knownText;
  }

  return (
    Array.from(container.querySelectorAll<HTMLElement>("div, span, a"))
      .map((node) => textOf(node))
      .find((text) => text.length >= 3 && text.length <= 32 && (text.endsWith("店") || text.includes("旗舰店"))) ?? ""
  );
}

function findSummary(container: HTMLElement | null, title: string, shopText: string) {
  if (!container) {
    return undefined;
  }

  const summaryNode = pickWithin(container, JD_SELECTORS.resultSummary);
  const summaryText = textOf(summaryNode);
  if (summaryText && summaryText !== title && summaryText !== shopText) {
    return summaryText;
  }

  const candidates = Array.from(container.querySelectorAll<HTMLElement>("span, p, div"))
    .filter((node) => !node.closest("a"))
    .map((node) => textOf(node))
    .filter((text) => {
      return (
        text.length >= 4 &&
        text.length <= 48 &&
        !PRICE_PATTERN.test(text) &&
        text !== title &&
        text !== shopText &&
        !text.endsWith("店")
      );
    });

  return candidates[0];
}

function mapCard(card: HTMLElement): ExtractedItem {
  const linkNode = findBestProductLink(card);
  const title = findTitleText(card, linkNode);
  const shopText = findShopText(card) || undefined;
  const tagNodes = pickAllWithin(card, JD_SELECTORS.resultTagSpans);

  return {
    title,
    priceText: findPriceText(card),
    url: buildProductUrl(card, linkNode),
    shopText,
    tags: tagNodes.map((node) => textOf(node)).filter(Boolean).slice(0, 3),
    summary: findSummary(card, title, shopText ?? ""),
  };
}

function extractByCardSelectors(root: Document | HTMLElement): ExtractedItem[] {
  return findCards(root).slice(0, 20).map((card) => mapCard(card));
}

function extractByHeuristics(root: Document | HTMLElement): ExtractedItem[] {
  const links = Array.from(root.querySelectorAll<HTMLAnchorElement>(PRODUCT_LINK_SELECTOR));

  return links.slice(0, 40).map((link) => {
    const container = findProductContainer(link);
    const title = findTitleText(container, link);
    const shopText = findShopText(container) || undefined;
    const tagNodes = container ? pickAllWithin(container, JD_SELECTORS.resultTagSpans) : [];

    return {
      title,
      priceText: findPriceText(container),
      url: normalizeHref(link.href),
      shopText,
      tags: tagNodes.map((node) => textOf(node)).filter(Boolean).slice(0, 3),
      summary: findSummary(container, title, shopText ?? ""),
    };
  });
}

function buildDiagnostics(primary: ExtractedItem[], fallback: ExtractedItem[], items: ExtractedItem[], root: Document | HTMLElement): ExtractionDiagnostics {
  const cards = findCards(root);
  const links = Array.from(root.querySelectorAll<HTMLAnchorElement>(PRODUCT_LINK_SELECTOR));
  const inspected = [...primary, ...fallback];

  return {
    cardCandidateCount: cards.length,
    productLinkCount: links.length,
    primaryItemCount: primary.length,
    fallbackItemCount: fallback.length,
    finalItemCount: items.length,
    filteredOutCount: inspected.length - items.length,
    missingTitleCount: inspected.filter((item) => !item.title).length,
    missingPriceCount: inspected.filter((item) => !item.priceText).length,
    missingUrlCount: inspected.filter((item) => !item.url).length,
  };
}

export function extractStructuredProducts(
  root: Document | HTMLElement = document,
  options: {
    limit?: number;
  } = {},
) {
  const limit = Math.max(1, options.limit ?? 10);
  const primary = uniqueItems(extractByCardSelectors(root));
  const fallback = uniqueItems([...primary, ...extractByHeuristics(root)]);
  const items = (primary.length >= 3 ? primary : fallback).slice(0, limit);

  return {
    items,
    diagnostics: buildDiagnostics(primary, fallback, items, root),
  };
}
