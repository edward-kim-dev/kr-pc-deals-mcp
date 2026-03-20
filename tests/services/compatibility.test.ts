import { describe, it, expect } from "vitest";
import {
  checkCompatibility,
  extractSocket,
  extractDDRType,
  extractWattage,
  extractTDP,
} from "../../src/services/compatibility.js";

describe("extractSocket", () => {
  it("LGA1700 소켓 추출", () => {
    expect(extractSocket({}, "인텔 코어 i7-14700K LGA1700")).toBe("LGA1700");
  });

  it("AM5 소켓 추출", () => {
    expect(extractSocket({}, "AMD 라이젠 7 7800X3D AM5")).toBe("AM5");
  });

  it("스펙에서 소켓 추출", () => {
    expect(extractSocket({ "CPU 소켓": "LGA 1700" }, "메인보드")).toBe("LGA1700");
  });

  it("소켓 정보 없으면 undefined", () => {
    expect(extractSocket({}, "일반 제품")).toBeUndefined();
  });
});

describe("extractDDRType", () => {
  it("DDR5 추출", () => {
    expect(extractDDRType({}, "삼성 DDR5-6000 16GB")).toBe("DDR5");
  });

  it("DDR4 추출", () => {
    expect(extractDDRType({}, "삼성 DDR4-3200 16GB")).toBe("DDR4");
  });
});

describe("extractWattage", () => {
  it("파워 와트 추출", () => {
    expect(extractWattage({}, "시소닉 FOCUS GX-850 850W")).toBe(850);
  });

  it("와트 정보 없으면 undefined", () => {
    expect(extractWattage({}, "알 수 없는 제품")).toBeUndefined();
  });
});

describe("extractTDP", () => {
  it("TDP 추출", () => {
    expect(extractTDP({ TDP: "125W" }, "CPU")).toBe(125);
  });

  it("이름에서 TDP 추출", () => {
    expect(extractTDP({}, "CPU TDP: 65W")).toBe(65);
  });
});

describe("checkCompatibility", () => {
  it("호환 가능한 구성", () => {
    const result = checkCompatibility({
      cpu: { socket: "LGA1700", tdp: 125 },
      motherboard: { socket: "LGA1700", ddrType: "DDR5" },
      ram: { ddrType: "DDR5" },
      psu: { wattage: 850 },
    });

    expect(result.compatible).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("소켓 불일치 감지", () => {
    const result = checkCompatibility({
      cpu: { socket: "LGA1700" },
      motherboard: { socket: "AM5" },
    });

    expect(result.compatible).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("소켓");
  });

  it("DDR 불일치 감지", () => {
    const result = checkCompatibility({
      motherboard: { ddrType: "DDR5" },
      ram: { ddrType: "DDR4" },
    });

    expect(result.compatible).toBe(false);
    expect(result.errors[0]).toContain("DDR");
  });

  it("PSU 부족 경고", () => {
    const result = checkCompatibility({
      cpu: { tdp: 253 },
      gpu: { tdp: 320 },
      psu: { wattage: 550 },
    });

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("PSU");
  });

  it("GPU-케이스 길이 초과", () => {
    const result = checkCompatibility({
      gpu: { length: 350 },
      case: { maxGpuLength: 300 },
    });

    expect(result.compatible).toBe(false);
    expect(result.errors[0]).toContain("GPU 길이");
  });
});

describe("checkCompatibility — 폼팩터 호환성", () => {
  it("ATX 케이스 + ATX 보드 — 호환", () => {
    const result = checkCompatibility({
      motherboard: { formFactor: "ATX" },
      case: { formFactor: "ATX" },
    });
    expect(result.compatible).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("ATX 케이스 + mATX 보드 — 호환 (ATX가 더 큼)", () => {
    const result = checkCompatibility({
      motherboard: { formFactor: "mATX" },
      case: { formFactor: "ATX" },
    });
    expect(result.compatible).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("mATX 케이스 + ATX 보드 — 비호환", () => {
    const result = checkCompatibility({
      motherboard: { formFactor: "ATX" },
      case: { formFactor: "mATX" },
    });
    expect(result.compatible).toBe(false);
    expect(result.errors[0]).toContain("폼팩터");
  });

  it("ITX 케이스 + ATX 보드 — 비호환", () => {
    const result = checkCompatibility({
      motherboard: { formFactor: "ATX" },
      case: { formFactor: "ITX" },
    });
    expect(result.compatible).toBe(false);
  });

  it("ATX 케이스 + ITX 보드 — 호환", () => {
    const result = checkCompatibility({
      motherboard: { formFactor: "ITX" },
      case: { formFactor: "ATX" },
    });
    expect(result.compatible).toBe(true);
  });
});
