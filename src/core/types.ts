/**
 * PC 부품 카테고리.
 * 다나와/컴퓨존 검색, 카테고리 필터링에 사용된다.
 * PCPartPicker는 별도의 PcppCategory를 사용한다.
 */
export type PartCategory =
  | "cpu"
  | "gpu"
  | "motherboard"
  | "ram"
  | "ssd"
  | "hdd"
  | "psu"
  | "case"
  | "cooler"
  | "monitor";

/** 데이터 출처 (어느 사이트에서 가져온 정보인지) */
export type Source = "danawa" | "compuzone";

/** 판매처별 가격 정보 (다나와 제품 상세에서 추출) */
export interface SellerPrice {
  sellerName: string;    // 판매처명 (예: "11번가", "쿠팡")
  price: number;         // 상품 가격
  shippingCost: number;  // 배송비
  totalPrice: number;    // 상품 가격 + 배송비
  productUrl: string;    // 판매처 구매 링크
}

/** 검색 결과 제품 (다나와/컴퓨존 공통 구조) */
export interface Product {
  id: string;                       // 사이트별 제품 고유 ID
  source: Source;                   // 데이터 출처
  name: string;                     // 제품명
  category?: PartCategory;          // 부품 카테고리 (검색 시 지정된 경우)
  lowestPrice: number;              // 최저가 (원)
  prices: SellerPrice[];            // 판매처별 가격 목록
  specs: Record<string, string>;    // 스펙 (키-값 쌍, 예: {"소켓": "AM5"})
  imageUrl?: string;                // 제품 이미지 URL
  productUrl: string;               // 제품 상세 페이지 링크
  reviewCount?: number;             // 리뷰 수
}

/** 가격 이력 데이터 포인트 (다나와 가격 변동 그래프) */
export interface PriceHistoryEntry {
  date: string;      // 날짜 (YYYY-MM-DD)
  minPrice: number;  // 해당 일 최저가
  maxPrice: number;  // 해당 일 최고가
}

/** 가격 이력 조회 결과 */
export interface PriceHistory {
  productCode: string;         // 다나와 제품 코드
  period: number;              // 조회 기간 (개월)
  data: PriceHistoryEntry[];   // 일별 가격 데이터
}

/** 다나와/컴퓨존 가격 비교 결과 */
export interface ComparisonResult {
  query: string;
  danawa: Product[];
  compuzone: Product[];
  matched: {
    danawa: Product;
    compuzone: Product;
    priceDiff: number;        // 가격 차이 (원)
    cheaperSource: Source;    // 더 저렴한 사이트
  }[];
}

/** 카테고리별 한국어 라벨 (UI 표시용) */
export const CATEGORY_LABELS: Record<PartCategory, string> = {
  cpu: "CPU (프로세서)",
  gpu: "그래픽카드",
  motherboard: "메인보드",
  ram: "메모리 (RAM)",
  ssd: "SSD",
  hdd: "HDD",
  psu: "파워서플라이",
  case: "케이스",
  cooler: "CPU 쿨러",
  monitor: "모니터",
};

// ─── 다나와 빌드(견적) 전용 타입 ───

/** 빌드에 추가된 부품 */
export interface BuildPart {
  id: string;              // 다나와 제품 코드 (productSeq)
  category: PartCategory;  // 부품 카테고리
  name: string;            // 제품명
  price: number;           // 최저가
}

/** 호환성 체크 결과 (부품 쌍별) */
export interface CompatibilityPair {
  result: string;          // "0001" = 호환, 그 외 = 비호환/경고
  parts: [string, string]; // 비교 대상 카테고리 쌍 (예: ["cpu", "ram"])
  messages: Record<string, string>; // 카테고리별 메시지
}

/** 빌드 호환성 체크 전체 결과 */
export interface CompatibilityResult {
  compatible: boolean;     // 전체 호환 여부
  pairs: CompatibilityPair[];
}

/** 빌드 상태 */
export interface Build {
  parts: BuildPart[];
  createdAt: number;
}

