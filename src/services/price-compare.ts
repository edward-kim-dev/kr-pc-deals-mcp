import { searchDanawa } from "../providers/danawa/index.js";
import { searchCompuzone } from "../providers/compuzone/index.js";
import { searchCoupang } from "../providers/coupang/index.js";
import { findBestMatch } from "../utils/normalize.js";
import type {
  Product,
  PartCategory,
  ComparisonResult,
  Source,
} from "../core/types.js";

export async function comparePrices(
  query: string,
  options?: { category?: PartCategory; limit?: number }
): Promise<ComparisonResult> {
  const limit = options?.limit ?? 10;

  // 3개 출처를 순차 검색 (사이트별 rate limiter가 있지만, 안전하게 순차 실행)
  const [danawa, compuzone, coupang] = await Promise.all([
    searchDanawa(query, { category: options?.category, limit }).catch(() => []),
    searchCompuzone(query, { category: options?.category, limit }).catch(() => []),
    // 쿠팡은 키 없으면 자동 빈 배열
    searchCoupang(query, { category: options?.category, limit }).catch(() => []),
  ]);

  // 크로스사이트 매칭: 다나와를 기준으로 컴퓨존/쿠팡에서 동일 제품 찾기
  const matched: ComparisonResult["matched"] = [];
  const compuzoneNames = compuzone.map((p) => p.name);
  const coupangNames = coupang.map((p) => p.name);

  for (const dProduct of danawa) {
    const cMatch = findBestMatch(dProduct.name, compuzoneNames, 0.4);
    const coupMatch = findBestMatch(dProduct.name, coupangNames, 0.4);

    if (!cMatch && !coupMatch) continue;

    const cProduct = cMatch ? compuzone[cMatch.index] : undefined;
    const coupProduct = coupMatch ? coupang[coupMatch.index] : undefined;

    const priceCandidates: { source: Source; price: number }[] = [
      { source: "danawa", price: dProduct.lowestPrice },
    ];
    if (cProduct && cProduct.lowestPrice > 0) {
      priceCandidates.push({ source: "compuzone", price: cProduct.lowestPrice });
    }
    if (coupProduct && coupProduct.lowestPrice > 0) {
      priceCandidates.push({ source: "coupang", price: coupProduct.lowestPrice });
    }

    const cheapest = priceCandidates.reduce((min, p) =>
      p.price < min.price ? p : min
    );
    const dearest = priceCandidates.reduce((max, p) =>
      p.price > max.price ? p : max
    );

    matched.push({
      danawa: dProduct,
      compuzone: cProduct,
      coupang: coupProduct,
      priceDiff: dearest.price - cheapest.price,
      cheaperSource: cheapest.source,
    });
  }

  return { query, danawa, compuzone, coupang, matched };
}

export async function findLowestPrice(
  query: string,
  options?: { category?: PartCategory }
): Promise<Product | null> {
  const comparison = await comparePrices(query, {
    category: options?.category,
    limit: 10,
  });

  const allProducts = [
    ...comparison.danawa,
    ...comparison.compuzone,
    ...comparison.coupang,
  ];

  if (allProducts.length === 0) return null;

  const withPrice = allProducts.filter((p) => p.lowestPrice > 0);
  if (withPrice.length === 0) return allProducts[0];

  return withPrice.reduce((min, p) =>
    p.lowestPrice < min.lowestPrice ? p : min
  );
}
