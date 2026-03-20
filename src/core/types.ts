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

export type Source = "danawa" | "compuzone";
export type Purpose = "gaming" | "office" | "workstation" | "streaming";

export interface SellerPrice {
  sellerName: string;
  price: number;
  shippingCost: number;
  totalPrice: number;
  productUrl: string;
}

export interface Product {
  id: string;
  source: Source;
  name: string;
  category?: PartCategory;
  lowestPrice: number;
  prices: SellerPrice[];
  specs: Record<string, string>;
  imageUrl?: string;
  productUrl: string;
  reviewCount?: number;
}

export interface PriceHistoryEntry {
  date: string;
  minPrice: number;
  maxPrice: number;
}

export interface PriceHistory {
  productCode: string;
  period: number;
  data: PriceHistoryEntry[];
}

export interface ComparisonResult {
  query: string;
  danawa: Product[];
  compuzone: Product[];
  matched: {
    danawa: Product;
    compuzone: Product;
    priceDiff: number;
    cheaperSource: Source;
  }[];
}

export interface BuildPart {
  category: PartCategory;
  product: Product;
  allocatedBudget: number;
}

export interface BuildEstimate {
  purpose: Purpose;
  totalPrice: number;
  budget: number;
  remainingBudget: number;
  parts: BuildPart[];
  warnings: string[];
}

export interface CompatibilityCheck {
  compatible: boolean;
  warnings: string[];
  errors: string[];
  details: Record<string, string>;
}

export const BUDGET_RATIOS: Record<Purpose, Record<string, number>> = {
  gaming: {
    cpu: 0.2,
    gpu: 0.35,
    motherboard: 0.1,
    ram: 0.08,
    ssd: 0.08,
    psu: 0.07,
    case: 0.05,
    cooler: 0.07,
  },
  office: {
    cpu: 0.25,
    gpu: 0.1,
    motherboard: 0.12,
    ram: 0.1,
    ssd: 0.15,
    psu: 0.1,
    case: 0.1,
    cooler: 0.08,
  },
  workstation: {
    cpu: 0.25,
    gpu: 0.3,
    motherboard: 0.12,
    ram: 0.12,
    ssd: 0.08,
    psu: 0.05,
    case: 0.04,
    cooler: 0.04,
  },
  streaming: {
    cpu: 0.22,
    gpu: 0.3,
    motherboard: 0.1,
    ram: 0.1,
    ssd: 0.1,
    psu: 0.06,
    case: 0.05,
    cooler: 0.07,
  },
};

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
