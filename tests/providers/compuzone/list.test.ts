import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildCategoryListForm, listCompuzoneCategory } from "../../../src/providers/compuzone/list.js";
import { eucKr, fixture, restoreNetwork, stubFetch, useFastNetwork, type Route } from "../../helpers.js";

const LIST = /compuzone\.co\.kr\/product\/product_list\.php$/;
const ROUTES: Route[] = [
  { match: LIST, body: () => eucKr(fixture("compuzone-list-gpu.html")), contentType: "text/html; charset=euc-kr" },
];

describe("buildCategoryListForm", () => {
  it("분류 화면의 숨은 폼과 같은 값을 판매량순으로 보낸다", () => {
    expect(Object.fromEntries(buildCategoryListForm("gpu"))).toMatchObject({
      actype: "getList",
      BigDivNo: "4",
      MediumDivNo: "1016",
      PreOrder: "sale_order",
      PageNum: "1",
      ScrollPage: "1",
    });
  });
});

describe("listCompuzoneCategory (실제 그래픽카드 판매량순 목록)", () => {
  beforeEach(useFastNetwork);
  afterEach(restoreNetwork);

  it("목록 주소에 POST하고 상품을 읽는다", async () => {
    const { fn, calls } = stubFetch(ROUTES);
    const products = await listCompuzoneCategory("gpu");
    expect(calls).toHaveLength(1);
    expect(calls[0].headers.referer).toBe("https://www.compuzone.co.kr/product/product_list.htm?BigDivNo=4&MediumDivNo=1016");
    expect((fn.mock.calls[0][1] as RequestInit).method).toBe("POST");
    expect(products.map((p) => p.id)).toEqual(["1234579", "1353723", "1219561", "1193038", "1217151", "1215850"]);
    expect(products[0]).toMatchObject({
      source: "compuzone",
      name: "[MSI] 지포스 RTX 5060 Ti 벤투스 2X OC 플러스 D7 8GB",
      price: 779000,
      category: "gpu",
    });
  });

  it("상품이 없으면 오류를 내고 캐시하지 않는다", async () => {
    const { calls } = stubFetch([{ match: LIST, body: () => eucKr('<ul class="product_list" id="product_list_ul"></ul>') }]);
    await expect(listCompuzoneCategory("gpu")).rejects.toThrow("찾지 못했습니다");
    await expect(listCompuzoneCategory("gpu")).rejects.toThrow("찾지 못했습니다");
    expect(calls).toHaveLength(2);
  });
});
