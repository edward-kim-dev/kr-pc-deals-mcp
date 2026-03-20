import { fetchHtml } from "../../utils/http.js";
import { getCached, setCached, buildCacheKey } from "../../core/cache.js";
import { parseProductDetail } from "./parser.js";
import type { Product, SellerPrice } from "../../core/types.js";

export async function getProductDetail(productCode: string): Promise<{
  specs: Record<string, string>;
  prices: SellerPrice[];
}> {
  const cacheKey = buildCacheKey("danawa", "product", productCode);
  const cached = getCached<{ specs: Record<string, string>; prices: SellerPrice[] }>(cacheKey);
  if (cached) return cached;

  const url = `https://prod.danawa.com/info/?pcode=${productCode}`;
  const html = await fetchHtml(url, "danawa");
  const result = parseProductDetail(html, productCode);

  setCached(cacheKey, result, "product");
  return result;
}
