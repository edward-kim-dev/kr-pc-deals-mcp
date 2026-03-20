import * as cheerio from "cheerio";

export interface EstimateProduct {
  id: string;
  name: string;
  price: number;
  productUrl: string;
  imageUrl?: string;
}

export function parseEstimateProductList(html: string): EstimateProduct[] {
  const $ = cheerio.load(html);
  const products: EstimateProduct[] = [];

  const seenIds = new Set<string>();
  // 실제 HTML 구조: tr[class*='productList_'] - recom_area 섹션 + 일반 목록 섹션 통합
  $("tr[class*='productList_']").each((_, el) => {
    const $el = $(el);

    // onclick에서 ID 추출: productInfoPopup(21694499, ...)
    const onclick = $el.find("p.subject a").first().attr("onclick") ?? "";
    const idMatch = onclick.match(/productInfoPopup\((\d+)/);
    if (!idMatch) return;
    const id = idMatch[1];
    if (seenIds.has(id)) return;
    seenIds.add(id);

    const name = $el.find("p.subject a").first().text().trim();
    if (!name) return;

    // 가격: p.low_price span.prod_price
    const priceText = $el.find("p.low_price span.prod_price").first().text().trim();
    const priceMatch = priceText.match(/[\d,]+/);
    const price = priceMatch ? parseInt(priceMatch[0].replace(/,/g, ""), 10) : 0;

    const imageUrl =
      $el.find("td.goods_img img").attr("src") ||
      undefined;

    products.push({
      id,
      name,
      price,
      productUrl: `https://prod.danawa.com/info/?pcode=${id}`,
      imageUrl: imageUrl || undefined,
    });
  });

  return products;
}
