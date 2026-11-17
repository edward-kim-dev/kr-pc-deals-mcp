/**
 * 견적왕 카테고리 인기 목록.
 *
 * 분류 화면(/shop/product_list.html?ct_no=)은 상품을 직접 그리지 않고, 화면 스크립트(searchListAjax)가
 * 검색과 같은 목록 주소에 익명 POST로 불러온다. 같은 요청을 보낸다 (검색과 달리 토큰이 필요 없다).
 * POST https://kjwwang.com/skin/shop/basic/product_list_include_plist.php
 * 한 번에 10개(인기상품순)를 주며 첫 페이지만 읽는다. 응답은 EUC-KR이고 검색 목록과 같은 형식이다.
 */

import { fetchText } from "../../utils/http.js";
import { getCached, setCached, buildCacheKey } from "../../core/cache.js";
import { ScrapingError } from "../../core/errors.js";
import type { PartCategory } from "../../core/categories.js";
import type { Product } from "../../core/types.js";
import { KJWWANG_CATEGORIES, kjwwangCategoryUrl, kjwwangParentCategory } from "./categories.js";
import { parseKjwwangSearchList } from "./parser.js";

const LIST_URL = "https://kjwwang.com/skin/shop/basic/product_list_include_plist.php";

/** 카테고리 인기 목록 첫 페이지 전체 (인기상품순 10개) */
export async function listKjwwangCategory(category: PartCategory): Promise<Product[]> {
  const cacheKey = buildCacheKey("kjwwang", "list", category);
  const cached = getCached<Product[]>(cacheKey);
  if (cached) return cached;

  const html = await fetchText(LIST_URL, "kjwwang", {
    method: "POST",
    body: buildCategoryListForm(category).toString(),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Referer: kjwwangCategoryUrl(category),
    },
    encoding: "euc-kr",
  });
  const products = parseKjwwangSearchList(html, category);
  // 카테고리 목록은 비어 있을 수 없다. 비었으면 점검 화면이나 구조 변경으로 보고 캐시하지 않는다.
  if (products.length === 0) {
    throw new ScrapingError("kjwwang", "견적왕 카테고리 목록에서 상품을 찾지 못했습니다. 페이지 구조가 바뀌었거나 점검 중일 수 있습니다.");
  }
  setCached(cacheKey, products, "list");
  return products;
}

/** 분류 화면 스크립트(searchListAjax)가 보내는 것과 같은 폼 본문 */
export function buildCategoryListForm(category: PartCategory): URLSearchParams {
  return new URLSearchParams({
    depth: "2",
    cate1: kjwwangParentCategory(category),
    cate2: KJWWANG_CATEGORIES[category],
    search_cate: "0", // 하위 분류를 고르지 않음
    search: "",
    search1: "",
    sprice: "",
    eprice: "",
    page: "1",
    list_sort_type: "", // 기본 인기상품순
    view_type: "list",
    estimate_company: "",
  });
}
