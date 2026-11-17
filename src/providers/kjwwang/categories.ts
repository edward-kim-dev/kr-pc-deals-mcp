import type { PartCategory } from "../../core/categories.js";

/**
 * 견적왕 카테고리 번호.
 * 검색 목록 POST의 `search_cate` 값이며, 분류 화면 주소 `/shop/product_list.html?ct_no=`의 번호와 같다.
 * 모두 2단계 분류다. 부품은 "PC주요부품"(ct_no=2), 모니터는 "모니터/노트북/미니PC"(ct_no=6082) 아래에 있다.
 */
export const KJWWANG_CATEGORIES: Record<PartCategory, string> = {
  cpu: "9",
  gpu: "12",
  motherboard: "11",
  ram: "10",
  ssd: "243",
  hdd: "13",
  psu: "15",
  case: "16",
  cooler: "574",
  monitor: "6090",
};

/** 검색 목록 상품의 분류 이름(`ul.prd_cate li`) → 부품 종류 */
const CATEGORY_BY_NAME: Record<string, PartCategory> = {
  CPU: "cpu",
  그래픽카드: "gpu",
  메인보드: "motherboard",
  메모리: "ram",
  SSD: "ssd",
  "데스크탑 HDD": "hdd",
  파워서플라이: "psu",
  케이스: "case",
  CPU쿨러: "cooler",
  모니터: "monitor",
};

/** 분류 이름 목록(대분류 → 중분류 순)에서 부품 종류를 찾는다. 가장 아래 분류부터 본다 */
export function categoryFromKjwwangNames(names: string[]): PartCategory | undefined {
  for (const name of [...names].reverse()) {
    const category = CATEGORY_BY_NAME[name.trim()];
    if (category) return category;
  }
  return undefined;
}

/** 분류 화면이 목록 POST에 보내는 상위 분류 번호(cate1) */
export function kjwwangParentCategory(category: PartCategory): string {
  return category === "monitor" ? "6082" : "2";
}

export function kjwwangCategoryUrl(category: PartCategory): string {
  return `https://kjwwang.com/shop/product_list.html?ct_no=${KJWWANG_CATEGORIES[category]}`;
}

export function kjwwangProductUrl(pdNo: string): string {
  return `https://kjwwang.com/shop/product_detail.html?pd_no=${pdNo}`;
}
