/**
 * 견적왕 키워드 검색. 페이지가 하는 두 단계를 그대로 따른다.
 *
 * 1. GET https://kjwwang.com/shop/product_search.html?main_search={EUC-KR 검색어}
 *    검색어는 EUC-KR 퍼센트 인코딩으로 보내야 한다 (UTF-8로 보내면 글자가 깨져 0건이 된다).
 *    응답에서 목록 POST에 넘길 검색 토큰(#search_query)과 "부품(N)" 결과 수를 읽는다.
 * 2. POST https://kjwwang.com/skin/shop/basic/product_list_include_plist.php
 *    검색 화면의 searchListAjax()와 같은 익명 폼 전송. 토큰이 없으면 서버가 "검색결과가 없습니다"를 준다.
 *    한 번에 10개(인기상품순)를 주며, 첫 페이지만 읽는다.
 * 두 응답 모두 EUC-KR이다. robots.txt는 /shop/, /skin/을 막지 않는다 (/ajax/ 등 관리용 경로만 막음).
 */

import { encodeEucKr, fetchText } from "../../utils/http.js";
import { getCached, setCached, buildCacheKey } from "../../core/cache.js";
import { ScrapingError } from "../../core/errors.js";
import type { PartCategory } from "../../core/categories.js";
import type { Product } from "../../core/types.js";
import { KJWWANG_CATEGORIES } from "./categories.js";
import { isKjwwangEmptyList, parseKjwwangSearchList, parseKjwwangSearchPage } from "./parser.js";

const SEARCH_PAGE_URL = "https://kjwwang.com/shop/product_search.html";
const LIST_URL = "https://kjwwang.com/skin/shop/basic/product_list_include_plist.php";

export async function searchKjwwang(
  query: string,
  options?: { category?: PartCategory; limit?: number }
): Promise<Product[]> {
  const limit = options?.limit ?? 10;
  const cacheKey = buildCacheKey("kjwwang", "search", query, options?.category);
  const cached = getCached<Product[]>(cacheKey);
  if (cached) return cached.slice(0, limit);

  const pageUrl = `${SEARCH_PAGE_URL}?main_search=${await encodeEucKr(query)}`;
  const page = parseKjwwangSearchPage(await fetchText(pageUrl, "kjwwang", { encoding: "euc-kr" }));
  if (page.partCount === 0) {
    // "부품(0)": 부품 검색 결과가 없다. 목록을 요청하지 않는다.
    setCached(cacheKey, [], "search");
    return [];
  }
  if (!page.token) {
    throw new ScrapingError("kjwwang", "견적왕 검색 화면을 읽지 못했습니다. 페이지 구조가 바뀌었거나 점검 중일 수 있습니다.");
  }

  const html = await fetchText(LIST_URL, "kjwwang", {
    method: "POST",
    body: buildListForm(page.searchWord || query, page.token, options?.category).toString(),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Referer: pageUrl,
    },
    encoding: "euc-kr",
  });

  const products = parseKjwwangSearchList(html, options?.category);
  // 상품도 "검색결과가 없습니다" 문구도 없으면 점검 화면이거나 구조가 바뀐 것이다. 빈 결과로 캐시하지 않는다.
  if (products.length === 0 && !isKjwwangEmptyList(html)) {
    throw new ScrapingError("kjwwang", "견적왕 검색 결과를 읽지 못했습니다. 페이지 구조가 바뀌었거나 점검 중일 수 있습니다.");
  }
  setCached(cacheKey, products, "search");
  return products.slice(0, limit);
}

/**
 * 검색 화면 스크립트(searchListAjax)가 jQuery로 보내는 것과 같은 폼 본문.
 * jQuery는 값을 UTF-8로 인코딩하고, 견적서 정렬값 배열 sort를 sort[]로 4개 보낸다.
 */
export function buildListForm(searchWord: string, token: string, category?: PartCategory): URLSearchParams {
  const form = new URLSearchParams();
  for (const value of ["", "", "", "X"]) form.append("sort[]", value);
  form.append("action", "pc_estimate_keyword");
  form.append("search_word", searchWord);
  form.append("search1", "");
  form.append("search_query", token);
  form.append("search_cate", category ? KJWWANG_CATEGORIES[category] : "0"); // 0은 "전체보기"
  form.append("sprice", "");
  form.append("eprice", "");
  form.append("page", "1");
  form.append("list_sort_type", ""); // 기본 인기상품순
  form.append("view_type", "");
  form.append("timeid", String(Math.random() * 1_000_000)); // 화면 스크립트와 같은 캐시 방지 값
  return form;
}
