import { ScrapingError } from "../core/errors.js";
import { isZyteAvailable, zyteFetchHtml, zyteFetchRaw, zyteFetchJson } from "./zyte.js";

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
];

// ─── 사이트별 독립 Rate Limiter ───

class RateLimiter {
  private lastRequestTime = 0;
  private queue: Array<() => void> = [];
  private processing = false;

  constructor(private minDelayMs: number) {}

  async acquire(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const now = Date.now();
      const elapsed = now - this.lastRequestTime;
      if (elapsed < this.minDelayMs) {
        await new Promise((r) => setTimeout(r, this.minDelayMs - elapsed));
      }
      this.lastRequestTime = Date.now();
      const next = this.queue.shift();
      next?.();
    }

    this.processing = false;
  }
}

const rateLimiters: Record<string, RateLimiter> = {
  danawa: new RateLimiter(2000),
  compuzone: new RateLimiter(2000),
  default: new RateLimiter(1500),
};

function getRateLimiter(source: string): RateLimiter {
  return rateLimiters[source] ?? rateLimiters.default;
}

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// ─── 차단 감지 및 지수 백오프 ───

const blockStatus: Record<string, { blockedUntil: number; backoffMs: number }> = {};

function isBlocked(source: string): boolean {
  const status = blockStatus[source];
  return !!status && Date.now() < status.blockedUntil;
}

function markBlocked(source: string, statusCode?: number): void {
  if (statusCode === 429 || statusCode === 403) {
    const current = blockStatus[source];
    const backoffMs = current
      ? Math.min(current.backoffMs * 2, 300000)
      : 30000;
    blockStatus[source] = {
      blockedUntil: Date.now() + backoffMs,
      backoffMs,
    };
  }
}

function clearBlocked(source: string): void {
  delete blockStatus[source];
}

// ─── Zyte 폴백 상태 추적 ───

// 사이트별로 직접 요청 연속 실패 시 자동으로 Zyte 경유 모드 전환
const zyteMode: Record<string, { active: boolean; directFailCount: number }> = {};

function shouldUseZyte(source: string): boolean {
  // ZYTE_API_KEY가 없으면 사용 불가
  if (!isZyteAvailable()) return false;

  // 직접 요청이 차단된 상태면 Zyte 사용
  if (isBlocked(source)) return true;

  // 연속 실패 3회 이상이면 Zyte로 전환
  const state = zyteMode[source];
  return !!state && state.active;
}

function recordDirectSuccess(source: string): void {
  clearBlocked(source);
  zyteMode[source] = { active: false, directFailCount: 0 };
}

function recordDirectFailure(source: string, statusCode?: number): void {
  markBlocked(source, statusCode);

  const state = zyteMode[source] ?? { active: false, directFailCount: 0 };
  state.directFailCount += 1;

  // 3회 연속 차단/실패 시 Zyte 모드 활성화
  if (state.directFailCount >= 3) {
    state.active = true;
    console.error(
      `[${source}] 직접 요청 ${state.directFailCount}회 연속 실패 → Zyte 프록시 모드 활성화`
    );
  }

  zyteMode[source] = state;
}

// ─── 공개 API ───

export interface FetchOptions {
  headers?: Record<string, string>;
  retries?: number;
  /** true면 Zyte 폴백 비활성화 (직접 요청만) */
  noProxy?: boolean;
  /** 응답 인코딩 (기본 UTF-8). EUC-KR 사이트는 "euc-kr" 지정 */
  encoding?: string;
}

export async function fetchHtml(
  url: string,
  source: string,
  options?: FetchOptions
): Promise<string> {
  // Zyte 모드일 때: 프록시 경유
  if (!options?.noProxy && shouldUseZyte(source)) {
    console.error(`[${source}] Zyte 프록시 경유: ${url}`);
    try {
      const html = await zyteFetchHtml(url, source);
      return html;
    } catch (zyteError) {
      // Zyte도 실패하면 에러 던짐
      throw zyteError;
    }
  }

  // 직접 요청
  const retries = options?.retries ?? 2;
  const limiter = getRateLimiter(source);

  for (let attempt = 0; attempt <= retries; attempt++) {
    await limiter.acquire();

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": getRandomUserAgent(),
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
          "Accept-Encoding": "gzip, deflate, br",
          ...options?.headers,
        },
      });

      if (response.status === 429 || response.status === 403) {
        recordDirectFailure(source, response.status);

        // 직접 요청 차단됐고 Zyte 사용 가능하면 즉시 폴백
        if (!options?.noProxy && isZyteAvailable()) {
          console.error(
            `[${source}] HTTP ${response.status} 차단 → Zyte 폴백 시도: ${url}`
          );
          return await zyteFetchHtml(url, source);
        }

        throw new ScrapingError(
          source,
          `HTTP ${response.status}: 요청이 차단되었습니다. ZYTE_API_KEY를 설정하면 프록시를 통해 우회할 수 있습니다.`,
          response.status
        );
      }

      if (!response.ok) {
        throw new ScrapingError(
          source,
          `HTTP ${response.status}: ${response.statusText}`,
          response.status
        );
      }

      recordDirectSuccess(source);
      if (options?.encoding && options.encoding.toLowerCase() !== "utf-8") {
        const { decode } = await import("iconv-lite");
        const buffer = await response.arrayBuffer();
        return decode(Buffer.from(buffer), options.encoding);
      }
      return await response.text();
    } catch (error) {
      if (
        error instanceof ScrapingError &&
        (error.statusCode === 429 || error.statusCode === 403)
      ) {
        throw error;
      }

      if (attempt === retries) {
        // 마지막 시도 실패 시 Zyte 폴백 시도
        if (!options?.noProxy && isZyteAvailable()) {
          console.error(
            `[${source}] 직접 요청 ${retries + 1}회 실패 → Zyte 폴백 시도: ${url}`
          );
          recordDirectFailure(source);
          return await zyteFetchHtml(url, source);
        }

        if (error instanceof ScrapingError) throw error;
        throw new ScrapingError(
          source,
          `요청 실패: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new ScrapingError(source, "최대 재시도 횟수 초과");
}

export async function fetchJson<T>(
  url: string,
  source: string,
  options?: FetchOptions
): Promise<T> {
  // Zyte 모드일 때: 프록시 경유
  if (!options?.noProxy && shouldUseZyte(source)) {
    console.error(`[${source}] Zyte 프록시 경유 (JSON): ${url}`);
    return await zyteFetchJson<T>(url, source, {
      headers: options?.headers,
    });
  }

  const limiter = getRateLimiter(source);
  await limiter.acquire();

  const response = await fetch(url, {
    headers: {
      "User-Agent": getRandomUserAgent(),
      Accept: "application/json, text/javascript, */*;q=0.01",
      "Accept-Language": "ko-KR,ko;q=0.9",
      "X-Requested-With": "XMLHttpRequest",
      ...options?.headers,
    },
  });

  if (response.status === 429 || response.status === 403) {
    recordDirectFailure(source, response.status);

    // Zyte 폴백
    if (!options?.noProxy && isZyteAvailable()) {
      console.error(
        `[${source}] HTTP ${response.status} 차단 → Zyte 폴백 (JSON): ${url}`
      );
      return await zyteFetchJson<T>(url, source, {
        headers: options?.headers,
      });
    }

    throw new ScrapingError(
      source,
      `HTTP ${response.status}: 요청이 차단되었습니다.`,
      response.status
    );
  }

  if (!response.ok) {
    throw new ScrapingError(
      source,
      `HTTP ${response.status}: ${response.statusText}`,
      response.status
    );
  }

  recordDirectSuccess(source);
  return (await response.json()) as T;
}

/**
 * 현재 프록시 상태를 조회합니다 (디버깅용).
 */
export function getProxyStatus(): Record<
  string,
  { blocked: boolean; zyteActive: boolean; failCount: number }
> {
  const sources = new Set([
    ...Object.keys(blockStatus),
    ...Object.keys(zyteMode),
    "danawa",
    "compuzone",
  ]);

  const result: Record<
    string,
    { blocked: boolean; zyteActive: boolean; failCount: number }
  > = {};

  for (const source of sources) {
    result[source] = {
      blocked: isBlocked(source),
      zyteActive: zyteMode[source]?.active ?? false,
      failCount: zyteMode[source]?.directFailCount ?? 0,
    };
  }

  return result;
}
