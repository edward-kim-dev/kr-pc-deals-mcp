import { fetchHtml } from "../../utils/http.js";
import { getCached, setCached, buildCacheKey } from "../../core/cache.js";
import { parseSearchResults, COMPUZONE_ONLINE_CATEGORIES } from "./parser.js";
import type { Product, PartCategory } from "../../core/types.js";

const SEARCH_BASE_URL = "https://www.compuzone.co.kr/search/search_list.php";

export async function searchCompuzone(
  query: string,
  options?: { category?: PartCategory; limit?: number }
): Promise<Product[]> {
  const cacheKey = buildCacheKey("compuzone", "search", query, options?.category);
  const cached = getCached<Product[]>(cacheKey);
  if (cached) return cached;

  // 키워드 검색은 search_list.php 사용 (online_list.php는 키워드 검색 미지원)
  const cat = options?.category ? COMPUZONE_ONLINE_CATEGORIES[options.category] : null;
  const url =
    SEARCH_BASE_URL +
    "?actype=list&SearchType=small" +
    `&SearchText=${encodeURIComponent(query)}` +
    "&PreOrder=recommand&PageCount=20&StartNum=0&PageNum=1&ListType=" +
    `&BigDivNo=${cat?.big ?? ""}&MediumDivNo=${cat?.medium ?? ""}&DivNo=`;

  const html = await fetchHtml(url, "compuzone", {
    headers: {
      Referer: "https://www.compuzone.co.kr/search/search.htm",
      "X-Requested-With": "XMLHttpRequest",
    },
    encoding: "euc-kr",
  });

  let products = parseSearchResults(html);

  if (options?.category) {
    products = products.map((p) => ({ ...p, category: options.category }));
  }

  const limit = options?.limit ?? 20;
  products = products.slice(0, limit);

  setCached(cacheKey, products, "search");
  return products;
}

