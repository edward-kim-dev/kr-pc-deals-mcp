/**
 * 사이트 간 가격 비교.
 * 여러 사이트를 동시에 검색하고, 같은 제품끼리 묶어 가격을 나란히 놓는다.
 */

import { extractCapacities, extractModelNumber, scorePair } from "../utils/normalize.js";
import type { PartCategory } from "../core/categories.js";
import type { Product, Source, SourceError } from "../core/types.js";
import { ALL_RESULTS, searchSources } from "./sources.js";

/** compare_prices가 돌려주는 묶음 수 기본값 */
export const DEFAULT_GROUP_LIMIT = 10;

/** 여러 사이트에서 찾은 같은 제품 한 묶음 */
export interface PriceGroup {
  /** 묶음 대표(첫 상품)의 상품명 */
  name: string;
  /** 사이트마다 하나씩, 사이트 표 순서대로. 첫 상품이 묶음의 대표다 */
  products: Product[];
  /** 가장 싼 사이트 (같은 값이면 여럿). 가격이 있는 상품이 없으면 빈 배열 */
  cheapestSources: Source[];
  /** 가장 싼 가격(원). 가격이 있는 상품이 없으면 0 */
  lowestPrice: number;
  /** 가장 비싼 곳과 가장 싼 곳의 차이(원). 가격이 있는 사이트가 둘 미만이면 0 */
  priceGap: number;
}

export interface ComparisonResult {
  query: string;
  /** 사이트별 검색 결과 수 */
  counts: Array<{ source: Source; count: number }>;
  groups: PriceGroup[];
  errors: SourceError[];
}

export async function comparePrices(
  query: string,
  options?: { category?: PartCategory; limit?: number }
): Promise<ComparisonResult> {
  // 사이트마다 검색 순위가 달라 상위 몇 개끼리만 맞춰 보면 같은 제품을 놓친다.
  // 첫 페이지는 어차피 한 번에 받으므로 전부 맞춰 보고(요청 수는 같다), 돌려줄 묶음 수만 자른다.
  const { bySource, errors } = await searchSources(query, { category: options?.category, limit: ALL_RESULTS });
  return {
    query,
    counts: bySource.map(({ source, products }) => ({ source, count: products.length })),
    groups: groupSameProducts(bySource, options?.category).slice(0, options?.limit ?? DEFAULT_GROUP_LIMIT),
    errors,
  };
}

/**
 * 같은 제품끼리 묶는다 (판정 규칙은 utils/normalize.ts의 scorePair).
 * 사이트 표 순서(services/sources.ts)대로 한 사이트씩, 그 사이트 상품을 지금까지의 묶음에 1:1로 배정한다.
 * - 모든 (묶음 대표, 상품) 쌍의 점수를 구해 높은 순서대로 배정하므로, 한 상품은 한 묶음에만,
 *   한 묶음에는 사이트마다 한 상품만 들어간다.
 * - 짝을 못 찾은 상품은 새 묶음이 되어 뒤 사이트를 기다린다. 앞 사이트에 없는 제품도 뒤 사이트끼리 묶인다.
 * - 두 사이트 이상 모인 묶음만 돌려준다. 순서는 묶음이 생긴 순서(앞 사이트의 검색 순위)다.
 */
export function groupSameProducts(
  bySource: Array<{ source: Source; products: Product[] }>,
  category?: PartCategory
): PriceGroup[] {
  const groups: Product[][] = [];
  for (const { products } of bySource) {
    const assigned = assignOneToOne(
      groups.map((group) => group[0]),
      products,
      category
    );
    for (const [g, o] of assigned) groups[g].push(products[o]);
    const used = new Set(assigned.values());
    products.forEach((product, o) => {
      if (!used.has(o)) groups.push([product]);
    });
  }
  return groups.filter((group) => group.length > 1).map(summarize);
}

/**
 * base와 others 사이의 1:1 짝 (점수 높은 쌍부터). base 번호 → others 번호.
 * 한 상품이 상대편의 서로 다른 제품 여럿과 모두 맞으면 어느 것과 같은지 알 수 없어 짝짓지 않는다
 * (예: 포장이 안 적힌 "7800X3D (라파엘)"은 멀티팩·정품·벌크 상품과 모두 맞는다).
 */
function assignOneToOne(base: Product[], others: Product[], category?: PartCategory): Map<number, number> {
  const pairs: Pair[] = [];
  base.forEach((bp, b) => {
    others.forEach((op, o) => {
      const score = scorePair(bp.name, op.name, bp.category ?? op.category ?? category);
      if (score) pairs.push({ b, o, ...score });
    });
  });

  const unclearBase = findAmbiguous(pairs, (p) => p.b, (p) => others[p.o], category);
  const unclearOthers = findAmbiguous(pairs, (p) => p.o, (p) => base[p.b], category);
  const clear = pairs.filter((p) => !unclearBase.has(p.b) && !unclearOthers.has(p.o));
  clear.sort((x, y) => y.similarity - x.similarity || y.overall - x.overall);

  const assigned = new Map<number, number>();
  const used = new Set<number>();
  for (const { b, o } of clear) {
    if (assigned.has(b) || used.has(o)) continue;
    assigned.set(b, o);
    used.add(o);
  }
  return assigned;
}

interface Pair {
  b: number;
  o: number;
  similarity: number;
  overall: number;
}

/** 짝 후보 중에 서로 다른 제품이 섞인 상품의 번호들 (side로 어느 쪽 번호인지, partner로 짝 후보 상품을 고른다) */
function findAmbiguous(
  pairs: Pair[],
  side: (pair: Pair) => number,
  partner: (pair: Pair) => Product,
  category?: PartCategory
): Set<number> {
  const partners = new Map<number, Product[]>();
  for (const pair of pairs) partners.set(side(pair), [...(partners.get(side(pair)) ?? []), partner(pair)]);

  const ambiguous = new Set<number>();
  for (const [index, list] of partners) {
    const mixed = list.some((x, i) =>
      list.slice(i + 1).some((y) => !scorePair(x.name, y.name, x.category ?? y.category ?? category))
    );
    if (mixed) ambiguous.add(index);
  }
  return ambiguous;
}

function summarize(products: Product[]): PriceGroup {
  // 가격 미정(0)은 비교에서 뺀다
  const priced = products.filter((p) => p.price > 0);
  const prices = priced.map((p) => p.price);
  const lowestPrice = prices.length > 0 ? Math.min(...prices) : 0;
  return {
    name: products[0].name,
    products,
    cheapestSources: priced.filter((p) => p.price === lowestPrice).map((p) => p.source),
    lowestPrice,
    priceGap: prices.length >= 2 ? Math.max(...prices) - lowestPrice : 0,
  };
}

export interface LowestPriceResult {
  query: string;
  /** 가장 싼 상품. 조건에 맞는 상품이 없으면 null */
  cheapest: Product | null;
  /** 검색어에서 뽑은 모델번호. 있으면 이 모델로 확인되는 상품만 후보로 삼았다 */
  model: string | null;
  /** 검색어에 적힌 용량. 다른 용량이 적힌 상품은 후보에서 뺐다 */
  capacities: string[];
  /** 비교한 후보 수 */
  candidates: number;
  errors: SourceError[];
}

/**
 * 모든 사이트 결과 중 가장 싼 상품을 고른다.
 * 검색어에 모델번호(예: RTX 5070 Ti, 14700K, 7800X3D)가 있으면 그 모델로 확인되는 상품만,
 * 용량(16GB, 2TB 등)이 있으면 다른 용량이 적힌 상품을 뺀 나머지만 후보로 삼는다.
 * 후보가 없으면 다른 모델로 대신하지 않고 cheapest를 null로 돌려준다.
 */
export async function findLowestPrice(
  query: string,
  options?: { category?: PartCategory }
): Promise<LowestPriceResult> {
  const { bySource, errors } = await searchSources(query, { category: options?.category, limit: ALL_RESULTS });
  const priced = bySource.flatMap(({ products }) => products).filter((p) => p.price > 0 && !p.priceWarning);

  const model = extractModelNumber(query, options?.category);
  const capacities = extractCapacities(query);
  const candidates = priced.filter((p) => {
    if (model && extractModelNumber(p.name, p.category ?? options?.category) !== model) return false;
    // 검색어에 용량(16GB 등)이 있으면 다른 용량이 적힌 상품은 뺀다. 이름에 용량이 없는 상품은 남긴다.
    const own = extractCapacities(p.name);
    return capacities.length === 0 || own.length === 0 || own.some((c) => capacities.includes(c));
  });

  const cheapest = candidates.length > 0 ? candidates.reduce((min, p) => (p.price < min.price ? p : min)) : null;
  return { query, cheapest, model, capacities, candidates: candidates.length, errors };
}
