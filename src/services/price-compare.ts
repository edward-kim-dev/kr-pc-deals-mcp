import { searchDanawa } from "../providers/danawa/index.js";
import { searchCompuzone } from "../providers/compuzone/index.js";
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

  // 순차 검색 (사이트별 rate limiter가 있지만, 안전하게 순차 실행)
  let danawaResults: PromiseSettledResult<Product[]>;
  let compuzoneResults: PromiseSettledResult<Product[]>;

  try {
    const d = await searchDanawa(query, { category: options?.category, limit });
    danawaResults = { status: "fulfilled", value: d };
  } catch (e) {
    danawaResults = { status: "rejected", reason: e };
  }

  try {
    const c = await searchCompuzone(query, { category: options?.category, limit });
    compuzoneResults = { status: "fulfilled", value: c };
  } catch (e) {
    compuzoneResults = { status: "rejected", reason: e };
  }

  const danawa =
    danawaResults.status === "fulfilled" ? danawaResults.value : [];
  const compuzone =
    compuzoneResults.status === "fulfilled" ? compuzoneResults.value : [];

  // 크로스사이트 매칭
  const matched: ComparisonResult["matched"] = [];
  const compuzoneNames = compuzone.map((p) => p.name);

  for (const dProduct of danawa) {
    const match = findBestMatch(dProduct.name, compuzoneNames, 0.35);
    if (match) {
      const cProduct = compuzone[match.index];
      const priceDiff = Math.abs(dProduct.lowestPrice - cProduct.lowestPrice);
      const cheaperSource: Source =
        dProduct.lowestPrice <= cProduct.lowestPrice ? "danawa" : "compuzone";

      matched.push({
        danawa: dProduct,
        compuzone: cProduct,
        priceDiff,
        cheaperSource,
      });
    }
  }

  return { query, danawa, compuzone, matched };
}

export async function findLowestPrice(
  query: string,
  options?: { category?: PartCategory }
): Promise<Product | null> {
  const comparison = await comparePrices(query, {
    category: options?.category,
    limit: 10,
  });

  const allProducts = [...comparison.danawa, ...comparison.compuzone];

  if (allProducts.length === 0) return null;

  // 가격이 0인 제품 제외
  const withPrice = allProducts.filter((p) => p.lowestPrice > 0);
  if (withPrice.length === 0) return allProducts[0];

  return withPrice.reduce((min, p) =>
    p.lowestPrice < min.lowestPrice ? p : min
  );
}
