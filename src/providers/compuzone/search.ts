import { fetchHtml } from "../../utils/http.js";
import { getCached, setCached, buildCacheKey } from "../../core/cache.js";
import { parseOnlineResults, parseSearchResults, COMPUZONE_ONLINE_CATEGORIES } from "./parser.js";
import type { Product, PartCategory } from "../../core/types.js";

const ONLINE_BASE_URL = "https://www.compuzone.co.kr/online/online_list.php";
const ONLINE_REFERER = "https://www.compuzone.co.kr/online/online_main.htm";
const SEARCH_BASE_URL = "https://www.compuzone.co.kr/search/search_list.php";

function buildOnlineUrl(params: Record<string, string>): string {
  return ONLINE_BASE_URL + "?" + new URLSearchParams(params).toString();
}

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

export async function listByCategoryCompuzone(
  category: PartCategory,
  options?: { limit?: number }
): Promise<Product[]> {
  const cacheKey = buildCacheKey("compuzone", "online-category", category);
  const cached = getCached<Product[]>(cacheKey);
  if (cached) return cached;

  const cat = COMPUZONE_ONLINE_CATEGORIES[category];
  const params: Record<string, string> = {
    actype: "list",
    BigDivNo: cat.big,
    MediumDivNo: cat.medium,
    DivNo: "",
    PreOrder: "recommand",
    StartNum: "0",
    PageNum: "1",
    param: "N|N",
    SearchBottom: "",
    SearchKeyword: "",
    MaxCount: "20",
    IsAroundComAssemble: "N",
  };

  const url = buildOnlineUrl(params);
  const html = await fetchHtml(url, "compuzone", {
    headers: {
      Referer: ONLINE_REFERER,
      "X-Requested-With": "XMLHttpRequest",
    },
    encoding: "euc-kr",
  });

  let products = parseOnlineResults(html).map((p) => ({ ...p, category }));

  const limit = options?.limit ?? 20;
  products = products.slice(0, limit);

  setCached(cacheKey, products, "category");
  return products;
}
