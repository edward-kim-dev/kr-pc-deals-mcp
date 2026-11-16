/**
 * 사이트별 검색 함수 표.
 * search_parts·compare_prices·find_lowest_price가 이 표를 거쳐 여러 사이트를 동시에 검색한다.
 * 새 사이트를 붙이면 provider를 만들고 여기 한 줄을 더한다.
 */

import { searchDanawa, getDanawaProduct } from "../providers/danawa/index.js";
import { searchCompuzone, getCompuzoneProduct } from "../providers/compuzone/index.js";
import { searchEnuri, getEnuriProduct } from "../providers/enuri/index.js";
import { searchKjwwang, getKjwwangProduct } from "../providers/kjwwang/index.js";
import type { PartCategory } from "../core/categories.js";
import type { Product, ProductDetail, Source, SourceError } from "../core/types.js";
import { describeError } from "./errors.js";

export type SearchFn = (query: string, options: { category?: PartCategory; limit?: number }) => Promise<Product[]>;
export type DetailFn = (id: string) => Promise<ProductDetail>;

/** 상품 상세를 지원하는 사이트 */
export const DETAIL_FETCHERS: Array<[Source, DetailFn]> = [
  ["danawa", getDanawaProduct],
  ["enuri", getEnuriProduct],
  ["kjwwang", getKjwwangProduct],
  ["compuzone", getCompuzoneProduct],
];

export const DETAIL_SOURCES: Source[] = DETAIL_FETCHERS.map(([source]) => source);

export function getProductDetail(source: Source, id: string): Promise<ProductDetail> {
  const fetcher = DETAIL_FETCHERS.find(([s]) => s === source)?.[1];
  if (!fetcher) throw new Error(`${source}는 상품 상세를 지원하지 않습니다.`);
  return fetcher(id);
}

/**
 * 검색을 지원하는 사이트. 순서가 결과 순서이자 사이트 간 짝짓기의 기준 우선순위다.
 * 상품명이 정돈된 가격비교 카탈로그(다나와·에누리)를 앞에, 쇼핑몰을 뒤에 둔다.
 */
export const SEARCHERS: Array<[Source, SearchFn]> = [
  ["danawa", searchDanawa],
  ["enuri", searchEnuri],
  ["kjwwang", searchKjwwang],
  ["compuzone", searchCompuzone],
];

export const SEARCH_SOURCES: Source[] = SEARCHERS.map(([source]) => source);

/**
 * 받은 검색 결과를 자르지 않고 모두 쓰라는 limit 값.
 * 사이트마다 첫 페이지(다나와·에누리 40개, 컴퓨존 20개, 견적왕 10개)만 받아 캐시하고 limit만큼 잘라 주므로
 * 이 값을 줘도 요청 수는 같다. 용량·포장별 옵션을 펼친 상품까지 들어가 한 페이지 상품 수보다 많을 수 있다.
 */
export const ALL_RESULTS = Number.POSITIVE_INFINITY;

export interface MultiSearchResult {
  /** 검색한 사이트와 그 결과 (실패한 사이트는 빈 배열) */
  bySource: Array<{ source: Source; products: Product[] }>;
  errors: SourceError[];
}

/** 여러 사이트를 동시에 검색한다. 한 사이트가 실패해도 나머지 결과를 돌려준다. */
export async function searchSources(
  query: string,
  options: { category?: PartCategory; limit?: number; sources?: Source[] }
): Promise<MultiSearchResult> {
  const targets = SEARCHERS.filter(([source]) => !options.sources || options.sources.includes(source));
  const settled = await Promise.allSettled(
    targets.map(([, search]) => search(query, { category: options.category, limit: options.limit }))
  );

  const bySource: MultiSearchResult["bySource"] = [];
  const errors: SourceError[] = [];
  settled.forEach((outcome, i) => {
    const source = targets[i][0];
    if (outcome.status === "fulfilled") bySource.push({ source, products: outcome.value });
    else {
      bySource.push({ source, products: [] });
      errors.push({ source, message: describeError(outcome.reason) });
    }
  });
  return { bySource, errors };
}
