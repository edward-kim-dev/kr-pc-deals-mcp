/**
 * 쿠팡 파트너스 Open API HMAC-SHA256 인증.
 *
 * Authorization 헤더 형식:
 *   CEA algorithm=HmacSHA256, access-key={key}, signed-date={date}, signature={sig}
 *
 * signed-date: yyMMdd'T'HHmmss'Z' (UTC)
 * signature: HMAC_SHA256(secret_key, signed-date + method + path + query) → hex
 *
 * 공식 문서: https://partners.coupang.com (Open API 가이드)
 */

import crypto from "node:crypto";

export interface CoupangCredentials {
  accessKey: string;
  secretKey: string;
}

/** 환경변수에서 쿠팡 파트너스 키를 로드. 둘 다 있어야 활성. */
export function loadCoupangCredentials(): CoupangCredentials | null {
  const accessKey = process.env.COUPANG_ACCESS_KEY?.trim();
  const secretKey = process.env.COUPANG_SECRET_KEY?.trim();
  if (!accessKey || !secretKey) return null;
  return { accessKey, secretKey };
}

export function isCoupangAvailable(): boolean {
  return loadCoupangCredentials() !== null;
}

/** yyMMdd'T'HHmmss'Z' 포맷의 UTC 타임스탬프 생성 */
function getSignedDate(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    now.getUTCFullYear().toString().slice(2) +
    pad(now.getUTCMonth() + 1) +
    pad(now.getUTCDate()) +
    "T" +
    pad(now.getUTCHours()) +
    pad(now.getUTCMinutes()) +
    pad(now.getUTCSeconds()) +
    "Z"
  );
}

/**
 * 요청 URL(path + query)에 대해 Authorization 헤더 값을 생성한다.
 *
 * @param method HTTP 메서드 (GET/POST 등)
 * @param pathWithQuery URL의 path와 query 부분 (예: "/v2/.../search?keyword=cpu")
 * @param credentials 쿠팡 파트너스 키
 */
export function buildAuthorizationHeader(
  method: string,
  pathWithQuery: string,
  credentials: CoupangCredentials
): string {
  const signedDate = getSignedDate();
  const [path, query = ""] = pathWithQuery.split("?");
  const message = signedDate + method.toUpperCase() + path + query;

  const signature = crypto
    .createHmac("sha256", credentials.secretKey)
    .update(message)
    .digest("hex");

  return `CEA algorithm=HmacSHA256, access-key=${credentials.accessKey}, signed-date=${signedDate}, signature=${signature}`;
}
