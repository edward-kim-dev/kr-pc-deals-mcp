import * as cheerio from "cheerio";
import type { Product, PartCategory } from "../../core/types.js";

// online_list.php 응답 파서 (카테고리 목록용)
export function parseOnlineResults(html: string): Product[] {
  const $ = cheerio.load(html);
  const products: Product[] = [];

  $("a[href*='detail_show']").each((_, el) => {
    const $a = $(el);
    const href = $a.attr("href") ?? "";
    const idMatch = href.match(/detail_show\('?(\d+)'?\)/);
    if (!idMatch) return;
    const id = idMatch[1];

    if (products.some((p) => p.id === id)) return;

    const $row = $a.closest("tr");

    // 제품명: td.name a b (b 태그가 정제된 이름, 나머지는 스펙 텍스트)
    const name =
      $row.find("td.name a b").first().text().trim() ||
      $row.find("td.name a").first().text().trim();
    if (!name) return;

    const priceText = $row.find("span.black13").first().text().trim();
    const priceMatch = priceText.match(/[\d,]+/);
    const price = priceMatch ? parseInt(priceMatch[0].replace(/,/g, ""), 10) : 0;

    const imageUrl = $row.find("a.imgbox img").first().attr("src") ?? undefined;
    const productUrl = `https://www.compuzone.co.kr/product/product_detail.htm?ProductNo=${id}`;

    products.push({
      id,
      source: "compuzone",
      name,
      lowestPrice: price,
      prices: [{ sellerName: "컴퓨존", price, shippingCost: 0, totalPrice: price, productUrl }],
      specs: {},
      imageUrl: imageUrl || undefined,
      productUrl,
    });
  });

  return products;
}

// search_list.php 응답 파서 (키워드 검색용)
export function parseSearchResults(html: string): Product[] {
  const $ = cheerio.load(html);
  const products: Product[] = [];

  $("div.prd_price").each((_, el) => {
    const $el = $(el);

    // 가격: data-price 속성 (첫 번째 숫자 패턴만 추출)
    const priceAttr = ($el.attr("data-price") ?? "").trim();
    const priceMatch = priceAttr.match(/[\d,]+/);
    const price = priceMatch ? parseInt(priceMatch[0].replace(/,/g, ""), 10) : 0;

    // 제품 ID: data-pricetable 속성 (= ProductNo, 5자리 이상만 유효)
    const id = $el.attr("data-pricetable") ?? "";
    if (!id || id.length < 5) return;
    if (products.some((p) => p.id === id)) return;

    // 상위 컨테이너에서 제품명 추출
    const $container = $el.closest(".prdH_wrap, .listView, li, .prd_info").length
      ? $el.closest(".prdH_wrap, .listView, li, .prd_info")
      : $el.parent();

    const name =
      $container.find("a.prd_info_name").text().trim() ||
      $el.parent().prevAll().find("a.prd_info_name").first().text().trim();
    if (!name) return;

    const imageUrl =
      $container.find("img").first().attr("src") ?? undefined;
    const productUrl = `https://www.compuzone.co.kr/product/product_detail.htm?ProductNo=${id}`;

    products.push({
      id,
      source: "compuzone",
      name,
      lowestPrice: price,
      prices: [{ sellerName: "컴퓨존", price, shippingCost: 0, totalPrice: price, productUrl }],
      specs: {},
      imageUrl: imageUrl || undefined,
      productUrl,
    });
  });

  return products;
}

export function parseProductDetail(
  html: string
): { specs: Record<string, string>; price: number } {
  const $ = cheerio.load(html);
  const specs: Record<string, string> = {};

  $(".prd_spec_area table tr, .spec_table tr, .product_info_table tr").each(
    (_, row) => {
      const $row = $(row);
      const key = $row.find("th, .tit, td:first-child").text().trim();
      const value = $row.find("td:last-child, .desc").text().trim();
      if (key && value && key !== value) {
        specs[key] = value;
      }
    }
  );

  const priceText =
    $(".price_area .sale_price, .prd_price_area .price, #productPrice")
      .text()
      .trim();
  const price = parseInt(priceText.replace(/[^0-9]/g, ""), 10) || 0;

  return { specs, price };
}

// 컴퓨존 온라인 견적 카테고리 매핑 (online_list.php 기준)
export const COMPUZONE_ONLINE_CATEGORIES: Record<
  PartCategory,
  { big: string; medium: string }
> = {
  cpu: { big: "4", medium: "1012" },       // 실측 확인 ✓
  gpu: { big: "4", medium: "1016" },       // 실측: RTX 5060 확인 ✓
  motherboard: { big: "4", medium: "1013" }, // 실측: X870E 메인보드 확인 ✓
  ram: { big: "4", medium: "1014" },       // 실측: 삼성 DDR5 확인 ✓
  ssd: { big: "4", medium: "1276" },       // 실측: WD SN5000 확인 ✓
  hdd: { big: "4", medium: "1015" },       // 실측: WD BLUE HDD 확인 ✓
  psu: { big: "4", medium: "1148" },       // 실측: 마이크로닉스 파워 확인 ✓
  case: { big: "4", medium: "1147" },      // 실측: 미들타워 확인 ✓
  cooler: { big: "4", medium: "1020" },    // 실측: CPU쿨러 확인 ✓
  monitor: { big: "4", medium: "1022" },   // 실측: 삼성 모니터 확인 ✓
};

// 하위 호환: 기존 코드에서 참조하는 COMPUZONE_CATEGORIES
export const COMPUZONE_CATEGORIES = COMPUZONE_ONLINE_CATEGORIES;
