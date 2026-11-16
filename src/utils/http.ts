/**
 * 외부 사이트 HTTP 요청 계층.
 *
 * 모든 provider는 이 파일의 fetchText/fetchJson만 쓴다. 여기서 사이트별 규칙을 한곳에서 지킨다.
 * - ConcurrencyLimiter: 사이트별 동시 요청 수, 요청 간격, 분당·하루 상한
 * - 차단 감지: 403/429를 받으면 그 사이트를 잠시 쉬게 한다 (30초부터 두 배씩, 최대 5분)
 * - 타임아웃·재시도: 네트워크 오류와 5xx만 다시 시도한다
 * - 인코딩: EUC-KR 응답은 iconv-lite로 디코딩한다
 */

import { ScrapingError } from "../core/errors.js";

/** 모든 요청에 쓰는 User-Agent. 요청마다 바꾸지 않는다. */
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36";

const REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_RETRIES = 2;

// ─── 사이트별 동시성·속도 제어 (세마포어) ───

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

/**
 * ConcurrencyLimiter 옵션.
 * - maxPerMinute / maxPerDay: 슬라이딩 윈도우 요청 총량 상한. 넘으면 ScrapingError(429)로 바로 거부한다.
 * - label: 상한 초과 오류 메시지에 쓸 이름.
 * - now: 시각 함수 (테스트용). 기본 Date.now.
 */
export interface LimiterOptions {
  maxPerMinute?: number;
  maxPerDay?: number;
  label?: string;
  now?: () => number;
}

/**
 * 세마포어 기반 동시성 제어기.
 * - maxConcurrent: 동시에 실행할 수 있는 최대 요청 수
 * - minIntervalMs: 요청 시작 사이 최소 간격 (ms)
 * - options.maxPerMinute / maxPerDay: 분당·하루 누적 요청 상한
 */
export class ConcurrencyLimiter {
  private running = 0;
  private queue: Array<() => void> = [];
  private lastRequestTime = 0;
  /** 상한 집계용 요청 승인 시각 (슬라이딩 윈도우) */
  private requestTimes: number[] = [];

  constructor(
    private maxConcurrent: number,
    private minIntervalMs: number,
    private options: LimiterOptions = {}
  ) {}

  private now(): number {
    return this.options.now ? this.options.now() : Date.now();
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  /** 분당·하루 상한을 검사한다. 넘으면 ScrapingError(429)를 던진다. */
  private checkQuota(): void {
    const { maxPerMinute, maxPerDay, label } = this.options;
    if (!maxPerMinute && !maxPerDay) return;

    const now = this.now();
    this.requestTimes = this.requestTimes.filter((t) => now - t < DAY_MS);

    if (maxPerDay && this.requestTimes.length >= maxPerDay) {
      throw new ScrapingError(
        label ?? "rate-limit",
        `하루 요청 한도(${maxPerDay}건)를 넘었습니다. 내일 다시 시도해 주세요.`,
        429
      );
    }
    if (maxPerMinute) {
      const inMinute = this.requestTimes.filter((t) => now - t < MINUTE_MS).length;
      if (inMinute >= maxPerMinute) {
        throw new ScrapingError(
          label ?? "rate-limit",
          `분당 요청 한도(${maxPerMinute}건)를 넘었습니다. 1분 뒤 다시 시도해 주세요.`,
          429
        );
      }
    }
  }

  private async acquire(): Promise<void> {
    // 1) 이미 상한을 넘었으면 기다리지 않고 바로 거부한다.
    this.checkQuota();

    // 2) 동시성 슬롯과 최소 간격을 모두 만족할 때까지 기다린다.
    //    기다리는 동안 상태가 바뀔 수 있으므로 매번 처음부터 다시 검사한다.
    for (;;) {
      if (this.running >= this.maxConcurrent) {
        await new Promise<void>((resolve) => {
          this.queue.push(resolve);
        });
        continue;
      }
      const wait = this.minIntervalMs - (this.now() - this.lastRequestTime);
      if (wait > 0) {
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      break;
    }

    // 3) 슬롯을 먼저 잡은 뒤 상한을 await 없이 다시 검사한다.
    //    동시에 몰린 요청도 상한을 넘지 못하게 하려면 승인 시점에 검사해야 한다.
    //    거부할 때는 잡은 슬롯을 돌려줘 대기 중인 다음 요청이 막히지 않게 한다.
    this.running++;
    try {
      this.checkQuota();
    } catch (error) {
      this.release();
      throw error;
    }
    const grantTime = this.now();
    this.lastRequestTime = grantTime;
    if (this.options.maxPerMinute || this.options.maxPerDay) {
      this.requestTimes.push(grantTime);
    }
  }

  private release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) next();
  }
}

/**
 * 사이트별 요청 규칙.
 * - danawa-search: search.danawa.com. robots.txt의 Crawl-delay: 10을 지켜 10초에 한 번만 보낸다.
 * - danawa: prod.danawa.com(목록·상세), shop.danawa.com(호환성 검사)
 * - compuzone: www.compuzone.co.kr
 * - enuri: price.enuri.com, www.enuri.com. robots.txt의 Crawl-delay: 1을 지킨다.
 * - kjwwang: kjwwang.com (견적왕)
 */
function createDefaultLimiters(): Record<string, ConcurrencyLimiter> {
  return {
    "danawa-search": new ConcurrencyLimiter(1, 10_000, { label: "다나와 검색", maxPerMinute: 6, maxPerDay: 1000 }),
    danawa: new ConcurrencyLimiter(2, 1000, { label: "다나와", maxPerMinute: 30, maxPerDay: 3000 }),
    compuzone: new ConcurrencyLimiter(2, 1000, { label: "컴퓨존", maxPerMinute: 30, maxPerDay: 3000 }),
    enuri: new ConcurrencyLimiter(1, 1000, { label: "에누리", maxPerMinute: 30, maxPerDay: 2000 }),
    kjwwang: new ConcurrencyLimiter(1, 1000, { label: "견적왕", maxPerMinute: 30, maxPerDay: 2000 }),
    default: new ConcurrencyLimiter(1, 1000, { label: "사이트", maxPerMinute: 30, maxPerDay: 1000 }),
  };
}

let limiters = createDefaultLimiters();

function getLimiter(source: string): ConcurrencyLimiter {
  return limiters[source] ?? limiters.default;
}

/**
 * 테스트용: 사이트별 limiter를 바꾸거나(overrides), 인자 없이 부르면 기본값으로 되돌린다.
 */
export function configureLimiters(overrides?: Record<string, ConcurrencyLimiter>): void {
  limiters = { ...createDefaultLimiters(), ...overrides };
}

// ─── 차단 감지와 백오프 ───
// 403/429를 받으면 그 사이트를 잠시 차단 상태로 두고 요청을 보내지 않는다.
// 쉬는 시간이 끝난 뒤 또 막히면 30초 → 60초 → 120초 … 최대 5분까지 늘린다. 한 번 성공하면 초기화한다.

const blockStatus: Record<string, { blockedUntil: number; backoffMs: number }> = {};

/** 해당 source가 지금 차단(쉬는) 상태인지 */
export function isBlocked(source: string): boolean {
  const status = blockStatus[source];
  return !!status && Date.now() < status.blockedUntil;
}

/**
 * 403/429 응답을 받은 source를 차단 상태로 기록한다.
 * 이미 쉬는 중에 받은 응답(동시에 나갔던 요청들)으로는 쉬는 시간을 늘리지 않는다.
 */
export function markBlocked(source: string, statusCode?: number): void {
  if (statusCode !== 429 && statusCode !== 403) return;
  if (isBlocked(source)) return;
  const current = blockStatus[source];
  const backoffMs = current ? Math.min(current.backoffMs * 2, 300_000) : 30_000;
  blockStatus[source] = { blockedUntil: Date.now() + backoffMs, backoffMs };
}

function blockedError(source: string): ScrapingError {
  return new ScrapingError(source, "사이트가 요청을 잠시 막았습니다. 잠시 후 다시 시도해 주세요.", 429);
}

/** 요청이 성공하면 source의 차단 기록을 지운다 */
export function clearBlocked(source: string): void {
  delete blockStatus[source];
}

// ─── 공개 API ───

export interface FetchOptions {
  headers?: Record<string, string>;
  /** 응답 인코딩 (기본 UTF-8). EUC-KR 사이트는 "euc-kr" */
  encoding?: string;
  /** 네트워크 오류·5xx일 때 다시 시도할 횟수 (기본 2) */
  retries?: number;
  /** 기본 GET. 페이지가 쓰는 것과 같은 익명 폼 전송이 필요할 때만 POST */
  method?: "GET" | "POST";
  /** POST 본문. 폼이면 Content-Type 헤더를 함께 넘긴다 */
  body?: string;
}

/**
 * 문자열을 EUC-KR 바이트로 퍼센트 인코딩한다 (EUC-KR 사이트의 검색어·폼 값용).
 * 예: "라이젠" → "%B6%F3%C0%CC%C1%A8"
 */
export async function encodeEucKr(text: string): Promise<string> {
  const { encode } = await import("iconv-lite");
  return Array.from(encode(text, "euc-kr"))
    .map((byte) =>
      (byte >= 0x30 && byte <= 0x39) || (byte >= 0x41 && byte <= 0x5a) || (byte >= 0x61 && byte <= 0x7a) || "-_.~".includes(String.fromCharCode(byte))
        ? String.fromCharCode(byte)
        : `%${byte.toString(16).toUpperCase().padStart(2, "0")}`
    )
    .join("");
}

const HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
const JSON_ACCEPT = "application/json, text/javascript, */*;q=0.01";

/** HTML 등 텍스트 응답을 가져온다 */
export function fetchText(url: string, source: string, options?: FetchOptions): Promise<string> {
  return request(url, source, HTML_ACCEPT, options);
}

/** JSON 응답을 가져와 파싱한다 */
export async function fetchJson<T>(url: string, source: string, options?: FetchOptions): Promise<T> {
  const text = await request(url, source, JSON_ACCEPT, options);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ScrapingError(source, "응답이 JSON 형식이 아닙니다. 사이트 구조가 바뀌었을 수 있습니다.");
  }
}

async function request(
  url: string,
  source: string,
  accept: string,
  options?: FetchOptions
): Promise<string> {
  if (isBlocked(source)) throw blockedError(source);

  const retries = options?.retries ?? DEFAULT_RETRIES;
  const limiter = getLimiter(source);

  for (let attempt = 0; ; attempt++) {
    try {
      const response = await limiter.run(async () => {
        // 대기열에서 기다리는 동안 다른 요청이 차단을 받았을 수 있어, 보내기 직전에 다시 확인한다.
        if (isBlocked(source)) throw blockedError(source);
        const res = await fetch(url, {
          method: options?.method ?? "GET",
          body: options?.method === "POST" ? options.body : undefined,
          headers: {
            "User-Agent": USER_AGENT,
            Accept: accept,
            "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
            ...options?.headers,
          },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        // 차단은 슬롯을 돌려주기 전에 기록해, 대기 중인 다음 요청이 나가지 않게 한다.
        if (res.status === 429 || res.status === 403) {
          markBlocked(source, res.status);
          await discardBody(res);
          throw new ScrapingError(source, `HTTP ${res.status}: 사이트가 요청을 막았습니다.`, res.status);
        }
        return res;
      });

      if (!response.ok) {
        await discardBody(response);
        throw new ScrapingError(source, `HTTP ${response.status}: ${response.statusText}`, response.status);
      }

      clearBlocked(source);

      if (options?.encoding && options.encoding.toLowerCase() !== "utf-8") {
        const { decode } = await import("iconv-lite");
        return decode(Buffer.from(await response.arrayBuffer()), options.encoding);
      }
      return await response.text();
    } catch (error) {
      if (!isRetryable(error) || attempt >= retries) {
        if (error instanceof ScrapingError) throw error;
        throw new ScrapingError(source, `요청 실패: ${describeError(error)}`);
      }
      await new Promise((resolve) => setTimeout(resolve, Math.min(1000 * 2 ** attempt, 10_000)));
    }
  }
}

/** 읽지 않을 응답 본문을 닫아 연결을 돌려준다 */
async function discardBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // 이미 닫혔으면 할 일이 없다
  }
}

/** 네트워크 오류·타임아웃·5xx만 다시 시도한다. 4xx와 요청 상한 초과는 다시 시도하지 않는다. */
function isRetryable(error: unknown): boolean {
  if (error instanceof ScrapingError) {
    return error.statusCode !== undefined && error.statusCode >= 500;
  }
  return true;
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "TimeoutError") return `${REQUEST_TIMEOUT_MS / 1000}초 안에 응답이 없습니다.`;
    return error.message;
  }
  return String(error);
}
