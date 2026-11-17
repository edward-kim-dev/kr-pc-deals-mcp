/**
 * 다나와 카테고리 인기 목록.
 *
 * prod.danawa.com/list/?cate={listCode} 페이지는 첫 화면(인기상품순 30개)을 서버에서 그려 보낸다.
 * 다른 정렬과 다음 페이지는 robots.txt가 막은 /api/로만 받을 수 있어 쓰지 않는다.
 * 정렬·개수 자르기는 services/sources.ts의 listCategoryOnSources가 사이트 공통으로 한다.
 */

import { fetchText } from "../../utils/http.js";
import { getCached, setCached, buildCacheKey } from "../../core/cache.js";
import { ScrapingError } from "../../core/errors.js";
import type { PartCategory } from "../../core/categories.js";
import type { Product } from "../../core/types.js";
import { collapseSpaces, htmlToText, toWon } from "../../utils/text.js";
import { DANAWA_CATEGORIES, danawaProductUrl } from "./categories.js";
import { extractDehydratedQueries } from "../../utils/next-flight.js";

/** 카테고리 인기 목록 첫 화면 전체 (인기상품순 30개) */
export async function listDanawaCategory(category: PartCategory): Promise<Product[]> {
  const cacheKey = buildCacheKey("danawa", "list", category);
  const cached = getCached<Product[]>(cacheKey);
  if (cached) return cached;

  const { listCode } = DANAWA_CATEGORIES[category];
  const html = await fetchText(`https://prod.danawa.com/list/?cate=${listCode}`, "danawa");
  const products = parseDanawaListPage(html, category);
  if (products.length === 0) {
    throw new ScrapingError("danawa", "다나와 카테고리 목록에서 상품을 찾지 못했습니다. 페이지 구조가 바뀌었을 수 있습니다.");
  }
  setCached(cacheKey, products, "list");
  return products;
}

/** 목록 페이지 HTML에서 상품을 꺼낸다 (인기상품순 그대로) */
export function parseDanawaListPage(html: string, category?: PartCategory): Product[] {
  const query = extractDehydratedQueries(html).find((q) => q.queryKey[0] === "productList");
  const items = (query?.data as { products?: unknown[] } | undefined)?.products;
  if (!Array.isArray(items)) return [];

  const products: Product[] = [];
  for (const raw of items) {
    const item = raw as {
      id?: number | string;
      productName?: string;
      /** 용량별로 묶인 상품(메모리·SSD 등)의 이 상품 옵션 이름 (예: "32GB(16Gx2)") */
      bundleProductName?: string;
      price?: { min?: number; promotionMinPriceQ?: number };
      stats?: { shopCount?: number };
    };
    const id = String(item.id ?? "");
    const baseName = htmlToText(item.productName ?? "");
    if (!/^\d+$/.test(id) || !baseName) continue;
    // 묶음 옵션 이름은 상품명에 없어 붙여야 어느 용량의 가격인지 알 수 있다
    const bundle = htmlToText(typeof item.bundleProductName === "string" ? item.bundleProductName : "");
    const name = collapseSpaces(bundle ? `${baseName} (${bundle})` : baseName);

    const price = toWon(item.price?.min);
    products.push({
      source: "danawa",
      id,
      name,
      price,
      url: danawaProductUrl(id),
      category,
      shopCount: toWon(item.stats?.shopCount) || undefined,
      priceWarning: suspiciousPriceWarning(price, toWon(item.price?.promotionMinPriceQ)),
    });
  }
  return products;
}

/**
 * 다나와 대표 최저가가 같은 상품의 다른 기준가(promotionMinPriceQ)의 절반도 안 되면
 * 판매처 등록 오류일 가능성이 높다 (예: 라이젠 9700X 최저가 42,430원 / 기준가 412,000원).
 */
function suspiciousPriceWarning(price: number, reference: number): string | undefined {
  if (price <= 0 || reference <= 0 || price >= reference * 0.5) return undefined;
  const won = (n: number) => `${new Intl.NumberFormat("ko-KR").format(n)}원`;
  return `최저가 ${won(price)}이 같은 상품의 다른 기준가 ${won(reference)}보다 크게 낮습니다. 판매처 등록 오류일 수 있으니 상품 페이지에서 확인하세요.`;
}
