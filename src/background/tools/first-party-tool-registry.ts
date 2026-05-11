import type { BrowserDriver } from "../browser/capability/browser-driver-contract";
import type { BrowserLinkObservation, BrowserObservation, BrowserPageProblem } from "../../shared/browser-capability-contract";
import { runExplicitUrlOverview } from "../browser/overview/explicit-url-overview";
import {
  FIRST_PARTY_LLM_VISIBLE_TOOL_CONTRACTS,
  FIRST_PARTY_LLM_VISIBLE_TOOL_NAMES,
  type BrowserSearchToolInput,
  type BrowserSearchToolOutput,
  type BrowserSiteOverviewPage,
  type BrowserSiteOverviewToolInput,
  type BrowserSiteOverviewToolOutput,
  type BrowserWebDetailFact,
  type BrowserWebDetailToolInput,
  type BrowserWebDetailToolOutput,
  type CommerceResearchToolInput,
  type CommerceResearchToolOutput,
  type FirstPartyLlmVisibleToolName,
} from "./first-party-tool-contracts";

export interface FirstPartyToolInputMap {
  "browser.search": BrowserSearchToolInput;
  "browser.webDetail": BrowserWebDetailToolInput;
  "browser.siteOverview": BrowserSiteOverviewToolInput;
  "skill.commerceResearch": CommerceResearchToolInput;
}

export interface FirstPartyToolOutputMap {
  "browser.search": BrowserSearchToolOutput;
  "browser.webDetail": BrowserWebDetailToolOutput;
  "browser.siteOverview": BrowserSiteOverviewToolOutput;
  "skill.commerceResearch": CommerceResearchToolOutput;
}

export interface FirstPartyToolHandlerContext {
  driver?: BrowserDriver;
  signal?: AbortSignal;
  commerceResearchDelegate?: (
    input: CommerceResearchToolInput,
    context: FirstPartyToolHandlerContext,
  ) => Promise<CommerceResearchToolOutput>;
}

export type FirstPartyToolHandler<Name extends FirstPartyLlmVisibleToolName> = (
  input: FirstPartyToolInputMap[Name],
  context: FirstPartyToolHandlerContext,
) => Promise<FirstPartyToolOutputMap[Name]>;

export type FirstPartyToolHandlerMap = {
  [Name in FirstPartyLlmVisibleToolName]: FirstPartyToolHandler<Name>;
};

export type FirstPartyToolRegistry = {
  [Name in FirstPartyLlmVisibleToolName]: {
    contract: (typeof FIRST_PARTY_LLM_VISIBLE_TOOL_CONTRACTS)[Name];
    handler: FirstPartyToolHandler<Name>;
  };
};

function ensureDriver(context: FirstPartyToolHandlerContext, toolName: FirstPartyLlmVisibleToolName): BrowserDriver {
  if (!context.driver) {
    throw new Error(`${toolName} requires a BrowserDriver.`);
  }
  return context.driver;
}

function normalizeText(text: string | undefined) {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function compactText(text: string | undefined, maxLength = 180) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return "";
  }
  return normalized.length > maxLength ? `${normalized.slice(0, Math.max(0, maxLength - 3))}...` : normalized;
}

function toToolProblems(problems: BrowserPageProblem[]) {
  return problems.map((problem) => ({
    code: problem.code,
    message: problem.message,
    suggestedNextAction: problem.suggestedNextAction,
  }));
}

function uniqueByUrl<T extends { url: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.url)) {
      return false;
    }
    seen.add(item.url);
    return true;
  });
}

function isSearchInternalUrl(url: string) {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./, "");
    return hostname === "google.com" || hostname.endsWith(".google.com");
  } catch {
    return true;
  }
}

function toSearchResults(observation: BrowserObservation) {
  const filtered = observation.links.filter((link) => {
    if (!link.url || isSearchInternalUrl(link.url)) {
      return false;
    }
    if (/\.pdf($|[?#])/i.test(link.url)) {
      return false;
    }
    return true;
  });

  return uniqueByUrl(filtered).map((link, index) => ({
    title: link.text || (() => {
      try {
        return new URL(link.url).hostname.replace(/^www\./, "");
      } catch {
        return link.url;
      }
    })(),
    url: link.url,
    snippet: undefined,
    source: (() => {
      try {
        return new URL(link.url).hostname.replace(/^www\./, "");
      } catch {
        return undefined;
      }
    })(),
    rankOnPage: index + 1,
  }));
}

function toDetailFacts(observation: BrowserObservation, url: string): BrowserWebDetailFact[] {
  const normalized = normalizeText(observation.mainText);
  if (!normalized) {
    return [];
  }

  const segments = normalized
    .split(/(?<=[。！？.!?])\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .slice(0, 3);

  if (segments.length === 0) {
    return [
      {
        text: compactText(normalized, 140),
        evidenceUrl: url,
        evidenceTitle: observation.title,
      },
    ];
  }

  return segments.map((segment) => ({
    text: compactText(segment, 140),
    evidenceUrl: url,
    evidenceTitle: observation.title,
  }));
}

function buildSearchPageUrl(input: BrowserSearchToolInput) {
  const url = new URL("https://www.google.com/search");
  url.searchParams.set("q", input.query);
  url.searchParams.set("hl", "zh-CN");
  return url.toString();
}

function inferPageStatus(observation: BrowserObservation): BrowserSiteOverviewPage["status"] {
  if (observation.problems.length > 0 || observation.coverage.mainTextChars === 0) {
    return "partial";
  }
  return "success";
}

function inferSitePageRole(link: BrowserLinkObservation, fallback: BrowserSiteOverviewPage["role"] = "other"): BrowserSiteOverviewPage["role"] {
  const text = `${link.text} ${link.url}`.toLowerCase();
  if (/(pricing|price|plans|定价|价格|费用)/i.test(text)) {
    return "pricing";
  }
  if (/(product|products|模型|产品|solutions|solution)/i.test(text)) {
    return "product";
  }
  if (/(docs|documentation|api|guide|guides|文档)/i.test(text)) {
    return "docs";
  }
  if (/(about|company|about us|关于)/i.test(text)) {
    return "about";
  }
  return fallback;
}

function sameSiteLinks(entryUrl: string, links: BrowserLinkObservation[]) {
  let hostname: string | undefined;
  let normalizedEntryUrl: string | undefined;
  try {
    const parsedEntryUrl = new URL(entryUrl);
    hostname = parsedEntryUrl.hostname.replace(/^www\./, "");
    parsedEntryUrl.hash = "";
    normalizedEntryUrl = parsedEntryUrl.toString();
  } catch {
    hostname = undefined;
    normalizedEntryUrl = undefined;
  }

  if (!hostname) {
    return [];
  }

  const filtered = links.filter((link) => {
    try {
      const parsedLinkUrl = new URL(link.url);
      parsedLinkUrl.hash = "";
      if (normalizedEntryUrl && parsedLinkUrl.toString() === normalizedEntryUrl) {
        return false;
      }

      const linkHostname = parsedLinkUrl.hostname.replace(/^www\./, "");
      return linkHostname === hostname || linkHostname.endsWith(`.${hostname}`) || hostname.endsWith(`.${linkHostname}`);
    } catch {
      return false;
    }
  });

  return uniqueByUrl(filtered);
}

export async function runBrowserSearchTool(
  input: BrowserSearchToolInput,
  context: FirstPartyToolHandlerContext,
): Promise<BrowserSearchToolOutput> {
  const driver = ensureDriver(context, "browser.search");
  const searchPageUrl = buildSearchPageUrl(input);
  const tab = await driver.openTab({ url: searchPageUrl, active: true }, { signal: context.signal });
  await driver.waitForStable(tab.tabId, { signal: context.signal });
  const observation = await driver.observe(tab.tabId, { signal: context.signal });
  const results = toSearchResults(observation);
  const limitations =
    results.length === 0 ? ["No usable natural results remained after rule-based filtering on the first page."] : [];

  return {
    status: results.length > 0 ? "success" : "partial",
    results,
    searchPageUrl: observation.url,
    coverage: {
      scope: "First visible natural results on the current search results page.",
      limitations,
    },
    problems:
      results.length > 0
        ? toToolProblems(observation.problems)
        : [
            ...toToolProblems(observation.problems),
            {
              code: "NO_USABLE_RESULTS",
              message: "第一页自然结果过滤后没有保留可读候选。",
              suggestedNextAction: "换一个更具体的查询词，或手动打开一个候选页后再调用 browser.webDetail。",
            },
          ],
  };
}

export async function runBrowserWebDetailTool(
  input: BrowserWebDetailToolInput,
  context: FirstPartyToolHandlerContext,
): Promise<BrowserWebDetailToolOutput> {
  const driver = ensureDriver(context, "browser.webDetail");
  const observation = await runExplicitUrlOverview(driver, {
    url: input.url,
    active: true,
  });
  const keyFacts = toDetailFacts(observation, input.url);
  const pageSummary =
    compactText(observation.mainText, 180) ||
    compactText(observation.links.map((link) => link.text).join(" "), 180) ||
    "页面可打开，但正文提取不足以形成稳定摘要。";
  const partial = keyFacts.length === 0 || observation.problems.length > 0 || observation.coverage.mainTextChars === 0;

  return {
    status: partial ? "partial" : "success",
    pageTitle: observation.title || input.url,
    pageSummary,
    keyFacts,
    coverage: {
      scope: "Single explicitly requested page after trimming and observation extraction.",
      limitations: partial ? ["Readable content was partial or insufficient for a fully stable detail summary."] : [],
    },
    links: observation.links
      .filter((link) => Boolean(link.text) && Boolean(link.url))
      .slice(0, 5)
      .map((link) => ({
        title: link.text || link.url,
        url: link.url,
      })),
    problems:
      partial && observation.problems.length === 0
        ? [
            {
              code: "READABILITY_PARTIAL",
              message: "正文脱水后信息不足，无法支持稳定摘要。",
              suggestedNextAction: "改用 browser.siteOverview 读取同站高价值页面，或手动指定更高价值的单页。",
            },
          ]
        : toToolProblems(observation.problems),
  };
}

export async function runBrowserSiteOverviewTool(
  input: BrowserSiteOverviewToolInput,
  context: FirstPartyToolHandlerContext,
): Promise<BrowserSiteOverviewToolOutput> {
  const driver = ensureDriver(context, "browser.siteOverview");
  const entryObservation = await runExplicitUrlOverview(driver, {
    url: input.entryUrl,
    active: true,
  });

  const selectedLinks = sameSiteLinks(entryObservation.url, entryObservation.links).slice(0, Math.max(0, input.maxPages - 1));
  const pagesRead: BrowserSiteOverviewPage[] = [
    {
      title: entryObservation.title || entryObservation.url,
      url: entryObservation.url,
      role: "entry",
      status: inferPageStatus(entryObservation),
    },
  ];
  const problems = [...toToolProblems(entryObservation.problems)];

  for (const link of selectedLinks) {
    const tab = await driver.openTab({ url: link.url, active: false }, { signal: context.signal });
    await driver.waitForStable(tab.tabId, { signal: context.signal });
    const observation = await driver.observe(tab.tabId, { signal: context.signal });
    pagesRead.push({
      title: observation.title || link.text || observation.url,
      url: observation.url,
      role: inferSitePageRole(link),
      status: inferPageStatus(observation),
    });
    problems.push(...toToolProblems(observation.problems));
  }

  const maxDepthLimitation = input.maxDepth > 1 ? ["Current handler only reads entry plus one-hop same-site pages."] : [];
  const gaps = selectedLinks.length === 0 ? ["No usable same-site navigation pages remained after filtering the homepage links."] : [];
  const limitations = [
    ...maxDepthLimitation,
    ...(gaps.length > 0 ? ["Same-site navigation candidates were exhausted before enough high-value pages were collected."] : []),
  ];
  const keyPages = pagesRead.filter((page) => page.role !== "entry");

  return {
    status: gaps.length > 0 || problems.length > 0 ? "partial" : "success",
    siteSummary:
      keyPages.length > 0
        ? `站点入口已读取，并补充了 ${keyPages.length} 个同站高价值页面，可用于形成基础站点概览。`
        : "入口页可读，但高价值同站页面不足，概览覆盖有限。",
    pagesRead,
    keyPages: keyPages.length > 0 ? keyPages : [pagesRead[0]],
    gaps,
    coverage: {
      scope: "Entry page plus same-site one-hop pages selected for the goal.",
      limitations,
    },
    problems,
  };
}

export async function runCommerceResearchTool(
  input: CommerceResearchToolInput,
  context: FirstPartyToolHandlerContext,
): Promise<CommerceResearchToolOutput> {
  if (context.commerceResearchDelegate) {
    return context.commerceResearchDelegate(input, context);
  }

  return {
    status: "blocked",
    shortlist: [],
    evidence: [],
    gaps: ["No commerce research delegate is wired into the first-party tool registry yet."],
    coverage: {
      scope: "Contract-level black-box commerce skill registration only.",
      limitations: ["A runtime delegate or adapter is required before this skill becomes executable."],
    },
    problems: [
      {
        code: "COMMERCE_DELEGATE_MISSING",
        message: "首批 commerce skill 已注册，但尚未接入可执行 delegate。",
        suggestedNextAction: "为 commerce_search 主链提供 registry handler 或 runtime delegate。",
      },
    ],
  };
}

export const DEFAULT_FIRST_PARTY_TOOL_HANDLERS: FirstPartyToolHandlerMap = {
  "browser.search": runBrowserSearchTool,
  "browser.webDetail": runBrowserWebDetailTool,
  "browser.siteOverview": runBrowserSiteOverviewTool,
  "skill.commerceResearch": runCommerceResearchTool,
};

export function createFirstPartyToolRegistry(handlers: FirstPartyToolHandlerMap): FirstPartyToolRegistry {
  const registry = {
    "browser.search": {
      contract: FIRST_PARTY_LLM_VISIBLE_TOOL_CONTRACTS["browser.search"],
      handler: handlers["browser.search"],
    },
    "browser.webDetail": {
      contract: FIRST_PARTY_LLM_VISIBLE_TOOL_CONTRACTS["browser.webDetail"],
      handler: handlers["browser.webDetail"],
    },
    "browser.siteOverview": {
      contract: FIRST_PARTY_LLM_VISIBLE_TOOL_CONTRACTS["browser.siteOverview"],
      handler: handlers["browser.siteOverview"],
    },
    "skill.commerceResearch": {
      contract: FIRST_PARTY_LLM_VISIBLE_TOOL_CONTRACTS["skill.commerceResearch"],
      handler: handlers["skill.commerceResearch"],
    },
  } satisfies FirstPartyToolRegistry;

  validateFirstPartyToolRegistry(registry);
  return registry;
}

export function createDefaultFirstPartyToolRegistry() {
  return createFirstPartyToolRegistry(DEFAULT_FIRST_PARTY_TOOL_HANDLERS);
}

export function validateFirstPartyToolRegistry(registry: FirstPartyToolRegistry) {
  const registryKeys = Object.keys(registry).sort();
  const expectedKeys = [...FIRST_PARTY_LLM_VISIBLE_TOOL_NAMES].sort();

  if (registryKeys.length !== expectedKeys.length || registryKeys.some((key, index) => key !== expectedKeys[index])) {
    throw new Error(`First-party tool registry keys must exactly match ${expectedKeys.join(", ")}.`);
  }

  for (const name of FIRST_PARTY_LLM_VISIBLE_TOOL_NAMES) {
    const entry = registry[name];
    if (!entry) {
      throw new Error(`Missing first-party tool registry entry: ${name}.`);
    }
    if (entry.contract.name !== name) {
      throw new Error(`Registry entry ${name} is bound to contract ${entry.contract.name}.`);
    }
    if (typeof entry.handler !== "function") {
      throw new Error(`Registry entry ${name} must expose a handler.`);
    }
    if (!entry.contract.description || entry.contract.timeoutMs <= 0) {
      throw new Error(`Registry entry ${name} is missing required metadata.`);
    }
    if (entry.contract.requires.length === 0 || entry.contract.produces.length === 0) {
      throw new Error(`Registry entry ${name} must declare requires/produces metadata.`);
    }
  }
}

export function getFirstPartyToolRegistration<Name extends FirstPartyLlmVisibleToolName>(
  registry: FirstPartyToolRegistry,
  name: Name,
) {
  return registry[name];
}

export async function executeFirstPartyTool<Name extends FirstPartyLlmVisibleToolName>(
  registry: FirstPartyToolRegistry,
  name: Name,
  input: unknown,
  context: FirstPartyToolHandlerContext,
): Promise<FirstPartyToolOutputMap[Name]> {
  const registration = getFirstPartyToolRegistration(registry, name);
  const parsedInput = registration.contract.inputSchema.parse(input) as FirstPartyToolInputMap[Name];
  const rawOutput = await registration.handler(parsedInput, context);
  return registration.contract.outputSchema.parse(rawOutput) as FirstPartyToolOutputMap[Name];
}
