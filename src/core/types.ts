import type { PartCategory } from "./categories.js";

/** 데이터 출처 */
export const SOURCES = ["danawa", "compuzone", "enuri", "kjwwang"] as const;
export type Source = (typeof SOURCES)[number];

export const SOURCE_LABELS: Record<Source, string> = {
  danawa: "다나와",
  compuzone: "컴퓨존",
  enuri: "에누리",
  kjwwang: "견적왕",
};

/** 검색·목록 결과의 상품 한 건 */
export interface Product {
  source: Source;
  /** 사이트별 상품 코드 (다나와 pcode, 컴퓨존 ProductNo, 에누리 modelno, 견적왕 상품 번호) */
  id: string;
  name: string;
  /** 원 단위 가격. 가격비교 사이트(다나와·에누리·견적왕)는 판매처 최저가, 컴퓨존은 자체 판매가. 0이면 가격 미정 */
  price: number;
  url: string;
  category?: PartCategory;
  /** 가격비교 사이트에 등록된 판매처 수 */
  shopCount?: number;
  /** 가격이 비정상으로 보일 때의 경고 (예: 판매처 등록 오류로 최저가가 시세보다 크게 낮음) */
  priceWarning?: string;
}

/** 판매처별 가격 */
export interface SellerOffer {
  seller: string;
  price: number;
  /** 배송비(원). 0은 무료배송, null은 알 수 없음 */
  shippingFee: number | null;
  url?: string;
}

/** 상품 상세 */
export interface ProductDetail {
  source: Source;
  id: string;
  name: string;
  url: string;
  /** 최저가(원). 0이면 가격 미정 */
  price: number;
  /** 다나와 현금 최저가 */
  cashPrice?: number;
  /** 스펙 요약 항목 (예: "PCIe5.0x16", "가로(길이): 338mm") */
  specs: string[];
  /** 판매처별 가격. 다나와는 상세 페이지에 바로 나오는 상위 판매처만 담긴다 */
  offers: SellerOffer[];
  maker?: string;
  /** 다나와 등록월 (예: "2025.03.") */
  registeredAt?: string;
}

/** 가격 변동 이력의 한 시점 */
export interface PricePoint {
  /** 주 단위면 "2026-10-20", 월 단위면 "2026-10" */
  date: string;
  /** 그 시점의 최저가(원) */
  minPrice: number;
  /** 한 주만 크게 떨어졌다 회복한 값 (판매처 등록 오류일 수 있음) */
  suspicious?: boolean;
}

export interface PriceHistory {
  productCode: string;
  periodMonths: number;
  /** 1·3개월은 주 단위, 6·12·24개월은 월 단위 */
  granularity: "week" | "month";
  /** 이상값을 뺀 기간 최저가·최고가(원). 자료가 없으면 0 */
  lowest: number;
  highest: number;
  points: PricePoint[];
}

/** 사이트 하나가 실패했을 때 결과에 함께 싣는 오류 */
export interface SourceError {
  source: Source;
  message: string;
}

/** 다나와 호환성 검사의 부품 쌍 결과 */
export interface CompatibilityPair {
  /** 비교한 부품 종류 쌍 (다나와 표기, 예: ["cpu", "mainboard"]) */
  parts: [string, string];
  compatible: boolean;
  /** 다나와 결과 코드. "0001"이 호환 */
  code: string;
  messages: string[];
}

export interface CompatibilityResult {
  compatible: boolean;
  pairs: CompatibilityPair[];
}
