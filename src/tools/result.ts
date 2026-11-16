/**
 * 도구 결과 만들기.
 * - 성공: structuredContent에 데이터를 넣고, 같은 JSON을 텍스트로도 넣는다 (MCP 스펙 권고).
 *   클라이언트마다 모델에 넘기는 쪽이 달라서(Claude Code는 structuredContent, 일부는 텍스트)
 *   안내 문구도 텍스트가 아니라 데이터의 notice 필드에 넣는다.
 * - 실패: isError: true와 고칠 방법이 담긴 메시지. 모델이 읽고 다시 시도할 수 있다.
 */

import type { CallToolResult } from "@modelcontextprotocol/server";
import { describeError } from "../services/errors.js";

export function toolResult<T extends Record<string, unknown>>(data: T): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data) }],
    structuredContent: data,
  };
}

export function toolError(errorOrMessage: unknown): CallToolResult {
  const message = typeof errorOrMessage === "string" ? errorOrMessage : describeError(errorOrMessage);
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

/** 외부 사이트를 읽기만 하는 도구의 annotations */
export const READ_ONLY_WEB = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;
