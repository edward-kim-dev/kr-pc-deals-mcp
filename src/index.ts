#!/usr/bin/env node
/**
 * kr-pc-deals-mcp 실행 진입점 (npx kr-pc-deals-mcp).
 * stdio로 MCP 클라이언트와 통신한다. serveStdio가 클라이언트의 프로토콜 세대
 * (2025년 initialize 방식 / 2026-07-28 무상태 방식)를 가려 같은 createServer로 응답한다.
 * stdout은 프로토콜 전용이라 로그는 stderr로만 쓴다.
 */

import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createServer } from "./server.js";

const handle = serveStdio(() => createServer(), {
  onerror: (error) => console.error("[kr-pc-deals-mcp]", error),
});

const shutdown = () => void handle.close().finally(() => process.exit(0));
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

console.error("kr-pc-deals-mcp 서버가 시작되었습니다.");
