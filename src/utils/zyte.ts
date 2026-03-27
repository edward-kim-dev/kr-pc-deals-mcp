/**
 * Zyte API 프록시 클라이언트
 *
 * daiso-mcp의 올리브영 패턴을 참고:
 * - 직접 요청이 차단(403/429)될 때 Zyte API를 경유하여 우회
 * - Zyte가 IP 로테이션, Cloudflare 챌린지 우회, ban 관리를 자동 처리
 * - ZYTE_API_KEY 환경변수가 없으면 Zyte 비활성화
 */

import { ScrapingError } from "../core/errors.js";

const ZYTE_API_URL = "https://api.zyte.com/v1/extract";

interface ZyteExtractRequest {
  url: string;
  httpResponseBody?: boolean;
  httpResponseHeaders?: boolean;
  browserHtml?: boolean;
  httpRequestMethod?: string;
  httpRequestText?: string;
  customHttpRequestHeaders?: Array<{ name: string; value: string }>;
}

interface ZyteExtractResponse {
  url: string;
  statusCode?: number;
  httpResponseBody?: string; // base64 encoded
  httpResponseHeaders?: Array<{ name: string; value: string[] }>;
  browserHtml?: string;
}

function getZyteApiKey(): string | null {
  return process.env.ZYTE_API_KEY ?? null;
}

export function isZyteAvailable(): boolean {
  return getZyteApiKey() !== null;
}

/**
 * Zyte API를 통해 HTML 페이지를 가져옵니다.
 * browserHtml 모드: Zyte의 헤드리스 브라우저가 JS 렌더링 후 HTML 반환
 */
export async function zyteFetchHtml(
  url: string,
  source: string
): Promise<string> {
  const apiKey = getZyteApiKey();
  if (!apiKey) {
    throw new ScrapingError(
      source,
      "Zyte API 키가 설정되지 않았습니다. ZYTE_API_KEY 환경변수를 설정해주세요."
    );
  }

  const payload: ZyteExtractRequest = {
    url,
    browserHtml: true,
  };

  const response = await fetch(ZYTE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new ScrapingError(
      source,
      `Zyte API 오류 (HTTP ${response.status}): ${errorText}`,
      response.status
    );
  }

  const data = (await response.json()) as ZyteExtractResponse;

  if (data.browserHtml) {
    return data.browserHtml;
  }

  throw new ScrapingError(source, "Zyte API에서 HTML을 반환하지 않았습니다.");
}

/**
 * Zyte API를 통해 HTTP 요청을 프록시합니다.
 * httpResponseBody 모드: JS 렌더링 없이 순수 HTTP 응답 반환 (빠르고 저렴)
 */
export async function zyteFetchRaw(
  url: string,
  source: string,
  options?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }
): Promise<string> {
  const apiKey = getZyteApiKey();
  if (!apiKey) {
    throw new ScrapingError(
      source,
      "Zyte API 키가 설정되지 않았습니다. ZYTE_API_KEY 환경변수를 설정해주세요."
    );
  }

  const payload: ZyteExtractRequest = {
    url,
    httpResponseBody: true,
    httpResponseHeaders: true,
  };

  if (options?.method) {
    payload.httpRequestMethod = options.method;
  }

  if (options?.body) {
    payload.httpRequestText = options.body;
  }

  if (options?.headers) {
    payload.customHttpRequestHeaders = Object.entries(options.headers).map(
      ([name, value]) => ({ name, value })
    );
  }

  const response = await fetch(ZYTE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new ScrapingError(
      source,
      `Zyte API 오류 (HTTP ${response.status}): ${errorText}`,
      response.status
    );
  }

  const data = (await response.json()) as ZyteExtractResponse;

  if (data.httpResponseBody) {
    // base64 디코딩
    return Buffer.from(data.httpResponseBody, "base64").toString("utf-8");
  }

  throw new ScrapingError(source, "Zyte API에서 응답 본문을 반환하지 않았습니다.");
}

/**
 * Zyte API를 통해 HTTP 요청을 프록시하고, 응답 본문과 헤더를 모두 반환한다.
 * PCPartPicker 세션 초기화에 사용: HTML(본문)과 Set-Cookie(헤더) 모두 필요.
 */
export async function zyteFetchRawWithHeaders(
  url: string,
  source: string,
  options?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }
): Promise<{ body: string; headers: Array<{ name: string; value: string[] }> }> {
  const apiKey = getZyteApiKey();
  if (!apiKey) {
    throw new ScrapingError(
      source,
      "Zyte API 키가 설정되지 않았습니다. ZYTE_API_KEY 환경변수를 설정해주세요."
    );
  }

  const payload: ZyteExtractRequest = {
    url,
    httpResponseBody: true,
    httpResponseHeaders: true,
  };

  if (options?.method) {
    payload.httpRequestMethod = options.method;
  }

  if (options?.body) {
    payload.httpRequestText = options.body;
  }

  if (options?.headers) {
    payload.customHttpRequestHeaders = Object.entries(options.headers).map(
      ([name, value]) => ({ name, value })
    );
  }

  const response = await fetch(ZYTE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new ScrapingError(
      source,
      `Zyte API 오류 (HTTP ${response.status}): ${errorText}`,
      response.status
    );
  }

  const data = (await response.json()) as ZyteExtractResponse;

  if (!data.httpResponseBody) {
    throw new ScrapingError(
      source,
      "Zyte API에서 응답 본문을 반환하지 않았습니다."
    );
  }

  return {
    body: Buffer.from(data.httpResponseBody, "base64").toString("utf-8"),
    headers: data.httpResponseHeaders ?? [],
  };
}

/**
 * Zyte API를 통해 JSON 응답을 가져옵니다.
 */
export async function zyteFetchJson<T>(
  url: string,
  source: string,
  options?: {
    headers?: Record<string, string>;
  }
): Promise<T> {
  const body = await zyteFetchRaw(url, source, {
    headers: {
      Accept: "application/json",
      ...options?.headers,
    },
  });

  return JSON.parse(body) as T;
}
