import { InputError, ScrapingError } from "../core/errors.js";

const SOURCE_NAMES: Record<string, string> = {
  danawa: "다나와",
  "danawa-search": "다나와 검색",
  compuzone: "컴퓨존",
};

/** 오류를 사용자에게 보여줄 한 줄 문장으로 바꾼다 */
export function describeError(error: unknown): string {
  if (error instanceof ScrapingError) {
    const site = SOURCE_NAMES[error.source] ?? error.source;
    if (error.statusCode === 403 || error.statusCode === 429) {
      return `${site}: ${error.message} (요청이 많아 사이트가 잠시 막았거나 이 서버의 요청 한도에 걸렸습니다)`;
    }
    return `${site}: ${error.message}`;
  }
  if (error instanceof InputError) return error.message;
  return error instanceof Error ? error.message : String(error);
}
