import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { extractReadableContent } from "../../src/content/core/readable-content";

describe("Browser Core V2 readable content", () => {
  it("extracts a markdown excerpt with Readability and Turndown", () => {
    const dom = new JSDOM(
      `<!doctype html>
      <html>
        <head><title>Readable Example</title></head>
        <body>
          <nav>Navigation noise</nav>
          <article>
            <h1>Browser agents need reliable tools</h1>
            <p>Browser Core V2 reads page content through a store-safe content script path.</p>
            <p>The readable article body is converted to a compact markdown excerpt before it reaches the LLM.</p>
          </article>
        </body>
      </html>`,
      { url: "https://example.com/readable" },
    );

    const result = extractReadableContent(dom.window.document, { maxChars: 500 });

    expect(result.status).toBe("success");
    expect(result.strategy).toBe("readability");
    expect(result.markdown).toContain("# Browser agents need reliable tools");
    expect(result.markdown).toContain("compact markdown excerpt");
    expect(result.markdown).not.toContain("Navigation noise");
  });

  it("falls back to DOM text when Readability has too little article structure", () => {
    const dom = new JSDOM(
      `<!doctype html>
      <html>
        <head><title>Fallback Example</title></head>
        <body>
          <main>
            <h1>Fallback page</h1>
            <p>This page keeps enough meaningful text for the conservative fallback extractor.</p>
            <p>The fallback path should preserve useful content without needing CDP or debugger permission.</p>
          </main>
        </body>
      </html>`,
      { url: "https://example.com/fallback" },
    );

    const result = extractReadableContent(dom.window.document, { maxChars: 500 });

    expect(result.status).toBe("success");
    expect(result.text).toContain("conservative fallback extractor");
    expect(result.markdown).toContain("Fallback page");
  });
});
