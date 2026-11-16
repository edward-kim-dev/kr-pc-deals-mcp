/**
 * 다나와 키워드 검색.
 *
 * search.danawa.com 검색 화면이 쓰는 상품 목록 JSON(`/api/search/product-list/`)을 읽는다.
 * 검색 화면과 같은 데이터이며, 카테고리(cate1/cate2)로 거를 수 있다.
 * search.danawa.com은 robots.txt에 Crawl-delay: 10이 있어 "danawa-search" limiter가 10초 간격을 지킨다.
 */

import { fetchJson } from "../../utils/http.js";
import { getCached, setCached, buildCacheKey } from "../../core/cache.js";
import { ScrapingError } from "../../core/errors.js";
import type { PartCategory } from "../../core/categories.js";
import type { Product } from "../../core/types.js";
import { collapseSpaces, htmlToText, toWon } from "../../utils/text.js";
import { DANAWA_CATEGORIES, categoryFromCate2, danawaProductUrl } from "./categories.js";

const SEARCH_API = "https://search.danawa.com/api/search/product-list/";
/** 한 번에 받는 상품 수. 검색 화면 한 페이지와 같다 */
const PAGE_SIZE = 40;

/** 검색 API 응답 중 이 프로젝트가 쓰는 부분 */
export interface DanawaSearchResponse {
  data?: {
    products?: Array<{
      prodType?: number;
      productSeq?: string | number;
      /** 묶음 옵션 이름이 빠진 상품명 (예: "ESSENCORE KLEVV DDR5-6000 CL30 FIT V 패키지 서린") */
      productName?: string;
      /** 이 상품 코드의 묶음 옵션 이름 (예: "32GB(16Gx2)"). 묶음이 없는 상품(그래픽카드 등)은 없다 */
      bundleName?: string;
      /** 같은 상품의 묶음 옵션들(이 상품 포함). 옵션마다 상품 코드·가격·판매처 수가 따로 있다 */
      bundleList?: Array<{
        productSeq?: string | number;
        bundleName?: string;
        minPrice?: number | string;
        shopCount?: number | string;
      }>;
      minPrice?: number | string;
      shopCount?: number | string;
      categorySeq2?: number | string;
    }>;
  };
}

export async function searchDanawa(
  query: string,
  options?: { category?: PartCategory; limit?: number }
): Promise<Product[]> {
  const limit = options?.limit ?? 10;
  const cacheKey = buildCacheKey("danawa", "search", query, options?.category);
  const cached = getCached<Product[]>(cacheKey);
  if (cached) return cached.slice(0, limit);

  const params = new URLSearchParams({
    keyword: query,
    sort: "saveDESC", // 인기상품순 (검색 화면 기본값)
    page: "1",
    limit: String(PAGE_SIZE),
  });
  if (options?.category) {
    const { cate1, cate2 } = DANAWA_CATEGORIES[options.category];
    params.set("cate1", String(cate1));
    params.set("cate2", String(cate2));
  }

  const response = await fetchJson<DanawaSearchResponse>(`${SEARCH_API}?${params}`, "danawa-search", {
    headers: {
      Referer: `https://search.danawa.com/?query=${encodeURIComponent(query)}&tab=goods`,
    },
  });
  if (!response?.data || !Array.isArray(response.data.products)) {
    throw new ScrapingError("danawa", "다나와 검색 응답 형식이 바뀌었습니다.");
  }

  const products = parseDanawaSearchResponse(response);
  setCached(cacheKey, products, "search");
  return products.slice(0, limit);
}

/**
 * 검색 API 응답을 상품 목록으로 바꾼다.
 * - 다나와 가격비교 카탈로그 상품(prodType 1, 숫자 pcode)만 남긴다.
 *   오픈마켓 개별 상품(prodType 3, "TH201_…" 같은 코드)은 견적·상세 조회에 쓸 수 없어 뺀다.
 * - 메모리·SSD처럼 용량별로 묶인 상품은 상품명에 용량이 없고 bundleName에 따로 온다.
 *   이름 뒤에 붙여야 어느 용량의 가격인지 알 수 있다 ("… FIT V 패키지 서린 (32GB(16Gx2))").
 * - 같은 묶음의 다른 옵션(bundleList)은 상품 코드·가격이 따로 있어 별도 상품으로 펼친다.
 *   대표 상품을 인기순 그대로 먼저 담고, 다른 옵션은 그 뒤에 붙인다.
 */
export function parseDanawaSearchResponse(response: DanawaSearchResponse): Product[] {
  const representatives: Product[] = [];
  const otherBundles: Product[] = [];
  for (const item of response.data?.products ?? []) {
    const id = String(item.productSeq ?? "");
    if (item.prodType !== 1 || !/^\d+$/.test(id)) continue;

    const baseName = htmlToText(item.productName ?? "");
    if (!baseName) continue;
    const category = categoryFromCate2(item.categorySeq2);
    const toProduct = (pcode: string, bundleName: unknown, price: unknown, shopCount: unknown): Product => {
      const bundle = htmlToText(typeof bundleName === "string" ? bundleName : "");
      return {
        source: "danawa",
        id: pcode,
        name: collapseSpaces(bundle ? `${baseName} (${bundle})` : baseName),
        price: toWon(price),
        url: danawaProductUrl(pcode),
        category,
        shopCount: toWon(shopCount) || undefined,
      };
    };

    representatives.push(toProduct(id, item.bundleName, item.minPrice, item.shopCount));
    for (const bundle of Array.isArray(item.bundleList) ? item.bundleList : []) {
      const pcode = String(bundle?.productSeq ?? "");
      if (/^\d+$/.test(pcode)) otherBundles.push(toProduct(pcode, bundle.bundleName, bundle.minPrice, bundle.shopCount));
    }
  }

  const seen = new Set<string>();
  return [...representatives, ...otherBundles].filter((product) => {
    if (seen.has(product.id)) return false;
    seen.add(product.id);
    return true;
  });
}
