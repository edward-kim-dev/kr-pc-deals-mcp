/**
 * 에누리 키워드 검색.
 *
 * GET https://price.enuri.com/search?keyword={검색어}[&category={에누리 카테고리 코드}]
 * 서버가 그려 보내는 첫 페이지(전체상품 탭, 인기순 40개)의 목록 데이터(`initProductList`)를 읽는다.
 * 탭(가격비교만 보기)·정렬·페이지당 개수를 바꾸면 화면이 robots.txt가 막은 /api/search/list로 다시 불러오므로
 * 그 값들은 쓰지 않는다. 그래서 오픈마켓 개별 상품(type "normal")이 섞여 오고, 가격비교 카탈로그 상품(type "model")만 남긴다.
 * price.enuri.com robots.txt는 Crawl-delay: 1이다 ("enuri" limiter가 1초 간격을 지킨다).
 */

import { fetchText } from "../../utils/http.js";
import { getCached, setCached, buildCacheKey } from "../../core/cache.js";
import { ScrapingError } from "../../core/errors.js";
import type { PartCategory } from "../../core/categories.js";
import type { Product } from "../../core/types.js";
import { collapseSpaces, htmlToText, toWon } from "../../utils/text.js";
import { ENURI_CATEGORIES, categoryFromEnuriCode, enuriProductUrl } from "./categories.js";
import { findFlightObject, isObject, joinFlightChunks } from "../../utils/next-flight.js";

const SEARCH_URL = "https://price.enuri.com/search";

export async function searchEnuri(
  query: string,
  options?: { category?: PartCategory; limit?: number }
): Promise<Product[]> {
  const limit = options?.limit ?? 10;
  const cacheKey = buildCacheKey("enuri", "search", query, options?.category);
  const cached = getCached<Product[]>(cacheKey);
  if (cached) return cached.slice(0, limit);

  let url = `${SEARCH_URL}?keyword=${encodeURIComponent(query)}`;
  if (options?.category) url += `&category=${ENURI_CATEGORIES[options.category]}`;

  const html = await fetchText(url, "enuri");
  // 목록 데이터도 "결과 없음" 화면도 없으면 parseEnuriSearchPage가 오류를 던진다. 그래서 여기서 캐시하는 빈 배열은 확실한 "결과 없음"뿐이다.
  const products = parseEnuriSearchPage(html, options?.category);
  setCached(cacheKey, products, "search");
  return products.slice(0, limit);
}

/** 검색 목록 상품 중 이 프로젝트가 쓰는 필드 */
interface EnuriListItem {
  /** 카탈로그 번호(modelno). 일반 상품은 "0" */
  id?: unknown;
  /** "model" 가격비교 카탈로그, "normal" 오픈마켓 개별 상품 */
  type?: unknown;
  name?: unknown;
  /** 용량 등으로 묶인 상품의 대표 옵션 이름 (예: "2TB", "4TB, ST4000VN006"). 옵션마다 카탈로그 번호가 따로 있다 */
  condiName?: unknown;
  /** 판매처 최저가. 현금가 판매처까지 포함한 값일 수 있다 (상세의 대표 최저가는 일반 판매가 기준) */
  priceInfo?: { price?: unknown };
  mallCount?: unknown;
  isRental?: unknown;
  category?: { categoryId?: unknown };
  /** 같은 묶음의 옵션들(대표 옵션 포함). 옵션마다 카탈로그 번호(modelId)·가격·판매처 수가 따로 있다 */
  purchaseOptions?: unknown;
}

interface EnuriPurchaseOption {
  modelId?: unknown;
  optionName?: unknown;
  price?: unknown;
  mallCount?: unknown;
}

/**
 * 검색 화면 HTML에서 가격비교 카탈로그 상품을 꺼낸다.
 * - 용량·포장(정품/멀티팩/벌크) 등으로 묶인 상품은 에누리가 고른 대표 옵션이 목록에 오고
 *   (검색어에 "2TB"가 있으면 2TB 옵션이 대표가 된다), 나머지 옵션은 purchaseOptions에 들어 있다.
 *   상품명 뒤에 옵션 이름을 붙여 어느 옵션의 가격인지 드러낸다.
 * - 대표 상품을 인기순 그대로 먼저 담고, 나머지 옵션은 그 뒤에 붙인다.
 *   앞쪽 결과는 에누리 순위 그대로이고, 대표 상품이 적은 검색(예: "라이젠 7800X3D"는 1개)에서만 다른 옵션이 채워진다.
 * - "결과 없음" 화면이면 빈 배열. 목록 데이터도 "결과 없음" 표시도 없으면 점검 화면이나 구조 변경으로 보고 ScrapingError.
 */
export function parseEnuriSearchPage(html: string, category?: PartCategory): Product[] {
  const payload = joinFlightChunks(html);
  const list = findFlightObject(payload, "initProductList");
  if (!list) {
    if (isEnuriEmptyResult(payload)) return [];
    throw new ScrapingError("enuri", "에누리 검색 결과를 읽지 못했습니다. 페이지 구조가 바뀌었거나 점검 중일 수 있습니다.");
  }
  if (!Array.isArray(list.items)) {
    throw new ScrapingError("enuri", "에누리 검색 응답 형식이 바뀌었습니다.");
  }

  const representatives: Product[] = [];
  const otherOptions: Product[] = [];
  for (const raw of list.items) {
    if (!isObject(raw)) continue;
    const item = raw as EnuriListItem;
    // 렌탈 상품의 가격은 월 요금이라 판매가와 비교할 수 없다
    if (item.type !== "model" || item.isRental === true) continue;

    const id = textOf(item.id);
    const baseName = htmlToText(textOf(item.name));
    const itemCategory = categoryFromEnuriCode(item.category?.categoryId) ?? category;
    const toProduct = (modelNo: string, option: string, price: unknown, mallCount: unknown): Product => ({
      source: "enuri",
      id: modelNo,
      name: collapseSpaces(`${baseName} ${option}`),
      price: toWon(price),
      url: enuriProductUrl(modelNo),
      category: itemCategory,
      shopCount: toWon(mallCount) || undefined,
    });
    representatives.push(toProduct(id, htmlToText(textOf(item.condiName)), item.priceInfo?.price, item.mallCount));

    for (const rawOption of Array.isArray(item.purchaseOptions) ? item.purchaseOptions : []) {
      if (!isObject(rawOption)) continue;
      const option = rawOption as EnuriPurchaseOption;
      const optionName = htmlToText(textOf(option.optionName));
      // 이름 없는 옵션은 대표 상품과 구분할 수 없어 뺀다
      if (optionName) otherOptions.push(toProduct(textOf(option.modelId), optionName, option.price, option.mallCount));
    }
  }

  const seen = new Set<string>();
  return [...representatives, ...otherOptions].filter((product) => {
    if (!/^\d+$/.test(product.id) || !product.name || seen.has(product.id)) return false;
    seen.add(product.id);
    return true;
  });
}

/**
 * 정상적인 "결과 없음" 화면인지.
 * 에누리는 결과가 없으면 목록 대신 SearchEmptySection 컴포넌트와 인기 추천 상품(initRecommendedProducts)을 보낸다.
 * 추천 상품은 검색 결과가 아니므로 쓰지 않는다.
 */
export function isEnuriEmptyResult(payload: string): boolean {
  return payload.includes('"SearchEmptySection"');
}

function textOf(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}
