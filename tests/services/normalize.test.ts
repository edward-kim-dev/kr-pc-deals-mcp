import { describe, it, expect } from "vitest";
import {
  normalizeProductName,
  extractModelNumber,
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

describe("extractModelNumber", () => {
  it("RTX 모델 추출", () => {
    expect(extractModelNumber("ASUS GeForce RTX 4070 SUPER")).toBe("rtx 4070 super");
  });

  it("RX 모델 추출", () => {
    expect(extractModelNumber("사파이어 Radeon RX 7900 XTX")).toBe("rx 7900 xtx");
  });

  it("인텔 CPU 모델 추출", () => {
    expect(extractModelNumber("인텔 코어 i7-14700K")).toBe("i7-14700k");
  });

  it("DDR 추출", () => {
    expect(extractModelNumber("삼성 DDR5-6000 16GB")).toBe("ddr5-6000");
  });

  it("모델 없으면 null", () => {
    expect(extractModelNumber("일반 제품")).toBeNull();
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

  it("모델번호 기반 정확 매칭", () => {
    const result = findBestMatch("RTX 4070 SUPER", [
      "ASUS RTX 4070 12GB",
      "MSI RTX 4060 Ti",
    ]);
    // RTX 4070 SUPER vs RTX 4070 - 모델번호가 다르므로 토큰 유사도로 폴백
    expect(result).not.toBeNull();
  });

  it("유사한 후보 매칭", () => {
    const result = findBestMatch("ASUS RTX 4070", candidates);
    expect(result).not.toBeNull();
    expect(result!.index).toBe(0);
  });

  it("임계값 미달 시 null", () => {
    const result = findBestMatch("완전히 다른 제품", candidates, 0.8);
    expect(result).toBeNull();
  });
});
