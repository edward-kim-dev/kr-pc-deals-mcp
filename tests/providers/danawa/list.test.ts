import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { listDanawaCategory, parseDanawaListPage } from "../../../src/providers/danawa/list.js";
import { fixture, restoreNetwork, SITE_ROUTES, stubFetch, useFastNetwork } from "../../helpers.js";

describe("parseDanawaListPage", () => {
  it("인기순 그대로 상품을 꺼내고 진짜 최저가(price.min)를 쓴다", () => {
    const products = parseDanawaListPage(fixture("danawa-list.html"), "gpu");
    expect(products.map((p) => p.id)).toEqual(["85410707", "122676813", "89732453", "77379380"]);
    expect(products[0]).toMatchObject({ price: 746100, shopCount: 170, category: "gpu" });
    expect(products[3].price).toBe(0); // 가격 미정
  });
});

describe("수상한 최저가", () => {
  // 실제 다나와 데이터: 라이젠 9700X 대표 최저가 42,430원, 같은 상품의 다른 기준가 412,000원
  const state = {
    state: {
      mutations: [],
      queries: [
        {
          queryKey: ["productList", "112747"],
          state: {
            data: {
              products: [
                { id: 62794082, productName: "AMD 라이젠7-6세대 9700X (그래니트 릿지)", price: { min: 42430, promotionMinPriceQ: 412000 } },
                { id: 70531547, productName: "AMD 라이젠7-6세대 9800X3D (그래니트 릿지)", price: { min: 560190, promotionMinPriceQ: 555660 } },
              ],
            },
          },
        },
      ],
    },
  };
  const html = `<script>self.__next_f.push([1,${JSON.stringify(`5:${JSON.stringify(state)}\n`)}])</script>`;

  it("기준가의 절반도 안 되는 최저가에 경고를 붙인다", () => {
    const [suspicious, normal] = parseDanawaListPage(html, "cpu");
    expect(suspicious.priceWarning).toContain("42,430원");
    expect(normal.priceWarning).toBeUndefined();
  });
});

describe("용량별 묶음 상품", () => {
  const state = {
    state: {
      mutations: [],
      queries: [
        {
          queryKey: ["productList", "112752"],
          state: {
            data: {
              products: [
                { id: 91188656, productName: "ESSENCORE KLEVV DDR5-6000 CL30 FIT V 패키지 서린", bundleProductName: "32GB(16Gx2)", price: { min: 799000 } },
                { id: 85410707, productName: "ZOTAC GAMING 지포스 RTX 5060 Ti Twin Edge OC D7 8GB", bundleProductName: "", price: { min: 746100 } },
              ],
            },
          },
        },
      ],
    },
  };
  const html = `<script>self.__next_f.push([1,${JSON.stringify(`5:${JSON.stringify(state)}\n`)}])</script>`;

  it("상품명 뒤에 묶음 옵션(용량)을 붙인다", () => {
    expect(parseDanawaListPage(html, "ram").map((p) => p.name)).toEqual([
      "ESSENCORE KLEVV DDR5-6000 CL30 FIT V 패키지 서린 (32GB(16Gx2))",
      "ZOTAC GAMING 지포스 RTX 5060 Ti Twin Edge OC D7 8GB",
    ]);
  });
});

describe("listDanawaCategory", () => {
  beforeEach(useFastNetwork);
  afterEach(restoreNetwork);

  it("첫 화면 전체를 인기순 그대로 돌려주고 캐시한다", async () => {
    const { calls } = stubFetch(SITE_ROUTES);
    const first = await listDanawaCategory("gpu");
    const second = await listDanawaCategory("gpu");
    expect(first.map((p) => p.id)).toEqual(["85410707", "122676813", "89732453", "77379380"]);
    expect(second).toEqual(first);
    expect(calls).toHaveLength(1);
  });

  it("카테고리 목록 페이지 코드로 요청한다", async () => {
    const { calls } = stubFetch(SITE_ROUTES);
    await listDanawaCategory("cooler");
    expect(calls[0].url).toBe("https://prod.danawa.com/list/?cate=11236855");
  });

  it("상품을 못 찾으면 오류를 낸다", async () => {
    stubFetch([{ match: /prod\.danawa\.com\/list\//, body: () => "<html></html>" }]);
    await expect(listDanawaCategory("cpu")).rejects.toThrow("찾지 못했습니다");
  });
});
