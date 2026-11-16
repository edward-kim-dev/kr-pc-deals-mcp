import NodeCache from "node-cache";

/** 종류별 캐시 유지 시간(초). 가격이 들어 있는 결과는 짧게 둔다. */
const TTL_SECONDS = {
  search: 1800, // 검색 결과 30분
  list: 1800, // 카테고리 목록 30분
  product: 3600, // 상품 상세 1시간
  priceHistory: 21600, // 가격 이력 6시간
  compatibility: 86400, // 호환성 검사 결과 24시간 (부품 조합이 같으면 결과도 같다)
} as const;

export type CacheKind = keyof typeof TTL_SECONDS;

const cache = new NodeCache({ checkperiod: 120, useClones: false });

export function getCached<T>(key: string): T | undefined {
  return cache.get<T>(key);
}

export function setCached<T>(key: string, value: T, kind: CacheKind): void {
  cache.set(key, value, TTL_SECONDS[kind]);
}

/** 캐시 키. 부분마다 경계를 지키도록 JSON으로 묶는다 ("RTX 5070:gpu" 검색어와 "RTX 5070" + gpu가 겹치지 않게) */
export function buildCacheKey(...parts: (string | number | undefined)[]): string {
  return JSON.stringify(parts.map((p) => p ?? null));
}

export function clearCache(): void {
  cache.flushAll();
}
