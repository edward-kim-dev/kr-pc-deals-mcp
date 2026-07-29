/**
 * 쿠팡 검색 모드 판정.
 *
 * 쿠팡은 공식 파트너스 API를 사용하지 않고, 설치된 Chrome 계열 브라우저로
 * 공개 검색 페이지를 렌더링하는 브라우저 모드만 제공한다.
 *
 * 활성화: MCP 클라이언트 설정 env에 COUPANG_MODE=browser 지정.
 * (기본값은 비활성 — 무거운 브라우저 실행을 사용자가 명시적으로 opt-in 해야 한다.)
 */

export type CoupangProviderMode = "browser";

/**
 * 쿠팡 검색 방식을 결정한다.
 *
 * - COUPANG_MODE=browser: 설치된 Chrome 계열 브라우저로 공개 검색 페이지 렌더링
 * - 그 외/미설정: 비활성(null)
 */
export function getCoupangProviderMode(): CoupangProviderMode | null {
  const configured = process.env.COUPANG_MODE?.trim().toLowerCase();
  if (configured === "browser") return "browser";
  return null;
}

export function isCoupangAvailable(): boolean {
  return getCoupangProviderMode() !== null;
}
