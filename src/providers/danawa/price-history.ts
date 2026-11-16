/**
 * 다나와 가격 변동 이력.
 *
 * GET https://prod.danawa.com/info/ajax/getProductPriceList.ajax.php?productCode={pcode}&period={개월}
 * 응답 한 번에 모든 기간이 들어 있다 (period 값과 상관없음):
 *   { "1":  { result: [{ Fulldate: "26-10-20", date: "10-20", minPrice: 1291680 }, …], minPrice, maxPrice },  // 주 단위
 *     "3":  { … 주 단위 },
 *     "6":  { result: [{ date: "26-06", minPrice: 944390 }, …] },  // 월 단위 (그 달의 가장 낮은 주간 최저가)
 *     "12": { … }, "24": { … } }
 * 시점마다 최저가 하나만 있고 최고가는 없다.
 *
 * ⚠️ 이 주소는 prod.danawa.com robots.txt가 막은 /info/ajax/ 아래에 있다.
 * 다른 공개 경로가 없어 사용자 결정(2026-11-16)으로 유지한다. 상품당 한 번만 받아 6시간 캐시한다.
 */

import { fetchJson } from "../../utils/http.js";
import { getCached, setCached, buildCacheKey } from "../../core/cache.js";
import { InputError, ScrapingError } from "../../core/errors.js";
import type { PriceHistory, PricePoint } from "../../core/types.js";
import { toWon } from "../../utils/text.js";
import { danawaProductUrl } from "./categories.js";

export const HISTORY_PERIODS = [1, 3, 6, 12, 24] as const;
export type HistoryPeriod = (typeof HISTORY_PERIODS)[number];

/** 앞뒤 시점보다 이만큼 낮았다가 회복한 주간 값은 판매처 등록 오류 같은 이상값으로 본다 */
const DIP_RATIO = 0.75;

export async function getDanawaPriceHistory(pcode: string, months: HistoryPeriod = 3): Promise<PriceHistory> {
  if (!/^\d+$/.test(pcode)) {
    throw new InputError(`다나와 상품 코드는 숫자입니다: "${pcode}"`);
  }
  const cacheKey = buildCacheKey("danawa", "priceHistory", pcode);
  let periods = getCached<Partial<Record<HistoryPeriod, PriceHistory>>>(cacheKey);

  if (!periods) {
    const url = `https://prod.danawa.com/info/ajax/getProductPriceList.ajax.php?productCode=${pcode}&period=${months}`;
    const response = await fetchJson<unknown>(url, "danawa", {
      headers: { Referer: danawaProductUrl(pcode), "X-Requested-With": "XMLHttpRequest" },
    });
    periods = parseDanawaPriceHistory(response, pcode);
    setCached(cacheKey, periods, "priceHistory");
  }

  return periods[months] ?? { productCode: pcode, periodMonths: months, granularity: "month", lowest: 0, highest: 0, points: [] };
}

/** 응답을 기간별 이력으로 바꾼다. 형식이 다르면 "이력 없음"으로 착각하지 않도록 오류를 던진다. */
export function parseDanawaPriceHistory(
  response: unknown,
  pcode: string
): Partial<Record<HistoryPeriod, PriceHistory>> {
  if (!isObject(response)) {
    throw new ScrapingError("danawa", "다나와 가격 이력 응답 형식이 예상과 다릅니다.");
  }

  const periods: Partial<Record<HistoryPeriod, PriceHistory>> = {};
  for (const months of HISTORY_PERIODS) {
    const period = response[String(months)];
    if (!isObject(period) || !Array.isArray(period.result)) continue;

    const raw: PricePoint[] = period.result
      .filter(isObject)
      .map((p) => ({ date: normalizeDate(p.Fulldate ?? p.date), minPrice: toWon(p.minPrice) }))
      .filter((p) => p.date !== "" && p.minPrice > 0);
    const granularity = raw.every((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.date)) ? "week" : "month";
    const points = granularity === "week" ? flagDips(raw) : raw;

    const reliable = points.filter((p) => !p.suspicious).map((p) => p.minPrice);
    periods[months] = {
      productCode: pcode,
      periodMonths: months,
      granularity,
      lowest: reliable.length > 0 ? Math.min(...reliable) : 0,
      highest: reliable.length > 0 ? Math.max(...reliable) : 0,
      points,
    };
  }

  if (Object.keys(periods).length === 0) {
    throw new ScrapingError("danawa", "다나와 가격 이력 응답 형식이 예상과 다릅니다.");
  }
  return periods;
}

/** "26-10-20" → "2026-10-20", "26-06" → "2026-06". 읽을 수 없으면 "" */
function normalizeDate(value: unknown): string {
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{2}|\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (!match) return "";
  const year = match[1].length === 2 ? `20${match[1]}` : match[1];
  return match[3] ? `${year}-${match[2]}-${match[3]}` : `${year}-${match[2]}`;
}

/** 앞뒤 주보다 크게 낮았다가 다시 오른 값(한 주짜리 급락)에 suspicious 표시를 붙인다 */
function flagDips(points: PricePoint[]): PricePoint[] {
  return points.map((point, i) => {
    const neighbors = [points[i - 1], points[i + 1]].filter((p): p is PricePoint => p !== undefined);
    const dip = neighbors.length > 0 && neighbors.every((n) => point.minPrice < n.minPrice * DIP_RATIO);
    return dip ? { ...point, suspicious: true } : point;
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
