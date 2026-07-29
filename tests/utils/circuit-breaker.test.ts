import { describe, it, expect, afterEach } from "vitest";
import { isBlocked, markBlocked, clearBlocked } from "../../src/utils/http.js";

const S = "cb-test";

afterEach(() => clearBlocked(S));

describe("circuit breaker (isBlocked/markBlocked/clearBlocked)", () => {
  it("429/403만 차단으로 기록한다", () => {
    markBlocked(S, 500);
    expect(isBlocked(S)).toBe(false);
    markBlocked(S, 200);
    expect(isBlocked(S)).toBe(false);
    markBlocked(S, 429);
    expect(isBlocked(S)).toBe(true);
  });

  it("403도 차단으로 기록한다", () => {
    markBlocked(S, 403);
    expect(isBlocked(S)).toBe(true);
  });

  it("clearBlocked로 차단이 해제된다", () => {
    markBlocked(S, 429);
    expect(isBlocked(S)).toBe(true);
    clearBlocked(S);
    expect(isBlocked(S)).toBe(false);
  });

  it("source가 다르면 서로 격리된다", () => {
    markBlocked(S, 429);
    expect(isBlocked("other-source")).toBe(false);
  });
});
