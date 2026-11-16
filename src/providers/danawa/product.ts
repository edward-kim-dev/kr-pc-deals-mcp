/**
 * 다나와 상품 상세.
 *
 * prod.danawa.com/info/?pcode= 페이지가 서버에서 그려 보내는 부분만 읽는다.
 * 다나와는 상세 페이지를 새 구조(Next.js)로 옮기는 중이라 상품마다 두 가지 페이지가 섞여 나온다.
 * - 새 페이지: 서버가 넣어 둔 데이터(productBasicInfo, priceCompareTab)를 읽는다.
 * - 옛 페이지: .spec_list(스펙 요약), ul.list__mall-price(쇼핑몰별 최저가), 숨은 입력값을 읽는다.
 * 옛 페이지의 전체 판매처 목록은 robots.txt가 막은 /info/ajax/로만 받을 수 있어 쓰지 않는다.
 */

import * as cheerio from "cheerio";
import { fetchText } from "../../utils/http.js";
import { getCached, setCached, buildCacheKey } from "../../core/cache.js";
import { InputError, ScrapingError } from "../../core/errors.js";
import type { ProductDetail, SellerOffer } from "../../core/types.js";
import { collapseSpaces, parseWon, toWon } from "../../utils/text.js";
import { danawaProductUrl } from "./categories.js";
import { extractDehydratedQueries } from "../../utils/next-flight.js";

export async function getDanawaProduct(pcode: string): Promise<ProductDetail> {
  if (!/^\d+$/.test(pcode)) {
    throw new InputError(`다나와 상품 코드는 숫자입니다: "${pcode}"`);
  }
  const cacheKey = buildCacheKey("danawa", "product", pcode);
  const cached = getCached<ProductDetail>(cacheKey);
  if (cached) return cached;

  const html = await fetchText(danawaProductUrl(pcode), "danawa");
  const detail = parseDanawaProductPage(html, pcode);
  // 다나와가 가끔 본문(스펙·판매처) 없이 응답한다. 그런 결과는 캐시하지 않아 다음 호출에서 다시 받는다.
  if (detail.specs.length > 0 || detail.offers.length > 0) setCached(cacheKey, detail, "product");
  return detail;
}

export function parseDanawaProductPage(html: string, pcode: string): ProductDetail {
  const $ = cheerio.load(html);

  const ogTitle = $('meta[property="og:title"]').attr("content") ?? "";
  const name =
    collapseSpaces(ogTitle.replace(/^\[다나와\]\s*/, "")) ||
    collapseSpaces($("title").text().replace(/\s*:\s*다나와 가격비교\s*$/, ""));
  const ogDescription = $('meta[property="og:description"]').attr("content") ?? "";
  const cashPriceFromMeta = parseWon(ogDescription.match(/현금최저가\s*:?\s*([\d,]+)/)?.[1]) || undefined;
  const priceFromMeta = parseWon(ogDescription.match(/(?:^|[^금])최저가\s*([\d,]+)/)?.[1]);

  const fromNextData = parseNextProductData(html, pcode, name, priceFromMeta, cashPriceFromMeta);
  if (fromNextData) return fromNextData;

  const price =
    toWon($(`#min_price_${pcode}`).attr("value")) || parseWon($("#intMinFee").attr("value")) || priceFromMeta;
  const cashPrice = cashPriceFromMeta;

  if (!name || (!price && $(".spec_list").length === 0)) {
    throw new ScrapingError("danawa", `다나와 상품 ${pcode}의 정보를 찾지 못했습니다. 코드가 맞는지 확인해 주세요.`);
  }

  const specs = collapseSpaces($(".spec_list").first().text())
    .split(" / ")
    .map((s) => s.trim())
    .filter(Boolean);

  const madeInfo = collapseSpaces($(".made_info").first().text());
  const registeredAt = madeInfo.match(/등록월\s*:\s*([\d.]+)/)?.[1];
  const maker = madeInfo.match(/제조사\s*:\s*([^ㅣ|]+?)(?:\s*[ㅣ|]|$)/)?.[1]?.trim();

  const offers: SellerOffer[] = [];
  $("ul.list__mall-price > li").each((_, li) => {
    const $li = $(li);
    const seller =
      $li.find(".box__logo img").attr("alt")?.trim() || collapseSpaces($li.find(".box__logo").text());
    const $price = $li.find(".sell-price").first();
    const offerPrice = toWon($price.attr("data-base-price")) || parseWon($price.text());
    if (!seller || !offerPrice) return;
    offers.push({
      seller,
      price: offerPrice,
      shippingFee: readShippingFee($price.attr("data-delivery-price"), $li.find(".box__delivery").first().text()),
      url: $li.find("a.link__full-cover").attr("href") || undefined,
    });
  });

  return {
    source: "danawa",
    id: pcode,
    name,
    url: danawaProductUrl(pcode),
    price,
    cashPrice,
    specs,
    offers,
    maker,
    registeredAt,
  };
}

/** 새 상세 페이지에서 상위 판매처를 몇 곳까지 담을지 */
const MAX_OFFERS = 10;

interface BasicInfo {
  productName?: string;
  maker?: { name?: string };
  brand?: { name?: string };
  productBundleName?: string;
  price?: { min?: number };
  simpleDescription?: string;
  makeDate?: string;
}

interface MallItem {
  shop?: string;
  price?: string | number;
  delivery?: string;
  productUrl?: string;
}

/**
 * 새(Next.js) 상세 페이지의 데이터를 읽는다. 새 페이지가 아니면 null.
 * 직렬화 데이터 안의 값이 다른 조각을 가리키는 참조("$4f" 같은 문자열)로 바뀌어 있을 수 있어
 * 값의 타입을 하나씩 확인하고, 이상하면 og:description의 최저가로 대신한다.
 */
function parseNextProductData(
  html: string,
  pcode: string,
  pageName: string,
  priceFromMeta: number,
  cashPrice: number | undefined
): ProductDetail | null {
  const queries = extractDehydratedQueries(html);
  const isThisProduct = (key: unknown[]) => key.length < 3 || String(key[2]) === pcode;
  const basicQuery = queries.find(
    (q) => q.queryKey[0] === "productInfo" && q.queryKey[1] === "productBasicInfo" && isThisProduct(q.queryKey)
  );
  if (!basicQuery || !isObject(basicQuery.data)) return null;
  const basic = basicQuery.data as BasicInfo;

  const tab = queries.find(
    (q) => q.queryKey[0] === "productInfo" && q.queryKey[1] === "priceCompareTab" && isThisProduct(q.queryKey)
  )?.data as { sections?: unknown } | undefined;
  const sections = isObject(tab) && Array.isArray(tab.sections) ? tab.sections : [];

  const offers: SellerOffer[] = [];
  const seen = new Set<string>();
  for (const section of sections) {
    const items = isObject(section) && Array.isArray(section.items) ? (section.items as MallItem[]) : [];
    for (const item of items) {
      if (!isObject(item)) continue;
      const seller = collapseSpaces(typeof item.shop === "string" ? item.shop : "");
      const price =
        typeof item.price === "number" ? toWon(item.price) : parseWon(typeof item.price === "string" ? item.price : "");
      const key = `${seller}:${price}`;
      if (!seller || !price || seen.has(key)) continue;
      seen.add(key);
      offers.push({
        seller,
        price,
        shippingFee: readShippingFee(undefined, typeof item.delivery === "string" ? item.delivery : ""),
        url: typeof item.productUrl === "string" && item.productUrl ? item.productUrl : undefined,
      });
    }
  }
  offers.sort((a, b) => a.price - b.price);

  const text = (value: unknown) => (typeof value === "string" && !value.startsWith("$") ? value : "");
  const maker = text(basic.maker?.name);
  const composedName = [maker, text(basic.brand?.name), text(basic.productName)].filter(Boolean).join(" ");
  const bundle = text(basic.productBundleName);
  const name = pageName || collapseSpaces(bundle ? `${composedName} (${bundle})` : composedName);
  const price = typeof basic.price?.min === "number" ? toWon(basic.price.min) : priceFromMeta;

  if (!name || (!price && offers.length === 0)) {
    throw new ScrapingError("danawa", `다나와 상품 ${pcode}의 정보를 찾지 못했습니다. 페이지 구조가 바뀌었을 수 있습니다.`);
  }
  return {
    source: "danawa",
    id: pcode,
    name,
    url: danawaProductUrl(pcode),
    price,
    cashPrice,
    specs: parseSimpleDescription(text(basic.simpleDescription)),
    offers: offers.slice(0, MAX_OFFERS),
    maker: maker || undefined,
    registeredAt: text(basic.makeDate) || undefined,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** "AMD(소켓AM5)|8코어|메모리 규격$DDR5|기술 지원$A^B" → ["AMD(소켓AM5)", "8코어", "메모리 규격: DDR5", "기술 지원: A, B"] */
function parseSimpleDescription(description: string): string[] {
  return description
    .split("|")
    .map((item) => {
      const [key, ...rest] = item.split("$");
      const value = rest.join("$").split("^").join(", ");
      return collapseSpaces(rest.length > 0 ? `${key}: ${value}` : key);
    })
    .filter(Boolean);
}

/** 배송비: data-delivery-price 속성이 있으면 그 값, 없으면 "무료배송"/"3,000원" 같은 글자를 읽는다 */
function readShippingFee(attribute: string | undefined, text: string): number | null {
  if (attribute !== undefined && attribute !== "") return toWon(attribute);
  const label = collapseSpaces(text);
  if (label.includes("무료")) return 0;
  const fee = parseWon(label.match(/[\d,]+\s*원/)?.[0]);
  return fee > 0 ? fee : null;
}
