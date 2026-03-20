import * as cheerio from "cheerio";
import type { Product, SellerPrice, PartCategory } from "../../core/types.js";

export function parseSearchResults(html: string): Product[] {
  const $ = cheerio.load(html);
  const products: Product[] = [];

  $(".product_list .prod_item, .main_prodlist .prod_item").each((_, el) => {
    const $el = $(el);

    const id =
      $el.attr("id")?.replace("productItem", "").replace("productInfoEncoder_", "") ||
      $el.find("input[name='productCodeArr']").val()?.toString() ||
      $el.find("a[name='productName']").attr("href")?.match(/pcode=(\d+)/)?.[1] ||
      "";

    if (!id) return;

    const name =
      $el.find(".prod_name a").text().trim() ||
      $el.find("a[name='productName']").text().trim() ||
      $el.find(".prod_info .prod_name2 a").text().trim();

    if (!name) return;

    const priceRaw =
      $el.find(".price_sect .price_wrap .price em").first().text().trim() ||
      $el.find(".prod_pricelist .price_sect strong").first().text().trim() ||
      $el.find(".price_info .price_wrap em").first().text().trim();
    const priceNumMatch = priceRaw.match(/[\d,]+/);
    const price = priceNumMatch ? parseInt(priceNumMatch[0].replace(/,/g, ""), 10) : 0;

    const imageUrl =
      $el.find(".thumb_image img").attr("data-original") ||
      $el.find(".thumb_image img").attr("src") ||
      "";

    const productUrl = `https://prod.danawa.com/info/?pcode=${id}`;

    products.push({
      id,
      source: "danawa",
      name,
      lowestPrice: price,
      prices: [],
      specs: {},
      imageUrl: imageUrl || undefined,
      productUrl,
    });
  });

  return products;
}

export function parseProductDetail(
  html: string,
  productCode: string
): { specs: Record<string, string>; prices: SellerPrice[] } {
  const $ = cheerio.load(html);
  const specs: Record<string, string> = {};
  const prices: SellerPrice[] = [];

  // 스펙 테이블 파싱
  $(".spec_tbl tbody tr, .prod_spec table tr").each((_, row) => {
    const $row = $(row);
    const key = $row.find("th, .tit").text().trim();
    const value = $row.find("td, .dsc").text().trim();
    if (key && value) {
      specs[key] = value;
    }
  });

  // 상세 스펙 (제품 상세 스펙 영역)
  $(".spec_list li, .detail_summary .summary_info .spec_list li").each(
    (_, li) => {
      const text = $(li).text().trim();
      const [key, ...valueParts] = text.split(":");
      if (key && valueParts.length > 0) {
        specs[key.trim()] = valueParts.join(":").trim();
      }
    }
  );

  // 판매처 가격 테이블
  $(
    ".lowest_list tr, .product_list_wrap .prod_list tr, #productListArea .prod_item"
  ).each((_, row) => {
    const $row = $(row);
    const sellerName =
      $row.find(".mall_name, .logo_over img").attr("alt") ||
      $row.find(".mall_name a").text().trim() ||
      $row.find(".mall_txt").text().trim();

    const priceRaw2 = $row.find(".price_sect em, .prc_c").first().text().trim();
    const priceNumMatch2 = priceRaw2.match(/[\d,]+/);
    const price = priceNumMatch2 ? parseInt(priceNumMatch2[0].replace(/,/g, ""), 10) : 0;

    const shippingText =
      $row.find(".ship, .ship_fee").text().trim();
    const shipping = shippingText.includes("무료")
      ? 0
      : parseInt(shippingText.replace(/[^0-9]/g, ""), 10) || 0;

    const url =
      $row.find("a.mall_name, a.logo_over").attr("href") || "";

    if (sellerName && price > 0) {
      prices.push({
        sellerName,
        price,
        shippingCost: shipping,
        totalPrice: price + shipping,
        productUrl: url,
      });
    }
  });

  return { specs, prices };
}

export function parseCategoryList(html: string): Product[] {
  // 카테고리 목록 페이지도 검색 결과와 유사한 구조
  return parseSearchResults(html);
}

// 다나와 카테고리 코드 매핑
export const DANAWA_CATEGORIES: Record<PartCategory, string> = {
  cpu: "112747",
  gpu: "112753",
  motherboard: "112751",
  ram: "112752",
  ssd: "112760",
  hdd: "112763",
  psu: "112777",
  case: "112775",
  cooler: "11236855",
  monitor: "112757",
};
