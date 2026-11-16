import type { PartCategory } from "../../core/categories.js";

/**
 * 견적왕 카테고리 번호.
 * 검색 목록 POST의 `search_cate` 값이며, 분류 목록 주소 `/shop/product_list.html?ct_no=`의 번호와 같다.
 * 모니터만 대분류이고 나머지는 "PC 주요부품"(ct_no=2)의 하위 분류다.
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

export function kjwwangProductUrl(pdNo: string): string {
  return `https://kjwwang.com/shop/product_detail.html?pd_no=${pdNo}`;
}
