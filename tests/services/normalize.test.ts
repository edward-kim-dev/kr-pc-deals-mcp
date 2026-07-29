import { describe, it, expect } from "vitest";
import {
  normalizeProductName,
  calculateSimilarity,
  findBestMatch,
} from "../../src/utils/normalize.js";

describe("normalizeProductName", () => {
  it("공백 정규화", () => {
    expect(normalizeProductName("인텔  코어   i7")).toBe("인텔 코어 i7");
  });

  it("특수문자 제거", () => {
    expect(normalizeProductName("RTX 4070 (12GB)")).toBe("rtx 4070 12gb");
  });

  it("소문자 변환", () => {
    expect(normalizeProductName("NVIDIA RTX")).toBe("nvidia rtx");
  });
});

describe("calculateSimilarity", () => {
  it("동일 문자열은 1.0", () => {
    expect(calculateSimilarity("RTX 4070", "RTX 4070")).toBe(1.0);
  });

  it("유사한 제품명은 높은 유사도", () => {
    const sim = calculateSimilarity(
      "ASUS GeForce RTX 4070 SUPER",
      "ASUS RTX 4070 SUPER 12GB"
    );
    expect(sim).toBeGreaterThan(0.5);
  });

  it("다른 제품은 낮은 유사도", () => {
    const sim = calculateSimilarity("RTX 4070", "RX 7900 XTX");
    expect(sim).toBeLessThan(0.3);
  });
});

describe("findBestMatch", () => {
  const candidates = [
    "ASUS GeForce RTX 4070 12GB",
    "MSI GeForce RTX 4060 Ti 8GB",
    "삼성 DDR5-6000 16GB",
  ];

  it("모델번호가 다르면 매칭을 거부한다 (게이트)", () => {
    // RTX 5070 vs RTX 5070 Ti / Ti SUPER — 서로 다른 GPU
    expect(
      findBestMatch("RTX 5070", ["MSI RTX 5070 Ti", "ASUS RTX 5070 Ti SUPER"])
    ).toBeNull();
    // RTX 4070 SUPER vs RTX 4070 — 접미가 다르면 다른 모델
    expect(findBestMatch("RTX 4070 SUPER", ["ASUS RTX 4070 12GB"])).toBeNull();
    // 7800X3D vs 7700X — 서로 다른 CPU (접두사 없는 모델번호도 추출)
    expect(findBestMatch("AMD 라이젠7 7800X3D", ["AMD 라이젠7 7700X"])).toBeNull();
  });

  it("모델번호가 정확히 일치하면 매칭한다", () => {
    const result = findBestMatch("RTX 5070", [
      "MSI RTX 5070 Ti",
      "GIGABYTE RTX 5070 D6 12GB",
    ]);
    expect(result).not.toBeNull();
    expect(result!.index).toBe(1);
    expect(result!.similarity).toBe(1.0);
  });

  it("유사한 후보 매칭 (모델번호 일치)", () => {
    const result = findBestMatch("ASUS RTX 4070", candidates);
    expect(result).not.toBeNull();
    expect(result!.index).toBe(0);
  });

  it("임계값 미달 시 null", () => {
    const result = findBestMatch("완전히 다른 제품", candidates, 0.8);
    expect(result).toBeNull();
  });

  it("표기만 다른 동일 제품은 매칭을 유지한다 (크로스포맷)", () => {
    // 하이픈 vs 공백
    expect(
      findBestMatch("인텔 코어 i7-14700K", ["Intel Core i7 14700K"])
    ).not.toBeNull();
    expect(findBestMatch("DDR5-6000", ["삼성 DDR5 6000 16GB"])).not.toBeNull();
    // 영문 Ryzen vs 한글 라이젠 (사이트별 언어 표기 차이)
    expect(
      findBestMatch("AMD 라이젠7 7800X3D", ["AMD Ryzen 7 7800X3D"])
    ).not.toBeNull();
    // 접미 붙임 vs 공백
    expect(findBestMatch("RTX 5070Ti", ["MSI RTX 5070 Ti"])).not.toBeNull();
  });

  it("GTX SUPER를 일반 GTX와 구분한다", () => {
    expect(findBestMatch("GTX 1660", ["GIGABYTE GTX 1660 SUPER"])).toBeNull();
  });

  it("Core Ultra 3자리 SKU에도 게이트가 작동한다", () => {
    // 265K vs 265KF는 다른 SKU
    expect(
      findBestMatch("Core Ultra 7 265K", ["Intel Core Ultra 7 265KF"])
    ).toBeNull();
    // 동일 SKU는 매칭 유지
    expect(
      findBestMatch("Core Ultra 7 265K", ["Intel Core Ultra 7 265K"])
    ).not.toBeNull();
  });
});
