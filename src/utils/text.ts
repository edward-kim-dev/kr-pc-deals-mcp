import * as cheerio from "cheerio";

/** HTML 조각을 일반 텍스트로 바꾼다 (태그 제거, 엔티티 디코딩, 공백 정리) */
export function htmlToText(html: string): string {
  if (!html) return "";
  if (!/[<&]/.test(html)) return collapseSpaces(html);
  return collapseSpaces(cheerio.load(`<body>${html}</body>`)("body").text());
}

export function collapseSpaces(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** "1,355,310원" 같은 문자열에서 첫 번째 금액을 정수로 읽는다. 없으면 0 */
export function parseWon(text: string | undefined | null): number {
  if (!text) return 0;
  const match = text.match(/\d[\d,]*/);
  return match ? Number.parseInt(match[0].replace(/,/g, ""), 10) || 0 : 0;
}

/** 숫자 또는 숫자 문자열을 원 단위 정수로 바꾼다. 읽을 수 없으면 0 */
export function toWon(value: unknown): number {
  const n = typeof value === "number" ? value : Number.parseInt(String(value ?? "").replace(/,/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}
