/**
 * 다나와 PC견적 호환성 검사.
 *
 * GET https://shop.danawa.com/virtualestimate/?controller=estimateMain&methods=compatibility&productSeqList=id1,id2,...
 * 응답: { result: { "cpu-ram": { result: "0001", cpuMessage: "...", ramMessage: "..." }, ... } }
 * 결과 코드 "0001"이 호환이다. 다나와는 CPU·메인보드·RAM 조합 위주로 판정한다.
 */

import { fetchJson } from "../../utils/http.js";
import { getCached, setCached, buildCacheKey } from "../../core/cache.js";
import { ScrapingError } from "../../core/errors.js";
import type { CompatibilityPair, CompatibilityResult } from "../../core/types.js";

const ESTIMATE_URL = "https://shop.danawa.com/virtualestimate/";
const COMPATIBLE_CODE = "0001";

export interface CompatibilityResponse {
  desc?: unknown;
  result?: unknown;
}

/** 다나와 상품 코드 목록(2개 이상)의 호환성을 검사한다 */
export async function checkDanawaCompatibility(productIds: string[]): Promise<CompatibilityResult> {
  if (productIds.length < 2) return { compatible: true, pairs: [] };

  const ids = [...productIds].sort();
  const cacheKey = buildCacheKey("danawa", "compatibility", ids.join(","));
  const cached = getCached<CompatibilityResult>(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({
    controller: "estimateMain",
    methods: "compatibility",
    productSeqList: ids.join(","),
  });
  const response = await fetchJson<CompatibilityResponse>(`${ESTIMATE_URL}?${params}`, "danawa", {
    headers: { Referer: ESTIMATE_URL, "X-Requested-With": "XMLHttpRequest" },
  });

  const result = parseCompatibilityResponse(response);
  setCached(cacheKey, result, "compatibility");
  return result;
}

/**
 * 응답을 부품 쌍 결과로 바꾼다.
 * result가 빈 배열이면 판정할 조합이 없는 것이고, 객체도 빈 배열도 아니면 형식 오류로 보고 던진다
 * (오류 응답을 "판정할 조합 없음"으로 착각해 캐시하지 않기 위해).
 */
export function parseCompatibilityResponse(response: CompatibilityResponse): CompatibilityResult {
  const result = response?.result;
  if (Array.isArray(result) && result.length === 0) return { compatible: true, pairs: [] };
  if (!isObject(result) || !Object.values(result).every(isObject)) {
    const desc = typeof response?.desc === "string" && response.desc.trim() ? `: ${response.desc.trim()}` : "";
    throw new ScrapingError("danawa", `다나와 호환성 검사 응답 형식이 예상과 다릅니다${desc}`);
  }

  const pairs: CompatibilityPair[] = [];
  for (const [pairKey, pair] of Object.entries(result as Record<string, Record<string, unknown>>)) {
    const [a = "", b = ""] = pairKey.split("-");
    const code = String(pair.result ?? "");
    const messages = Object.entries(pair)
      .filter(([key, value]) => key.endsWith("Message") && typeof value === "string" && value.trim())
      .map(([, value]) => (value as string).trim());
    pairs.push({
      parts: [a, b],
      compatible: code === COMPATIBLE_CODE,
      code,
      messages: [...new Set(messages)],
    });
  }
  return { compatible: pairs.every((p) => p.compatible), pairs };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
