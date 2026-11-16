import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  isKjwwangEmptyList,
  parseKjwwangSearchList,
  parseKjwwangSearchPage,
} from "../../../src/providers/kjwwang/parser.js";
import { searchKjwwang } from "../../../src/providers/kjwwang/search.js";
import { KJWWANG_CATEGORIES, categoryFromKjwwangNames } from "../../../src/providers/kjwwang/categories.js";
import { PART_CATEGORIES } from "../../../src/core/categories.js";
import { eucKr, fixture, restoreNetwork, stubFetch, useFastNetwork, type Route } from "../../helpers.js";

const SEARCH_PAGE = /kjwwang\.com\/shop\/product_search\.html\?main_search=/;
const LIST = /kjwwang\.com\/skin\/shop\/basic\/product_list_include_plist\.php$/;

const ROUTES: Route[] = [
  { match: SEARCH_PAGE, body: () => eucKr(fixture("kjwwang-search.html")), contentType: "text/html; charset=euc-kr" },
  { match: LIST, body: () => eucKr(fixture("kjwwang-list.html")), contentType: "text/html; charset=euc-kr" },
];

/** 실제 "검색결과가 없습니다" 목록 응답 (토큰 없이 보냈을 때) */
const EMPTY_LIST = `<div class="cont_nav clear">
  <span class="cnt">상품리스트(<span class="all">0</span>개)</span> <input type="hidden" id="total_num" value="0">
</div>
<div class="products clear">
  <div class="empty"><p class="txt">검색결과가 없습니다.</p></div>
</div>`;

describe("parseKjwwangSearchPage", () => {
  it("검색 토큰·되돌려 준 검색어·부품 결과 수를 읽는다", () => {
    const page = parseKjwwangSearchPage(fixture("kjwwang-search.html"));
    expect(page.searchWord).toBe("라이젠 7800X3D");
    expect(page.partCount).toBe(4);
    expect(page.token).toMatch(/^[0-9a-f]{100,}$/);
  });

  it("부품 결과가 없으면 0을 돌려준다", () => {
    const html = `<li><a href='#' onclick='searchTab("부품"); return false;' class='basic on'>부품(0)</a></li>
      <li><a href='#' onclick='searchTab("견적서"); return false;' class='basic'>견적서(0)</a></li>`;
    expect(parseKjwwangSearchPage(html)).toEqual({ token: undefined, searchWord: undefined, partCount: 0 });
  });
});

describe("parseKjwwangSearchList", () => {
  it("상품 번호·이름·판매처 최저가·판매처 수·카테고리를 읽는다", () => {
    const products = parseKjwwangSearchList(fixture("kjwwang-list.html"));
    expect(products.map((p) => [p.id, p.price, p.shopCount])).toEqual([
      ["84861", 359980, 13],
      ["111383", 358630, 8],
      ["128927", 498440, 10],
      ["84860", 700800, 2],
    ]);
    expect(products[0]).toEqual({
      source: "kjwwang",
      id: "84861",
      name: "AMD 라이젠7-5세대 7800X3D (라파엘) (멀티팩(정품))",
      price: 359980,
      url: "https://kjwwang.com/shop/product_detail.html?pd_no=84861",
      category: "cpu",
      shopCount: 13,
    });
  });

  it("'검색결과가 없습니다' 목록을 알아본다", () => {
    expect(parseKjwwangSearchList(EMPTY_LIST)).toEqual([]);
    expect(isKjwwangEmptyList(EMPTY_LIST)).toBe(true);
    expect(isKjwwangEmptyList("<html><body>점검 중입니다</body></html>")).toBe(false);
  });
});

describe("견적왕 카테고리", () => {
  it("부품 10종 모두 search_cate 값이 있다", () => {
    expect(Object.keys(KJWWANG_CATEGORIES).sort()).toEqual([...PART_CATEGORIES].sort());
  });

  it("분류 이름을 부품 종류로 바꾼다", () => {
    expect(categoryFromKjwwangNames(["PC주요부품", "그래픽카드"])).toBe("gpu");
    expect(categoryFromKjwwangNames(["PC주요부품", "데스크탑 HDD"])).toBe("hdd");
    expect(categoryFromKjwwangNames(["PC주요부품", "키보드"])).toBeUndefined();
  });
});

describe("searchKjwwang", () => {
  beforeEach(useFastNetwork);
  afterEach(restoreNetwork);

  it("검색 화면을 EUC-KR 검색어로 받은 뒤, 토큰을 담아 목록을 POST로 받는다", async () => {
    const { fn, calls } = stubFetch(ROUTES);
    const products = await searchKjwwang("라이젠 7800X3D", { category: "cpu" });

    expect(products).toHaveLength(4);
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe("https://kjwwang.com/shop/product_search.html?main_search=%B6%F3%C0%CC%C1%A8%207800X3D");

    expect(calls[1].url).toBe("https://kjwwang.com/skin/shop/basic/product_list_include_plist.php");
    const init = fn.mock.calls[1][1] as RequestInit;
    expect(init.method).toBe("POST");
    const form = new URLSearchParams(String(init.body));
    expect(form.get("action")).toBe("pc_estimate_keyword");
    expect(form.get("search_word")).toBe("라이젠 7800X3D");
    expect(form.get("search_query")).toBe(parseKjwwangSearchPage(fixture("kjwwang-search.html")).token);
    expect(form.get("search_cate")).toBe("9");
    expect(form.get("page")).toBe("1");
    expect(form.getAll("sort[]")).toEqual(["", "", "", "X"]);
    expect(calls[1].headers["content-type"]).toContain("application/x-www-form-urlencoded");
    expect(calls[1].headers["x-requested-with"]).toBe("XMLHttpRequest");
    expect(calls[1].headers.referer).toBe(calls[0].url);
  });

  it("카테고리가 없으면 전체보기(0)로 보내고, 결과를 캐시한다", async () => {
    const { fn, calls } = stubFetch(ROUTES);
    const first = await searchKjwwang("라이젠 7800X3D", { limit: 2 });
    const second = await searchKjwwang("라이젠 7800X3D", { limit: 3 });
    expect(first).toHaveLength(2);
    expect(second).toHaveLength(3);
    expect(calls).toHaveLength(2);
    expect(new URLSearchParams(String((fn.mock.calls[1][1] as RequestInit).body)).get("search_cate")).toBe("0");
  });

  it("검색 화면이 '부품(0)'이면 목록을 요청하지 않고 빈 결과를 캐시한다", async () => {
    const page = `<a onclick='searchTab("부품"); return false;'>부품(0)</a><a onclick='searchTab("견적서"); return false;'>견적서(0)</a>`;
    const { calls } = stubFetch([{ match: SEARCH_PAGE, body: () => eucKr(page) }]);
    await expect(searchKjwwang("없는상품")).resolves.toEqual([]);
    await expect(searchKjwwang("없는상품")).resolves.toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("목록이 '검색결과가 없습니다'면 빈 배열이다", async () => {
    stubFetch([ROUTES[0], { match: LIST, body: () => eucKr(EMPTY_LIST) }]);
    await expect(searchKjwwang("라이젠 7800X3D", { category: "gpu" })).resolves.toEqual([]);
  });

  it("검색 화면에 토큰이 없거나 목록 형식이 다르면 캐시하지 않고 오류를 낸다", async () => {
    const noToken = stubFetch([{ match: SEARCH_PAGE, body: () => eucKr("<html><body>점검 중입니다</body></html>") }]);
    await expect(searchKjwwang("RTX 5070")).rejects.toThrow("읽지 못했습니다");
    expect(noToken.calls).toHaveLength(1);

    const broken = stubFetch([ROUTES[0], { match: LIST, body: () => eucKr("<html><body>점검 중입니다</body></html>") }]);
    await expect(searchKjwwang("라이젠 7800X3D")).rejects.toThrow("읽지 못했습니다");
    await expect(searchKjwwang("라이젠 7800X3D")).rejects.toThrow("읽지 못했습니다");
    expect(broken.calls).toHaveLength(4);
  });
});
