import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { checkDanawaCompatibility, parseCompatibilityResponse } from "../../../src/providers/danawa/compatibility.js";
import { fixture, restoreNetwork, SITE_ROUTES, stubFetch, useFastNetwork } from "../../helpers.js";

describe("parseCompatibilityResponse", () => {
  it("부품 쌍마다 호환 여부와 안내 문구를 정리한다", () => {
    const result = parseCompatibilityResponse(JSON.parse(fixture("danawa-compatibility.json")));
    expect(result.compatible).toBe(true);
    expect(result.pairs.map((p) => p.parts)).toEqual([
      ["cpu", "ram"],
      ["cpu", "mainboard"],
      ["ram", "mainboard"],
    ]);
    expect(result.pairs[0]).toMatchObject({ compatible: true, code: "0001", messages: ["호환 문제 없습니다."] });
  });

  it("0001이 아닌 쌍이 하나라도 있으면 전체가 비호환이다", () => {
    const result = parseCompatibilityResponse({
      result: {
        "cpu-mainboard": { result: "0002", cpuMessage: "소켓이 다릅니다.", mainboardMessage: "소켓이 다릅니다." },
        "cpu-ram": { result: "0001", cpuMessage: "호환 문제 없습니다." },
      },
    });
    expect(result.compatible).toBe(false);
    expect(result.pairs[0]).toEqual({
      parts: ["cpu", "mainboard"],
      compatible: false,
      code: "0002",
      messages: ["소켓이 다릅니다."],
    });
  });
});

describe("parseCompatibilityResponse — 형식 확인", () => {
  it("result가 빈 배열이면 판정할 조합이 없는 것이다", () => {
    expect(parseCompatibilityResponse({ desc: "", result: [] })).toEqual({ compatible: true, pairs: [] });
  });

  it("오류 응답은 '조합 없음'으로 착각하지 않고 오류를 낸다", () => {
    expect(() => parseCompatibilityResponse({ desc: "일시적인 오류", result: null })).toThrow("일시적인 오류");
    expect(() => parseCompatibilityResponse({ result: "error" })).toThrow("형식");
  });
});

describe("checkDanawaCompatibility", () => {
  beforeEach(useFastNetwork);
  afterEach(restoreNetwork);

  it("부품이 2개 미만이면 요청하지 않는다", async () => {
    const { fn } = stubFetch(SITE_ROUTES);
    expect(await checkDanawaCompatibility(["123"])).toEqual({ compatible: true, pairs: [] });
    expect(fn).not.toHaveBeenCalled();
  });

  it("상품 코드를 productSeqList로 보낸다", async () => {
    const { calls } = stubFetch(SITE_ROUTES);
    await checkDanawaCompatibility(["70531547", "73892000", "18965774"]);
    expect(new URL(calls[0].url).searchParams.get("productSeqList")).toBe("18965774,70531547,73892000");
  });
});
