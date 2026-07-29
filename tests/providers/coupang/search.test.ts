import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// 실제 브라우저를 띄우지 않도록 browser 모듈을 모킹한다.
const { renderMock } = vi.hoisted(() => ({ renderMock: vi.fn() }));
vi.mock("../../../src/providers/coupang/browser.js", () => ({
  renderCoupangSearchPage: renderMock,
  closeCoupangBrowser: vi.fn(),
  findCoupangBrowserExecutable: vi.fn(() => "/fake/chrome"),
  COUPANG_SOURCE: "coupang-browser",
}));

import { searchCoupang } from "../../../src/providers/coupang/search.js";
import { clearCache } from "../../../src/core/cache.js";

function fixture(count: number): string {
  const items = Array.from({ length: count }, (_, i) => `
    <li data-id="v${i}">
      <a href="/vp/products/${1000 + i}?itemId=${i}&vendorItemId=${i}">
        <figure><img alt="테스트 부품 ${i}" src="https://img/${i}.jpg"></figure>
        <div class="PriceArea_priceArea__x"><div><span>${(i + 1) * 10},000원</span></div></div>
        <div data-badge-id="ROCKET_MERCHANT"></div>
      </a>
    </li>`).join("");
  return `<ul id="product-list">${items}</ul>`;
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  clearCache();
  renderMock.mockReset();
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("searchCoupang (browser mode)", () => {
  it("COUPANG_MODE 미설정 시 브라우저를 띄우지 않고 빈 배열", async () => {
    delete process.env.COUPANG_MODE;
    const result = await searchCoupang("7800X3D");
    expect(result).toEqual([]);
    expect(renderMock).not.toHaveBeenCalled();
  });

  it("browser 모드에서 렌더링된 HTML을 파싱해 반환", async () => {
    process.env.COUPANG_MODE = "browser";
    renderMock.mockResolvedValue(fixture(1));

    const result = await searchCoupang("7800X3D", { category: "cpu" });

    expect(renderMock).toHaveBeenCalledTimes(1);
    expect(renderMock).toHaveBeenCalledWith("7800X3D");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      source: "coupang",
      category: "cpu",
      lowestPrice: 10000,
    });
    expect(result[0].prices[0].sellerName).toBe("쿠팡 로켓배송");
  });

  it("limit으로 결과 수를 제한", async () => {
    process.env.COUPANG_MODE = "browser";
    renderMock.mockResolvedValue(fixture(5));

    const result = await searchCoupang("케이스", { limit: 2 });
    expect(result).toHaveLength(2);
  });

  it("동일 쿼리 재검색은 캐시 사용 (렌더 1회)", async () => {
    process.env.COUPANG_MODE = "browser";
    renderMock.mockResolvedValue(fixture(1));

    await searchCoupang("동일쿼리");
    await searchCoupang("동일쿼리");
    expect(renderMock).toHaveBeenCalledTimes(1);
  });
});
