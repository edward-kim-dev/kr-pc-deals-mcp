import * as cheerio from "cheerio";
import type { PartCategory } from "../../core/categories.js";
import type { Product, ProductDetail } from "../../core/types.js";
import { collapseSpaces, parseWon } from "../../utils/text.js";
import { compuzoneProductUrl } from "./categories.js";

/**
 * 컴퓨존 검색 목록(search_list.php 응답)에서 상품을 꺼낸다.
 * 상품마다 `li.li-obj` 안에 `div.prd_price[data-pricetable=상품번호][data-price=정가][data-discountprice=판매가]`와
 * `a.prd_info_name`(상품명)이 있다.
 */
export function parseCompuzoneSearch(html: string, category?: PartCategory): Product[] {
  const $ = cheerio.load(html);
  const products: Product[] = [];
  const seen = new Set<string>();

  $("div.prd_price").each((_, el) => {
    const $price = $(el);
    const id = $price.attr("data-pricetable") ?? "";
    if (!/^\d{5,}$/.test(id) || seen.has(id)) return;

    // 상품 하나를 감싸는 li 안에서만 이름을 찾는다 (목록 전체를 감싸는 요소로 올라가면 이름이 섞인다)
    let $item = $price.closest("li.li-obj");
    if ($item.length === 0) $item = $price.closest("li");
    if ($item.length === 0) return;
    const name = collapseSpaces($item.find("a.prd_info_name").first().text());
    if (!name) return;

    // 할인 중이면 data-discountprice가 실제 판매가다 (할인이 없으면 data-price와 같다)
    const listPrice = parseWon($price.attr("data-price"));
    const salePrice = parseWon($price.attr("data-discountprice"));
    const price = salePrice > 0 && (listPrice === 0 || salePrice <= listPrice) ? salePrice : listPrice;

    seen.add(id);
    products.push({
      source: "compuzone",
      id,
      name,
      price,
      url: compuzoneProductUrl(id),
      category,
    });
  });

  return products;
}

/** "검색된 상품이 없습니다" 화면인지 (정상적인 빈 결과) */
export function isCompuzoneEmptyResult(html: string): boolean {
  return html.includes("검색된 상품이 없습니다") || /총\s*0\s*개의\s*상품/.test(html);
}

/**
 * 컴퓨존 상품 상세 페이지를 읽는다.
 * 가격 영역에는 화면에 보이지 않는 가짜 가격(display:none)이 함께 들어 있어,
 * 숨은 요소를 지운 뒤 화면에 보이는 글자만 읽는다.
 */
export function parseCompuzoneProductPage(html: string, productNo: string): ProductDetail {
  const $ = cheerio.load(html);

  const name =
    collapseSpaces($("h2.tit_p_name").first().text()) ||
    collapseSpaces($("title").text().replace(/\s*:\s*컴퓨존\s*$/, ""));

  const $price = $(".price_real").first().clone();
  $price.find('[style*="display:none"], [style*="display: none"]').remove();
  const price = parseWon($price.text());

  const specs = [
    ...new Set(
      collapseSpaces($(".p_spec").first().text())
        .split("/")
        .map((s) => s.trim())
        .filter(Boolean)
    ),
  ];

  const deliveryText = collapseSpaces($(".delivery_price_inner .txt").first().text());
  const shippingFee = deliveryText.includes("무료") ? 0 : parseWon(deliveryText) || null;

  const url = compuzoneProductUrl(productNo);
  return {
    source: "compuzone",
    id: productNo,
    name,
    url,
    price,
    specs,
    offers: price > 0 ? [{ seller: "컴퓨존", price, shippingFee, url }] : [],
  };
}
