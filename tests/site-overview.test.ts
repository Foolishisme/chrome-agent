import { describe, expect, it } from "vitest";
import { extractSiteNavLinks } from "../src/content/research";

describe("site overview navigation extraction", () => {
  it("extracts site navigation links from prominent page regions", () => {
    document.body.innerHTML = `
      <header>
        <nav>
          <a href="/products">Products</a>
          <a href="/pricing">Pricing</a>
        </nav>
      </header>
      <footer>
        <a href="/privacy">Privacy</a>
      </footer>
    `;

    const result = extractSiteNavLinks(document, { baseUrl: "https://openai.com/" });

    expect(result.candidates.map((candidate) => candidate.url)).toContain("https://openai.com/products");
    expect(result.candidates[0]?.linkLocation).toBe("header");
  });
});
