import { describe, it, expect, afterEach } from "vitest";
import {
  getCoupangProviderMode,
  isCoupangAvailable,
} from "../../../src/providers/coupang/mode.js";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("getCoupangProviderMode", () => {
  it("COUPANG_MODE 미설정 시 비활성(null)", () => {
    delete process.env.COUPANG_MODE;
    expect(getCoupangProviderMode()).toBeNull();
    expect(isCoupangAvailable()).toBe(false);
  });

  it("COUPANG_MODE=browser 이면 browser 모드", () => {
    process.env.COUPANG_MODE = "browser";
    expect(getCoupangProviderMode()).toBe("browser");
    expect(isCoupangAvailable()).toBe(true);
  });

  it("대소문자/공백 무관하게 인식", () => {
    process.env.COUPANG_MODE = "  BROWSER  ";
    expect(getCoupangProviderMode()).toBe("browser");
  });

  it("알 수 없는 값은 비활성", () => {
    process.env.COUPANG_MODE = "partners";
    expect(getCoupangProviderMode()).toBeNull();
    expect(isCoupangAvailable()).toBe(false);
  });

  it("파트너스 키가 있어도 browser 모드가 아니면 비활성", () => {
    delete process.env.COUPANG_MODE;
    process.env.COUPANG_ACCESS_KEY = "leftover-access";
    process.env.COUPANG_SECRET_KEY = "leftover-secret";
    expect(getCoupangProviderMode()).toBeNull();
    expect(isCoupangAvailable()).toBe(false);
  });
});
