import { describe, expect, it } from "vitest";
import { parseCoupangSearchResults } from "../../../src/providers/coupang/parser.js";

const HTML = `
<ul id="product-list">
  <li class="ProductUnit_productUnit__hash" data-id="vendor-1">
    <a href="/vp/products/8646097570?itemId=25094366771&vendorItemId=92127738716&q=RTX+5070&searchId=tracking&rank=0">
      <figure><img alt="MSI 지포스 RTX 5070" src="https://img.example/1.jpg"></figure>
      <div class="ProductUnit_productNameV2__hash">MSI 지포스 RTX 5070</div>
      <div class="PriceArea_priceArea__hash">
        <del>1,500,000원</del>
        <div><span>1,299,000원</span></div>
      </div>
      <div data-badge-id="ROCKET_MERCHANT"></div>
      <div class="ProductRating_productRating__hash"><span>(1,234)</span></div>
    </a>
  </li>
  <li class="ProductUnit_productUnit__hash" data-id="vendor-2">
    <a href="/vp/products/9299900544?itemId=25120043745&vendorItemId=95204224920">
      <figure><img alt="GIGABYTE 지포스 RTX 5070" src="https://img.example/2.jpg"></figure>
      <div class="PriceArea_priceArea__hash">
        <span>할인</span>
        <del>2,258,000원</del>
        <div><span>1,138,500원</span></div>
        <div data-badge-type="feePrice">배송비 3,000원</div>
      </div>
    </a>
  </li>
</ul>
`;

describe("parseCoupangSearchResults", () => {
  it("현재 판매가, 배송비, 로켓배송, 리뷰 수를 파싱", () => {
    const products = parseCoupangSearchResults(HTML, "gpu");

    expect(products).toHaveLength(2);
    expect(products[0]).toMatchObject({
      id: "8646097570",
      source: "coupang",
      name: "MSI 지포스 RTX 5070",
      category: "gpu",
      lowestPrice: 1299000,
      imageUrl: "https://img.example/1.jpg",
      reviewCount: 1234,
    });
    expect(products[0].prices[0]).toMatchObject({
      sellerName: "쿠팡 로켓배송",
      price: 1299000,
      shippingCost: 0,
      totalPrice: 1299000,
    });
    expect(products[1].prices[0]).toMatchObject({
      sellerName: "쿠팡",
      price: 1138500,
      shippingCost: 3000,
      totalPrice: 1141500,
    });
  });

  it("상품 URL에서 검색 추적 파라미터만 제거", () => {
    const [product] = parseCoupangSearchResults(HTML);
    const url = new URL(product.productUrl);

    expect(url.pathname).toBe("/vp/products/8646097570");
    expect(url.searchParams.get("itemId")).toBe("25094366771");
    expect(url.searchParams.get("vendorItemId")).toBe("92127738716");
    expect(url.searchParams.has("q")).toBe(false);
    expect(url.searchParams.has("searchId")).toBe(false);
    expect(url.searchParams.has("rank")).toBe(false);
  });

  it("가격이 없는 카드는 제외", () => {
    const html = HTML.replaceAll(/<span>[\d,]+원<\/span>/g, "<span>품절</span>");
    expect(parseCoupangSearchResults(html)).toEqual([]);
  });
});
