/**
 * 에누리 카테고리 인기 목록.
 *
 * GET https://price.enuri.com/list?category={에누리 카테고리 코드}
 * 서버가 그려 보내는 첫 화면(인기순 40개)의 목록 데이터(`initProductList`)를 읽는다. 검색 화면과 같은 형식이라
 * 검색 파서(parseEnuriSearchPage)로 읽는다. 정렬·페이지를 바꾸면 화면이 robots.txt가 막은 /api/로 다시 불러오므로
 * 첫 화면만 쓴다.
 */

import { fetchText } from "../../utils/http.js";
import { getCached, setCached, buildCacheKey } from "../../core/cache.js";
import { ScrapingError } from "../../core/errors.js";
import type { PartCategory } from "../../core/categories.js";
import type { Product } from "../../core/types.js";
import { ENURI_CATEGORIES } from "./categories.js";
import { parseEnuriSearchPage } from "./search.js";

const LIST_URL = "https://price.enuri.com/list";

/** 카테고리 인기 목록 첫 화면 전체 (인기순 40개) */
export async function listEnuriCategory(category: PartCategory): Promise<Product[]> {
  const cacheKey = buildCacheKey("enuri", "list", category);
  const cached = getCached<Product[]>(cacheKey);
  if (cached) return cached;

  const html = await fetchText(`${LIST_URL}?category=${ENURI_CATEGORIES[category]}`, "enuri");
  const products = parseEnuriSearchPage(html, category);
  // 카테고리 목록은 비어 있을 수 없다. 비었으면 점검 화면이나 구조 변경으로 보고 캐시하지 않는다.
  if (products.length === 0) {
    throw new ScrapingError("enuri", "에누리 카테고리 목록에서 상품을 찾지 못했습니다. 페이지 구조가 바뀌었을 수 있습니다.");
  }
  setCached(cacheKey, products, "list");
  return products;
}
