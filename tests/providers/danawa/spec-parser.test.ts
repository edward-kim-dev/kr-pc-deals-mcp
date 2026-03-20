import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseSpecHtml, parseSpecString } from "../../../src/providers/danawa/spec-parser.js";

describe("parseSpecString", () => {
  it("AM5 소켓 추출", () => {
    const spec = parseSpecString("AMD(소켓AM5) / AMD B850 / DDR5");
    expect(spec.socket).toBe("AM5");
  });

  it("LGA1700 소켓 추출", () => {
    const spec = parseSpecString("인텔(소켓LGA1700) / Z790 / DDR5");
    expect(spec.socket).toBe("LGA1700");
  });

  it("DDR5 추출", () => {
    const spec = parseSpecString("AMD B850 / DDR5 / 8400MHz");
    expect(spec.ddrType).toBe("DDR5");
  });

  it("DDR4 추출", () => {
    const spec = parseSpecString("인텔 / DDR4 / 3200MHz");
    expect(spec.ddrType).toBe("DDR4");
  });

  it("ATX 폼팩터 추출", () => {
    const spec = parseSpecString("AMD B850 / DDR5 / ATX");
    expect(spec.formFactor).toBe("ATX");
  });

  it("mATX 폼팩터 추출", () => {
    const spec = parseSpecString("인텔 / DDR4 / mATX");
    expect(spec.formFactor).toBe("mATX");
  });

  it("ITX 폼팩터 추출", () => {
    const spec = parseSpecString("DDR5 / ITX");
    expect(spec.formFactor).toBe("ITX");
  });

  it("TDP 추출 — 콜론 형식", () => {
    const spec = parseSpecString("AMD / TDP:105W");
    expect(spec.tdp).toBe(105);
  });

  it("PSU 와트수 추출 — 단독 숫자W", () => {
    const spec = parseSpecString("1000W / ATX / 80PLUS GOLD");
    expect(spec.wattage).toBe(1000);
  });

  it("스펙 없는 문자열 — 모두 undefined", () => {
    const spec = parseSpecString("일반 제품 이름");
    expect(spec.socket).toBeUndefined();
    expect(spec.ddrType).toBeUndefined();
    expect(spec.formFactor).toBeUndefined();
    expect(spec.tdp).toBeUndefined();
    expect(spec.wattage).toBeUndefined();
  });
});

describe("parseSpecHtml", () => {
  it("HTML에서 .spec 텍스트 파싱 — 3개 추출", () => {
    const html = readFileSync(
      join(process.cwd(), "tests/fixtures/estimate-spec-sample.html"),
      "utf-8"
    );
    const specs = parseSpecHtml(html);
    expect(specs).toHaveLength(3);
    // 첫 번째 .spec은 AM5 소켓
    expect(specs[0].socket).toBe("AM5");
  });

  it("빈 HTML이면 빈 배열", () => {
    expect(parseSpecHtml("<div></div>")).toHaveLength(0);
  });
});
