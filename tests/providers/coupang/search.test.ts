import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { searchCoupang } from "../../../src/providers/coupang/search.js";
import { clearCache } from "../../../src/core/cache.js";
import { ScrapingError } from "../../../src/core/errors.js";

const ORIGINAL_ENV = { ...process.env };

/** fetch를 지정한 Response 유사 객체로 스텁 */
function stubFetch(impl: () => Partial<Response> & { json?: () => Promise<unknown> }) {
  const fn = vi.fn(async () => impl() as Response);
  vi.stubGlobal("fetch", fn);
  return fn;
}

function okJson(body: unknown) {
  return { ok: true, status: 200, statusText: "OK", json: async () => body };
}

beforeEach(() => {
  clearCache();
  process.env.COUPANG_ACCESS_KEY = "test-access";
  process.env.COUPANG_SECRET_KEY = "test-secret";
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...ORIGINAL_ENV };
});

describe("searchCoupang", () => {
  it("키가 없으면 fetch 없이 빈 배열 반환", async () => {
    delete process.env.COUPANG_ACCESS_KEY;
    delete process.env.COUPANG_SECRET_KEY;
    const fetchMock = stubFetch(() => okJson({ rCode: "0", data: { productData: [] } }));

    const result = await searchCoupang("아무거나");
    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("productData를 Product[]로 변환", async () => {
    stubFetch(() =>
      okJson({
        rCode: "0",
        rMessage: "",
        data: {
          productData: [
            {
              productId: 12345,
              productName: "AMD 라이젠7 7800X3D",
              productPrice: 499000,
              productImage: "https://img/1.jpg",
              productUrl: "https://coupang/1",
              isRocket: true,
              categoryName: "CPU",
            },
          ],
        },
      })
    );

    const result = await searchCoupang("7800X3D", { category: "cpu" });
    expect(result).toHaveLength(1);
    const p = result[0];
    expect(p.id).toBe("12345");
    expect(p.source).toBe("coupang");
    expect(p.name).toBe("AMD 라이젠7 7800X3D");
    expect(p.category).toBe("cpu");
    expect(p.lowestPrice).toBe(499000);
    expect(p.prices[0].sellerName).toBe("쿠팡 로켓배송");
    expect(p.prices[0].totalPrice).toBe(499000);
    expect(p.prices[0].productUrl).toBe("https://coupang/1");
    expect(p.specs["카테고리"]).toBe("CPU");
    expect(p.imageUrl).toBe("https://img/1.jpg");
  });

  it("isRocket=false면 판매처명은 '쿠팡'", async () => {
    stubFetch(() =>
      okJson({
        rCode: "0",
        data: {
          productData: [
            {
              productId: 1,
              productName: "일반배송 상품",
              productPrice: 10000,
              productImage: "",
              productUrl: "https://coupang/x",
              isRocket: false,
            },
          ],
        },
      })
    );

    const result = await searchCoupang("일반배송");
    expect(result[0].prices[0].sellerName).toBe("쿠팡");
  });

  it("productData가 없으면 빈 배열", async () => {
    stubFetch(() => okJson({ rCode: "0", data: {} }));
    const result = await searchCoupang("결과없음");
    expect(result).toEqual([]);
  });

  it("HTTP 오류 시 ScrapingError", async () => {
    stubFetch(() => ({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      json: async () => ({}),
    }));
    await expect(searchCoupang("인증실패")).rejects.toBeInstanceOf(ScrapingError);
  });

  it("rCode가 '0'이 아니면 ScrapingError", async () => {
    stubFetch(() => okJson({ rCode: "ERROR", rMessage: "잘못된 요청" }));
    await expect(searchCoupang("에러코드")).rejects.toThrow(/잘못된 요청/);
  });

  it("동일 쿼리 재검색은 캐시 사용 (fetch 1회)", async () => {
    const fetchMock = stubFetch(() =>
      okJson({ rCode: "0", data: { productData: [] } })
    );
    await searchCoupang("캐시테스트");
    await searchCoupang("캐시테스트");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
