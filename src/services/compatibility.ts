import type { CompatibilityCheck } from "../core/types.js";

interface PartSpecs {
  cpu?: { socket?: string; tdp?: number; name?: string };
  motherboard?: { socket?: string; ddrType?: string; formFactor?: string; name?: string };
  ram?: { ddrType?: string; speed?: number; capacity?: number; name?: string };
  gpu?: { length?: number; tdp?: number; name?: string };
  psu?: { wattage?: number; name?: string };
  case?: { maxGpuLength?: number; maxCoolerHeight?: number; formFactor?: string; name?: string };
  cooler?: { height?: number; socket?: string[]; name?: string };
}

// 스펙 문자열에서 핵심 정보 추출
export function extractSocket(specs: Record<string, string>, name: string): string | undefined {
  const socketPatterns = [
    /LGA\s*\d{4}/i,
    /AM[45]/i,
    /Socket\s*\w+/i,
  ];

  const text = `${name} ${Object.values(specs).join(" ")}`;
  for (const pattern of socketPatterns) {
    const match = text.match(pattern);
    if (match) return match[0].toUpperCase().replace(/\s+/g, "");
  }
  return undefined;
}

export function extractDDRType(specs: Record<string, string>, name: string): string | undefined {
  const text = `${name} ${Object.values(specs).join(" ")}`;
  const match = text.match(/DDR[45]/i);
  return match ? match[0].toUpperCase() : undefined;
}

export function extractWattage(specs: Record<string, string>, name: string): number | undefined {
  const text = `${name} ${Object.values(specs).join(" ")}`;
  const match = text.match(/(\d{3,4})\s*W/i);
  return match ? parseInt(match[1], 10) : undefined;
}

export function extractTDP(specs: Record<string, string>, name: string): number | undefined {
  const text = `${name} ${Object.values(specs).join(" ")}`;
  const tdpMatch = text.match(/TDP\s*[:：]?\s*(\d+)\s*W/i);
  if (tdpMatch) return parseInt(tdpMatch[1], 10);

  // 스펙 키에서 찾기
  for (const [key, value] of Object.entries(specs)) {
    if (/tdp|소비전력|전력/i.test(key)) {
      const num = parseInt(value.replace(/[^0-9]/g, ""), 10);
      if (num > 0) return num;
    }
  }
  return undefined;
}

export function checkCompatibility(parts: PartSpecs): CompatibilityCheck {
  const warnings: string[] = [];
  const errors: string[] = [];
  const details: Record<string, string> = {};

  // CPU ↔ 메인보드 소켓 호환성
  if (parts.cpu?.socket && parts.motherboard?.socket) {
    if (parts.cpu.socket !== parts.motherboard.socket) {
      errors.push(
        `CPU 소켓(${parts.cpu.socket})과 메인보드 소켓(${parts.motherboard.socket})이 일치하지 않습니다.`
      );
    } else {
      details["CPU-메인보드"] = `소켓 ${parts.cpu.socket} 호환 확인`;
    }
  } else if (parts.cpu && parts.motherboard) {
    warnings.push("CPU와 메인보드의 소켓 정보를 확인할 수 없습니다. 수동으로 확인해주세요.");
  }

  // 메인보드 ↔ RAM DDR 호환성
  if (parts.motherboard?.ddrType && parts.ram?.ddrType) {
    if (parts.motherboard.ddrType !== parts.ram.ddrType) {
      errors.push(
        `메인보드(${parts.motherboard.ddrType})와 RAM(${parts.ram.ddrType})의 DDR 규격이 일치하지 않습니다.`
      );
    } else {
      details["메인보드-RAM"] = `${parts.ram.ddrType} 호환 확인`;
    }
  }

  // 전체 전력 ↔ PSU
  if (parts.psu?.wattage) {
    const totalTDP =
      (parts.cpu?.tdp ?? 125) + (parts.gpu?.tdp ?? 200) + 100; // 기타 부품 100W 추산
    const recommended = Math.ceil(totalTDP / 0.8);

    if (parts.psu.wattage < recommended) {
      warnings.push(
        `예상 소비전력(${totalTDP}W) 대비 PSU(${parts.psu.wattage}W)가 부족할 수 있습니다. 권장: ${recommended}W 이상`
      );
    } else {
      details["전력"] = `PSU ${parts.psu.wattage}W / 예상 소비 ${totalTDP}W (여유 ${parts.psu.wattage - totalTDP}W)`;
    }
  }

  // GPU 길이 ↔ 케이스
  if (parts.gpu?.length && parts.case?.maxGpuLength) {
    if (parts.gpu.length > parts.case.maxGpuLength) {
      errors.push(
        `GPU 길이(${parts.gpu.length}mm)가 케이스 허용 길이(${parts.case.maxGpuLength}mm)를 초과합니다.`
      );
    } else {
      details["GPU-케이스"] = `GPU ${parts.gpu.length}mm / 케이스 허용 ${parts.case.maxGpuLength}mm`;
    }
  }

  // 쿨러 높이 ↔ 케이스
  if (parts.cooler?.height && parts.case?.maxCoolerHeight) {
    if (parts.cooler.height > parts.case.maxCoolerHeight) {
      errors.push(
        `쿨러 높이(${parts.cooler.height}mm)가 케이스 허용 높이(${parts.case.maxCoolerHeight}mm)를 초과합니다.`
      );
    }
  }

  // 케이스 ↔ 메인보드 폼팩터 호환성
  // ATX(3) ⊇ mATX(2) ⊇ ITX(1)
  const FORM_FACTOR_RANK: Record<string, number> = { ATX: 3, mATX: 2, ITX: 1 };

  if (parts.motherboard?.formFactor && parts.case?.formFactor) {
    const boardRank = FORM_FACTOR_RANK[parts.motherboard.formFactor] ?? 0;
    const caseRank = FORM_FACTOR_RANK[parts.case.formFactor] ?? 0;
    if (boardRank > caseRank) {
      errors.push(
        `메인보드 폼팩터(${parts.motherboard.formFactor})가 케이스(${parts.case.formFactor})에 맞지 않습니다.`
      );
    } else {
      details["케이스-메인보드"] = `${parts.case.formFactor} 케이스 / ${parts.motherboard.formFactor} 메인보드 호환 확인`;
    }
  }

  return {
    compatible: errors.length === 0,
    warnings,
    errors,
    details,
  };
}
