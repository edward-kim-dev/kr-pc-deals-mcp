import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { listCategoryOnSources, sortByPrice } from "../../src/services/sources.js";
import type { Product } from "../../src/core/types.js";
import { restoreNetwork, SITE_ROUTES, stubFetch, useFastNetwork } from "../helpers.js";

describe("listCategoryOnSources (고정 데이터)", () => {
  beforeEach(useFastNetwork);
  afterEach(restoreNetwork);

  it("네 사이트의 인기 목록을 사이트 순서대로 limit개씩 돌려준다", async () => {
    stubFetch(SITE_ROUTES);
    const { bySource, errors } = await listCategoryOnSources("gpu", { limit: 3 });
    expect(errors).toEqual([]);
    expect(bySource.map(({ source, products }) => [source, products.length])).toEqual([
      ["danawa", 3],
      ["enuri", 3],
      ["kjwwang", 3],
      ["compuzone", 3],
    ]);
    // 인기순은 사이트가 준 순서 그대로다
    expect(bySource[1].products.map((p) => p.id)).toEqual(["131695974", "131526624", "132551091"]);
  });

  it("가격순은 사이트마다 받은 인기 상위 목록을 다시 정렬하고, 가격 미정은 뒤로 보낸다", async () => {
    stubFetch(SITE_ROUTES);
    const { bySource } = await listCategoryOnSources("gpu", { sort: "price", limit: 10, sources: ["danawa", "compuzone"] });
    expect(bySource.map(({ source }) => source)).toEqual(["danawa", "compuzone"]);
    expect(bySource[0].products.map((p) => p.price)).toEqual([698960, 746100, 787890, 0]);
    expect(bySource[1].products.map((p) => p.price)).toEqual([374000, 699000, 779000, 1399000, 1447400, 2215000]);
  });

  it("한 사이트가 실패해도 나머지 결과를 돌려준다", async () => {
    stubFetch(SITE_ROUTES.filter((r) => !r.match.source.includes("enuri")));
    const { bySource, errors } = await listCategoryOnSources("gpu", { limit: 2 });
    expect(errors).toEqual([{ source: "enuri", message: expect.stringContaining("404") }]);
    expect(bySource.find((s) => s.source === "enuri")?.products).toEqual([]);
    expect(bySource.find((s) => s.source === "danawa")?.products).toHaveLength(2);
  });
});

describe("sortByPrice", () => {
  const item = (id: string, price: number, priceWarning?: string): Product => ({
    source: "danawa", id, name: id, price, url: id, ...(priceWarning ? { priceWarning } : {}),
  });

  it("가격 경고가 붙은 상품도 가격 미정처럼 뒤로 보내고, 같은 순위면 원래 순서를 지킨다", () => {
    const sorted = sortByPrice([item("a", 0), item("b", 500), item("c", 100, "의심"), item("d", 300), item("e", 0)]);
    expect(sorted.map((p) => p.id)).toEqual(["d", "b", "a", "c", "e"]);
  });
});
