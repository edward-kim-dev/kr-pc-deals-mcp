import { searchDanawa, listByCategory } from "../providers/danawa/index.js";
import type {
  Purpose,
  PartCategory,
  BuildEstimate,
  BuildPart,
  Product,
  BUDGET_RATIOS,
} from "../core/types.js";
import { BUDGET_RATIOS as RATIOS } from "../core/types.js";
import { checkCompatibility, extractSocket, extractDDRType, extractTDP } from "./compatibility.js";

const BUILD_CATEGORIES: PartCategory[] = [
  "cpu",
  "gpu",
  "motherboard",
  "ram",
  "ssd",
  "psu",
  "case",
  "cooler",
];

// 카테고리별 검색 키워드 보강
const CATEGORY_SEARCH_HINTS: Partial<Record<PartCategory, Record<Purpose, string>>> = {
  cpu: {
    gaming: "인텔 코어 i5 i7 AMD 라이젠 5 7",
    office: "인텔 코어 i3 i5 AMD 라이젠 5",
    workstation: "인텔 코어 i9 AMD 라이젠 9",
    streaming: "인텔 코어 i7 AMD 라이젠 7",
  },
  gpu: {
    gaming: "GeForce RTX",
    office: "내장그래픽",
    workstation: "GeForce RTX Quadro",
    streaming: "GeForce RTX",
  },
};

// 마이닝/채굴용 PSU 필터
function isMiningPSU(name: string): boolean {
  return /채굴|마이닝|mining|서버용|server/i.test(name);
}

async function findBestPartForBudget(
  category: PartCategory,
  budget: number,
  purpose: Purpose
): Promise<Product | null> {
  try {
    // listByCategory 우선 사용 (카테고리 정확도 높음)
    let products = await listByCategory(category, { limit: 30 });

    // 가격 0 제품 제거
    products = products.filter((p) => p.lowestPrice > 0);

    // PSU: 마이닝/채굴용 제외
    if (category === "psu") {
      products = products.filter((p) => !isMiningPSU(p.name));
    }

    if (products.length === 0) return null;

    // 예산 내에서 가장 비싼 제품 (성능 우선)
    const affordable = products
      .filter((p) => p.lowestPrice <= budget)
      .sort((a, b) => b.lowestPrice - a.lowestPrice);

    if (affordable.length > 0) return affordable[0];

    // 예산 초과 시 가장 저렴한 제품
    return products.sort((a, b) => a.lowestPrice - b.lowestPrice)[0];
  } catch {
    // 폴백: 키워드 검색
    const hint = CATEGORY_SEARCH_HINTS[category]?.[purpose] ?? category;
    try {
      const products = await searchDanawa(String(hint), { category, limit: 20 });
      const valid = products.filter((p) => p.lowestPrice > 0);
      if (category === "psu") {
        const filtered = valid.filter((p) => !isMiningPSU(p.name));
        if (filtered.length > 0) {
          return filtered
            .filter((p) => p.lowestPrice <= budget)
            .sort((a, b) => b.lowestPrice - a.lowestPrice)[0] ??
            filtered.sort((a, b) => a.lowestPrice - b.lowestPrice)[0];
        }
      }
      const affordable = valid
        .filter((p) => p.lowestPrice <= budget)
        .sort((a, b) => b.lowestPrice - a.lowestPrice);
      return affordable[0] ?? valid.sort((a, b) => a.lowestPrice - b.lowestPrice)[0] ?? null;
    } catch {
      return null;
    }
  }
}

export async function estimateBuild(
  budget: number,
  purpose: Purpose
): Promise<BuildEstimate> {
  const ratios = RATIOS[purpose];
  const parts: BuildPart[] = [];
  const warnings: string[] = [];
  let totalPrice = 0;

  // 각 카테고리별로 부품 검색 (순차 실행 - rate limiting 준수)
  for (const category of BUILD_CATEGORIES) {
    const ratio = ratios[category] ?? 0.05;
    const allocatedBudget = Math.round(budget * ratio);

    const product = await findBestPartForBudget(
      category,
      allocatedBudget,
      purpose
    );

    if (product) {
      parts.push({ category, product, allocatedBudget });
      totalPrice += product.lowestPrice;

      if (product.lowestPrice > allocatedBudget) {
        warnings.push(
          `${category}: 배정 예산(${allocatedBudget.toLocaleString()}원) 초과 → ${product.lowestPrice.toLocaleString()}원`
        );
      }
    } else {
      warnings.push(`${category}: 적합한 제품을 찾지 못했습니다.`);
    }
  }

  // 호환성 체크
  const cpuPart = parts.find((p) => p.category === "cpu");
  const mbPart = parts.find((p) => p.category === "motherboard");
  const ramPart = parts.find((p) => p.category === "ram");
  const gpuPart = parts.find((p) => p.category === "gpu");
  const psuPart = parts.find((p) => p.category === "psu");

  if (cpuPart && mbPart) {
    const cpuSocket = extractSocket(cpuPart.product.specs, cpuPart.product.name);
    const mbSocket = extractSocket(mbPart.product.specs, mbPart.product.name);

    if (cpuSocket && mbSocket && cpuSocket !== mbSocket) {
      warnings.push(
        `⚠️ CPU(${cpuSocket})와 메인보드(${mbSocket}) 소켓이 불일치할 수 있습니다. 확인 필요.`
      );
    }
  }

  if (mbPart && ramPart) {
    const mbDDR = extractDDRType(mbPart.product.specs, mbPart.product.name);
    const ramDDR = extractDDRType(ramPart.product.specs, ramPart.product.name);

    if (mbDDR && ramDDR && mbDDR !== ramDDR) {
      warnings.push(
        `⚠️ 메인보드(${mbDDR})와 RAM(${ramDDR}) DDR 규격이 불일치할 수 있습니다. 확인 필요.`
      );
    }
  }

  return {
    purpose,
    totalPrice,
    budget,
    remainingBudget: budget - totalPrice,
    parts,
    warnings,
  };
}

export async function optimizeBuild(
  currentParts: { category: PartCategory; productName: string; price: number }[],
  optimizeFor: "price" | "performance" = "price"
): Promise<{
  suggestions: { category: PartCategory; current: string; suggested: Product; saving: number }[];
  totalSaving: number;
}> {
  const suggestions: {
    category: PartCategory;
    current: string;
    suggested: Product;
    saving: number;
  }[] = [];

  for (const part of currentParts) {
    try {
      const allProducts = await searchDanawa(part.productName, {
        category: part.category,
        limit: 10,
      });
      const products = allProducts.filter((p) => p.lowestPrice > 0);

      if (optimizeFor === "price") {
        // 더 저렴한 유사 제품 찾기
        const cheaper = products
          .filter((p) => p.lowestPrice > 0 && p.lowestPrice < part.price)
          .sort((a, b) => a.lowestPrice - b.lowestPrice);

        if (cheaper.length > 0) {
          suggestions.push({
            category: part.category,
            current: part.productName,
            suggested: cheaper[0],
            saving: part.price - cheaper[0].lowestPrice,
          });
        }
      } else {
        // 같은 가격대에서 더 나은 제품 찾기
        const betterValue = products
          .filter(
            (p) =>
              p.lowestPrice > 0 &&
              p.lowestPrice <= part.price * 1.1 &&
              p.lowestPrice >= part.price * 0.9
          )
          .sort((a, b) => (b.reviewCount ?? 0) - (a.reviewCount ?? 0));

        if (betterValue.length > 0 && betterValue[0].name !== part.productName) {
          suggestions.push({
            category: part.category,
            current: part.productName,
            suggested: betterValue[0],
            saving: part.price - betterValue[0].lowestPrice,
          });
        }
      }
    } catch {
      // 검색 실패 시 스킵
    }
  }

  const totalSaving = suggestions.reduce((sum, s) => sum + s.saving, 0);
  return { suggestions, totalSaving };
}
