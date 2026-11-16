import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getEnuriProduct, parseEnuriProductPage } from "../../../src/providers/enuri/product.js";
import { fixture, restoreNetwork, stubFetch, useFastNetwork, type Route } from "../../helpers.js";

const ROUTES: Route[] = [{ match: /price\.enuri\.com\/catalog\/\d+$/, body: () => fixture("enuri-product.html") }];

function flightHtml(...chunks: string[]): string {
  return chunks.map((chunk) => `<script>self.__next_f.push([1,${JSON.stringify(chunk)}])</script>`).join("\n");
}

/** React Query 직렬화 행 하나 (상품 화면의 HydrationBoundary props와 같은 모양) */
function hydrationRow(id: string, queries: Array<{ queryKey: unknown[]; data: unknown }>): string {
  const state = { state: { mutations: [], queries: queries.map((q) => ({ state: { data: q.data }, queryKey: q.queryKey })) } };
  return `${id}:["$","$L3d",null,${JSON.stringify(state)}]\n`;
}

describe("parseEnuriProductPage", () => {
  const detail = parseEnuriProductPage(fixture("enuri-product.html"), "101644564");

  it("상품명(옵션 포함)·대표 최저가·현금 최저가·제조사·등록월을 읽는다", () => {
    expect(detail).toMatchObject({
      source: "enuri",
      id: "101644564",
      name: "삼성전자 990 PRO M.2 NVMe 2TB",
      url: "https://price.enuri.com/catalog/101644564",
      price: 803620, // 일반 판매가 기준 최저가 (화면 대표 최저가)
      cashPrice: 790000, // 현금가 판매처 최저가
      maker: "삼성전자",
      registeredAt: "2022.11",
    });
  });

  it("스펙 요약을 '항목: 값'으로 만들고 제조사·등록일은 스펙에서 뺀다", () => {
    expect(detail.specs).toEqual(expect.arrayContaining(["용량: 2TB", "인터페이스: PCIe4.0x4 (64GT/s)", "지원기능: TRIM, S.M.A.R.T, SLC캐싱, GC, DEVSLP"]));
    expect(detail.specs.some((s) => s.startsWith("제조사") || s.startsWith("등록일"))).toBe(false);
  });

  it("쇼핑몰별 가격을 싼 순서로 10곳까지 담고, 같은 쇼핑몰의 같은 가격은 하나만 남긴다", () => {
    expect(detail.offers).toHaveLength(10);
    expect(detail.offers.map((o) => o.price)).toEqual([...detail.offers.map((o) => o.price)].sort((a, b) => a - b));
    expect(detail.offers.filter((o) => o.seller === "G마켓" && o.price === 803620)).toHaveLength(1);
  });

  it("현금가 판매처는 이름에 (현금)을 붙이고, 배송비와 판매처 링크를 채운다", () => {
    expect(detail.offers[0]).toEqual({
      seller: "다올씨앤씨 (현금)",
      price: 790000,
      shippingFee: 0,
      url: expect.stringContaining("https://www.enuri.com/move/Redirect.jsp?cmd=move_link&vcode=52011&modelno=101644564"),
    });
    expect(detail.offers.find((o) => o.seller === "11번가")).toMatchObject({ price: 803730, shippingFee: 3000 });
  });

  it("다른 상품 번호의 데이터는 쓰지 않는다", () => {
    expect(() => parseEnuriProductPage(fixture("enuri-product.html"), "999")).toThrow("찾지 못했습니다");
  });

  it("쇼핑몰별 가격 데이터가 없으면 상위 판매처 요약으로 대신하고 카드 할인가는 뺀다", () => {
    const html = flightHtml(
      hydrationRow("7", [
        {
          queryKey: ["catalog", "overview", "132551091", null],
          data: {
            initCatalogSummaryInfo: {
              catalogInfo: { catalogName: "ZOTAC GAMING 지포스 RTX 5070 SOLID OC D7 12GB", catalogOptionName: "", minPrice: "1,355,100", specs: [] },
            },
            initCatalogLowestPrice: {
              priceList: [
                { shopName: "하이마트", price: 1321200, type: "cardLowest", cardInfo: { cardPrice: 1321200 }, plno: "1" },
                { shopName: "G마켓", price: 1330000, cardInfo: { cardNameText: "G마켓삼성카드", cardPrice: 1330000 }, plno: "2" },
                { shopName: "다올씨앤씨", price: 1300000, type: "cashLowest", isCashPrice: true, deliveryText: "무료배송", plno: "3" },
                {
                  shopName: "11번가",
                  price: 1355100,
                  type: "lowest",
                  deliveryText: "무료배송",
                  plno: "4",
                  bridgePageLink: "https://www.enuri.com/move/Redirect.jsp?cmd=move_link&vcode=5910&modelno=132551091&pl_no=4",
                },
                { shopName: "컴비아", price: 1404000, deliveryText: "2,500원", plno: "5" },
              ],
            },
          },
        },
      ])
    );
    const fallback = parseEnuriProductPage(html, "132551091");
    expect(fallback.price).toBe(1355100);
    expect(fallback.cashPrice).toBe(1300000);
    expect(fallback.offers).toEqual([
      { seller: "다올씨앤씨 (현금)", price: 1300000, shippingFee: 0, url: undefined },
      {
        seller: "11번가",
        price: 1355100,
        shippingFee: 0,
        url: "https://www.enuri.com/move/Redirect.jsp?cmd=move_link&vcode=5910&modelno=132551091&pl_no=4",
      },
      { seller: "컴비아", price: 1404000, shippingFee: 2500, url: undefined },
    ]);
  });
});

describe("getEnuriProduct", () => {
  beforeEach(useFastNetwork);
  afterEach(restoreNetwork);

  it("상품 번호가 숫자가 아니면 요청하지 않고 입력 오류를 낸다", async () => {
    const { calls } = stubFetch(ROUTES);
    await expect(getEnuriProduct("G:101644564")).rejects.toThrow("숫자");
    expect(calls).toHaveLength(0);
  });

  it("카탈로그 주소로 요청하고 결과를 캐시한다", async () => {
    const { calls } = stubFetch(ROUTES);
    const first = await getEnuriProduct("101644564");
    const second = await getEnuriProduct("101644564");
    expect(second).toBe(first);
    expect(calls.map((c) => c.url)).toEqual(["https://price.enuri.com/catalog/101644564"]);
  });

  it("상품 데이터가 없는 화면은 오류를 낸다", async () => {
    stubFetch([{ match: /catalog/, body: () => "<html><body>점검 중입니다</body></html>" }]);
    await expect(getEnuriProduct("101644564")).rejects.toThrow("찾지 못했습니다");
  });
});
