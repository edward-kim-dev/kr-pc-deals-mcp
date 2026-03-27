import { describe, it, expect } from "vitest";
import { ConcurrencyLimiter } from "../../src/utils/http.js";

describe("ConcurrencyLimiter", () => {
  it("동시 실행 수를 maxConcurrent 이하로 제한한다", async () => {
    const limiter = new ConcurrencyLimiter(2, 0);
    let running = 0;
    let maxRunning = 0;

    // 5개의 작업을 동시에 실행
    const tasks = Array.from({ length: 5 }, () =>
      limiter.run(async () => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        // 약간의 지연으로 동시 실행 감지
        await new Promise((r) => setTimeout(r, 20));
        running--;
      })
    );

    await Promise.all(tasks);

    // 동시 실행이 2를 초과하지 않아야 한다
    expect(maxRunning).toBeLessThanOrEqual(2);
    expect(running).toBe(0);
  });

  it("에러 발생 시에도 세마포어를 해제한다", async () => {
    const limiter = new ConcurrencyLimiter(1, 0);

    // 첫 번째 작업: 에러 발생
    await expect(
      limiter.run(async () => {
        throw new Error("테스트 에러");
      })
    ).rejects.toThrow("테스트 에러");

    // 세마포어가 해제되었으므로 다음 작업이 정상 실행되어야 한다
    const result = await limiter.run(async () => "성공");
    expect(result).toBe("성공");
  });

  it("fn의 반환값을 그대로 반환한다", async () => {
    const limiter = new ConcurrencyLimiter(1, 0);
    const result = await limiter.run(async () => 42);
    expect(result).toBe(42);
  });

  it("minIntervalMs가 요청 간 최소 간격을 보장한다", async () => {
    const limiter = new ConcurrencyLimiter(5, 50);
    const timestamps: number[] = [];

    // 3개의 순차적 요청
    for (let i = 0; i < 3; i++) {
      await limiter.run(async () => {
        timestamps.push(Date.now());
      });
    }

    // 두 번째 이후 요청은 최소 간격(50ms)을 지켜야 한다
    for (let i = 1; i < timestamps.length; i++) {
      const gap = timestamps[i] - timestamps[i - 1];
      // 타이머 정밀도를 고려하여 약간의 여유(40ms) 허용
      expect(gap).toBeGreaterThanOrEqual(40);
    }
  });

  it("모든 작업이 완료될 때까지 대기한다", async () => {
    const limiter = new ConcurrencyLimiter(2, 0);
    const results: number[] = [];

    const tasks = Array.from({ length: 4 }, (_, i) =>
      limiter.run(async () => {
        await new Promise((r) => setTimeout(r, 10));
        results.push(i);
        return i;
      })
    );

    const returned = await Promise.all(tasks);

    // 4개 작업 모두 완료
    expect(results).toHaveLength(4);
    expect(returned).toEqual([0, 1, 2, 3]);
  });
});
