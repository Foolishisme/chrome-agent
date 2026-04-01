import { JD_SELECTORS } from "../shared/selectors";
import type { ExtractedItem, ExtractionDiagnostics, ResultListState } from "../shared/types";

const PRODUCT_LINK_SELECTOR = [
  "a[href*='item.jd.com/']",
  "a[href*='item.jd.hk/']",
  "a[href*='item.m.jd.com/product/']",
  "[data-sku] a[href]",
  "[data-spu] a[href]",
  ".gl-item a[href]",
  ".sku-name a[href]",
  ".p-name a[href]",
  "[class*='title'] a[href]",
  "article[data-sku] a[href]",
].join(", ");
const PRICE_PATTERN = /(?:¥|￥)?\s?(\d{2,6}(?:\.\d{1,2})?)/;

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

function findBestProductLink(card: HTMLElement): HTMLAnchorElement | null {
  const explicit = pickWithin(card, JD_SELECTORS.resultLink) as HTMLAnchorElement | null;
  if (explicit?.href) {
    return explicit;
  }

  const anchors = Array.from(card.querySelectorAll<HTMLAnchorElement>("a[href]"));
  return (
    anchors.find((anchor) => {
      const href = normalizeHref(anchor.getAttribute("href") ?? anchor.href);
      const text = textOf(anchor);
      return (
        href.length > 0 &&
        !href.includes("/shop") &&
        !href.includes("mall.jd.com") &&
        !href.includes("list.jd.com") &&
        (text.length >= 4 || !!anchor.querySelector("img"))
      );
    }) ?? null
  );
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
    const matched = text.match(PRICE_PATTERN)?.[1];
    if (matched) {
      return matched;
    }
  }

  return textOf(container).match(PRICE_PATTERN)?.[1] ?? "";
}

function findSummary(container: HTMLElement | null) {
  if (!container) {
    return undefined;
  }

  const summaryNode = pickWithin(container, JD_SELECTORS.resultSummary);
  const summaryText = textOf(summaryNode);
  if (summaryText) {
    return summaryText;
  }

  const shopText = textOf(pickWithin(container, JD_SELECTORS.resultShop));
  const candidates = Array.from(container.querySelectorAll<HTMLElement>("span, p, div"))
    .filter((node) => !node.closest("a"))
    .map((node) => textOf(node))
    .filter((text) => text.length >= 4 && text.length <= 48 && !PRICE_PATTERN.test(text) && text !== shopText);

  return candidates[0];
}

function mapCard(card: HTMLElement): ExtractedItem {
  const titleNode = pickWithin(card, JD_SELECTORS.resultTitle);
  const linkNode = findBestProductLink(card);
  const priceNode = pickWithin(card, JD_SELECTORS.resultPrice);
  const shopNode = pickWithin(card, JD_SELECTORS.resultShop);
  const summaryNode = pickWithin(card, JD_SELECTORS.resultSummary);
  const tagNodes = pickAllWithin(card, JD_SELECTORS.resultTagSpans);

  return {
    title: textOf(titleNode) || textOf(linkNode),
    priceText: textOf(priceNode),
    url: normalizeHref(linkNode?.href ?? ""),
    shopText: textOf(shopNode) || undefined,
    tags: tagNodes.map((node) => textOf(node)).filter(Boolean).slice(0, 3),
    summary: textOf(summaryNode) || undefined,
  };
}

function extractByCardSelectors(root: Document | HTMLElement): ExtractedItem[] {
  return findCards(root).slice(0, 20).map((card) => mapCard(card));
}

function extractByHeuristics(root: Document | HTMLElement): ExtractedItem[] {
  const links = Array.from(root.querySelectorAll<HTMLAnchorElement>(PRODUCT_LINK_SELECTOR));

  return links.slice(0, 40).map((link) => {
    const container = findProductContainer(link);
    const title = textOf(link.querySelector("em, span")) || textOf(link);
    const shopNode = container ? pickWithin(container, JD_SELECTORS.resultShop) : null;
    const tagNodes = container ? pickAllWithin(container, JD_SELECTORS.resultTagSpans) : [];

    return {
      title,
      priceText: findPriceText(container),
      url: normalizeHref(link.href),
      shopText: textOf(shopNode) || undefined,
      tags: tagNodes.map((node) => textOf(node)).filter(Boolean).slice(0, 3),
      summary: findSummary(container),
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

export function extractStructuredProducts(root: Document | HTMLElement = document) {
  const primary = uniqueItems(extractByCardSelectors(root));
  const fallback = uniqueItems([...primary, ...extractByHeuristics(root)]);
  const items = (primary.length >= 3 ? primary : fallback).slice(0, 10);

  return {
    items,
    diagnostics: buildDiagnostics(primary, fallback, items, root),
  };
}
