import { fetchText } from "../../utils/http.js";
import { getCached, setCached, buildCacheKey } from "../../core/cache.js";
import type { PartCategory } from "../../core/categories.js";
import type { Product } from "../../core/types.js";
import { ScrapingError } from "../../core/errors.js";
import { COMPUZONE_CATEGORIES } from "./categories.js";
import { isCompuzoneEmptyResult, parseCompuzoneSearch } from "./parser.js";

const SEARCH_URL = "https://www.compuzone.co.kr/search/search_list.php";
/** 컴퓨존 검색 한 페이지의 상품 수 (한 페이지만 읽는다) */
const PAGE_SIZE = 20;

/** 컴퓨존 키워드 검색. 응답은 EUC-KR이다. */
export async function searchCompuzone(
  query: string,
  options?: { category?: PartCategory; limit?: number }
): Promise<Product[]> {
  const limit = options?.limit ?? 10;
  const cacheKey = buildCacheKey("compuzone", "search", query, options?.category);
  const cached = getCached<Product[]>(cacheKey);
  if (cached) return cached.slice(0, limit);

  const division = options?.category ? COMPUZONE_CATEGORIES[options.category] : undefined;
  const params = new URLSearchParams({
    actype: "list",
    SearchType: "small",
    SearchText: query,
    PreOrder: "recommand",
    PageCount: String(PAGE_SIZE),
    StartNum: "0",
    PageNum: "1",
    ListType: "",
    BigDivNo: division?.big ?? "",
    MediumDivNo: division?.medium ?? "",
    DivNo: "",
  });

  const html = await fetchText(`${SEARCH_URL}?${params}`, "compuzone", {
    headers: {
      Referer: "https://www.compuzone.co.kr/search/search.htm",
      "X-Requested-With": "XMLHttpRequest",
    },
    encoding: "euc-kr",
  });

  const products = parseCompuzoneSearch(html, options?.category);
  // 상품도 "검색 결과 없음" 문구도 없으면 점검 화면이거나 구조가 바뀐 것이다. 빈 결과로 캐시하지 않는다.
  if (products.length === 0 && !isCompuzoneEmptyResult(html)) {
    throw new ScrapingError("compuzone", "컴퓨존 검색 결과를 읽지 못했습니다. 페이지 구조가 바뀌었거나 점검 중일 수 있습니다.");
  }
  setCached(cacheKey, products, "search");
  return products.slice(0, limit);
}
