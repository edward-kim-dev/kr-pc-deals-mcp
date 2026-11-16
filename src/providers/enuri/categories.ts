import type { PartCategory } from "../../core/categories.js";

/**
 * 에누리 카테고리 코드.
 * 검색 화면의 `category` 파라미터 값이자 상품 데이터 `category.categoryId`(예: "070522")의 앞자리다.
 * 4자리는 중분류, 6자리는 소분류다. SSD와 HDD는 같은 중분류(0713 "SSD/HDD")에 있어 소분류 코드를 쓴다.
 */
export const ENURI_CATEGORIES: Record<PartCategory, string> = {
  cpu: "0707",
  gpu: "0705",
  motherboard: "0708",
  ram: "0703",
  ssd: "071307",
  hdd: "071306",
  psu: "0718",
  case: "0711",
  cooler: "0719",
  monitor: "0405",
};

/** 긴 코드(소분류)부터 비교한다 */
const CODES_BY_LENGTH = (Object.entries(ENURI_CATEGORIES) as [PartCategory, string][]).sort(
  (a, b) => b[1].length - a[1].length
);

/** 에누리 카테고리 코드("070522", "07130700" …)로 부품 종류를 찾는다. PC 부품이 아니면 undefined */
export function categoryFromEnuriCode(code: unknown): PartCategory | undefined {
  const text = typeof code === "string" || typeof code === "number" ? String(code) : "";
  if (!/^\d{4,}$/.test(text)) return undefined;
  return CODES_BY_LENGTH.find(([, prefix]) => text.startsWith(prefix))?.[0];
}

export function enuriProductUrl(modelNo: string): string {
  return `https://price.enuri.com/catalog/${modelNo}`;
}
