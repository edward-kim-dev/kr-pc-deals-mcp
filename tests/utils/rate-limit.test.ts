import { describe, it, expect } from "vitest";
import { ConcurrencyLimiter } from "../../src/utils/http.js";
import { ScrapingError } from "../../src/core/errors.js";

describe("ConcurrencyLimiter — 분당·일일 요청 상한", () => {
  it("quota 미설정 시 무제한 통과", async () => {
    const lim = new ConcurrencyLimiter(5, 0);
    for (let i = 0; i < 50; i++) {
      await expect(lim.run(async () => i)).resolves.toBe(i);
    }
  });

  it("분당 상한 초과 시 ScrapingError(429)로 거부", async () => {
    const lim = new ConcurrencyLimiter(5, 0, { maxPerMinute: 2, label: "test" });
    await lim.run(async () => 1);
    await lim.run(async () => 2);
    await expect(lim.run(async () => 3)).rejects.toMatchObject({
      statusCode: 429,
    });
  });

  it("일일 상한 초과 시 ScrapingError(429)로 거부", async () => {
    const lim = new ConcurrencyLimiter(5, 0, { maxPerDay: 3, label: "test" });
    await lim.run(async () => 1);
    await lim.run(async () => 1);
    await lim.run(async () => 1);
    const err = await lim.run(async () => 1).catch((e) => e);
    expect(err).toBeInstanceOf(ScrapingError);
    expect(err.statusCode).toBe(429);
    expect(err.message).toContain("하루");
  });

  it("분당 창이 지나면 카운터가 리셋된다 (슬라이딩 윈도우)", async () => {
    let clock = 1_000_000;
    const lim = new ConcurrencyLimiter(5, 0, {
      maxPerMinute: 2,
      now: () => clock,
    });
    await lim.run(async () => 1);
    await lim.run(async () => 1);
    // 같은 분(minute) 안에서 3번째는 거부
    await expect(lim.run(async () => 1)).rejects.toBeInstanceOf(ScrapingError);
    // 1분 경과 → 창이 비워져 다시 통과
    clock += 61_000;
    await expect(lim.run(async () => 1)).resolves.toBe(1);
  });

  it("동시 버스트에서도 분당 상한을 강제한다 (grant 시점 원자적 재검사)", async () => {
    // maxConcurrent>1 + minInterval>0 → 여러 요청이 grant 전에 진입한다.
    // 예전 구현은 stale 선검사만 하여 5건 모두 통과했지만, grant 시점 재검사로 상한이 강제된다.
    const lim = new ConcurrencyLimiter(5, 2, { maxPerMinute: 3, label: "burst" });
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => lim.run(async () => "ok"))
    );
    const fulfilled = results.filter((r) => r.status === "fulfilled").length;
    // 상한(3)을 절대 넘지 않아야 한다 (버그였다면 5건 전부 통과).
    expect(fulfilled).toBeLessThanOrEqual(3);
    expect(fulfilled).toBeGreaterThanOrEqual(1);
  });

  it("grant 시점 quota 거부가 대기 중인 다음 요청을 굶기지 않는다 (hang 방지)", async () => {
    // maxConcurrent=1 → 뒤 요청들은 큐에서 대기. 첫 요청이 유일한 quota를 소진하면
    // 큐에서 풀린 요청들은 grant 재검사에서 거부되며, 슬롯 반납으로 다음 요청이 깨어나야 한다.
    const lim = new ConcurrencyLimiter(1, 0, { maxPerMinute: 1, label: "starve" });
    const results = await Promise.allSettled([
      lim.run(async () => {
        await new Promise((r) => setTimeout(r, 10));
        return "a";
      }),
      lim.run(async () => "b"),
      lim.run(async () => "c"),
    ]);
    // hang 없이 첫 요청만 통과, 나머지 2건은 거부되어야 한다.
    expect(results.filter((r) => r.status === "fulfilled").length).toBe(1);
    expect(results.filter((r) => r.status === "rejected").length).toBe(2);
  });

  it("거부된 요청은 카운터를 소모하지 않는다", async () => {
    let clock = 5_000_000;
    const lim = new ConcurrencyLimiter(5, 0, {
      maxPerMinute: 1,
      now: () => clock,
    });
    await lim.run(async () => 1); // 1건 소모
    await expect(lim.run(async () => 1)).rejects.toBeTruthy(); // 거부(카운트 안 됨)
    clock += 61_000;
    // 직전 거부가 카운트됐다면 여기서도 막혀야 하지만, 소모 안 됐으므로 통과
    await expect(lim.run(async () => 1)).resolves.toBe(1);
  });
});
