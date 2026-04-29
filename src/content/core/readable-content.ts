import { Readability } from "@mozilla/readability";
import { createBrowserCoreProblem } from "../../shared/browser-core/page-problems";
import { htmlToMarkdownExcerpt } from "./markdown";
import { buildTextExcerpt, normalizeWhitespace } from "./trimming";
import type { BrowserCoreReadableContent } from "../../shared/browser-core/types";

const DEFAULT_MAX_CHARS = 2_000;
const MIN_READABLE_TEXT_LENGTH = 120;
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
  /璇勮|鍥炲|鐩稿叧闃呰|鐩稿叧鎺ㄨ崘|鎺ㄨ崘闃呰|骞垮憡|璧炲姪|璁㈤槄|鍒嗕韩/,
];
const NOISE_SEGMENT_PATTERNS = [
  /^(comments?|replies|discussion|related|recommended|popular|sponsored|advertisement)\b/i,
  /^(subscribe|sign up|share|read more|continue reading)\b/i,
  /^(璇勮|鍥炲|鐩稿叧闃呰|鐩稿叧鎺ㄨ崘|鎺ㄨ崘闃呰|骞垮憡|璧炲姪|璁㈤槄|鍒嗕韩)/,
];

function currentUrl(doc: Document) {
  return doc.location?.href ?? "";
}

function textSegments(root: ParentNode) {
  return Array.from(root.querySelectorAll<HTMLElement>("h1, h2, h3, p, li"))
    .map((node) => normalizeWhitespace(node.textContent ?? ""))
    .filter((text) => text.length >= 24)
    .filter((text) => !NOISE_SEGMENT_PATTERNS.some((pattern) => pattern.test(text)));
}

function segmentsFromText(text: string) {
  return text
    .split(/\n+/)
    .map((segment) => normalizeWhitespace(segment))
    .filter((segment) => segment.length >= 24)
    .filter((segment) => !NOISE_SEGMENT_PATTERNS.some((pattern) => pattern.test(segment)));
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

  return !!values && NOISE_ATTRIBUTE_PATTERNS.some((pattern) => pattern.test(values));
}

function removeNoiseContainers(root: ParentNode) {
  root.querySelectorAll<HTMLElement>("script, style, noscript, nav, footer, header, aside, form, button, input, svg, canvas").forEach(
    (node) => node.remove(),
  );

  for (const element of Array.from(root.querySelectorAll<HTMLElement>("section, div, aside, ul, ol"))) {
    if (element.parentElement && isLikelyNoiseContainer(element)) {
      element.remove();
    }
  }
}

function resolveReadableRoot(doc: Document) {
  return (
    doc.querySelector<HTMLElement>("article") ??
    doc.querySelector<HTMLElement>("main") ??
    doc.querySelector<HTMLElement>("[role='main']") ??
    doc.body
  );
}

function makeResult(input: {
  status: BrowserCoreReadableContent["status"];
  title: string;
  url: string;
  text: string;
  markdown: string;
  textLength: number;
  strategy: BrowserCoreReadableContent["strategy"];
  truncated: boolean;
  problems?: BrowserCoreReadableContent["problems"];
}): BrowserCoreReadableContent {
  return {
    ...input,
    problems: input.problems ?? [],
  };
}

export function extractReadableContent(doc: Document = document, options: { maxChars?: number } = {}): BrowserCoreReadableContent {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const url = currentUrl(doc);

  if (/\.pdf(?:$|[?#])/i.test(url)) {
    return makeResult({
      status: "partial",
      title: doc.title || "PDF",
      url,
      text: "",
      markdown: "",
      textLength: 0,
      strategy: "fallback",
      truncated: false,
      problems: [createBrowserCoreProblem("unsupported_page", "PDF page extraction is not implemented in Browser Core V2.")],
    });
  }

  try {
    const clonedDocument = doc.cloneNode(true) as Document;
    removeNoiseContainers(clonedDocument);
    const parsed = new Readability(clonedDocument).parse();
    const textContent = parsed?.textContent ?? "";
    const cleanedText = normalizeWhitespace(textContent);
    const segments = segmentsFromText(textContent);

    if (parsed?.content && cleanedText.length >= MIN_READABLE_TEXT_LENGTH && segments.length > 0) {
      const text = buildTextExcerpt(segments, maxChars);
      const markdown = htmlToMarkdownExcerpt(parsed.content, maxChars);
      return makeResult({
        status: "success",
        title: parsed.title?.trim() || doc.title || "Untitled",
        url,
        text,
        markdown: markdown.markdown,
        textLength: cleanedText.length,
        strategy: "readability",
        truncated: markdown.truncated || cleanedText.length > text.length,
      });
    }
  } catch {
    // Fall back to conservative DOM text extraction.
  }

  const root = resolveReadableRoot(doc).cloneNode(true) as HTMLElement;
  removeNoiseContainers(root);
  const segments = textSegments(root);
  const text = buildTextExcerpt(segments, maxChars);
  const textLength = segments.join(" ").length;
  const markdown = htmlToMarkdownExcerpt(root.innerHTML, maxChars);
  const hasPasswordInput = !!doc.querySelector("input[type='password']");
  const likelySpa = textLength < MIN_READABLE_TEXT_LENGTH && !!doc.querySelector("#app, #root, [data-reactroot]");
  const problems =
    textLength < MIN_READABLE_TEXT_LENGTH
      ? [
          createBrowserCoreProblem(likelySpa ? "empty_content" : "empty_content", likelySpa ? "SPA page has limited readable DOM text." : "Readable text is too short.", {
            recoverable: true,
            suggestedNextAction: "Observe links and controls, then decide whether a low-risk interaction is needed.",
          }),
        ]
      : [];

  if (hasPasswordInput) {
    problems.push(
      createBrowserCoreProblem("login_wall", "Password input detected; page may be behind a login wall.", {
        recoverable: true,
        suggestedNextAction: "Ask the user before continuing through login or account-specific pages.",
      }),
    );
  }

  return makeResult({
    status: problems.length > 0 ? "partial" : "success",
    title: doc.title || "Untitled",
    url,
    text,
    markdown: markdown.markdown,
    textLength,
    strategy: "fallback",
    truncated: markdown.truncated,
    problems,
  });
}

