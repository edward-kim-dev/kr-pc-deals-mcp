import { fetchText } from "../../utils/http.js";
import { getCached, setCached, buildCacheKey } from "../../core/cache.js";
import { InputError, ScrapingError } from "../../core/errors.js";
import type { ProductDetail } from "../../core/types.js";
import { compuzoneProductUrl } from "./categories.js";
import { parseCompuzoneProductPage } from "./parser.js";

export async function getCompuzoneProduct(productNo: string): Promise<ProductDetail> {
  if (!/^\d+$/.test(productNo)) {
    throw new InputError(`컴퓨존 상품 번호는 숫자입니다: "${productNo}"`);
  }
  const cacheKey = buildCacheKey("compuzone", "product", productNo);
  const cached = getCached<ProductDetail>(cacheKey);
  if (cached) return cached;

  const html = await fetchText(compuzoneProductUrl(productNo), "compuzone", { encoding: "euc-kr" });
  const detail = parseCompuzoneProductPage(html, productNo);
  if (!detail.name || (!detail.price && detail.specs.length === 0)) {
    throw new ScrapingError("compuzone", `컴퓨존 상품 ${productNo}의 정보를 찾지 못했습니다. 번호가 맞는지 확인해 주세요.`);
  }

  setCached(cacheKey, detail, "product");
  return detail;
}
