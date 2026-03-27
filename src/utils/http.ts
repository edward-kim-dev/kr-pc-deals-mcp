/**
 * HTTP 요청 유틸리티
 *
 * 다나와/컴퓨존에 대한 모든 HTTP 요청을 관리한다.
 * - ConcurrencyLimiter: 사이트별 동시 요청 수 제한 (세마포어 패턴)
 * - 차단 감지: 429/403 응답 시 지수 백오프 + Zyte 프록시 자동 폴백
 * - fetchHtml/fetchJson: 재시도, 인코딩 변환, 프록시 폴백이 내장된 공개 함수
 */

import { ScrapingError } from "../core/errors.js";
import { isZyteAvailable, zyteFetchHtml, zyteFetchRaw, zyteFetchJson } from "./zyte.js";

// 차단 방지용 User-Agent 풀 (요청마다 랜덤 선택)
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:138.0) Gecko/20100101 Firefox/138.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
];

// ─── 사이트별 독립 동시성 제어 (세마포어 패턴) ───

/**
 * 세마포어 기반 동시성 제어기.
 * 기존 RateLimiter(직렬 2초 대기)를 대체하여 병렬 요청을 허용한다.
 * - maxConcurrent: 동시에 실행할 수 있는 최대 요청 수
 * - minIntervalMs: 요청 시작 간 최소 간격 (ms)
 */
export class ConcurrencyLimiter {
  // 현재 실행 중인 요청 수
  private running = 0;
  // 대기 중인 요청 큐 (resolve 함수를 저장)
  private queue: Array<() => void> = [];
  // 마지막 요청 시작 시각
  private lastRequestTime = 0;

  constructor(
    private maxConcurrent: number,
    private minIntervalMs: number
  ) {}

  /**
   * fn을 동시성 제한 내에서 실행한다.
   * 에러가 발생해도 세마포어가 반드시 해제된다.
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  // 세마포어 획득: 동시 실행 수가 초과되면 큐에서 대기
  private async acquire(): Promise<void> {
    // 최소 간격 대기
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.minIntervalMs) {
      await new Promise((r) => setTimeout(r, this.minIntervalMs - elapsed));
    }

    // 동시 실행 수 초과 시 큐에서 대기
    if (this.running >= this.maxConcurrent) {
      await new Promise<void>((resolve) => {
        this.queue.push(resolve);
      });
    }

    this.running++;
    this.lastRequestTime = Date.now();
  }

  // 세마포어 해제: 대기 중인 다음 요청을 깨운다
  private release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) next();
  }
}

// 사이트별 동시성 제어 설정
const limiters: Record<string, ConcurrencyLimiter> = {
  danawa: new ConcurrencyLimiter(3, 500),         // 견적 API: 공격적
  compuzone: new ConcurrencyLimiter(2, 1000),      // 일반 검색
  default: new ConcurrencyLimiter(2, 1000),
};

/** 소스별 동시성 제어기를 반환한다 */
export function getLimiter(source: string): ConcurrencyLimiter {
  return limiters[source] ?? limiters.default;
}

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// ─── 차단 감지 및 지수 백오프 ───
// 429(Too Many Requests) 또는 403(Forbidden) 응답을 받으면
// 해당 사이트를 일정 시간 차단 상태로 표시하고, 다음 요청은 Zyte를 경유한다.
// 백오프: 30초 → 60초 → 120초 → ... (최대 5분)

const blockStatus: Record<string, { blockedUntil: number; backoffMs: number }> = {};

/** 해당 사이트가 현재 차단 상태인지 확인 */
function isBlocked(source: string): boolean {
  const status = blockStatus[source];
  return !!status && Date.now() < status.blockedUntil;
}

/** 차단 상태로 표시 (지수 백오프 적용) */
function markBlocked(source: string, statusCode?: number): void {
  if (statusCode === 429 || statusCode === 403) {
    const current = blockStatus[source];
    const backoffMs = current
      ? Math.min(current.backoffMs * 2, 300000)  // 2배씩 증가, 최대 5분
      : 30000;  // 최초 30초
    blockStatus[source] = {
      blockedUntil: Date.now() + backoffMs,
      backoffMs,
    };
  }
}

/** 차단 상태 해제 (직접 요청 성공 시) */
function clearBlocked(source: string): void {
  delete blockStatus[source];
}

// ─── Zyte 프록시 자동 전환 ───
//
// 직접 요청이 연속 3회 실패하면 해당 사이트는 "Zyte 모드"로 전환된다.
// Zyte 모드에서는 모든 요청이 Zyte 프록시를 경유한다.
// 직접 요청이 성공하면 Zyte 모드가 해제된다.

const zyteMode: Record<string, { active: boolean; directFailCount: number }> = {};

/** Zyte 프록시를 사용해야 하는지 판단 */
function shouldUseZyte(source: string): boolean {
  // ZYTE_API_KEY가 없으면 사용 불가
  if (!isZyteAvailable()) return false;

  // 직접 요청이 차단된 상태면 Zyte 사용
  if (isBlocked(source)) return true;

  // 연속 실패 3회 이상이면 Zyte로 전환
  const state = zyteMode[source];
  return !!state && state.active;
}

/** 직접 요청 성공 — 차단/Zyte 상태 초기화 */
function recordDirectSuccess(source: string): void {
  clearBlocked(source);
  zyteMode[source] = { active: false, directFailCount: 0 };
}

/** 직접 요청 실패 — 차단 기록 + 3회 이상이면 Zyte 모드 활성화 */
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

/**
 * HTML 페이지를 GET으로 가져온다.
 *
 * 실행 흐름:
 *   1. Zyte 모드면 → 프록시 경유
 *   2. 직접 요청 (최대 retries+1회)
 *   3. 429/403이면 → Zyte 폴백 또는 에러
 *   4. EUC-KR 인코딩이면 → iconv-lite로 디코딩
 *   5. 전부 실패하면 → 마지막 시도에서 Zyte 폴백
 */
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
  const limiter = getLimiter(source);

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // 동시성 제어: limiter가 허용할 때까지 대기 후 요청 실행
      const response = await limiter.run(() => fetch(url, {
          headers: {
            "User-Agent": getRandomUserAgent(),
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
            "Accept-Encoding": "gzip, deflate, br",
            ...options?.headers,
          },
        }));

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

      // EUC-KR 등 비-UTF-8 인코딩 처리 (컴퓨존 응답에 사용)
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

      // 재시도 전 지수 백오프 대기: 1초 → 2초 → 4초 ... (최대 10초)
      const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new ScrapingError(source, "최대 재시도 횟수 초과");
}

/**
 * JSON API를 GET으로 호출한다.
 * fetchHtml과 동일한 차단 감지/Zyte 폴백 로직을 사용하지만,
 * Accept 헤더가 JSON용이고 재시도 로직은 없다 (1회 시도).
 */
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

  const limiter = getLimiter(source);

  // 동시성 제어 하에 JSON 요청 실행
  const response = await limiter.run(() => fetch(url, {
    headers: {
      "User-Agent": getRandomUserAgent(),
      Accept: "application/json, text/javascript, */*;q=0.01",
      "Accept-Language": "ko-KR,ko;q=0.9",
      "X-Requested-With": "XMLHttpRequest",
      ...options?.headers,
    },
  }));

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
