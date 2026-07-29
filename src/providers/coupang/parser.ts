import * as cheerio from "cheerio";
import type { PartCategory, Product } from "../../core/types.js";

const COUPANG_ORIGIN = "https://www.coupang.com";
const PRODUCT_PARAMS = new Set(["itemId", "vendorItemId"]);

function parseWon(text: string): number {
  const match = text.match(/([\d,]+)\s*원/);
  return match ? Number.parseInt(match[1].replace(/,/g, ""), 10) : 0;
}

/** 브라우저로 렌더링한 쿠팡 검색 페이지에서 상품 카드를 추출한다. */
export function parseCoupangSearchResults(
  html: string,
  category?: PartCategory
): Product[] {
  const $ = cheerio.load(html);
  const products: Product[] = [];
  const seenIds = new Set<string>();

  $('#product-list > li a[href*="/vp/products/"]').each((_, anchor) => {
    const $anchor = $(anchor);
    const href = $anchor.attr("href") ?? "";
    const id = href.match(/\/vp\/products\/(\d+)/)?.[1] ?? "";
    if (!id || seenIds.has(id)) return;

    const $card = $anchor.closest("li[data-id]");
    if ($card.length === 0) return;

    const $image = $card.find("figure img[alt]").first();
    const name =
      $image.attr("alt")?.trim() ||
      $card.find('[class*="ProductUnit_productName"]').first().text().trim();
    if (!name) return;

    const $priceArea = $card.find('[class*="PriceArea_priceArea"]').first();
    const priceText = $priceArea
      .find("span")
      .toArray()
      .map((element) => $(element).text().trim())
      .find((text) => /^[\d,]+\s*원$/.test(text));
    const price = priceText ? parseWon(priceText) : 0;
    if (price <= 0) return;

    const shippingText = $priceArea
      .find('[data-badge-type="feePrice"]')
      .first()
      .text()
      .trim();
    const shippingCost = shippingText ? parseWon(shippingText) : 0;
    const isRocket =
      $card.find('[data-badge-id^="ROCKET"]').length > 0;

    const reviewText = $card
      .find('[class*="ProductRating_productRating"] span')
      .last()
      .text()
      .trim();
    const reviewMatch = reviewText.match(/\(([\d,]+)\)/);
    const reviewCount = reviewMatch
      ? Number.parseInt(reviewMatch[1].replace(/,/g, ""), 10)
      : undefined;

    const productUrl = new URL(href, COUPANG_ORIGIN);
    for (const param of [...productUrl.searchParams.keys()]) {
      if (!PRODUCT_PARAMS.has(param)) productUrl.searchParams.delete(param);
    }

    const stableProductUrl = productUrl.toString();
    seenIds.add(id);
    products.push({
      id,
      source: "coupang",
      name,
      category,
      lowestPrice: price,
      prices: [
        {
          sellerName: isRocket ? "쿠팡 로켓배송" : "쿠팡",
          price,
          shippingCost,
          totalPrice: price + shippingCost,
          productUrl: stableProductUrl,
        },
      ],
      specs: {},
      imageUrl: $image.attr("src") || undefined,
      productUrl: stableProductUrl,
      reviewCount,
    });
  });

  return products;
}
