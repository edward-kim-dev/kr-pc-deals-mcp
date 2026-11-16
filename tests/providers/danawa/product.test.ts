import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getDanawaProduct, parseDanawaProductPage } from "../../../src/providers/danawa/product.js";
import { InputError, ScrapingError } from "../../../src/core/errors.js";
import { fixture, restoreNetwork, stubFetch, useFastNetwork } from "../../helpers.js";

describe("parseDanawaProductPage", () => {
  const detail = parseDanawaProductPage(fixture("danawa-product.html"), "77319413");

  it("상품명·최저가·현금최저가·제조사·등록월을 읽는다", () => {
    expect(detail).toMatchObject({
      source: "danawa",
      id: "77319413",
      name: "ZOTAC GAMING 지포스 RTX 5070 SOLID OC D7 12GB",
      price: 1355310,
      cashPrice: 1190000,
      maker: "ZOTAC",
      registeredAt: "2025.03.",
    });
  });

  it("스펙 요약을 항목별로 나눈다", () => {
    expect(detail.specs.slice(0, 3)).toEqual(["RTX 5070", "PCIe5.0x16", "650W 이상"]);
    expect(detail.specs).toContain("가로(길이): 304.4mm");
  });

  it("쇼핑몰별 최저가와 배송비를 읽는다", () => {
    expect(detail.offers.length).toBeGreaterThanOrEqual(4);
    expect(detail.offers[0]).toMatchObject({ seller: "옥션", price: 1355310, shippingFee: 0 });
    expect(detail.offers[2]).toMatchObject({ price: 1355310, shippingFee: 6000 });
    expect(detail.offers[0].url).toContain("pcode=77319413");
  });

  it("상품 정보가 없는 페이지면 오류를 낸다", () => {
    expect(() => parseDanawaProductPage("<html><title>다나와</title></html>", "1")).toThrow(ScrapingError);
  });
});

describe("parseDanawaProductPage (새 Next.js 상세 페이지)", () => {
  const detail = parseDanawaProductPage(fixture("danawa-product-next.html"), "19627934");

  it("서버가 넣어 둔 상품 데이터에서 이름·최저가·제조사·출시일을 읽는다", () => {
    expect(detail).toMatchObject({
      name: "AMD 라이젠7-5세대 7800X3D (라파엘) (멀티팩 정품)",
      price: 359300,
      cashPrice: 328500,
      maker: "AMD",
      registeredAt: "2023-04-06",
    });
  });

  it("'항목$값|…' 형식의 스펙 요약을 항목별로 나눈다", () => {
    expect(detail.specs.slice(0, 4)).toEqual(["AMD(소켓AM5)", "8코어", "16스레드", "메모리 규격: DDR5"]);
    expect(detail.specs).toContain("기술 지원: AMD Ryzen Master, AMD 3D V캐시, SMT(하이퍼스레딩)");
  });

  it("쇼핑몰 목록을 가격 낮은 순으로 모으고 배송비 글자를 읽는다", () => {
    expect(detail.offers.length).toBeGreaterThanOrEqual(4);
    expect(detail.offers.map((o) => o.price)).toEqual([...detail.offers.map((o) => o.price)].sort((a, b) => a - b));
    expect(detail.offers[0]).toMatchObject({ seller: "옥션", price: 359310, shippingFee: 0 });
    expect(detail.offers.find((o) => o.price === 359810)?.shippingFee).toBe(2400);
  });
});

describe("parseDanawaProductPage (새 페이지의 이상한 값)", () => {
  function page(queries: unknown[]): string {
    const state = { state: { mutations: [], queries } };
    const payload = `3e:${JSON.stringify(state)}\n`;
    return (
      `<html><head><meta property="og:title" content="[다나와] AMD 라이젠7-5세대 7800X3D (라파엘)"/>` +
      `<meta property="og:description" content="최저가 359,300원, 현금최저가: 328,500원"/></head><body>` +
      `<script>self.__next_f.push([1,${JSON.stringify(payload)}])</script></body></html>`
    );
  }
  const basic = (pcode: number, data: Record<string, unknown>) => ({
    queryKey: ["productInfo", "productBasicInfo", pcode],
    state: { data: { maker: { name: "AMD" }, simpleDescription: "8코어|16스레드", ...data } },
  });

  it("요청한 상품의 데이터만 쓴다", () => {
    const html = page([basic(11111111, { price: { min: 1000 } }), basic(19627934, { price: { min: 359300 } })]);
    expect(parseDanawaProductPage(html, "19627934").price).toBe(359300);
  });

  it("가격이 참조 문자열이면 og:description의 최저가를 쓰고, 참조 문자열 스펙은 버린다", () => {
    const html = page([basic(19627934, { price: { min: "$4f" }, simpleDescription: "$51" })]);
    const detail = parseDanawaProductPage(html, "19627934");
    expect(detail.price).toBe(359300);
    expect(detail.specs).toEqual([]);
  });

  it("판매처 목록이 배열이 아니어도 오류 없이 빈 목록을 준다", () => {
    const html = page([
      basic(19627934, { price: { min: 359300 } }),
      { queryKey: ["productInfo", "priceCompareTab", 19627934], state: { data: { sections: "$60" } } },
    ]);
    expect(parseDanawaProductPage(html, "19627934").offers).toEqual([]);
  });
});

describe("getDanawaProduct", () => {
  beforeEach(useFastNetwork);
  afterEach(restoreNetwork);

  it("숫자가 아닌 코드는 요청 없이 거절한다", async () => {
    const { fn } = stubFetch([]);
    await expect(getDanawaProduct("TH201_123")).rejects.toThrow(InputError);
    expect(fn).not.toHaveBeenCalled();
  });
});
