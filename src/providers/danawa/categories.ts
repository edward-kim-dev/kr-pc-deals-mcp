import type { PartCategory } from "../../core/categories.js";

/**
 * 다나와 카테고리 코드.
 * - listCode: 카테고리 목록 페이지 `prod.danawa.com/list/?cate=` 값
 * - cate1/cate2: 검색 API의 카테고리 필터이자 상품 데이터의 categorySeq1/categorySeq2.
 *   호환성 검사 API도 cate2 코드로 부품 종류를 구분한다.
 */
export const DANAWA_CATEGORIES: Record<PartCategory, { listCode: string; cate1: number; cate2: number }> = {
  cpu: { listCode: "112747", cate1: 861, cate2: 873 },
  gpu: { listCode: "112753", cate1: 861, cate2: 876 },
  motherboard: { listCode: "112751", cate1: 861, cate2: 875 },
  ram: { listCode: "112752", cate1: 861, cate2: 874 },
  ssd: { listCode: "112760", cate1: 861, cate2: 32617 },
  hdd: { listCode: "112763", cate1: 861, cate2: 877 },
  psu: { listCode: "112777", cate1: 861, cate2: 880 },
  case: { listCode: "112775", cate1: 861, cate2: 879 },
  cooler: { listCode: "11236855", cate1: 862, cate2: 887 },
  monitor: { listCode: "112757", cate1: 860, cate2: 13735 },
};

const CATEGORY_BY_CATE2 = new Map<number, PartCategory>(
  (Object.entries(DANAWA_CATEGORIES) as [PartCategory, { cate2: number }][]).map(([category, codes]) => [
    codes.cate2,
    category,
  ])
);

/** 다나와 categorySeq2 코드로 부품 종류를 찾는다. PC 부품이 아니면 undefined */
export function categoryFromCate2(cate2: unknown): PartCategory | undefined {
  return CATEGORY_BY_CATE2.get(Number(cate2));
}

export function danawaProductUrl(pcode: string): string {
  return `https://prod.danawa.com/info/?pcode=${pcode}`;
}
