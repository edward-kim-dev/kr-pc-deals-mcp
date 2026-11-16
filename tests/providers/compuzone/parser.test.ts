import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  isCompuzoneEmptyResult,
  parseCompuzoneProductPage,
  parseCompuzoneSearch,
} from "../../../src/providers/compuzone/parser.js";
import { searchCompuzone } from "../../../src/providers/compuzone/search.js";
import { eucKr, fixture, restoreNetwork, SITE_ROUTES, stubFetch, useFastNetwork } from "../../helpers.js";

describe("parseCompuzoneSearch", () => {
  it("상품 번호·이름·가격을 읽는다", () => {
    const products = parseCompuzoneSearch(fixture("compuzone-search.html"), "gpu");
    expect(products.map((p) => [p.id, p.price])).toEqual([
      ["1219124", 1449000],
      ["1215849", 2151000],
      ["1273021", 1428000],
    ]);
    expect(products[0]).toMatchObject({
      source: "compuzone",
      name: "[MSI] 지포스 RTX 5070 게이밍 트리오 OC D7 12GB 트라이프로져4",
      url: "https://www.compuzone.co.kr/product/product_detail.htm?ProductNo=1219124",
      category: "gpu",
    });
  });
});

describe("parseCompuzoneSearch — 가격과 구조 변화", () => {
  const item = (attrs: string) =>
    `<ul class="listView"><li class="li-obj"><a class="prd_info_name">[MSI] 지포스 RTX 5070</a><div class="prd_price" data-pricetable="1219124" ${attrs}></div></li>` +
    `<li class="li-obj"><a class="prd_info_name">[ZOTAC] 지포스 RTX 5070</a><div class="prd_price" data-pricetable="1273021" data-price="1,428,000"></div></li></ul>`;

  it("할인 중이면 할인가(data-discountprice)를 쓴다", () => {
    const [discounted] = parseCompuzoneSearch(item('data-price="1,449,000" data-discountprice="1,399,000"'));
    expect(discounted.price).toBe(1399000);
    const [normal] = parseCompuzoneSearch(item('data-price="1,449,000" data-discountprice="1,449,000"'));
    expect(normal.price).toBe(1449000);
  });

  it("상품마다 자기 이름을 붙인다", () => {
    const products = parseCompuzoneSearch(item('data-price="1,449,000"'));
    expect(products.map((p) => p.name)).toEqual(["[MSI] 지포스 RTX 5070", "[ZOTAC] 지포스 RTX 5070"]);
  });

  it("'검색 결과 없음' 화면을 알아본다", () => {
    expect(isCompuzoneEmptyResult("<p>전체보기 (총 0 개의 상품)</p><p>해당 검색어로 검색된 상품이 없습니다.</p>")).toBe(true);
    expect(isCompuzoneEmptyResult("<html><body>점검 중입니다</body></html>")).toBe(false);
  });
});

describe("parseCompuzoneProductPage", () => {
  const detail = parseCompuzoneProductPage(fixture("compuzone-product.html"), "1219124");

  it("숨겨진 가짜 가격이 아니라 화면에 보이는 가격을 읽는다", () => {
    expect(detail.price).toBe(1449000);
  });

  it("상품명·스펙·배송비를 읽는다", () => {
    expect(detail.name).toBe("[MSI] 지포스 RTX 5070 게이밍 트리오 OC D7 12GB 트라이프로져4");
    expect(detail.specs).toEqual(expect.arrayContaining(["RTX 5070", "PCIe5.0x16"]));
    expect(detail.offers).toEqual([
      { seller: "컴퓨존", price: 1449000, shippingFee: 0, url: detail.url },
    ]);
  });
});

describe("searchCompuzone", () => {
  beforeEach(useFastNetwork);
  afterEach(restoreNetwork);

  it("결과 없음은 빈 배열, 알 수 없는 화면은 오류 (빈 결과로 캐시하지 않음)", async () => {
    stubFetch([{ match: /zzz/, body: () => eucKr("<p>해당 검색어로 검색된 상품이 없습니다.</p>") }]);
    await expect(searchCompuzone("zzz")).resolves.toEqual([]);
    stubFetch([{ match: /qqq/, body: () => eucKr("<html><body>점검 중입니다</body></html>") }]);
    await expect(searchCompuzone("qqq")).rejects.toThrow("읽지 못했습니다");
  });

  it("EUC-KR 응답을 디코딩하고 카테고리 필터를 붙인다", async () => {
    const { calls } = stubFetch(SITE_ROUTES);
    const products = await searchCompuzone("RTX 5070", { category: "gpu" });
    expect(products[0].name).toContain("지포스");
    const url = new URL(calls[0].url);
    expect(url.searchParams.get("SearchText")).toBe("RTX 5070");
    expect(url.searchParams.get("BigDivNo")).toBe("4");
    expect(url.searchParams.get("MediumDivNo")).toBe("1016");
  });
});
