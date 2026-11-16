import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getDanawaPriceHistory, parseDanawaPriceHistory } from "../../../src/providers/danawa/price-history.js";
import { fixture, restoreNetwork, SITE_ROUTES, stubFetch, useFastNetwork } from "../../helpers.js";

// 실제 다나와 응답 (ZOTAC RTX 5070 SOLID, 2026-11-16)
const periods = parseDanawaPriceHistory(JSON.parse(fixture("danawa-price-history.json")), "77319413");

describe("parseDanawaPriceHistory", () => {
  it("한 응답에서 1·3·6·12·24개월을 모두 꺼낸다", () => {
    expect(Object.keys(periods).sort((a, b) => Number(a) - Number(b))).toEqual(["1", "3", "6", "12", "24"]);
  });

  it("1·3개월은 주 단위, 6개월 이상은 월 단위이며 날짜를 네 자리 연도로 바꾼다", () => {
    expect(periods[1]).toMatchObject({ granularity: "week", periodMonths: 1 });
    expect(periods[1]!.points[0]).toEqual({ date: "2026-10-20", minPrice: 1291680 });
    expect(periods[6]).toMatchObject({ granularity: "month" });
    expect(periods[6]!.points[0]).toEqual({ date: "2026-06", minPrice: 944390 });
    expect(periods[24]!.points).toHaveLength(21);
  });

  it("한 주만 크게 떨어졌다 회복한 값을 suspicious로 표시하고 최저가 계산에서 뺀다", () => {
    const three = periods[3]!;
    expect(three.points.filter((p) => p.suspicious).map((p) => p.date)).toEqual(["2026-09-01", "2026-10-27"]);
    expect(three.lowest).toBe(1066990);
    expect(three.highest).toBe(1355520);
  });

  it("형식이 다른 응답은 '이력 없음'으로 넘기지 않고 오류를 낸다", () => {
    expect(() => parseDanawaPriceHistory({ data: { priceList: [] } }, "1")).toThrow("형식");
    expect(() => parseDanawaPriceHistory("<html>", "1")).toThrow("형식");
  });
});

describe("getDanawaPriceHistory", () => {
  beforeEach(useFastNetwork);
  afterEach(restoreNetwork);

  it("상품당 한 번만 요청하고 다른 기간은 저장된 응답에서 꺼낸다", async () => {
    const { calls } = stubFetch(SITE_ROUTES);
    const three = await getDanawaPriceHistory("77319413", 3);
    const year = await getDanawaPriceHistory("77319413", 12);
    expect(three.points).toHaveLength(12);
    expect(year.points).toHaveLength(12);
    expect(year.granularity).toBe("month");
    expect(calls).toHaveLength(1);
  });
});
