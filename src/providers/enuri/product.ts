/**
 * 에누리 상품(카탈로그) 상세.
 *
 * GET https://price.enuri.com/catalog/{modelno}
 * 서버가 React Query 캐시를 직렬화해 페이지에 넣어 보낸다 (utils/next-flight.ts로 읽는다). 그중 두 항목을 쓴다.
 * - ["catalog", "overview", modelno, …]: 상품명, 최저가, 스펙 요약(제조사·등록일 포함), 상위 판매처(판매처 링크)
 * - ["catalog", "priceComparison", modelno, …, "price_asc", 1]: 쇼핑몰별 가격 첫 페이지(가격 낮은 순 20개)와 현금가 판매처
 * 다음 페이지와 최저가 추이 그래프는 화면이 robots.txt가 막은 /api/로 불러오므로 쓰지 않는다.
 */

import { fetchText } from "../../utils/http.js";
import { getCached, setCached, buildCacheKey } from "../../core/cache.js";
import { InputError, ScrapingError } from "../../core/errors.js";
import type { ProductDetail, SellerOffer } from "../../core/types.js";
import { collapseSpaces, htmlToText, parseWon, toWon } from "../../utils/text.js";
import { enuriProductUrl } from "./categories.js";
import { extractFlightQueries, isObject, joinFlightChunks, type FlightQuery } from "../../utils/next-flight.js";

/** 상세에 담을 판매처 수 (다나와와 같다) */
const MAX_OFFERS = 10;
/** 스펙 요약에서 따로 담거나 뺄 항목 */
const META_SPEC_LABELS = new Set(["제조사", "브랜드", "등록일"]);

export async function getEnuriProduct(modelNo: string): Promise<ProductDetail> {
  if (!/^\d+$/.test(modelNo)) {
    throw new InputError(`에누리 상품 번호(modelno)는 숫자입니다: "${modelNo}"`);
  }
  const cacheKey = buildCacheKey("enuri", "product", modelNo);
  const cached = getCached<ProductDetail>(cacheKey);
  if (cached) return cached;

  const html = await fetchText(enuriProductUrl(modelNo), "enuri");
  const detail = parseEnuriProductPage(html, modelNo);
  // 판매처·스펙이 모두 빈 결과는 일시적인 응답일 수 있어 캐시하지 않는다
  if (detail.specs.length > 0 || detail.offers.length > 0) setCached(cacheKey, detail, "product");
  return detail;
}

interface SpecEntry {
  label?: { raw?: unknown; visible?: unknown };
  values?: Array<{ raw?: unknown }>;
}

interface CatalogInfo {
  catalogName?: unknown;
  catalogOptionName?: unknown;
  minPrice?: unknown;
  specs?: unknown;
}

interface PriceEntry {
  shopName?: unknown;
  price?: unknown;
  plno?: unknown;
  deliveryPrice?: unknown;
  deliveryText?: unknown;
  /** 상위 판매처 요약(initCatalogLowestPrice)의 종류: "lowest", "cardLowest"(카드 할인가), "cashLowest"(현금가) … */
  type?: unknown;
  isCashPrice?: unknown;
  /** 있으면 price가 카드 할인가다 (상위 판매처 요약) */
  cardInfo?: unknown;
  bridgePageLink?: unknown;
}

export function parseEnuriProductPage(html: string, modelNo: string): ProductDetail {
  const queries = extractFlightQueries(joinFlightChunks(html));
  const overview = findQueryData(queries, "overview", modelNo);
  const summary = isObject(overview?.initCatalogSummaryInfo) ? overview.initCatalogSummaryInfo : undefined;
  const catalog = (isObject(summary?.catalogInfo) ? summary.catalogInfo : undefined) as CatalogInfo | undefined;
  const name = catalog
    ? collapseSpaces([htmlToText(textOf(catalog.catalogName)), htmlToText(textOf(catalog.catalogOptionName))].join(" "))
    : "";
  if (!catalog || !name) {
    throw new ScrapingError("enuri", `에누리 상품 ${modelNo}의 정보를 찾지 못했습니다. 번호가 맞는지 확인해 주세요.`);
  }

  const specEntries = (Array.isArray(catalog.specs) ? catalog.specs : []).filter(isObject) as SpecEntry[];
  const specValue = (label: string) => joinValues(specEntries.find((s) => textOf(s.label?.raw) === label));

  // 판매처 링크는 상위 판매처 요약(initCatalogLowestPrice)에만 있어, 판매처 상품 번호(plno)로 찾아 붙인다
  const lowest = isObject(overview?.initCatalogLowestPrice) ? overview.initCatalogLowestPrice : undefined;
  const lowestEntries = (Array.isArray(lowest?.priceList) ? lowest.priceList : []).filter(isObject) as PriceEntry[];
  const links = new Map<string, string>();
  for (const entry of lowestEntries) {
    const link = textOf(entry.bridgePageLink);
    if (textOf(entry.plno) && link.startsWith("https://")) links.set(textOf(entry.plno), link);
  }

  // 쇼핑몰별 가격 첫 페이지: 일반 판매가(priceList)와 현금가 판매처(cashList)
  const comparison = findQueryData(queries, "priceComparison", modelNo);
  let regular: PriceEntry[];
  let cash: PriceEntry[];
  if (comparison) {
    regular = entriesOf(isObject(comparison.data) ? comparison.data.priceList : undefined);
    cash = entriesOf(comparison.cashList);
  } else {
    // 쇼핑몰별 가격 데이터가 없으면 상위 판매처 요약으로 대신한다. 카드 할인가 항목은 판매가가 아니라 뺀다.
    const sellable = lowestEntries.filter((e) => e.type !== "cardLowest" && !isObject(e.cardInfo));
    cash = sellable.filter(isCashEntry);
    regular = sellable.filter((e) => !isCashEntry(e));
  }
  const offers = [...toOffers(regular, links, false), ...toOffers(cash, links, true)];

  const regularPrices = regular.map((e) => toWon(e.price)).filter((p) => p > 0);
  const cashPrices = cash.map((e) => toWon(e.price)).filter((p) => p > 0);
  // 화면의 대표 최저가는 일반 판매가 기준이다 (현금가·카드 할인가는 따로 보여 준다)
  const price = parseWon(textOf(catalog.minPrice)) || (regularPrices.length > 0 ? Math.min(...regularPrices) : 0);

  return {
    source: "enuri",
    id: modelNo,
    name,
    url: enuriProductUrl(modelNo),
    price,
    cashPrice: cashPrices.length > 0 ? Math.min(...cashPrices) : undefined,
    specs: specEntries
      .filter((s) => s.label?.visible !== false && !META_SPEC_LABELS.has(textOf(s.label?.raw)))
      .map((s) => {
        const label = htmlToText(textOf(s.label?.raw));
        const value = joinValues(s);
        return label && value ? `${label}: ${value}` : label || value;
      })
      .filter(Boolean),
    offers: dedupeOffers(offers)
      .sort((a, b) => a.price - b.price)
      .slice(0, MAX_OFFERS),
    maker: specValue("제조사") || undefined,
    registeredAt: specValue("등록일").match(/\d{4}\.\d{1,2}/)?.[0],
  };
}

/** queryKey가 ["catalog", kind, modelNo, …]인 항목의 데이터 */
function findQueryData(queries: FlightQuery[], kind: string, modelNo: string): Record<string, unknown> | undefined {
  const query = queries.find(
    (q) => q.queryKey[0] === "catalog" && q.queryKey[1] === kind && String(q.queryKey[2]) === modelNo
  );
  return isObject(query?.data) ? query.data : undefined;
}

function entriesOf(list: unknown): PriceEntry[] {
  return (Array.isArray(list) ? list : []).filter(isObject) as PriceEntry[];
}

function isCashEntry(entry: PriceEntry): boolean {
  return entry.isCashPrice === true || entry.type === "cashLowest";
}

/** 판매처 목록을 SellerOffer로 바꾼다. 현금가 판매처는 이름 뒤에 "(현금)"을 붙여 일반 판매가와 구분한다 */
function toOffers(entries: PriceEntry[], links: Map<string, string>, cash: boolean): SellerOffer[] {
  const offers: SellerOffer[] = [];
  for (const entry of entries) {
    const seller = htmlToText(textOf(entry.shopName));
    const price = toWon(entry.price);
    if (!seller || !price) continue;
    offers.push({
      seller: cash ? `${seller} (현금)` : seller,
      price,
      shippingFee: readShippingFee(entry.deliveryPrice, textOf(entry.deliveryText)),
      url: links.get(textOf(entry.plno)),
    });
  }
  return offers;
}

/** 같은 쇼핑몰의 같은 가격은 하나만 남긴다 (오픈마켓은 같은 상품을 여러 판매자가 올린다) */
function dedupeOffers(offers: SellerOffer[]): SellerOffer[] {
  const seen = new Set<string>();
  return offers.filter((offer) => {
    const key = `${offer.seller}:${offer.price}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 배송비: deliveryPrice 숫자가 있으면 그 값, 없으면 "무료배송"/"2,500원" 글자를 읽는다. 모르면 null */
function readShippingFee(deliveryPrice: unknown, deliveryText: string): number | null {
  if (typeof deliveryPrice === "number" && Number.isFinite(deliveryPrice) && deliveryPrice >= 0) {
    return Math.round(deliveryPrice);
  }
  if (deliveryText.includes("무료")) return 0;
  const fee = parseWon(deliveryText.match(/[\d,]+\s*원/)?.[0]);
  return fee > 0 ? fee : null;
}

function joinValues(entry: SpecEntry | undefined): string {
  const values = Array.isArray(entry?.values) ? entry.values : [];
  return values
    .map((v) => htmlToText(textOf(v?.raw)))
    .filter(Boolean)
    .join(", ");
}

function textOf(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}
