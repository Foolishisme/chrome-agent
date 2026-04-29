import TurndownService from "turndown";
import { trimText } from "./trimming";

const markdownConverter = new TurndownService({
  codeBlockStyle: "fenced",
  headingStyle: "atx",
});

markdownConverter.remove(["script", "style", "noscript", "canvas", "iframe"]);

export function htmlToMarkdownExcerpt(html: string, maxChars = 2_000) {
  const markdown = markdownConverter.turndown(html).replace(/\n{3,}/g, "\n\n").trim();
  const trimmed = trimText(markdown, maxChars);
  return {
    markdown: trimmed.text,
    truncated: trimmed.truncated,
  };
}

