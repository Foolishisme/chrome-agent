import { describe, expect, it, vi } from "vitest";
import { collectResultListState, extractStructuredProducts } from "../src/content/extractor";
import { scanPageAtUrl } from "../src/content/scanner";
import type { SemanticNode } from "../src/shared/agent-domain-model";

function mockVisibleRect() {
  return vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const width = this.hasAttribute("data-zero-size") ? 0 : 160;
      const height = this.hasAttribute("data-zero-size") ? 0 : 36;
      return {
        x: 0,
        y: 0,
        width,
        height,
        top: 0,
        left: 0,
        right: width,
        bottom: height,
        toJSON() {
          return {};
        },
      } as DOMRect;
    },
  );
}

function flattenSemanticNodes(node: SemanticNode): SemanticNode[] {
  return [node, ...(node.children ?? []).flatMap((child) => flattenSemanticNodes(child))];
}

describe("extractStructuredProducts", () => {
  it("maps classic JD search result cards into normalized items", () => {
    document.body.innerHTML = `
      <div id="J_goodsList">
        <div class="gl-item">
          <div class="p-name"><a href="https://item.jd.com/1.html"><em>ThinkBook 14</em></a></div>
          <div class="p-price"><strong>4999.00</strong></div>
          <div class="p-shop"><a>Lenovo 官方旗舰店</a></div>
          <div class="p-icons"><i>满减</i></div>
          <div class="p-promotions">高性能轻薄本</div>
        </div>
        <div class="gl-item">
          <div class="p-name"><a href="https://item.jd.com/2.html"><em>Redmi Book</em></a></div>
          <div class="p-price"><strong>4599.00</strong></div>
          <div class="p-shop"><a>Xiaomi 京东自营</a></div>
        </div>
      </div>
    `;

    const result = extractStructuredProducts(document);

    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      title: "ThinkBook 14",
      priceText: "4999.00",
      shopText: "Lenovo 官方旗舰店",
      url: "https://item.jd.com/1.html",
    });
    expect(result.items[0].tags).toContain("满减");
    expect(result.items[0].summary).toBe("高性能轻薄本");
    expect(result.diagnostics.primaryItemCount).toBe(2);
    expect(result.diagnostics.finalItemCount).toBe(2);
  });

  it("falls back to anchor-based extraction when card selectors miss", () => {
    document.body.innerHTML = `
      <section class="custom-results">
        <article data-sku="1001">
          <a href="https://item.jd.com/1001.html"><span>MateBook 14</span></a>
          <div class="meta">到手价 5299.00 元</div>
          <div class="shopline"><a>Huawei 京东自营</a></div>
          <p>轻薄高刷屏</p>
        </article>
        <article data-sku="1002">
          <a href="https://item.jd.com/1002.html"><span>MagicBook X16</span></a>
          <div>优惠价 4899.00</div>
          <p>大屏办公本</p>
        </article>
      </section>
    `;

    const result = extractStructuredProducts(document);

    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      title: "MateBook 14",
      priceText: "5299.00",
      url: "https://item.jd.com/1001.html",
    });
    expect(result.items[0].shopText).toBe("Huawei 京东自营");
    expect(result.items[0].summary).toBe("轻薄高刷屏");
    expect(result.diagnostics.fallbackItemCount).toBeGreaterThanOrEqual(2);
  });

  it("extracts current JD data-sku cards without opening the detail page", () => {
    const rectSpy = mockVisibleRect();

    document.title = "MacBook Air - 商品搜索 - 京东";
    document.body.innerHTML = `
      <div class="jd_pc_search_bar_react_search_wrap">
        <input class="jd_pc_search_bar_react_search_input" aria-label="搜索" value="MacBook Air" />
        <button class="jd_pc_search_bar_react_search_btn">搜索</button>
      </div>
      <section class="search-list">
        <div data-sku="1001" class="_wrapper_x plugin_goodsCardWrapper">
          <div class="_goods_title_container_x">
            <span>MacBook Air 13 英寸 M4</span>
          </div>
          <div class="_container_x">
            <span class="_price_x">¥7999.00</span>
          </div>
          <div class="_tags_x">
            <div class="_textTag_x"><span>学生优惠</span></div>
          </div>
          <div class="_shopFloor_x">
            <span class="_name_x">Apple 产品京东自营旗舰店</span>
          </div>
          <div class="_goods_volume_x">
            <span>已售 1万+</span>
          </div>
        </div>
      </section>
    `;

    const snapshot = scanPageAtUrl("https://search.jd.com/Search?keyword=MacBook%20Air");
    const extracted = extractStructuredProducts(document);

    expect(snapshot.pageFacts.searchBox.present).toBe(true);
    expect(snapshot.pageFacts.searchSubmit.present).toBe(true);
    expect(snapshot.pageReady.ready).toBe(true);
    expect(snapshot.pageFacts.resultList?.cardCount).toBe(1);
    expect(snapshot.pageFacts.resultList?.productLinkCount).toBe(0);
    expect(extracted.items).toHaveLength(1);
    expect(extracted.items[0]).toMatchObject({
      title: "MacBook Air 13 英寸 M4",
      url: "https://item.jd.com/1001.html",
      shopText: "Apple 产品京东自营旗舰店",
    });
    expect(extracted.items[0].priceText).toContain("7999");
    expect(extracted.items[0].tags).toContain("学生优惠");

    rectSpy.mockRestore();
  });
});

describe("collectResultListState", () => {
  it("reports result list readiness from cards and links", () => {
    document.body.innerHTML = `
      <div id="J_goodsList">
        <div class="gl-item"><a href="https://item.jd.com/1.html" target="_blank">A</a></div>
        <div class="gl-item"><a href="https://item.jd.com/2.html" target="_blank">B</a></div>
      </div>
    `;

    const state = collectResultListState(document);

    expect(state.present).toBe(true);
    expect(state.loaded).toBe(true);
    expect(state.cardCount).toBe(2);
    expect(state.productLinkCount).toBe(2);
  });

  it("treats link-based result sections as ready even when classic cards are missing", () => {
    const rectSpy = mockVisibleRect();

    document.title = "MacBook 搜索";
    document.body.innerHTML = `
      <div class="search-form">
        <input id="key" value="MacBook" />
        <button class="button">搜索</button>
      </div>
      <section class="custom-results">
        <article class="custom-entry">
          <div class="sku-name"><a href="https://item.jd.com/2001.html"><span>MacBook Air 13</span></a></div>
          <div>到手价 7999.00 元</div>
          <div class="shopline"><a>Apple 产品京东自营旗舰店</a></div>
          <p>轻薄便携</p>
        </article>
        <article class="custom-entry">
          <div class="sku-name"><a href="https://item.jd.com/2002.html"><span>MacBook Pro 14</span></a></div>
          <div>到手价 12999.00 元</div>
          <p>M 系列芯片</p>
        </article>
      </section>
    `;

    const state = collectResultListState(document);
    const snapshot = scanPageAtUrl("https://search.jd.com/Search?keyword=MacBook");
    const extracted = extractStructuredProducts(document);

    expect(state.present).toBe(true);
    expect(state.loaded).toBe(true);
    expect(state.cardCount).toBe(0);
    expect(state.productLinkCount).toBe(2);
    expect(snapshot.pageReady.ready).toBe(true);
    expect(snapshot.pageFacts.resultList?.productLinkCount).toBe(2);
    expect(extracted.items).toHaveLength(2);

    rectSpy.mockRestore();
  });

  it("allows extraction on search pages even when the search input is missing", () => {
    const rectSpy = mockVisibleRect();

    document.title = "macbookair - 商品搜索";
    document.body.innerHTML = `
      <div class="search-form">
        <button class="button">搜索</button>
      </div>
      <section class="custom-results">
        <article class="custom-entry">
          <div class="sku-name"><a href="https://item.jd.com/3001.html"><span>MacBook Air</span></a></div>
          <div>到手价 6999.00 元</div>
        </article>
      </section>
    `;

    const snapshot = scanPageAtUrl("https://search.jd.com/Search?keyword=macbookair");

    expect(snapshot.pageFacts.searchBox.present).toBe(false);
    expect(snapshot.pageFacts.resultList?.productLinkCount).toBe(1);
    expect(snapshot.pageReady.ready).toBe(true);
    expect(snapshot.pageReady.checks).toEqual([]);

    rectSpy.mockRestore();
  });
});

describe("semanticSnapshot", () => {
  it("captures a lightweight semantic skeleton for visible high-value nodes", () => {
    const rectSpy = mockVisibleRect();

    document.title = "Semantic page";
    document.body.innerHTML = `
      <main>
        <h1>Playwright vs Selenium</h1>
        <section>
          <button aria-expanded="true">展开详情</button>
          <a href="https://example.com/docs">官方文档</a>
          <input type="search" aria-label="站内搜索" required />
        </section>
      </main>
    `;

    const snapshot = scanPageAtUrl("https://example.com/article");
    const rootChildren = snapshot.semanticSnapshot.root.children ?? [];
    const mainNode = rootChildren.find((node) => node.role === "main");
    const flattened = flattenSemanticNodes(snapshot.semanticSnapshot.root);

    expect(snapshot.semanticSnapshot.version).toBe(1);
    expect(snapshot.semanticSnapshot.nodeCount).toBeGreaterThan(1);
    expect(mainNode).toBeDefined();
    expect(flattened.some((node) => node.role === "heading" && node.level === 1 && node.name === "Playwright vs Selenium")).toBe(true);
    expect(flattened.some((node) => node.role === "button" && node.state?.expanded === true)).toBe(true);
    expect(flattened.some((node) => node.role === "link" && node.name === "官方文档")).toBe(true);
    expect(flattened.some((node) => node.role === "input" && node.state?.required === true)).toBe(true);

    rectSpy.mockRestore();
  });

  it("filters hidden or zero-sized nodes and promotes semantic descendants through plain containers", () => {
    const rectSpy = mockVisibleRect();

    document.body.innerHTML = `
      <main>
        <div>
          <button style="display:none">隐藏按钮</button>
          <div data-zero-size>
            <a href="https://example.com/zero">零尺寸链接</a>
          </div>
          <div>
            <section>
              <h2>保留标题</h2>
            </section>
          </div>
        </div>
      </main>
    `;

    const snapshot = scanPageAtUrl("https://example.com/hidden");
    const serialized = JSON.stringify(snapshot.semanticSnapshot.root);

    expect(serialized).not.toContain("隐藏按钮");
    expect(serialized).not.toContain("零尺寸链接");
    expect(serialized).toContain("保留标题");

    rectSpy.mockRestore();
  });

  it("dedupes repeated text leaves and marks truncation when the semantic tree is too large", () => {
    const rectSpy = mockVisibleRect();

    document.body.innerHTML = `
      <main>
        ${Array.from({ length: 140 }, (_, index) => `<p>${index < 2 ? "重复文本" : `段落 ${index}`}</p>`).join("")}
      </main>
    `;

    const snapshot = scanPageAtUrl("https://example.com/long");
    const rootSerialized = JSON.stringify(snapshot.semanticSnapshot.root);

    expect(snapshot.semanticSnapshot.truncated).toBe(true);
    expect(snapshot.semanticSnapshot.nodeCount).toBeLessThanOrEqual(120);
    expect(rootSerialized.match(/重复文本/g)?.length ?? 0).toBe(1);

    rectSpy.mockRestore();
  });
});
