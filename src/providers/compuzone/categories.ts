import type { PartCategory } from "../../core/categories.js";

/** 컴퓨존 검색의 카테고리 필터 (BigDivNo / MediumDivNo) */
export const COMPUZONE_CATEGORIES: Record<PartCategory, { big: string; medium: string }> = {
  cpu: { big: "4", medium: "1012" },
  gpu: { big: "4", medium: "1016" },
  motherboard: { big: "4", medium: "1013" },
  ram: { big: "4", medium: "1014" },
  ssd: { big: "4", medium: "1276" },
  hdd: { big: "4", medium: "1015" },
  psu: { big: "4", medium: "1148" },
  case: { big: "4", medium: "1147" },
  cooler: { big: "4", medium: "1020" },
  monitor: { big: "4", medium: "1022" },
};

export function compuzoneProductUrl(productNo: string): string {
  return `https://www.compuzone.co.kr/product/product_detail.htm?ProductNo=${productNo}`;
}
