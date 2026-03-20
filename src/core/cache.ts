import NodeCache from "node-cache";

const DEFAULT_TTL: Record<string, number> = {
  search: 1800, // 30분
  product: 3600, // 1시간
  priceHistory: 21600, // 6시간
  category: 86400, // 24시간
};

const cache = new NodeCache({ checkperiod: 120 });

export function getCached<T>(key: string): T | undefined {
  return cache.get<T>(key);
}

export function setCached<T>(
  key: string,
  value: T,
  type: keyof typeof DEFAULT_TTL = "search"
): void {
  cache.set(key, value, DEFAULT_TTL[type] ?? 1800);
}

export function buildCacheKey(...parts: (string | undefined)[]): string {
  return parts.filter(Boolean).join(":");
}

export function clearCache(): void {
  cache.flushAll();
}
