import { describe, expect, it } from "vitest";
import { extractProducts } from "../src/content/scanner";

describe("extractProducts", () => {
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

    const items = extractProducts(document);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      title: "ThinkBook 14",
      priceText: "4999.00",
      shopText: "Lenovo 官方旗舰店",
      url: "https://item.jd.com/1.html",
    });
    expect(items[0].tags).toContain("满减");
    expect(items[0].summary).toBe("高性能轻薄本");
  });
});
