/**
 * 견적왕 상품 상세.
 *
 * GET https://kjwwang.com/shop/product_detail.html?pd_no={상품 번호} (EUC-KR)
 * 판매처는 현금가 판매처와 카드가 판매처로 나뉘어 있어, 판매처 이름 뒤에 "(현금)"·"(카드)"를 붙인다.
 * 가격 변동 이력은 상세 화면에 없다.
 */

import { fetchText } from "../../utils/http.js";
import { getCached, setCached, buildCacheKey } from "../../core/cache.js";
import { InputError, ScrapingError } from "../../core/errors.js";
import type { ProductDetail } from "../../core/types.js";
import { kjwwangProductUrl } from "./categories.js";
import { parseKjwwangProductPage } from "./parser.js";

export async function getKjwwangProduct(pdNo: string): Promise<ProductDetail> {
  if (!/^\d+$/.test(pdNo)) {
    throw new InputError(`견적왕 상품 번호(pd_no)는 숫자입니다: "${pdNo}"`);
  }
  const cacheKey = buildCacheKey("kjwwang", "product", pdNo);
  const cached = getCached<ProductDetail>(cacheKey);
  if (cached) return cached;

  const html = await fetchText(kjwwangProductUrl(pdNo), "kjwwang", { encoding: "euc-kr" });
  const detail = parseKjwwangProductPage(html, pdNo);
  if (!detail.name || (!detail.price && detail.offers.length === 0 && detail.specs.length === 0)) {
    throw new ScrapingError("kjwwang", `견적왕 상품 ${pdNo}의 정보를 찾지 못했습니다. 번호가 맞는지 확인해 주세요.`);
  }

  setCached(cacheKey, detail, "product");
  return detail;
}
