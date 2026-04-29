import { getLinksAndControls } from "./links-controls";
import { detectBrowserCorePageProblems } from "./page-problems";
import { extractReadableContent } from "./readable-content";
import type { BrowserCoreSnapshot } from "../../shared/browser-core/types";

export function buildBrowserCoreSnapshot(doc: Document = document, options: { tabId?: number; textLimit?: number } = {}): BrowserCoreSnapshot {
  const content = extractReadableContent(doc, { maxChars: options.textLimit });
  const linksAndControls = getLinksAndControls(doc, { tabId: options.tabId });
  const problems = [...content.problems, ...detectBrowserCorePageProblems(doc, content.text)];

  return {
    url: doc.location?.href ?? "",
    title: doc.title || "",
    mainText: content.text,
    links: linksAndControls.links,
    controls: linksAndControls.controls,
    targets: linksAndControls.targets,
    problems,
    truncated: content.truncated,
    coverage: {
      mainTextChars: content.text.length,
      linkCount: linksAndControls.coverage.linkCount,
      controlCount: linksAndControls.coverage.controlCount,
      targetCount: linksAndControls.coverage.targetCount,
    },
  };
}

