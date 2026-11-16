/** 배포 메타데이터가 서로 어긋나지 않는지 확인한다 (버전을 올릴 때 한쪽만 고치는 실수 방지) */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const server = JSON.parse(readFileSync("server.json", "utf8"));

describe("배포 메타데이터", () => {
  it("server.json의 이름이 package.json의 mcpName과 같다 (MCP Registry 검증 조건)", () => {
    expect(server.name).toBe(pkg.mcpName);
  });

  it("server.json 버전과 npm 패키지 버전이 package.json과 같다", () => {
    expect(server.version).toBe(pkg.version);
    expect(server.packages[0]).toMatchObject({ registryType: "npm", identifier: pkg.name, version: pkg.version });
  });

  it("Registry 설명은 100자 이하다", () => {
    expect(server.description.length).toBeLessThanOrEqual(100);
  });
});
