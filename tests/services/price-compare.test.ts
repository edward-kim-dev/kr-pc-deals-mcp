import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { comparePrices, findLowestPrice, groupSameProducts, type PriceGroup } from "../../src/services/price-compare.js";
import type { Product, Source } from "../../src/core/types.js";
import { fixture, restoreNetwork, SITE_ROUTES, stubFetch, useFastNetwork } from "../helpers.js";

const item = (source: Source, name: string, price: number, id = name): Product => ({ source, id, name, price, url: id });

describe("groupSameProducts", () => {
  it("가격 미정(0)은 최저가 계산에서 뺀다", () => {
    const [group] = groupSameProducts([
      { source: "danawa", products: [item("danawa", "ZOTAC RTX 5070 SOLID OC", 0)] },
      { source: "compuzone", products: [item("compuzone", "[ZOTAC] RTX 5070 SOLID OC", 1355310)] },
    ]);
    expect(group).toMatchObject({ cheapestSources: ["compuzone"], lowestPrice: 1355310, priceGap: 0 });
  });

  it("모든 사이트가 가격 미정이면 cheapestSources는 비어 있다", () => {
    const [group] = groupSameProducts([
      { source: "danawa", products: [item("danawa", "RTX 5070 A", 0)] },
      { source: "compuzone", products: [item("compuzone", "RTX 5070 A", 0)] },
    ]);
    expect(group).toMatchObject({ cheapestSources: [], lowestPrice: 0, priceGap: 0 });
  });

  it("세 사이트 이상을 한 묶음으로 모으고, 같은 최저가면 사이트를 모두 알린다", () => {
    const [group] = groupSameProducts([
      { source: "danawa", products: [item("danawa", "MSI RTX 5070 게이밍 트리오", 1449000)] },
      { source: "enuri", products: [item("enuri", "MSI RTX 5070 게이밍 트리오", 1428000)] },
      { source: "compuzone", products: [item("compuzone", "[MSI] RTX 5070 게이밍 트리오", 1428000)] },
    ]);
    expect(group.products.map((p) => p.source)).toEqual(["danawa", "enuri", "compuzone"]);
    expect(group).toMatchObject({ cheapestSources: ["enuri", "compuzone"], lowestPrice: 1428000, priceGap: 21000 });
  });

  it("모델번호가 다르면 묶지 않는다 (RTX 5070 ↔ RTX 5070 Ti)", () => {
    expect(
      groupSameProducts([
        { source: "danawa", products: [item("danawa", "MSI RTX 5070 Ti 게이밍 트리오", 2286790)] },
        { source: "compuzone", products: [item("compuzone", "MSI RTX 5070 게이밍 트리오", 1449000)] },
      ])
    ).toEqual([]);
  });

  it("다른 사이트 상품 하나는 가장 잘 맞는 기준 상품 하나에만 들어간다 (1:1)", () => {
    const groups = groupSameProducts([
      {
        source: "danawa",
        products: [
          item("danawa", "GIGABYTE 지포스 RTX 5070 AERO OC D7 12GB 제이씨현", 1502220),
          item("danawa", "GIGABYTE 지포스 RTX 5070 AERO OC D7 12GB 피씨디렉트", 1565260),
        ],
      },
      { source: "compuzone", products: [item("compuzone", "[GIGABYTE] 지포스 RTX 5070 AERO OC D7 12GB 피씨디렉트", 1573000)] },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].products[0].price).toBe(1565260); // 유통사까지 같은 쪽
  });

  it("기준 사이트 결과가 없으면 결과가 있는 다음 사이트를 기준으로 삼는다", () => {
    const [group] = groupSameProducts([
      { source: "danawa", products: [] },
      { source: "enuri", products: [item("enuri", "AMD 라이젠7-5세대 7800X3D (라파엘)", 359000)] },
      { source: "compuzone", products: [item("compuzone", "[AMD] 라이젠7 라파엘 7800X3D", 371000)] },
    ]);
    expect(group.products.map((p) => p.source)).toEqual(["enuri", "compuzone"]);
  });
});

describe("groupSameProducts: 짝이 여럿이라 확실하지 않은 경우", () => {
  // 2026-11-16 실제 "7800X3D"(CPU) 검색 결과
  const cpu = (source: Source, name: string, price: number) => ({ ...item(source, name, price), category: "cpu" as const });
  const bySource = [
    { source: "danawa" as const, products: [cpu("danawa", "AMD 라이젠7-5세대 7800X3D (라파엘)", 359300)] },
    {
      source: "enuri" as const,
      products: [
        cpu("enuri", "AMD 라이젠7-5세대 7800X3D (라파엘) 멀티팩 정품", 351720),
        cpu("enuri", "AMD 라이젠7-5세대 7800X3D (라파엘) 정품", 757470),
        cpu("enuri", "AMD 라이젠7-5세대 7800X3D (라파엘) 벌크 병행", 366740),
        cpu("enuri", "AMD 라이젠7-5세대 7800X3D (라파엘) 해외구매", 392080),
      ],
    },
    {
      source: "kjwwang" as const,
      products: [
        cpu("kjwwang", "AMD 라이젠7-5세대 7800X3D (라파엘) (멀티팩(정품))", 359980),
        cpu("kjwwang", "AMD 라이젠7-5세대 7800X3D (라파엘) 수입 벌크 A/S 3년", 358630),
        cpu("kjwwang", "AMD 라이젠7-5세대 7800X3D (라파엘) 정품 벌크", 498440),
        cpu("kjwwang", "AMD 라이젠7-5세대 7800X3D (라파엘) (정품)", 700800),
      ],
    },
    { source: "compuzone" as const, products: [cpu("compuzone", "[AMD] 라이젠7 라파엘 7800X3D (8코어/16스레드/4.2GHz/쿨러미포함)", 371000)] },
  ];

  it("포장이 안 적힌 상품은 포장이 다른 여러 상품 중 하나로 정할 수 없어 묶지 않는다", () => {
    const groups = groupSameProducts(bySource, "cpu");
    expect(groups.map((g) => g.products.map((p) => `${p.source}:${p.price}`))).toEqual([
      ["enuri:351720", "kjwwang:359980"], // 멀티팩
      ["enuri:757470", "kjwwang:700800"], // 정품(박스)
    ]);
  });
});

describe("comparePrices / findLowestPrice (고정 데이터)", () => {
  beforeEach(useFastNetwork);
  afterEach(restoreNetwork);

  it("한 사이트가 실패하면 결과 대신 오류를 알린다", async () => {
    stubFetch(SITE_ROUTES.filter((r) => !r.match.source.includes("compuzone")));
    const result = await comparePrices("RTX 5070", { category: "gpu" });
    expect(result.counts.find((c) => c.source === "danawa")?.count).toBeGreaterThan(0);
    expect(result.errors).toEqual([{ source: "compuzone", message: expect.stringContaining("404") }]);
  });

  /** 대표 상품 id로 묶음을 찾아 묶인 상품 id들을 돌려준다 */
  const idsOf = (groups: PriceGroup[], first: string) => groups.find((g) => g.products[0].id === first)?.products.map((p) => p.id);

  it("네 사이트에서 같은 제품을 사이트마다 하나씩 묶는다", async () => {
    stubFetch(SITE_ROUTES);
    const result = await comparePrices("RTX 5070", { category: "gpu" });
    expect(result.errors).toEqual([]);
    expect(result.counts).toEqual([
      { source: "danawa", count: 5 },
      { source: "enuri", count: 11 },
      { source: "kjwwang", count: 10 },
      { source: "compuzone", count: 3 },
    ]);
    // MSI RTX 5070 게이밍 트리오: 네 사이트 모두에 있고 견적왕이 가장 싸다
    const msi = result.groups.find((g) => g.products[0].id === "77379380");
    expect(msi?.products.map((p) => p.id)).toEqual(["77379380", "132577674", "111192", "1219124"]);
    expect(msi).toMatchObject({ cheapestSources: ["kjwwang"], lowestPrice: 1393100, priceGap: 1449000 - 1393100 });
    // PALIT RTX 5070 Ti GAMINGPRO-S: 에누리의 "GAMINGPRO-S OC"(142935469)가 아니라 이름이 같은 상품과 묶고,
    // 컴퓨존의 GIGABYTE 5070 Ti와는 묶지 않는다
    expect(idsOf(result.groups, "91768979")).toEqual(["91768979", "135330384", "114828"]);
    // "INFINITY 3" ↔ "Infinity 3": 대소문자만 다른 이름은 같은 제품이다
    expect(idsOf(result.groups, "79402577")).toEqual(["79402577", "133581175", "112153"]);
  });

  it("앞 사이트에 없는 제품도 뒤 사이트끼리 묶는다", async () => {
    stubFetch(SITE_ROUTES);
    const { groups } = await comparePrices("RTX 5070", { category: "gpu" });
    // 다나와 고정 데이터에 없는 GIGABYTE RTX 5070 Ti WINDFORCE OC SFF: 에누리 ↔ 컴퓨존
    expect(idsOf(groups, "132240157")).toEqual(["132240157", "1215849"]);
    // 에누리에 유통사만 다른 두 상품이 있으면 유통사(피씨디렉트)까지 같은 쪽과 묶는다
    expect(idsOf(groups, "132215009")).toEqual(["132215009", "110900"]);
    expect(idsOf(groups, "132240154")).toBeUndefined();
    // 변형색(WHITE)은 같은 색끼리만 묶는다
    expect(idsOf(groups, "137461149")).toEqual(["137461149", "121078"]);
  });

  it("돌려줄 묶음 수를 limit으로 자른다 (묶음 순서는 그대로)", async () => {
    stubFetch(SITE_ROUTES);
    const all = await comparePrices("RTX 5070", { category: "gpu", limit: 30 });
    const two = await comparePrices("RTX 5070", { category: "gpu", limit: 2 });
    expect(all.groups.length).toBeGreaterThan(2);
    expect(two.groups).toEqual(all.groups.slice(0, 2));
  });

  it("검색어의 모델번호와 같은 모델 중에서만 최저가를 고른다", async () => {
    stubFetch(SITE_ROUTES);
    const result = await findLowestPrice("RTX 5070 Ti", { category: "gpu" });
    // 고정 데이터의 가장 싼 상품은 RTX 5070(에누리 1,250,000원)이지만, 5070 Ti 중 최저가를 골라야 한다
    expect(result.model).toBe("rtx5070ti");
    expect(result.cheapest).toMatchObject({ source: "enuri", id: "132215069", price: 1825000 });
  });

  it("검색어의 모델로 확인되는 상품이 없으면 다른 모델로 대신하지 않는다", async () => {
    stubFetch(SITE_ROUTES);
    const result = await findLowestPrice("RTX 5080", { category: "gpu" });
    expect(result).toMatchObject({ model: "rtx5080", cheapest: null, candidates: 0 });
  });

  it("검색어의 용량과 다른 용량이 적힌 상품은 뺀다", async () => {
    stubFetch(SITE_ROUTES);
    // 고정 데이터의 RTX 5070 Ti는 모두 16GB다
    expect(await findLowestPrice("RTX 5070 Ti 12GB", { category: "gpu" })).toMatchObject({ cheapest: null, capacities: ["12gb"] });
    expect(await findLowestPrice("RTX 5070 Ti 16GB", { category: "gpu" })).toMatchObject({ cheapest: { id: "132215069" } });
  });

  it("다나와 용량별 묶음까지 펼쳐 검색어의 용량 중에서만 고른다", async () => {
    stubFetch([
      { match: /search\.danawa\.com\/api\/search\/product-list/, body: () => fixture("danawa-search-ram.json"), contentType: "application/json" },
      ...SITE_ROUTES,
    ]);
    // 32GB 상품(KingBank 648,620원 등)이 더 싸지만, 64GB 중 최저가는 FLARE X5 J 64GB다.
    // 대표 상품이 32GB인 TRIDENT Z5 NEO의 64GB 옵션(1,890,000원)도 후보에 들어간다.
    const result = await findLowestPrice("DDR5-6000 64GB", { category: "ram" });
    expect(result).toMatchObject({ model: "ddr56000", capacities: ["64gb"], candidates: 3 });
    expect(result.cheapest).toMatchObject({ id: "72913559", price: 1789990 });
  });

  it("모델번호가 없는 검색어는 전체 결과에서 고른다", async () => {
    stubFetch(SITE_ROUTES);
    const result = await findLowestPrice("지포스 그래픽카드", { category: "gpu" });
    expect(result.model).toBeNull();
    expect(result.cheapest).toMatchObject({ source: "enuri", id: "137461149", price: 1250000 });
  });
});
