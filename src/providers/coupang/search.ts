/**
 * 쿠팡 키워드 검색 (브라우저 모드).
 *
 * COUPANG_MODE=browser일 때, 설치된 Chrome 계열 브라우저로 공개 검색 페이지를
 * 렌더링한 뒤 상품 카드를 파싱한다. 로그인/쿠키/프록시를 사용하지 않는다.
 * 모드가 비활성이면 빈 배열을 반환한다.
 */

import { getCached, setCached, buildCacheKey } from "../../core/cache.js";
import { getLimiter, isBlocked } from "../../utils/http.js";
import { ScrapingError } from "../../core/errors.js";
import { getCoupangProviderMode } from "./mode.js";
import { renderCoupangSearchPage, COUPANG_SOURCE } from "./browser.js";
import { parseCoupangSearchResults } from "./parser.js";
import type { Product, PartCategory } from "../../core/types.js";

/**
 * 쿠팡에서 부품을 검색한다.
 * 활성화된 모드가 없으면(파트너스 미지원) 빈 배열을 반환한다.
 */
export async function searchCoupang(
  query: string,
  options?: { category?: PartCategory; limit?: number }
): Promise<Product[]> {
  const mode = getCoupangProviderMode();
  if (!mode) return [];

  const limit = Math.min(Math.max(options?.limit ?? 20, 1), 50);
  const cacheKey = buildCacheKey(
    "coupang",
    "search",
    query,
    options?.category,
    String(limit)
  );
  const cached = getCached<Product[]>(cacheKey);
  if (cached) return cached;

  // 차단(백오프) 상태면 limiter 슬롯·quota를 소모하지 않고 즉시 실패한다.
  if (isBlocked(COUPANG_SOURCE)) {
    throw new ScrapingError(
      "coupang",
      "쿠팡이 일시적으로 차단 상태입니다. 잠시 후 다시 시도해주세요.",
      429
    );
  }

  // 브라우저 실행은 무거우므로 coupang-browser 전용 limiter(동시 1개)로 직렬화한다.
  const limiter = getLimiter(COUPANG_SOURCE);
  const html = await limiter.run(() => renderCoupangSearchPage(query));
  const products = parseCoupangSearchResults(html, options?.category).slice(
    0,
    limit
  );

  setCached(cacheKey, products, "search");
  return products;
}
