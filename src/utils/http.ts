/**
 * HTTP 요청 유틸리티
 *
 * 다나와/컴퓨존에 대한 모든 HTTP 요청을 관리한다.
 * - ConcurrencyLimiter: 사이트별 동시 요청 수 제한 (세마포어 패턴)
 * - 차단 감지: 429/403 응답 시 지수 백오프로 일정 시간 차단 상태 유지
 * - fetchHtml/fetchJson: 재시도와 인코딩 변환이 내장된 공개 함수
 */

import { ScrapingError } from "../core/errors.js";

// 차단 방지용 User-Agent 풀 (요청마다 랜덤 선택)
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:138.0) Gecko/20100101 Firefox/138.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
];

// ─── 사이트별 독립 동시성 제어 (세마포어 패턴) ───

/**
 * 세마포어 기반 동시성 제어기.
 * - maxConcurrent: 동시에 실행할 수 있는 최대 요청 수
 * - minIntervalMs: 요청 시작 간 최소 간격 (ms)
 */
export class ConcurrencyLimiter {
  private running = 0;
  private queue: Array<() => void> = [];
  private lastRequestTime = 0;

  constructor(
    private maxConcurrent: number,
    private minIntervalMs: number
  ) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private async acquire(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.minIntervalMs) {
      await new Promise((r) => setTimeout(r, this.minIntervalMs - elapsed));
    }

    if (this.running >= this.maxConcurrent) {
      await new Promise<void>((resolve) => {
        this.queue.push(resolve);
      });
    }

    this.running++;
    this.lastRequestTime = Date.now();
  }

  private release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) next();
  }
}

const limiters: Record<string, ConcurrencyLimiter> = {
  danawa: new ConcurrencyLimiter(3, 500),
  compuzone: new ConcurrencyLimiter(2, 1000),
  coupang: new ConcurrencyLimiter(3, 200),    // 공식 API는 응답 빠름
  default: new ConcurrencyLimiter(2, 1000),
};

export function getLimiter(source: string): ConcurrencyLimiter {
  return limiters[source] ?? limiters.default;
}

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// ─── 차단 감지 및 지수 백오프 ───
// 429(Too Many Requests) 또는 403(Forbidden) 응답을 받으면
// 해당 사이트를 일정 시간 차단 상태로 표시한다.
// 백오프: 30초 → 60초 → 120초 → ... (최대 5분)

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

// ─── 공개 API ───

export interface FetchOptions {
  headers?: Record<string, string>;
  retries?: number;
  /** 응답 인코딩 (기본 UTF-8). EUC-KR 사이트는 "euc-kr" 지정 */
  encoding?: string;
}

/**
 * HTML 페이지를 GET으로 가져온다.
 *
 * 실행 흐름:
 *   1. 차단 상태면 즉시 에러
 *   2. 직접 요청 (최대 retries+1회, 지수 백오프 재시도)
 *   3. 429/403이면 → 차단 상태 기록 후 에러
 *   4. EUC-KR 인코딩이면 → iconv-lite로 디코딩
 */
export async function fetchHtml(
  url: string,
  source: string,
  options?: FetchOptions
): Promise<string> {
  if (isBlocked(source)) {
    throw new ScrapingError(
      source,
      `${source} 사이트가 일시적으로 차단 상태입니다. 잠시 후 다시 시도해주세요.`,
      429
    );
  }

  const retries = options?.retries ?? 2;
  const limiter = getLimiter(source);

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await limiter.run(() =>
        fetch(url, {
          headers: {
            "User-Agent": getRandomUserAgent(),
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
            "Accept-Encoding": "gzip, deflate, br",
            ...options?.headers,
          },
        })
      );

      if (response.status === 429 || response.status === 403) {
        markBlocked(source, response.status);
        throw new ScrapingError(
          source,
          `HTTP ${response.status}: 요청이 차단되었습니다. 잠시 후 다시 시도해주세요.`,
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

      clearBlocked(source);

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

/**
 * JSON API를 GET으로 호출한다.
 * fetchHtml과 동일한 차단 감지 로직을 사용하지만,
 * Accept 헤더가 JSON용이고 재시도 로직은 없다 (1회 시도).
 */
export async function fetchJson<T>(
  url: string,
  source: string,
  options?: FetchOptions
): Promise<T> {
  if (isBlocked(source)) {
    throw new ScrapingError(
      source,
      `${source} 사이트가 일시적으로 차단 상태입니다. 잠시 후 다시 시도해주세요.`,
      429
    );
  }

  const limiter = getLimiter(source);

  const response = await limiter.run(() =>
    fetch(url, {
      headers: {
        "User-Agent": getRandomUserAgent(),
        Accept: "application/json, text/javascript, */*;q=0.01",
        "Accept-Language": "ko-KR,ko;q=0.9",
        "X-Requested-With": "XMLHttpRequest",
        ...options?.headers,
      },
    })
  );

  if (response.status === 429 || response.status === 403) {
    markBlocked(source, response.status);
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

  clearBlocked(source);
  return (await response.json()) as T;
}
