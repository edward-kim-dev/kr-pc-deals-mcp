import { fetchHtml } from "../../utils/http.js";
import { getCached, setCached, buildCacheKey } from "../../core/cache.js";
import { ESTIMATE_BASE_URL, ESTIMATE_MARKETPLACE_SEQ } from "./estimate-constants.js";

export function buildProductListUrl(
  categorySeq: number,
  page: number,
  keyword?: string,
  serviceSectionSeq?: number
): string {
  const params = new URLSearchParams({
    controller: "estimateMain",
    methods: "product",
    marketPlaceSeq: String(ESTIMATE_MARKETPLACE_SEQ),
    categorySeq: String(categorySeq),
    categoryDepth: "2",
    pseq: "2",
    serviceSectionSeq: String(serviceSectionSeq ?? 0),
    page: String(page),
    minPrice: "0",
    maxPrice: "0",
  });
  if (keyword) {
    params.set("name", keyword);
  }
  return `${ESTIMATE_BASE_URL}?${params}`;
}

export function buildSpecSearchUrl(categorySeq: number, keyword: string): string {
  const params = new URLSearchParams({
    controller: "estimateMain",
    methods: "searchOption",
    marketPlaceSeq: String(ESTIMATE_MARKETPLACE_SEQ),
    categorySeq: String(categorySeq),
  });
  return `${ESTIMATE_BASE_URL}?${params}&name=${encodeURIComponent(keyword)}`;
}

export async function fetchProductListHtml(
  categorySeq: number,
  page: number,
  keyword?: string,
  serviceSectionSeq?: number
): Promise<string> {
  const cacheKey = buildCacheKey("danawa-estimate", "product", String(categorySeq), String(page), keyword ?? "", String(serviceSectionSeq ?? 0));
  const cached = getCached<string>(cacheKey);
  if (cached) return cached;

  const url = buildProductListUrl(categorySeq, page, keyword, serviceSectionSeq);
  const html = await fetchHtml(url, "danawa", {
    headers: { Referer: ESTIMATE_BASE_URL },
  });
  setCached(cacheKey, html, "search");
  return html;
}

export async function fetchSpecSearchHtml(
  categorySeq: number,
  keyword: string
): Promise<string> {
  const cacheKey = buildCacheKey("danawa-estimate", "spec", String(categorySeq), keyword);
  const cached = getCached<string>(cacheKey);
  if (cached) return cached;

  const url = buildSpecSearchUrl(categorySeq, keyword);
  const html = await fetchHtml(url, "danawa");
  setCached(cacheKey, html, "priceHistory");
  return html;
}
