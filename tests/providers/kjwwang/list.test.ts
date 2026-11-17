import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildCategoryListForm, listKjwwangCategory } from "../../../src/providers/kjwwang/list.js";
import { eucKr, fixture, restoreNetwork, stubFetch, useFastNetwork, type Route } from "../../helpers.js";

const LIST = /kjwwang\.com\/skin\/shop\/basic\/product_list_include_plist\.php$/;
const ROUTES: Route[] = [
  { match: LIST, body: () => eucKr(fixture("kjwwang-category-gpu.html")), contentType: "text/html; charset=euc-kr" },
];

describe("buildCategoryListForm", () => {
  it("분류 화면 스크립트와 같은 값을 보낸다 (부품은 상위 분류 2)", () => {
    const form = buildCategoryListForm("gpu");
    expect(Object.fromEntries(form)).toMatchObject({
      depth: "2",
      cate1: "2",
      cate2: "12",
      search_cate: "0",
      page: "1",
      list_sort_type: "",
      view_type: "list",
    });
  });

  it("모니터는 상위 분류 6082(모니터/노트북/미니PC) 아래다", () => {
    expect(Object.fromEntries(buildCategoryListForm("monitor"))).toMatchObject({ cate1: "6082", cate2: "6090" });
  });
});

describe("listKjwwangCategory (실제 그래픽카드 인기 목록)", () => {
  beforeEach(useFastNetwork);
  afterEach(restoreNetwork);

  it("목록 주소에 POST하고 인기상품순 상품을 읽는다", async () => {
    const { fn, calls } = stubFetch(ROUTES);
    const products = await listKjwwangCategory("gpu");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://kjwwang.com/skin/shop/basic/product_list_include_plist.php");
    expect(calls[0].headers.referer).toBe("https://kjwwang.com/shop/product_list.html?ct_no=12");
    const init = fn.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(new URLSearchParams(String(init.body)).get("cate2")).toBe("12");
    expect(products.map((p) => p.id)).toEqual(["112524", "111161", "114828", "124719", "112522", "86440"]);
    expect(products[1]).toMatchObject({ source: "kjwwang", price: 1372370, shopCount: 13, category: "gpu" });
  });

  it("상품이 없으면 오류를 내고 캐시하지 않는다", async () => {
    const empty = '<input type="hidden" id="total_num" value="0"><div class="empty"><p class="txt">검색결과가 없습니다.</p></div>';
    const { calls } = stubFetch([{ match: LIST, body: () => eucKr(empty) }]);
    await expect(listKjwwangCategory("gpu")).rejects.toThrow("찾지 못했습니다");
    await expect(listKjwwangCategory("gpu")).rejects.toThrow("찾지 못했습니다");
    expect(calls).toHaveLength(2);
  });
});
