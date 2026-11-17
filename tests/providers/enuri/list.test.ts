import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { listEnuriCategory } from "../../../src/providers/enuri/list.js";
import { fixture, restoreNetwork, stubFetch, useFastNetwork, type Route } from "../../helpers.js";

const ROUTES: Route[] = [{ match: /price\.enuri\.com\/list\?category=/, body: () => fixture("enuri-list-gpu.html") }];

describe("listEnuriCategory (실제 그래픽카드 인기 목록)", () => {
  beforeEach(useFastNetwork);
  afterEach(restoreNetwork);

  it("카테고리 코드로 첫 화면을 요청하고 인기순 상품을 그대로 읽는다", async () => {
    const { calls } = stubFetch(ROUTES);
    const products = await listEnuriCategory("gpu");
    expect(calls[0].url).toBe("https://price.enuri.com/list?category=0705");
    expect(products).toHaveLength(12);
    expect(products[0]).toEqual({
      source: "enuri",
      id: "131695974",
      name: "PALIT 지포스 RTX 5090 GAMEROCK D7 32GB 이엠텍",
      price: 10999990,
      url: "https://price.enuri.com/catalog/131695974",
      category: "gpu",
      shopCount: 31,
    });
  });

  it("결과를 캐시한다", async () => {
    const { calls } = stubFetch(ROUTES);
    await listEnuriCategory("gpu");
    await listEnuriCategory("gpu");
    expect(calls).toHaveLength(1);
  });

  it("상품이 없으면 오류를 내고 캐시하지 않는다", async () => {
    const empty = `<script>self.__next_f.push([1,${JSON.stringify('45:{"initProductList":{"items":[]}}\n')}])</script>`;
    const { calls } = stubFetch([{ match: /price\.enuri\.com\/list/, body: () => empty }]);
    await expect(listEnuriCategory("gpu")).rejects.toThrow("찾지 못했습니다");
    await expect(listEnuriCategory("gpu")).rejects.toThrow("찾지 못했습니다");
    expect(calls).toHaveLength(2);
  });
});
