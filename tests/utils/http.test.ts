import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  ConcurrencyLimiter,
  clearBlocked,
  configureLimiters,
  fetchJson,
  fetchText,
  isBlocked,
  markBlocked,
} from "../../src/utils/http.js";
import { ScrapingError } from "../../src/core/errors.js";
import { eucKr, restoreNetwork, stubFetch, useFastNetwork } from "../helpers.js";

describe("fetchText / fetchJson", () => {
  beforeEach(useFastNetwork);
  afterEach(restoreNetwork);

  it("5xx는 다시 시도한다", async () => {
    let calls = 0;
    const { fn } = stubFetch([
      {
        match: /retry/,
        get status() {
          return calls++ === 0 ? 503 : 200;
        },
        body: () => "ok",
      },
    ]);
    await expect(fetchText("https://example.test/retry", "danawa")).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("404는 다시 시도하지 않는다", async () => {
    const { fn } = stubFetch([]);
    await expect(fetchText("https://example.test/missing", "danawa")).rejects.toMatchObject({ statusCode: 404 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("403을 받으면 그 사이트를 차단 상태로 두고 다음 요청은 보내지 않는다", async () => {
    const { fn } = stubFetch([{ match: /blocked/, body: () => "denied", status: 403 }]);
    await expect(fetchText("https://example.test/blocked", "compuzone")).rejects.toBeInstanceOf(ScrapingError);
    expect(isBlocked("compuzone")).toBe(true);
    await expect(fetchText("https://example.test/blocked", "compuzone")).rejects.toMatchObject({ statusCode: 429 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("대기열에 있던 요청은 앞 요청이 403을 받으면 보내지 않는다", async () => {
    configureLimiters({ compuzone: new ConcurrencyLimiter(1, 0) });
    const { fn } = stubFetch([{ match: /queued/, body: () => "denied", status: 403 }]);
    const results = await Promise.allSettled(
      [1, 2, 3].map((i) => fetchText(`https://example.test/queued/${i}`, "compuzone"))
    );
    expect(results.every((r) => r.status === "rejected")).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("이미 쉬는 중에 받은 403으로는 쉬는 시간을 늘리지 않는다", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(0);
      markBlocked("backoff-test", 403);
      vi.setSystemTime(1_000);
      markBlocked("backoff-test", 403); // 쉬는 중 → 30초 그대로
      vi.setSystemTime(31_000);
      expect(isBlocked("backoff-test")).toBe(false);
      markBlocked("backoff-test", 403); // 쉬는 시간이 끝난 뒤 다시 막힘 → 60초
      vi.setSystemTime(31_000 + 59_000);
      expect(isBlocked("backoff-test")).toBe(true);
    } finally {
      clearBlocked("backoff-test");
      vi.useRealTimers();
    }
  });

  it("EUC-KR 응답을 디코딩한다", async () => {
    stubFetch([{ match: /euckr/, body: () => eucKr("컴퓨존 지포스") }]);
    await expect(fetchText("https://example.test/euckr", "compuzone", { encoding: "euc-kr" })).resolves.toBe("컴퓨존 지포스");
  });

  it("JSON이 아니면 형식 오류를 낸다", async () => {
    stubFetch([{ match: /json/, body: () => "<html>" }]);
    await expect(fetchJson("https://example.test/json", "danawa")).rejects.toThrow("JSON");
  });

  it("모든 요청에 같은 User-Agent와 한국어 Accept-Language를 보낸다", async () => {
    const { calls } = stubFetch([{ match: /ua/, body: () => "ok" }]);
    await fetchText("https://example.test/ua1", "danawa");
    await fetchText("https://example.test/ua2", "danawa");
    expect(calls[0].headers["user-agent"]).toBeTruthy();
    expect(calls[0].headers["user-agent"]).toBe(calls[1].headers["user-agent"]);
    expect(calls[0].headers["accept-language"]).toMatch(/^ko-KR/);
  });
});
