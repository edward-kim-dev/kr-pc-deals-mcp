import { describe, it, expect } from "vitest";
import { buildProductListUrl } from "../../../src/providers/danawa/estimate-api.js";

describe("buildProductListUrl", () => {
  it("올바른 URL 생성 — categorySeq와 page 포함", () => {
    const url = buildProductListUrl(873, 1);
    expect(url).toContain("controller=estimateMain");
    expect(url).toContain("methods=product");
    expect(url).toContain("categorySeq=873");
    expect(url).toContain("page=1");
    expect(url).toContain("marketPlaceSeq=16");
  });

  it("page=3이면 URL에 page=3 포함", () => {
    const url = buildProductListUrl(876, 3);
    expect(url).toContain("page=3");
    expect(url).toContain("categorySeq=876");
  });

  it("keyword 지정 시 name= 파라미터 포함", () => {
    const url = buildProductListUrl(876, 1, "RTX 5090");
    expect(url).toContain("name=RTX+5090");
    expect(url).toContain("categorySeq=876");
  });
});
