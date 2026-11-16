/**
 * 견적왕(kjwwang.com) HTML 파서. 응답은 EUC-KR이고, 요청 함수가 디코딩한 문자열을 받는다.
 * - 검색 화면(product_search.html): 목록 POST에 넘길 검색 토큰과 부품 검색 결과 수
 * - 검색 목록 조각(product_list_include_plist.php): 상품 번호·이름·최저가·판매처 수
 * - 상품 상세(product_detail.html): 현금가·카드가 판매처 표
 */

import * as cheerio from "cheerio";
import type { PartCategory } from "../../core/categories.js";
import type { Product, ProductDetail, SellerOffer } from "../../core/types.js";
import { collapseSpaces, parseWon } from "../../utils/text.js";
import { categoryFromKjwwangNames, kjwwangProductUrl } from "./categories.js";

/** 상세에 담을 판매처 수 (다나와와 같다) */
const MAX_OFFERS = 10;

export interface KjwwangSearchPage {
  /** 목록 POST의 search_query 값 (서버가 검색어로 만든 16진수 토큰). 없이 보내면 서버가 "검색결과가 없습니다"를 준다 */
  token?: string;
  /** 서버가 되돌려 준 검색어. 화면 스크립트는 이 값을 search_word로 보낸다 */
  searchWord?: string;
  /** "부품(N)" 탭의 N. 0이면 부품 검색 결과가 없다 */
  partCount?: number;
}

/** 검색 화면에서 목록 POST에 필요한 값을 꺼낸다 */
export function parseKjwwangSearchPage(html: string): KjwwangSearchPage {
  const $ = cheerio.load(html);
  const token = $("#search_query").attr("value")?.trim();
  const searchWord = $('input[name="main_search"]').first().attr("value");

  let partCount: number | undefined;
  $("a").each((_, el) => {
    const match = collapseSpaces($(el).text()).match(/^부품\s*\((\d+)\)$/);
    if (match && partCount === undefined) partCount = Number(match[1]);
  });

  return {
    token: token && /^[0-9a-f]+$/i.test(token) ? token : undefined,
    searchWord: searchWord !== undefined ? collapseSpaces(searchWord) : undefined,
    partCount,
  };
}

/**
 * 검색 목록 조각에서 상품을 꺼낸다 (화면 순서 그대로).
 * 상품마다 `li.list` 안에 `a.name`(상세 링크·이름), `ul.price span.card`(판매처 최저가), `a.shop`("판매처 13"),
 * `ul.prd_cate li`(분류 이름)가 있다. 가격 칸의 class는 "card"지만 값은 현금가·카드가를 통틀어 가장 싼 판매처의 가격이다
 * (같은 상품의 "쇼핑몰별 최저가" 첫 줄과 같다).
 */
export function parseKjwwangSearchList(html: string, category?: PartCategory): Product[] {
  const $ = cheerio.load(html);
  const products: Product[] = [];
  const seen = new Set<string>();

  $("li.list").each((_, li) => {
    const $li = $(li);
    const $name = $li.find("a.name").first();
    const id = $name.attr("href")?.match(/[?&]pd_no=(\d+)/)?.[1] ?? "";
    const name = collapseSpaces($name.text());
    if (!id || !name || seen.has(id)) return;

    const priceText = $li
      .find("ul.price span.card, ul.price span.cash")
      .toArray()
      .map((el) => $(el).text())
      .find((text) => /\d/.test(text));
    const categoryNames = $li
      .find("ul.prd_cate li")
      .toArray()
      .map((el) => collapseSpaces($(el).text()));

    seen.add(id);
    products.push({
      source: "kjwwang",
      id,
      name,
      price: parseWon(priceText),
      url: kjwwangProductUrl(id),
      category: categoryFromKjwwangNames(categoryNames) ?? category,
      shopCount: parseWon($li.find("a.shop").first().text()) || undefined,
    });
  });

  return products;
}

/** 정상적인 "검색결과가 없습니다" 목록인지 */
export function isKjwwangEmptyList(html: string): boolean {
  return /id="total_num"\s+value="0"/.test(html) || html.includes("검색결과가 없습니다");
}

/**
 * 상품 상세 페이지를 읽는다.
 * - 이름 `.data_head .info .name`, 제조사·등록일 `.data_head .desc p`("제조회사 : ZOTAC | 등록일 2025-03-06"), 스펙 `.desc .spec`
 * - 판매처: "가격비교" 탭의 `table.compare_table` 두 개(`th` "현금판매가", "카드판매가").
 *   행마다 `span.name`(판매처), `span.price`, `li.fee`(배송비)가 있다.
 * - 최저가: 위쪽 `.price_compare` 탭의 "현금가 최저"·"카드가 최저" 중 낮은 값
 */
export function parseKjwwangProductPage(html: string, pdNo: string): ProductDetail {
  const $ = cheerio.load(html);
  const $head = $(".detail_top .data_head").first();

  const name = collapseSpaces($head.find(".info .name").first().text()) || collapseSpaces($("title").first().text());
  const desc = collapseSpaces($head.find(".desc p").first().text());
  const maker = desc.match(/제조회사\s*:\s*([^|]+?)\s*(?:\||$)/)?.[1];
  const registeredAt = desc.match(/등록일\s*:?\s*(\d{4}-\d{2}-\d{2})/)?.[1];
  const specs = [
    ...new Set(
      collapseSpaces($head.find(".desc .spec").first().text())
        .replace(/\s*\/$/, "") // 끝에 구분자 " /"가 붙어 온다
        .split(" / ")
        .map((s) => s.trim())
        .filter(Boolean)
    ),
  ];

  const offers: SellerOffer[] = [];
  const cashPrices: number[] = [];
  $("table.compare_table").each((_, table) => {
    const $table = $(table);
    const header = collapseSpaces($table.find("th").first().text());
    const kind = header.includes("현금") ? "현금" : header.includes("카드") ? "카드" : "";
    $table.find("tr").each((__, tr) => {
      const $tr = $(tr);
      const seller = collapseSpaces($tr.find("span.name").first().text());
      const price = parseWon($tr.find("span.price").first().text());
      if (!seller || !price) return;
      if (kind === "현금") cashPrices.push(price);
      offers.push({
        seller: kind ? `${seller} (${kind})` : seller,
        price,
        shippingFee: readShippingFee($tr.find("li.fee").first().text()),
      });
    });
  });
  offers.sort((a, b) => a.price - b.price);

  // 위쪽 요약 탭: <li><span class="type">현금가</span> … <span class="price">1,372,380원</span></li>
  const summary = new Map<string, number>();
  $(".price_compare ul.tab > li").each((_, li) => {
    const type = collapseSpaces($(li).find(".type").first().text());
    const price = parseWon($(li).find(".low_price .price").first().text());
    if (type && price) summary.set(type, price);
  });
  const lowest = [summary.get("현금가"), summary.get("카드가"), offers[0]?.price].filter(
    (p): p is number => typeof p === "number" && p > 0
  );
  const cashPrice = summary.get("현금가") ?? (cashPrices.length > 0 ? Math.min(...cashPrices) : undefined);

  return {
    source: "kjwwang",
    id: pdNo,
    name,
    url: kjwwangProductUrl(pdNo),
    price: lowest.length > 0 ? Math.min(...lowest) : 0,
    cashPrice,
    specs,
    offers: offers.slice(0, MAX_OFFERS),
    maker: maker || undefined,
    registeredAt,
  };
}

/** "4,000" → 4000, "무료배송" → 0, 비어 있으면 null */
function readShippingFee(text: string): number | null {
  const label = collapseSpaces(text);
  if (label.includes("무료")) return 0;
  const match = label.match(/\d[\d,]*/);
  return match ? Number.parseInt(match[0].replace(/,/g, ""), 10) : null;
}
