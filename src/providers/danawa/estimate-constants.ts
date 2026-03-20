import type { PartCategory } from "../../core/types.js";

export const ESTIMATE_CATEGORY_SEQ: Record<PartCategory, number> = {
  cpu: 873,
  ram: 874,
  motherboard: 875,
  gpu: 876,
  hdd: 877,
  case: 879,
  psu: 880,
  cooler: 887,
  ssd: 32617,
  monitor: 13735,
};

// virtualestimate API의 실제 카테고리 필터 파라미터
// name= 파라미터와 함께 사용 시 categorySeq는 무시되므로 이 값으로 필터링
export const ESTIMATE_SERVICE_SECTION_SEQ: Record<PartCategory, number> = {
  cpu: 266,
  motherboard: 267,
  ram: 268,
  gpu: 269,
  hdd: 270,
  ssd: 272,
  case: 273,
  psu: 274,
  monitor: 276,
  cooler: 280,
};

// name= 파라미터와 함께 카테고리 검색 시 항상 이 값을 categorySeq로 사용
// (개별 categorySeq는 name= 과 함께 쓰면 무시됨)
export const ESTIMATE_SEARCH_CATEGORY_SEQ = 887;

export const ESTIMATE_MARKETPLACE_SEQ = 16;
export const ESTIMATE_BASE_URL = "https://shop.danawa.com/virtualestimate/";
