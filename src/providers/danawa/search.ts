import { fetchHtml } from "../../utils/http.js";
import { getCached, setCached, buildCacheKey } from "../../core/cache.js";
import { parseSearchResults } from "./parser.js";
import type { Product, PartCategory } from "../../core/types.js";
import { DANAWA_CATEGORIES } from "./parser.js";
import { ESTIMATE_CATEGORY_SEQ, ESTIMATE_SERVICE_SECTION_SEQ, ESTIMATE_SEARCH_CATEGORY_SEQ } from "./estimate-constants.js";
import { fetchProductListHtml } from "./estimate-api.js";
import { parseEstimateProductList } from "./estimate-parser.js";

export async function searchDanawa(
  query: string,
  options?: { category?: PartCategory; limit?: number }
): Promise<Product[]> {
  const cacheKey = buildCacheKey("danawa", "search", query, options?.category);
  const cached = getCached<Product[]>(cacheKey);
  if (cached) return cached;

  const limit = options?.limit ?? 20;

  // 카테고리 지정 시: estimate API의 name= 파라미터로 키워드+카테고리 동시 필터링
  if (options?.category) {
    const categorySeq = ESTIMATE_SEARCH_CATEGORY_SEQ;
    const serviceSectionSeq = ESTIMATE_SERVICE_SECTION_SEQ[options.category];
    const collected: Product[] = [];
    const seenIds = new Set<string>();

    for (let page = 1; collected.length < limit; page++) {
      const html = await fetchProductListHtml(categorySeq, page, query, serviceSectionSeq);
      const items = parseEstimateProductList(html);
      if (items.length === 0) break;

      let newItems = 0;
      for (const item of items) {
        if (seenIds.has(item.id)) continue;
        seenIds.add(item.id);
        newItems++;
        collected.push({
          id: item.id,
          source: "danawa",
          name: item.name,
          category: options.category,
          lowestPrice: item.price,
          prices: [],
          specs: {},
          imageUrl: item.imageUrl,
          productUrl: item.productUrl,
        });
        if (collected.length >= limit) break;
      }
      if (newItems === 0) break;
    }

    if (collected.length > 0) {
      setCached(cacheKey, collected, "search");
      return collected;
    }
    // estimate API 결과 없으면 아래 키워드 검색으로 폴백
  }

  // 카테고리 미지정: search.danawa.com 키워드 검색
  const url = `https://search.danawa.com/dsearch.php?query=${encodeURIComponent(query)}&tab=goods`;
  const html = await fetchHtml(url, "danawa");
  let products = parseSearchResults(html);

  if (options?.category) {
    products = products.map((p) => ({ ...p, category: options.category }));
  }

  products = products.slice(0, limit);
  setCached(cacheKey, products, "search");
  return products;
}

export async function listByCategory(
  category: PartCategory,
  options?: { sortBy?: "price" | "popularity"; limit?: number }
): Promise<Product[]> {
  const sort = options?.sortBy ?? "popularity";
  const limit = options?.limit ?? 20;
  const cacheKey = buildCacheKey("danawa-estimate", "list", category, sort, String(limit));
  const cached = getCached<Product[]>(cacheKey);
  if (cached) return cached;

  // estimate API 우선 시도
  try {
    const categorySeq = ESTIMATE_CATEGORY_SEQ[category];
    const collected: Product[] = [];
    const seenIds = new Set<string>();
    const MAX_PAGES = 5;

    for (let page = 1; collected.length < limit && page <= MAX_PAGES; page++) {
      const html = await fetchProductListHtml(categorySeq, page);
      const pageItems = parseEstimateProductList(html);
      if (pageItems.length === 0) break;

      let newItems = 0;
      for (const item of pageItems) {
        if (seenIds.has(item.id)) continue;
        seenIds.add(item.id);
        newItems++;
        collected.push({
          id: item.id,
          source: "danawa",
          name: item.name,
          category,
          lowestPrice: item.price,
          prices: [],
          specs: {},
          imageUrl: item.imageUrl,
          productUrl: item.productUrl,
        });
        if (collected.length >= limit) break;
      }
      // 새 제품이 없으면 이미 모든 제품을 수집한 것
      if (newItems === 0) break;
    }

    if (collected.length > 0) {
      setCached(cacheKey, collected, "search");
      return collected;
    }
  } catch {
    // 폴백: 기존 구현으로 전환
  }

  // 폴백: 기존 prod.danawa.com 구현
  const categoryCode = DANAWA_CATEGORIES[category];
  const sortParam = sort === "price" ? "lowprice" : "bestsell";
  const url = `https://prod.danawa.com/list/?cate=${categoryCode}&sort=${sortParam}`;

  const html = await fetchHtml(url, "danawa");
  let products = parseSearchResults(html).map((p) => ({ ...p, category }));
  products = products.slice(0, limit);
  setCached(cacheKey, products, "category");
  return products;
}
