/**
 * 컴퓨존 카테고리 인기 목록.
 *
 * 분류 화면(/product/product_list.htm?BigDivNo=&MediumDivNo=)은 상품을 화면 스크립트(product_list.js의 getProductList)가
 * 익명 POST로 불러온다. 같은 요청을 보낸다.
 * POST https://www.compuzone.co.kr/product/product_list.php
 * 응답은 검색 목록과 같은 형식의 상품 조각(EUC-KR)이고, 한 번에 20개(스크롤 한 단위)를 준다. 첫 단위만 읽는다.
 * 화면 기본 정렬은 "추천순"(recommand)이지만 인기 목록이므로 "판매량순"(sale_order)으로 받는다.
 */

import { fetchText } from "../../utils/http.js";
import { getCached, setCached, buildCacheKey } from "../../core/cache.js";
import { ScrapingError } from "../../core/errors.js";
import type { PartCategory } from "../../core/categories.js";
import type { Product } from "../../core/types.js";
import { COMPUZONE_CATEGORIES } from "./categories.js";
import { parseCompuzoneSearch } from "./parser.js";

const LIST_URL = "https://www.compuzone.co.kr/product/product_list.php";

/** 카테고리 인기 목록 첫 단위 전체 (판매량순 20개) */
export async function listCompuzoneCategory(category: PartCategory): Promise<Product[]> {
  const cacheKey = buildCacheKey("compuzone", "list", category);
  const cached = getCached<Product[]>(cacheKey);
  if (cached) return cached;

  const { big, medium } = COMPUZONE_CATEGORIES[category];
  const html = await fetchText(LIST_URL, "compuzone", {
    method: "POST",
    body: buildCategoryListForm(category).toString(),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Referer: `https://www.compuzone.co.kr/product/product_list.htm?BigDivNo=${big}&MediumDivNo=${medium}`,
    },
    encoding: "euc-kr",
  });
  const products = parseCompuzoneSearch(html, category);
  // 카테고리 목록은 비어 있을 수 없다. 비었으면 점검 화면이나 구조 변경으로 보고 캐시하지 않는다.
  if (products.length === 0) {
    throw new ScrapingError("compuzone", "컴퓨존 카테고리 목록에서 상품을 찾지 못했습니다. 페이지 구조가 바뀌었거나 점검 중일 수 있습니다.");
  }
  setCached(cacheKey, products, "list");
  return products;
}

/** 분류 화면의 숨은 폼(global_form)과 같은 본문 */
export function buildCategoryListForm(category: PartCategory): URLSearchParams {
  const { big, medium } = COMPUZONE_CATEGORIES[category];
  return new URLSearchParams({
    actype: "getList",
    BigDivNo: big,
    MediumDivNo: medium,
    DivNo: "0",
    PageCount: "60",
    StartNum: "0",
    PageNum: "1",
    PreOrder: "sale_order", // 판매량순
    lvm: "L",
    ScrollPage: "1",
    ProductType: "list",
  });
}
