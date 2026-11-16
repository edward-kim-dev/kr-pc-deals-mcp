import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { parseEnuriSearchPage, searchEnuri } from "../../../src/providers/enuri/search.js";
import { ENURI_CATEGORIES, categoryFromEnuriCode } from "../../../src/providers/enuri/categories.js";
import { PART_CATEGORIES } from "../../../src/core/categories.js";
import { fixture, restoreNetwork, stubFetch, useFastNetwork, type Route } from "../../helpers.js";

const ROUTES: Route[] = [{ match: /price\.enuri\.com\/search\?/, body: () => fixture("enuri-search.html") }];

/** flight 데이터 문자열을 페이지처럼 self.__next_f.push 스크립트로 감싼다 */
function flightHtml(...chunks: string[]): string {
  return chunks.map((chunk) => `<script>self.__next_f.push([1,${JSON.stringify(chunk)}])</script>`).join("\n");
}

describe("parseEnuriSearchPage", () => {
  const products = parseEnuriSearchPage(fixture("enuri-search.html"));

  it("가격비교 카탈로그 상품(type model)만 남기고 오픈마켓 개별 상품(type normal)은 뺀다", () => {
    expect(products.every((p) => /^\d+$/.test(p.id) && p.id !== "0")).toBe(true);
    expect(products.some((p) => p.name.includes("[오늘출발]"))).toBe(false);
  });

  it("대표 상품을 에누리 순서대로 먼저 담고, 같은 묶음의 다른 옵션(용량)은 그 뒤에 붙인다", () => {
    expect(products.map((p) => p.id)).toEqual([
      // 대표 옵션 (검색어의 2TB)
      "101644564",
      "106648577",
      "101694723",
      // 각 묶음의 다른 옵션
      "116017608",
      "101644563",
      "116017786",
      "106648575",
      "121152604",
      "101694721",
    ]);
    expect(products.find((p) => p.id === "101644563")).toEqual({
      source: "enuri",
      id: "101644563",
      name: "삼성전자 990 PRO M.2 NVMe 1TB",
      price: 373000,
      url: "https://price.enuri.com/catalog/101644563",
      category: "ssd",
      shopCount: 230,
    });
  });

  it("상품명 뒤에 대표 옵션 이름을 붙이고 판매처 최저가·판매처 수·카테고리를 채운다", () => {
    expect(products[0]).toEqual({
      source: "enuri",
      id: "101644564",
      name: "삼성전자 990 PRO M.2 NVMe 2TB",
      price: 790000,
      url: "https://price.enuri.com/catalog/101644564",
      category: "ssd",
      shopCount: 224,
    });
    expect(products[2].name).toBe("삼성전자 990 PRO M.2 NVMe 병행수입 2TB");
  });

  it("값이 참조 문자열인 곳은 건너뛰고 객체로 된 목록 데이터를 읽는다", () => {
    const html = flightHtml(
      '4c:["$","$L4b",null,{"data":{"initProductList":"$31:props:data:initProductList"}}]\n',
      '31:{"props":{"data":{"initProductList":{"listCount":{"total":1},"items":[{"id":"132551091","type":"model",' +
        '"name":"ZOTAC GAMING 지포스 RTX 5070 SOLID OC D7 12GB","condiName":"","priceInfo":{"price":1355100},"mallCount":145,' +
        '"category":{"categoryId":"070522"}}]}}}}\n'
    );
    expect(parseEnuriSearchPage(html)).toEqual([
      expect.objectContaining({ id: "132551091", name: "ZOTAC GAMING 지포스 RTX 5070 SOLID OC D7 12GB", category: "gpu" }),
    ]);
  });

  it("렌탈 상품과 숫자가 아닌 번호는 뺀다", () => {
    const list = {
      listCount: { total: 3 },
      items: [
        { id: "555", type: "model", name: "렌탈 상품", isRental: true, priceInfo: { price: 30000 } },
        { id: "G:1", type: "model", name: "번호가 이상한 상품", priceInfo: { price: 1000 } },
        { id: "777", type: "model", name: "가격 미정 &amp; 판매처 없음", condiName: "1TB", priceInfo: { price: 0 }, mallCount: 0 },
      ],
    };
    const html = flightHtml(`45:["$","$L4c",null,{"data":{"initProductList":${JSON.stringify(list)}}}]\n`);
    expect(parseEnuriSearchPage(html, "ssd")).toEqual([
      {
        source: "enuri",
        id: "777",
        name: "가격 미정 & 판매처 없음 1TB",
        price: 0,
        url: "https://price.enuri.com/catalog/777",
        category: "ssd", // 상품 데이터에 카테고리가 없으면 요청한 카테고리
        shopCount: undefined,
      },
    ]);
  });

  it("'결과 없음' 화면이면 빈 배열이고, 함께 오는 추천 상품은 결과로 쓰지 않는다", () => {
    const html = flightHtml(
      '3f:I[123,["/_next/static/chunks/a.js"],"SearchEmptySection"]\n',
      '44:["$","$L3f",null,{"data":{"initRecommendedProducts":{"type":"popular","products":[{"productName":"바리스타 터치","price":2100000}]}}}]\n'
    );
    expect(parseEnuriSearchPage(html)).toEqual([]);
  });

  it("목록 데이터도 '결과 없음' 표시도 없으면 오류를 낸다", () => {
    expect(() => parseEnuriSearchPage("<html><body>점검 중입니다</body></html>")).toThrow("읽지 못했습니다");
    const broken = flightHtml('45:["$","$L4c",null,{"data":{"initProductList":{"listCount":{"total":3}}}}]\n');
    expect(() => parseEnuriSearchPage(broken)).toThrow("형식");
  });
});

describe("에누리 카테고리 코드", () => {
  it("부품 10종 모두 코드가 있다", () => {
    expect(Object.keys(ENURI_CATEGORIES).sort()).toEqual([...PART_CATEGORIES].sort());
  });

  it("상품 카테고리 코드를 앞자리로 부품 종류에 대응시킨다 (SSD·HDD는 소분류까지 본다)", () => {
    expect(categoryFromEnuriCode("070522")).toBe("gpu");
    expect(categoryFromEnuriCode("07052200")).toBe("gpu");
    expect(categoryFromEnuriCode("07130700")).toBe("ssd");
    expect(categoryFromEnuriCode("07130611")).toBe("hdd");
    expect(categoryFromEnuriCode("071320")).toBeUndefined(); // 병행/벌크/중고: SSD인지 HDD인지 모른다
    expect(categoryFromEnuriCode("0404")).toBeUndefined(); // 노트북
    expect(categoryFromEnuriCode(undefined)).toBeUndefined();
  });
});

describe("searchEnuri", () => {
  beforeEach(useFastNetwork);
  afterEach(restoreNetwork);

  it("검색어를 UTF-8로, 카테고리를 category 파라미터로 보내고 결과를 캐시한다", async () => {
    const { calls } = stubFetch(ROUTES);
    const first = await searchEnuri("삼성전자 990 PRO 2TB", { category: "ssd", limit: 2 });
    const second = await searchEnuri("삼성전자 990 PRO 2TB", { category: "ssd", limit: 40 });

    expect(first).toHaveLength(2);
    expect(second).toHaveLength(9);
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(`${url.origin}${url.pathname}`).toBe("https://price.enuri.com/search");
    expect(url.searchParams.get("keyword")).toBe("삼성전자 990 PRO 2TB");
    expect(url.searchParams.get("category")).toBe("071307");
  });

  it("카테고리가 없으면 category 파라미터를 붙이지 않는다", async () => {
    const { calls } = stubFetch(ROUTES);
    await searchEnuri("RTX 5070");
    expect(calls[0].url).toBe("https://price.enuri.com/search?keyword=RTX%205070");
  });

  it("결과 없음은 빈 배열로 캐시하고, 알 수 없는 화면은 캐시하지 않고 오류를 낸다", async () => {
    const empty = stubFetch([
      { match: /keyword=zzz/, body: () => flightHtml('3f:I[1,["/_next/static/chunks/a.js"],"SearchEmptySection"]\n') },
    ]);
    await expect(searchEnuri("zzz")).resolves.toEqual([]);
    await expect(searchEnuri("zzz")).resolves.toEqual([]);
    expect(empty.calls).toHaveLength(1);

    const broken = stubFetch([{ match: /keyword=qqq/, body: () => "<html><body>점검 중입니다</body></html>" }]);
    await expect(searchEnuri("qqq")).rejects.toThrow("읽지 못했습니다");
    await expect(searchEnuri("qqq")).rejects.toThrow("읽지 못했습니다");
    expect(broken.calls).toHaveLength(2);
  });
});
