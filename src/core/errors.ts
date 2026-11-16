/**
 * 외부 사이트 요청·파싱 실패.
 * source로 어느 사이트에서 실패했는지 구분하고, statusCode가 403/429면 사이트가 요청을 막은 것이다.
 */
export class ScrapingError extends Error {
  constructor(
    public source: string,
    message: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = "ScrapingError";
  }
}

/** 사용자가 잘못된 값을 넘겼을 때 (예: 다나와 견적에 컴퓨존 상품 번호) */
export class InputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InputError";
  }
}
