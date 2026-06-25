import { describe, expect, it } from "vitest";
import { renderMarkdownBlock } from "../src/sidepanel/renderers/markdown";

describe("sidepanel markdown renderer", () => {
  it("renders standard block and inline markdown", () => {
    const html = renderMarkdownBlock("# 标题\n\n正文包含 **粗体**、*斜体* 和 `代码`。", "空");

    expect(html).toContain('<div class="markdown-output">');
    expect(html).toContain("<h1>标题</h1>");
    expect(html).toContain("<strong>粗体</strong>");
    expect(html).toContain("<em>斜体</em>");
    expect(html).toContain("<code>代码</code>");
  });

  it("renders ordered, unordered, and nested lists with the existing class contract", () => {
    const html = renderMarkdownBlock("- 一级\n  1. 二级\n  2. 三级", "空");

    expect(html).toContain('<ul class="markdown-list">');
    expect(html).toContain('<ol class="markdown-list">');
    expect(html).toContain("<li>一级");
    expect(html).toContain("<li>二级</li>");
  });

  it("renders GFM tables and preserves pipes inside inline code", () => {
    const html = renderMarkdownBlock("| 名称 | 示例 |\n| --- | --- |\n| 管道 | `a\\|b` |", "空");

    expect(html).toContain('<div class="markdown-table-wrap"><table class="markdown-table">');
    expect(html).toContain("<th>名称</th>");
    expect(html).toContain("<code>a|b</code>");
    expect(html).toContain("</table></div>");
  });

  it("renders fenced code blocks without applying inline-code padding structure", () => {
    const html = renderMarkdownBlock("```ts\nconst value = 1;\n```", "空");

    expect(html).toContain('<pre><code class="language-ts">');
    expect(html).toContain("const value = 1;");
    expect(html).toContain("</code></pre>");
  });

  it("adds safe attributes to HTTP and HTTPS links", () => {
    const html = renderMarkdownBlock("[HTTP](http://example.com) [HTTPS](https://example.com/path)", "空");

    expect(html).toContain(
      '<a href="http://example.com" class="result-link" target="_blank" rel="noreferrer noopener">HTTP</a>',
    );
    expect(html).toContain(
      '<a href="https://example.com/path" class="result-link" target="_blank" rel="noreferrer noopener">HTTPS</a>',
    );
  });

  it("does not render unsafe links or raw HTML", () => {
    const html = renderMarkdownBlock('[危险](javascript:alert("x"))\n\n<img src=x onerror=alert(1)>', "空");

    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("safely renders incomplete streaming markdown", () => {
    expect(() => renderMarkdownBlock("正在输出 **未闭合粗体", "空")).not.toThrow();
    expect(() => renderMarkdownBlock("[未闭合链接](https://example.com", "空")).not.toThrow();
    expect(() => renderMarkdownBlock("```ts\nconst streaming = true;", "空")).not.toThrow();

    const codeHtml = renderMarkdownBlock("```ts\nconst streaming = true;", "空");
    expect(codeHtml).toContain("<pre><code");
    expect(codeHtml).toContain("const streaming = true;");
  });

  it("keeps the existing empty-state output", () => {
    expect(renderMarkdownBlock(undefined, "暂无结果")).toBe('<div class="muted">暂无结果</div>');
    expect(renderMarkdownBlock("", "<等待>")).toBe('<div class="muted">&lt;等待&gt;</div>');
  });
});
