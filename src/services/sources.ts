/**
 * 사이트별 함수 표 (검색·카테고리 인기 목록·상품 상세).
 * 도구들이 이 표를 거쳐 여러 사이트를 동시에 부른다.
 * 새 사이트를 붙이면 provider를 만들고 여기 표마다 한 줄을 더한다.
 */

import { searchDanawa, getDanawaProduct, listDanawaCategory } from "../providers/danawa/index.js";
import { searchCompuzone, getCompuzoneProduct, listCompuzoneCategory } from "../providers/compuzone/index.js";
import { searchEnuri, getEnuriProduct, listEnuriCategory } from "../providers/enuri/index.js";
import { searchKjwwang, getKjwwangProduct, listKjwwangCategory } from "../providers/kjwwang/index.js";
import type { PartCategory } from "../core/categories.js";
import type { Product, ProductDetail, Source, SourceError } from "../core/types.js";
import { describeError } from "./errors.js";

export type SearchFn = (query: string, options: { category?: PartCategory; limit?: number }) => Promise<Product[]>;
export type DetailFn = (id: string) => Promise<ProductDetail>;
/** 카테고리 인기 목록 첫 화면 전체를 인기순 그대로 돌려준다 (사이트마다 캐시) */
export type ListFn = (category: PartCategory) => Promise<Product[]>;

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
  /** 부른 사이트와 그 결과 (실패한 사이트는 빈 배열) */
  bySource: Array<{ source: Source; products: Product[] }>;
  errors: SourceError[];
}

/** 여러 사이트를 동시에 검색한다. 한 사이트가 실패해도 나머지 결과를 돌려준다. */
export function searchSources(
  query: string,
  options: { category?: PartCategory; limit?: number; sources?: Source[] }
): Promise<MultiSearchResult> {
  return runOnSources(pick(SEARCHERS, options.sources), (search) =>
    search(query, { category: options.category, limit: options.limit })
  );
}

/** 카테고리 인기 목록을 지원하는 사이트. 사이트마다 인기순 첫 화면만 읽는다 */
export const LISTERS: Array<[Source, ListFn]> = [
  ["danawa", listDanawaCategory], // 인기상품순 30개
  ["enuri", listEnuriCategory], // 인기순 40개
  ["kjwwang", listKjwwangCategory], // 인기상품순 10개
  ["compuzone", listCompuzoneCategory], // 판매량순 20개
];

export const LIST_SOURCES: Source[] = LISTERS.map(([source]) => source);

export type ListSort = "popularity" | "price";

/**
 * 여러 사이트의 카테고리 인기 목록을 동시에 받아 사이트마다 limit개씩 돌려준다.
 * 한 사이트가 실패해도 나머지 결과를 돌려준다.
 * sort가 "price"면 사이트마다 받은 인기 상위 목록을 가격 낮은 순으로 다시 정렬한다 (카테고리 전체의 최저가순이 아니다).
 */
export function listCategoryOnSources(
  category: PartCategory,
  options: { sort?: ListSort; limit?: number; sources?: Source[] }
): Promise<MultiSearchResult> {
  return runOnSources(pick(LISTERS, options.sources), async (list) => {
    const products = await list(category);
    return (options.sort === "price" ? sortByPrice(products) : products).slice(0, options.limit ?? 10);
  });
}

/** 가격 낮은 순. 가격 미정(0)과 가격이 의심스러운 상품은 뒤로 보낸다. 같은 순위면 원래(인기) 순서를 지킨다. */
export function sortByPrice(products: Product[]): Product[] {
  const unreliable = (p: Product) => (p.price === 0 || p.priceWarning ? 1 : 0);
  return [...products].sort((a, b) => unreliable(a) - unreliable(b) || (unreliable(a) ? 0 : a.price - b.price));
}

function pick<F>(table: Array<[Source, F]>, sources?: Source[]): Array<[Source, F]> {
  return table.filter(([source]) => !sources || sources.includes(source));
}

/** 사이트마다 동시에 실행하고, 실패한 사이트는 빈 결과와 오류 문장으로 바꾼다 */
async function runOnSources<F>(
  targets: Array<[Source, F]>,
  run: (fn: F) => Promise<Product[]>
): Promise<MultiSearchResult> {
  const settled = await Promise.allSettled(targets.map(([, fn]) => run(fn)));

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
