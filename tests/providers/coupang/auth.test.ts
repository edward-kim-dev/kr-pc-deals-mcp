import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  loadCoupangCredentials,
  isCoupangAvailable,
  buildAuthorizationHeader,
} from "../../../src/providers/coupang/auth.js";

const ORIGINAL_ENV = { ...process.env };

function setKeys(access?: string, secret?: string) {
  if (access === undefined) delete process.env.COUPANG_ACCESS_KEY;
  else process.env.COUPANG_ACCESS_KEY = access;
  if (secret === undefined) delete process.env.COUPANG_SECRET_KEY;
  else process.env.COUPANG_SECRET_KEY = secret;
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("loadCoupangCredentials", () => {
  beforeEach(() => setKeys(undefined, undefined));

  it("두 키가 모두 없으면 null", () => {
    expect(loadCoupangCredentials()).toBeNull();
    expect(isCoupangAvailable()).toBe(false);
  });

  it("한 키만 있으면 null (둘 다 필요)", () => {
    setKeys("access-only", undefined);
    expect(loadCoupangCredentials()).toBeNull();
    expect(isCoupangAvailable()).toBe(false);

    setKeys(undefined, "secret-only");
    expect(loadCoupangCredentials()).toBeNull();
    expect(isCoupangAvailable()).toBe(false);
  });

  it("두 키가 모두 있으면 credentials 반환", () => {
    setKeys("my-access", "my-secret");
    expect(loadCoupangCredentials()).toEqual({
      accessKey: "my-access",
      secretKey: "my-secret",
    });
    expect(isCoupangAvailable()).toBe(true);
  });

  it("공백만 있는 키는 무효 처리", () => {
    setKeys("   ", "   ");
    expect(loadCoupangCredentials()).toBeNull();
  });

  it("키 앞뒤 공백은 trim", () => {
    setKeys("  access  ", "  secret  ");
    expect(loadCoupangCredentials()).toEqual({
      accessKey: "access",
      secretKey: "secret",
    });
  });
});

describe("buildAuthorizationHeader", () => {
  const credentials = { accessKey: "test-access", secretKey: "test-secret" };

  it("CEA HmacSHA256 형식의 헤더 생성", () => {
    const header = buildAuthorizationHeader(
      "GET",
      "/v2/products/search?keyword=cpu",
      credentials
    );
    expect(header).toMatch(/^CEA algorithm=HmacSHA256, /);
    expect(header).toContain("access-key=test-access");
    expect(header).toContain("signed-date=");
    expect(header).toContain("signature=");
  });

  it("signed-date는 yyMMdd'T'HHmmss'Z' 포맷", () => {
    const header = buildAuthorizationHeader("GET", "/path?q=1", credentials);
    const match = header.match(/signed-date=(\d{6}T\d{6}Z)/);
    expect(match).not.toBeNull();
  });

  it("signature는 64자리 hex (HMAC-SHA256)", () => {
    const header = buildAuthorizationHeader("GET", "/path?q=1", credentials);
    const match = header.match(/signature=([0-9a-f]+)/);
    expect(match).not.toBeNull();
    expect(match![1]).toHaveLength(64);
  });

  it("메서드/경로가 다르면 서명도 달라짐", () => {
    const sigOf = (h: string) => h.match(/signature=([0-9a-f]+)/)![1];
    const a = buildAuthorizationHeader("GET", "/path?q=1", credentials);
    const b = buildAuthorizationHeader("POST", "/path?q=1", credentials);
    const c = buildAuthorizationHeader("GET", "/other?q=1", credentials);
    // 서명 메시지 = signedDate + method + path + query 이므로 method/path 변화가 반영돼야 한다
    expect(sigOf(a)).not.toBe(sigOf(b));
    expect(sigOf(a)).not.toBe(sigOf(c));
  });
});
