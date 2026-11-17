/** 테스트 공용 도우미: 고정 데이터 읽기, fetch 대체, 빠른 네트워크 설정 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import iconv from "iconv-lite";
import { vi } from "vitest";
import { ConcurrencyLimiter, configureLimiters, clearBlocked } from "../src/utils/http.js";
import { clearCache } from "../src/core/cache.js";

export function fixture(name: string): string {
  return readFileSync(join(process.cwd(), "tests/fixtures", name), "utf8");
}

export function eucKr(text: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(iconv.encode(text, "euc-kr"));
}

export interface Route {
  match: RegExp;
  body: () => string | Uint8Array<ArrayBuffer>;
  status?: number;
  contentType?: string;
}

/** 전역 fetch를 URL 패턴별 응답으로 바꾼다. 맞는 패턴이 없으면 404. */
export function stubFetch(routes: Route[]) {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    calls.push({ url, headers: Object.fromEntries(new Headers(init?.headers).entries()) });
    const route = routes.find((r) => r.match.test(url));
    if (!route) return new Response("not found", { status: 404, statusText: "Not Found" });
    return new Response(route.body(), {
      status: route.status ?? 200,
      headers: { "content-type": route.contentType ?? "text/html; charset=utf-8" },
    });
  });
  vi.stubGlobal("fetch", fn);
  return { fn, calls };
}

const SOURCES = ["danawa", "danawa-search", "compuzone", "enuri", "kjwwang", "default"];

/** 요청 간격 없이 테스트하도록 limiter를 바꾸고 캐시·차단 기록을 비운다 */
export function useFastNetwork(): void {
  configureLimiters(Object.fromEntries(SOURCES.map((s) => [s, new ConcurrencyLimiter(10, 0)])));
  clearCache();
  SOURCES.forEach(clearBlocked);
}

export function restoreNetwork(): void {
  vi.unstubAllGlobals();
  configureLimiters();
  clearCache();
  SOURCES.forEach(clearBlocked);
}

/**
 * 고정 데이터로 응답하는 기본 경로들. 검색은 네 사이트 모두 실제 "RTX 5070"(그래픽카드) 검색 응답이고,
 * 카테고리 목록은 그래픽카드 인기 목록이다. 견적왕 카테고리 목록 POST는 검색 목록과 주소가 같아 검색 응답을 돌려준다.
 */
export const SITE_ROUTES: Route[] = [
  { match: /search\.danawa\.com\/api\/search\/product-list/, body: () => fixture("danawa-search.json"), contentType: "application/json" },
  { match: /prod\.danawa\.com\/list\//, body: () => fixture("danawa-list.html") },
  { match: /prod\.danawa\.com\/info\/\?pcode=/, body: () => fixture("danawa-product.html") },
  { match: /shop\.danawa\.com\/virtualestimate\/.*methods=compatibility/, body: () => fixture("danawa-compatibility.json"), contentType: "application/json" },
  { match: /prod\.danawa\.com\/info\/ajax\/getProductPriceList/, body: () => fixture("danawa-price-history.json"), contentType: "text/html; charset=UTF-8" },
  { match: /compuzone\.co\.kr\/search\/search_list\.php/, body: () => eucKr(fixture("compuzone-search.html")) },
  { match: /compuzone\.co\.kr\/product\/product_detail\.htm/, body: () => eucKr(fixture("compuzone-product.html")) },
  { match: /price\.enuri\.com\/search\?/, body: () => fixture("enuri-search-rtx5070.html") },
  { match: /price\.enuri\.com\/catalog\/\d+$/, body: () => fixture("enuri-product.html") },
  { match: /price\.enuri\.com\/list\?category=/, body: () => fixture("enuri-list-gpu.html") },
  { match: /compuzone\.co\.kr\/product\/product_list\.php$/, body: () => eucKr(fixture("compuzone-list-gpu.html")), contentType: "text/html; charset=euc-kr" },
  { match: /kjwwang\.com\/shop\/product_search\.html\?main_search=/, body: () => eucKr(fixture("kjwwang-search-rtx5070.html")), contentType: "text/html; charset=euc-kr" },
  { match: /kjwwang\.com\/skin\/shop\/basic\/product_list_include_plist\.php$/, body: () => eucKr(fixture("kjwwang-list-rtx5070.html")), contentType: "text/html; charset=euc-kr" },
  { match: /kjwwang\.com\/shop\/product_detail\.html\?pd_no=\d+$/, body: () => eucKr(fixture("kjwwang-product.html")), contentType: "text/html; charset=euc-kr" },
];
