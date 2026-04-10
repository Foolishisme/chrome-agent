import { escapeHtml } from "./common";

function renderInlineMarkdown(text: unknown) {
  let html = escapeHtml(text);
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a class="result-link" href="$2" target="_blank" rel="noreferrer">$1</a>');
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return html;
}

function isMarkdownTableSeparator(line: string) {
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line);
}

function parseMarkdownTableRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => renderInlineMarkdown(cell.trim()));
}

function renderMarkdownTable(lines: string[], startIndex: number) {
  const headerCells = parseMarkdownTableRow(lines[startIndex] ?? "");
  const bodyRows: string[] = [];
  let index = startIndex + 2;

  while (index < lines.length) {
    const current = lines[index]?.trim() ?? "";
    if (!current || !current.includes("|")) {
      break;
    }

    const cells = parseMarkdownTableRow(current);
    bodyRows.push(`<tr>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`);
    index += 1;
  }

  return {
    html: `
      <div class="markdown-table-wrap">
        <table class="markdown-table">
          <thead><tr>${headerCells.map((cell) => `<th>${cell}</th>`).join("")}</tr></thead>
          <tbody>${bodyRows.join("")}</tbody>
        </table>
      </div>
    `,
    nextIndex: index - 1,
  };
}

export function renderMarkdownBlock(markdown: string | undefined, emptyText: string) {
  if (!markdown) {
    return `<div class="muted">${escapeHtml(emptyText)}</div>`;
  }

  const lines = markdown.split(/\r?\n/);
  const parts: string[] = [];
  let listItems: string[] = [];
  let listTag: "ul" | "ol" | undefined;

  const flushList = () => {
    if (listItems.length === 0) {
      return;
    }
    const tag = listTag ?? "ul";
    parts.push(`<${tag} class="markdown-list">${listItems.join("")}</${tag}>`);
    listItems = [];
    listTag = undefined;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      continue;
    }

    const nextTrimmed = lines[index + 1]?.trim() ?? "";
    if (trimmed.includes("|") && isMarkdownTableSeparator(nextTrimmed)) {
      flushList();
      const table = renderMarkdownTable(lines, index);
      parts.push(table.html);
      index = table.nextIndex;
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      parts.push(`<h${level} class="markdown-h${level}">${renderInlineMarkdown(headingMatch[2])}</h${level}>`);
      continue;
    }

    const orderedMatch = trimmed.match(/^\d+\.\s+(.*)$/);
    if (orderedMatch) {
      if (listTag && listTag !== "ol") {
        flushList();
      }
      listTag = "ol";
      listItems.push(`<li>${renderInlineMarkdown(orderedMatch[1])}</li>`);
      continue;
    }

    const unorderedMatch = trimmed.match(/^[-*+]\s+(.*)$/);
    if (unorderedMatch) {
      if (listTag && listTag !== "ul") {
        flushList();
      }
      listTag = "ul";
      listItems.push(`<li>${renderInlineMarkdown(unorderedMatch[1])}</li>`);
      continue;
    }

    flushList();
    parts.push(`<p>${renderInlineMarkdown(trimmed)}</p>`);
  }

  flushList();
  return `<div class="markdown-output">${parts.join("")}</div>`;
}
