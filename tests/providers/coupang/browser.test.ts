import { describe, it, expect, afterEach } from "vitest";
import { renderCoupangSearchPage } from "../../../src/providers/coupang/browser.js";
import { markBlocked, clearBlocked } from "../../../src/utils/http.js";
import { ScrapingError } from "../../../src/core/errors.js";

const S = "coupang-browser";

afterEach(() => clearBlocked(S));

describe("renderCoupangSearchPage — 회로 차단 선검사", () => {
  it("차단 상태면 브라우저를 실행하지 않고 429로 즉시 실패", async () => {
    // 직전에 403/429를 받아 차단된 상황을 재현.
    markBlocked(S, 429);

    const err = await renderCoupangSearchPage("RTX 5070").catch((e) => e);

    // 브라우저 launch 이전에 선검사로 던져지므로, 실제 브라우저 없이도 통과한다.
    expect(err).toBeInstanceOf(ScrapingError);
    expect((err as ScrapingError).statusCode).toBe(429);
  });
});
