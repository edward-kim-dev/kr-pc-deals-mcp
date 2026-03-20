import { fetchHtml } from "../../utils/http.js";
import { getCached, setCached, buildCacheKey } from "../../core/cache.js";
import { parseProductDetail } from "./parser.js";
import type { SellerPrice } from "../../core/types.js";

export async function getCompuzoneProductDetail(productId: string): Promise<{
  specs: Record<string, string>;
  prices: SellerPrice[];
}> {
  const cacheKey = buildCacheKey("compuzone", "product", productId);
  const cached = getCached<{ specs: Record<string, string>; prices: SellerPrice[] }>(cacheKey);
  if (cached) return cached;

  const url = `https://www.compuzone.co.kr/product/product_detail.htm?ProductNo=${productId}`;
  const html = await fetchHtml(url, "compuzone");
  const { specs, price } = parseProductDetail(html);

  const result = {
    specs,
    prices: price > 0
      ? [
          {
            sellerName: "컴퓨존",
            price,
            shippingCost: 0,
            totalPrice: price,
            productUrl: url,
          },
        ]
      : [],
  };

  setCached(cacheKey, result, "product");
  return result;
}
