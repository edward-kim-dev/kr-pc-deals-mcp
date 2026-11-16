import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { parseKjwwangProductPage } from "../../../src/providers/kjwwang/parser.js";
import { getKjwwangProduct } from "../../../src/providers/kjwwang/product.js";
import { eucKr, fixture, restoreNetwork, stubFetch, useFastNetwork, type Route } from "../../helpers.js";

const ROUTES: Route[] = [
  {
    match: /kjwwang\.com\/shop\/product_detail\.html\?pd_no=\d+$/,
    body: () => eucKr(fixture("kjwwang-product.html")),
    contentType: "text/html; charset=euc-kr",
  },
];

describe("parseKjwwangProductPage", () => {
  const detail = parseKjwwangProductPage(fixture("kjwwang-product.html"), "111161");

  it("상품명·제조사·등록일·최저가를 읽는다", () => {
    expect(detail).toMatchObject({
      source: "kjwwang",
      id: "111161",
      name: "ZOTAC GAMING 지포스 RTX 5070 SOLID OC D7 12GB",
      url: "https://kjwwang.com/shop/product_detail.html?pd_no=111161",
      price: 1372380, // 현금가 최저 1,372,380원과 카드가 최저 1,413,790원 중 낮은 값
      cashPrice: 1372380,
      maker: "ZOTAC",
      registeredAt: "2025-03-06",
    });
  });

  it("스펙을 ' / '로 나누고 끝의 구분자를 남기지 않는다", () => {
    expect(detail.specs).toEqual(expect.arrayContaining(["RTX 5070", "PCIe5.0, 16배속", "메모리용량 : 12(GB)"]));
    expect(detail.specs.at(-1)).toBe("높이 : 41.6(mm)");
  });

  it("현금가·카드가 판매처를 이름에 표시해 싼 순서로 담고 배송비를 읽는다", () => {
    expect(detail.offers).toEqual([
      { seller: "보라컴 (현금)", price: 1372380, shippingFee: 4000 },
      { seller: "견적마트 (현금)", price: 1372400, shippingFee: 4000 },
      { seller: "아더넥트 (현금)", price: 1372400, shippingFee: 4000 },
      { seller: "피씨포맨 (카드)", price: 1413790, shippingFee: 4000 },
      { seller: "청년백수pc (카드)", price: 1413790, shippingFee: 4000 },
      { seller: "아싸컴 (카드)", price: 1418380, shippingFee: 4000 },
    ]);
  });

  it("카드가가 더 싸면 대표 최저가는 카드가, 현금 최저가는 따로 둔다", () => {
    const html = fixture("kjwwang-product.html").replace("1,413,790원", "1,300,000원");
    const cheaperCard = parseKjwwangProductPage(html, "111161");
    expect(cheaperCard.price).toBe(1300000);
    expect(cheaperCard.cashPrice).toBe(1372380);
  });
});

describe("getKjwwangProduct", () => {
  beforeEach(useFastNetwork);
  afterEach(restoreNetwork);

  it("상품 번호가 숫자가 아니면 요청하지 않고 입력 오류를 낸다", async () => {
    const { calls } = stubFetch(ROUTES);
    await expect(getKjwwangProduct("pd111161")).rejects.toThrow("숫자");
    expect(calls).toHaveLength(0);
  });

  it("EUC-KR 상세 페이지를 디코딩해 읽고 결과를 캐시한다", async () => {
    const { calls } = stubFetch(ROUTES);
    const first = await getKjwwangProduct("111161");
    const second = await getKjwwangProduct("111161");
    expect(first.name).toContain("지포스");
    expect(second).toBe(first);
    expect(calls.map((c) => c.url)).toEqual(["https://kjwwang.com/shop/product_detail.html?pd_no=111161"]);
  });

  it("상품 정보가 없는 화면은 캐시하지 않고 오류를 낸다", async () => {
    const { calls } = stubFetch([{ match: /product_detail/, body: () => eucKr("<html><head><title></title></head><body></body></html>") }]);
    await expect(getKjwwangProduct("1")).rejects.toThrow("찾지 못했습니다");
    await expect(getKjwwangProduct("1")).rejects.toThrow("찾지 못했습니다");
    expect(calls).toHaveLength(2);
  });
});
