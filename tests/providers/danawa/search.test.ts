import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { parseDanawaSearchResponse, searchDanawa } from "../../../src/providers/danawa/search.js";
import { fixture, restoreNetwork, SITE_ROUTES, stubFetch, useFastNetwork } from "../../helpers.js";

describe("parseDanawaSearchResponse", () => {
  const products = parseDanawaSearchResponse(JSON.parse(fixture("danawa-search.json")));

  it("가격비교 카탈로그 상품만 남기고 오픈마켓 상품(prodType 3)은 뺀다", () => {
    expect(products).toHaveLength(5);
    expect(products.every((p) => /^\d+$/.test(p.id))).toBe(true);
  });

  it("상품명의 강조 태그를 지우고 최저가·판매처 수·카테고리를 채운다", () => {
    expect(products[0]).toEqual({
      source: "danawa",
      id: "77379380",
      name: "MSI 지포스 RTX 5070 게이밍 트리오 OC D7 12GB 트라이프로져4",
      price: 1449000,
      url: "https://prod.danawa.com/info/?pcode=77379380",
      category: "gpu",
      shopCount: 51,
    });
  });
});

describe("parseDanawaSearchResponse: 용량별 묶음 상품 (실제 메모리 검색 응답)", () => {
  const products = parseDanawaSearchResponse(JSON.parse(fixture("danawa-search-ram.json")));

  it("상품명 뒤에 묶음 옵션(용량)을 붙인다", () => {
    expect(products[0]).toMatchObject({
      id: "91188656",
      name: "ESSENCORE KLEVV DDR5-6000 CL30 FIT V 패키지 서린 (32GB(16Gx2))",
      price: 799000,
      category: "ram",
    });
  });

  it("같은 묶음의 다른 용량은 상품 코드·가격이 따로 있어 대표 상품들 뒤에 별도 상품으로 붙인다", () => {
    expect(products.map((p) => p.id)).toEqual([
      // 대표 상품 (검색 순위 그대로)
      "91188656", "37989017", "124480188", "17931893", "72913559",
      // 다른 용량 옵션 (대표 상품과 같은 코드는 한 번만)
      "32076077", "72913664", "17931533",
    ]);
    expect(products.find((p) => p.id === "72913664")).toMatchObject({
      name: "G.SKILL DDR5-6000 CL36 TRIDENT Z5 NEO RGB J 패키지 (64GB(32Gx2))",
      price: 1890000,
      shopCount: 87,
      url: "https://prod.danawa.com/info/?pcode=72913664",
    });
  });
});

describe("searchDanawa", () => {
  beforeEach(useFastNetwork);
  afterEach(restoreNetwork);

  it("카테고리를 주면 cate1/cate2 필터로 요청하고 결과를 캐시한다", async () => {
    const { calls } = stubFetch(SITE_ROUTES);
    const first = await searchDanawa("RTX 5070", { category: "gpu", limit: 3 });
    const second = await searchDanawa("RTX 5070", { category: "gpu", limit: 5 });

    expect(first).toHaveLength(3);
    expect(second).toHaveLength(5);
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.searchParams.get("keyword")).toBe("RTX 5070");
    expect(url.searchParams.get("cate1")).toBe("861");
    expect(url.searchParams.get("cate2")).toBe("876");
    expect(calls[0].headers.referer).toContain("search.danawa.com");
  });

  it("응답 형식이 다르면 오류를 낸다", async () => {
    stubFetch([{ match: /search\.danawa\.com/, body: () => '{"kind":"error"}', contentType: "application/json" }]);
    await expect(searchDanawa("RTX 5070")).rejects.toThrow("형식");
  });
});
