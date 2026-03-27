/**
 * 다나와 견적 호환성 체크 모듈
 *
 * 다나와 가상견적의 호환성 체크 API를 활용하여
 * CPU-메인보드-RAM 등 부품 간 호환성을 확인한다.
 *
 * API 엔드포인트:
 *   GET /virtualestimate/?controller=estimateMain&methods=compatibility
 *       &productSeqList=id1,id2,id3
 *
 * 응답 예시:
 *   { "result": { "cpu-ram": { "result": "0001", ... }, ... } }
 *   result "0001" = 호환 문제 없음
 */

import { fetchJson } from "../../utils/http.js";
import { ESTIMATE_BASE_URL } from "./estimate-constants.js";
import type { PartCategory, BuildPart, Build, CompatibilityPair, CompatibilityResult } from "../../core/types.js";

// ─── 인메모리 빌드 상태 ───

let currentBuild: Build = {
  parts: [],
  createdAt: Date.now(),
};

/** 새 빌드를 시작한다 (기존 상태 초기화) */
export function startBuild(): Build {
  currentBuild = {
    parts: [],
    createdAt: Date.now(),
  };
  return currentBuild;
}

/** 현재 빌드 상태를 반환한다 */
export function getBuild(): Build {
  return currentBuild;
}

/** 빌드에 부품을 추가한다. 같은 카테고리의 기존 부품은 교체된다. */
export function addPartToBuild(part: BuildPart): Build {
  // 같은 카테고리가 이미 있으면 교체
  currentBuild.parts = currentBuild.parts.filter(
    (p) => p.category !== part.category
  );
  currentBuild.parts.push(part);
  return currentBuild;
}

/** 빌드에서 특정 카테고리의 부품을 제거한다 */
export function removePartFromBuild(category: PartCategory): Build {
  currentBuild.parts = currentBuild.parts.filter(
    (p) => p.category !== category
  );
  return currentBuild;
}

// ─── 호환성 체크 API ───

/** 다나와 호환성 API 원본 응답 구조 */
interface RawCompatibilityResponse {
  desc?: string;
  result?: Record<string, {
    result: string;
    optionList?: unknown[];
    [key: string]: unknown;
  }>;
}

/** 카테고리 코드 → PartCategory 매핑 */
const CODE_TO_CATEGORY: Record<string, PartCategory> = {
  "873": "cpu",
  "874": "ram",
  "875": "motherboard",
  "876": "gpu",
  "877": "hdd",
  "879": "case",
  "880": "psu",
  "887": "cooler",
  "32617": "ssd",
  "13735": "monitor",
};

/**
 * 다나와 호환성 API를 호출하여 부품 간 호환성을 확인한다.
 *
 * @param productIds 제품 시퀀스 ID 목록 (최소 2개)
 * @returns 호환성 결과
 */
export async function checkCompatibility(
  productIds: string[]
): Promise<CompatibilityResult> {
  if (productIds.length < 2) {
    return { compatible: true, pairs: [] };
  }

  const params = new URLSearchParams({
    controller: "estimateMain",
    methods: "compatibility",
    productSeqList: productIds.join(","),
    _: String(Date.now()),
  });

  const url = `${ESTIMATE_BASE_URL}?${params}`;

  const raw = await fetchJson<RawCompatibilityResponse>(url, "danawa", {
    headers: { Referer: ESTIMATE_BASE_URL },
  });

  if (!raw.result) {
    return { compatible: true, pairs: [] };
  }

  const pairs: CompatibilityPair[] = [];
  let allCompatible = true;

  for (const [pairKey, pairData] of Object.entries(raw.result)) {
    const isCompatible = pairData.result === "0001";
    if (!isCompatible) allCompatible = false;

    // pairKey 예: "cpu-ram", "cpu-mainboard", "ram-mainboard"
    const partNames = pairKey.split("-");
    const messages: Record<string, string> = {};

    // 응답에서 각 부품별 메시지를 추출
    for (const [key, value] of Object.entries(pairData)) {
      if (key.endsWith("Message") && typeof value === "string") {
        const partType = key.replace("Message", "");
        messages[partType] = value;
      }
    }

    pairs.push({
      result: pairData.result,
      parts: [partNames[0], partNames[1]] as [string, string],
      messages,
    });
  }

  return { compatible: allCompatible, pairs };
}

/**
 * 현재 빌드의 모든 부품에 대해 호환성을 체크한다.
 * 부품이 2개 미만이면 체크를 건너뛴다.
 */
export async function checkBuildCompatibility(): Promise<CompatibilityResult> {
  const ids = currentBuild.parts.map((p) => p.id);
  return checkCompatibility(ids);
}
