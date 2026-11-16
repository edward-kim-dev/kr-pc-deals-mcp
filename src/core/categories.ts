/**
 * PC 부품 카테고리.
 * 모든 도구의 category 파라미터와 견적(빌드) 슬롯이 이 목록을 쓴다.
 * 사이트별 카테고리 코드는 각 provider의 categories.ts에 있다.
 */
export const PART_CATEGORIES = [
  "cpu",
  "gpu",
  "motherboard",
  "ram",
  "ssd",
  "hdd",
  "psu",
  "case",
  "cooler",
  "monitor",
] as const;

export type PartCategory = (typeof PART_CATEGORIES)[number];

/** 카테고리별 한국어 표시 이름 */
export const CATEGORY_LABELS: Record<PartCategory, string> = {
  cpu: "CPU",
  gpu: "그래픽카드",
  motherboard: "메인보드",
  ram: "메모리(RAM)",
  ssd: "SSD",
  hdd: "HDD",
  psu: "파워",
  case: "케이스",
  cooler: "CPU 쿨러",
  monitor: "모니터",
};
