/**
 * 쿠팡 파트너스 Open API 키워드 검색.
 *
 * 엔드포인트:
 *   GET https://api-gateway.coupang.com/v2/providers/affiliate_open_api/apis/openapi/v1/products/search
 *
 * 쿼리:
 *   keyword: 검색어
 *   limit: 결과 수 (1~50, 기본 20)
 *
 * 응답: { rCode, rMessage, data: { productData: [{ productId, productName, productPrice,
 *        productImage, productUrl, keyword, rank, isRocket, isFreeShipping, categoryName }] } }
 */

import { ScrapingError } from "../../core/errors.js";
import { getCached, setCached, buildCacheKey } from "../../core/cache.js";
import { getLimiter } from "../../utils/http.js";
import { loadCoupangCredentials, buildAuthorizationHeader } from "./auth.js";
import type { Product, PartCategory } from "../../core/types.js";

const API_HOST = "https://api-gateway.coupang.com";
const SEARCH_PATH =
  "/v2/providers/affiliate_open_api/apis/openapi/v1/products/search";

interface CoupangProductRaw {
  productId: number;
  productName: string;
  productPrice: number;
  productImage: string;
  productUrl: string;
  keyword?: string;
  rank?: number;
  isRocket?: boolean;
  isFreeShipping?: boolean;
  categoryName?: string;
}

interface CoupangSearchResponse {
  rCode: string;
  rMessage: string;
  data?: {
    productData?: CoupangProductRaw[];
  };
}

/**
 * 쿠팡에서 부품을 검색한다.
 * COUPANG_ACCESS_KEY/COUPANG_SECRET_KEY가 설정되지 않은 경우 빈 배열을 반환한다.
 */
export async function searchCoupang(
  query: string,
  options?: { category?: PartCategory; limit?: number }
): Promise<Product[]> {
  const credentials = loadCoupangCredentials();
  if (!credentials) return [];

  const limit = options?.limit ?? 20;
  const cacheKey = buildCacheKey("coupang", "search", query, options?.category);
  const cached = getCached<Product[]>(cacheKey);
  if (cached) return cached;

  const pathWithQuery = `${SEARCH_PATH}?keyword=${encodeURIComponent(query)}&limit=${limit}`;
  const url = API_HOST + pathWithQuery;
  const authorization = buildAuthorizationHeader("GET", pathWithQuery, credentials);

  const limiter = getLimiter("coupang");
  const response = await limiter.run(() =>
    fetch(url, {
      headers: {
        Authorization: authorization,
        "X-Requested-By": credentials.accessKey,
        Accept: "application/json",
      },
    })
  );

  if (!response.ok) {
    throw new ScrapingError(
      "coupang",
      `HTTP ${response.status}: ${response.statusText}`,
      response.status
    );
  }

  const data = (await response.json()) as CoupangSearchResponse;

  if (data.rCode && data.rCode !== "0") {
    throw new ScrapingError(
      "coupang",
      `쿠팡 API 오류 [${data.rCode}]: ${data.rMessage}`
    );
  }

  const raw = data.data?.productData ?? [];
  const products: Product[] = raw.map((r) => {
    const specs: Record<string, string> = {};
    if (r.categoryName) specs["카테고리"] = r.categoryName;

    return {
      id: String(r.productId),
      source: "coupang",
      name: r.productName,
      category: options?.category,
      lowestPrice: r.productPrice,
      prices: [
        {
          sellerName: r.isRocket ? "쿠팡 로켓배송" : "쿠팡",
          price: r.productPrice,
          shippingCost: 0,
          totalPrice: r.productPrice,
          productUrl: r.productUrl,
        },
      ],
      specs,
      imageUrl: r.productImage,
      productUrl: r.productUrl,
    };
  });

  setCached(cacheKey, products, "search");
  return products;
}
