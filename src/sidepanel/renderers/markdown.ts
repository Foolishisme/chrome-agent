import markdownit from "markdown-it";
import { escapeHtml } from "./sidepanel-rendering-primitives";

const markdownRenderer = markdownit({
  html: false,
  linkify: false,
  breaks: false,
});

markdownRenderer.validateLink = (url) => /^https?:\/\//i.test(url);

markdownRenderer.renderer.rules.link_open = (tokens, index, options, _env, self) => {
  const token = tokens[index];
  token.attrSet("class", "result-link");
  token.attrSet("target", "_blank");
  token.attrSet("rel", "noreferrer noopener");
  return self.renderToken(tokens, index, options);
};

markdownRenderer.renderer.rules.bullet_list_open = () => '<ul class="markdown-list">';
markdownRenderer.renderer.rules.ordered_list_open = () => '<ol class="markdown-list">';
markdownRenderer.renderer.rules.table_open = () => '<div class="markdown-table-wrap"><table class="markdown-table">';
markdownRenderer.renderer.rules.table_close = () => "</table></div>";

export function renderMarkdownBlock(markdown: string | undefined, emptyText: string) {
  if (!markdown) {
    return `<div class="muted">${escapeHtml(emptyText)}</div>`;
  }

  return `<div class="markdown-output">${markdownRenderer.render(markdown)}</div>`;
}
