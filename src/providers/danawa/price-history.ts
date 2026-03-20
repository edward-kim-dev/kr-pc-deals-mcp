import { fetchJson } from "../../utils/http.js";
import { getCached, setCached, buildCacheKey } from "../../core/cache.js";
import type { PriceHistory, PriceHistoryEntry } from "../../core/types.js";

interface DanawaPriceResponse {
  data?: {
    priceList?: Array<{
      date: string;
      minPrice: number;
      maxPrice: number;
    }>;
  };
  [key: string]: unknown;
}

export async function getPriceHistory(
  productCode: string,
  period: 1 | 3 | 6 | 12 = 3
): Promise<PriceHistory> {
  const cacheKey = buildCacheKey(
    "danawa",
    "priceHistory",
    productCode,
    String(period)
  );
  const cached = getCached<PriceHistory>(cacheKey);
  if (cached) return cached;

  const url = `https://prod.danawa.com/info/ajax/getProductPriceList.ajax.php?productCode=${productCode}&period=${period}`;

  try {
    const response = await fetchJson<DanawaPriceResponse>(url, "danawa", {
      headers: {
        Referer: `https://prod.danawa.com/info/?pcode=${productCode}`,
      },
    });

    const data: PriceHistoryEntry[] = (response.data?.priceList ?? []).map(
      (item) => ({
        date: item.date,
        minPrice: item.minPrice,
        maxPrice: item.maxPrice,
      })
    );

    const result: PriceHistory = {
      productCode,
      period,
      data,
    };

    setCached(cacheKey, result, "priceHistory");
    return result;
  } catch {
    // AJAX 엔드포인트가 실패하면 빈 결과 반환
    return { productCode, period, data: [] };
  }
}
