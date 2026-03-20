import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseEstimateProductList } from "../../../src/providers/danawa/estimate-parser.js";

const sampleHtml = readFileSync(
  join(process.cwd(), "tests/fixtures/estimate-product-sample.html"),
  "utf-8"
);

describe("parseEstimateProductList", () => {
  it("제품 목록 파싱 — 2개 추출", () => {
    const products = parseEstimateProductList(sampleHtml);
    expect(products).toHaveLength(2);
  });

  it("첫 번째 제품 ID는 21694499", () => {
    const products = parseEstimateProductList(sampleHtml);
    expect(products[0].id).toBe("21694499");
  });

  it("첫 번째 제품 이름 포함", () => {
    const products = parseEstimateProductList(sampleHtml);
    expect(products[0].name).toContain("7800X3D");
  });

  it("첫 번째 제품 가격 459000", () => {
    const products = parseEstimateProductList(sampleHtml);
    expect(products[0].price).toBe(459000);
  });

  it("productUrl 형식 확인", () => {
    const products = parseEstimateProductList(sampleHtml);
    expect(products[0].productUrl).toBe("https://prod.danawa.com/info/?pcode=21694499");
  });

  it("빈 HTML이면 빈 배열 반환", () => {
    expect(parseEstimateProductList("<div></div>")).toHaveLength(0);
  });
});
