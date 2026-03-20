import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isZyteAvailable } from "../../src/utils/zyte.js";
import { getProxyStatus } from "../../src/utils/http.js";

describe("Zyte 프록시 통합", () => {
  const originalEnv = process.env.ZYTE_API_KEY;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ZYTE_API_KEY = originalEnv;
    } else {
      delete process.env.ZYTE_API_KEY;
    }
  });

  describe("isZyteAvailable", () => {
    it("ZYTE_API_KEY 미설정 시 false", () => {
      delete process.env.ZYTE_API_KEY;
      expect(isZyteAvailable()).toBe(false);
    });

    it("ZYTE_API_KEY 설정 시 true", () => {
      process.env.ZYTE_API_KEY = "test-key-123";
      expect(isZyteAvailable()).toBe(true);
    });
  });

  describe("getProxyStatus", () => {
    it("초기 상태에서 모든 소스 정상", () => {
      const status = getProxyStatus();
      expect(status.danawa).toBeDefined();
      expect(status.compuzone).toBeDefined();
      expect(status.danawa.blocked).toBe(false);
      expect(status.danawa.zyteActive).toBe(false);
      expect(status.danawa.failCount).toBe(0);
    });
  });
});
