/**
 * 스크래핑/HTTP 요청 실패 시 사용하는 기본 에러.
 * source로 어느 사이트에서 실패했는지 구분한다.
 * statusCode가 429/403이면 차단으로 판단하여 Zyte 폴백을 시도한다.
 */
export class ScrapingError extends Error {
  constructor(
    public source: string,
    message: string,
    public statusCode?: number
  ) {
    super(`[${source}] ${message}`);
    this.name = "ScrapingError";
  }
}

/** 호환성 검사 실패 시 사용하는 에러 */
export class CompatibilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompatibilityError";
  }
}
