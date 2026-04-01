import { describe, expect, it, vi } from "vitest";
import { collectResultListState, extractStructuredProducts } from "../src/content/extractor";
import { scanPageAtUrl } from "../src/content/scanner";

describe("extractStructuredProducts", () => {
  it("maps JD search result cards into normalized items", () => {
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

  it("treats link-based result sections as ready even when legacy cards are missing", () => {
    const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () =>
        ({
          x: 0,
          y: 0,
          width: 160,
          height: 36,
          top: 0,
          left: 0,
          right: 160,
          bottom: 36,
          toJSON() {
            return {};
          },
        }) as DOMRect,
    );

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
    const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () =>
        ({
          x: 0,
          y: 0,
          width: 160,
          height: 36,
          top: 0,
          left: 0,
          right: 160,
          bottom: 36,
          toJSON() {
            return {};
          },
        }) as DOMRect,
    );

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
