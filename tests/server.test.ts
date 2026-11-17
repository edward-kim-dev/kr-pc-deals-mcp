/**
 * MCP 프로토콜 통합 테스트.
 * 실제 클라이언트처럼 InMemoryTransport로 서버에 붙어 tools/list와 tools/call을 보낸다.
 * 외부 사이트 요청은 고정 데이터로 바꾼다. SDK가 structuredContent를 outputSchema로 검증하므로
 * 성공 결과에 isError가 없으면 출력 스키마도 맞는 것이다.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Client, InMemoryTransport, type CallToolResult } from "@modelcontextprotocol/client";
import { createServer } from "../src/server.js";
import { restoreNetwork, SITE_ROUTES, stubFetch, useFastNetwork } from "./helpers.js";

async function connect() {
  const server = createServer();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  return (await client.callTool({ name, arguments: args })) as CallToolResult;
}

function text(result: CallToolResult): string {
  return result.content.map((c) => (c.type === "text" ? c.text : "")).join("\n");
}

const TOOL_NAMES = [
  "search_parts",
  "get_product_detail",
  "get_price_history",
  "compare_prices",
  "find_lowest_price",
  "list_by_category",
  "check_build",
];

const CPU = { category: "cpu", productId: "70531547", name: "AMD 라이젠7-6세대 9800X3D", price: 560190 };
const BOARD = { category: "motherboard", productId: "73892000", name: "GIGABYTE B850M AORUS ELITE", price: 208790 };
const RAM = { category: "ram", productId: "18965774", name: "KLEVV DDR5-5600 16GB", price: 60000, quantity: 2 };

describe("MCP 서버", () => {
  beforeEach(useFastNetwork);
  afterEach(restoreNetwork);

  it("도구 7개를 제목·설명·annotations·outputSchema와 함께 공개한다", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(TOOL_NAMES);
    for (const tool of tools) {
      expect(tool.title, tool.name).toBeTruthy();
      expect(tool.description, tool.name).toBeTruthy();
      expect(tool.outputSchema?.type, tool.name).toBe("object");
      // 모든 도구가 외부 사이트를 읽기만 한다
      expect(tool.annotations, tool.name).toEqual({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      });
    }
  });

  it("서버 정보와 사용 안내(instructions)를 준다", async () => {
    const client = await connect();
    expect(client.getServerVersion()).toMatchObject({ name: "kr-pc-deals-mcp" });
    expect(client.getInstructions()).toContain("check_build");
  });

  it("search_parts: 네 사이트 결과를 합치고, 텍스트에 같은 JSON을 싣는다", async () => {
    stubFetch(SITE_ROUTES);
    const client = await connect();
    const result = await call(client, "search_parts", { query: "RTX 5070", category: "gpu", limit: 3 });
    expect(result.isError).toBeFalsy();
    const data = result.structuredContent as { results: Array<{ source: string; id: string }>; errors: unknown[] };
    for (const source of ["danawa", "enuri", "kjwwang", "compuzone"]) {
      expect(data.results.filter((p) => p.source === source), source).toHaveLength(3);
    }
    expect(data.errors).toEqual([]);
    expect(JSON.parse(text(result))).toEqual(data);
  });

  it("search_parts: 모든 사이트가 실패하면 isError로 알린다", async () => {
    stubFetch([]);
    const client = await connect();
    const result = await call(client, "search_parts", { query: "RTX 5070" });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain("404");
  });

  it("get_product_detail: 네 사이트 상세를 돌려준다", async () => {
    stubFetch(SITE_ROUTES);
    const client = await connect();
    const danawa = await call(client, "get_product_detail", { source: "danawa", productId: "77319413" });
    expect(danawa.isError).toBeFalsy();
    expect(danawa.structuredContent).toMatchObject({ price: 1355310, cashPrice: 1190000, maker: "ZOTAC" });
    const compuzone = await call(client, "get_product_detail", { source: "compuzone", productId: "1219124" });
    expect(compuzone.isError).toBeFalsy();
    expect(compuzone.structuredContent).toMatchObject({ price: 1449000 });
    const enuri = await call(client, "get_product_detail", { source: "enuri", productId: "101644564" });
    expect(enuri.isError).toBeFalsy();
    expect(enuri.structuredContent).toMatchObject({ source: "enuri", price: 803620, cashPrice: 790000, maker: "삼성전자" });
    const kjwwang = await call(client, "get_product_detail", { source: "kjwwang", productId: "111161" });
    expect(kjwwang.isError).toBeFalsy();
    expect(kjwwang.structuredContent).toMatchObject({ source: "kjwwang", price: 1372380, maker: "ZOTAC" });
  });

  it("get_price_history: 기간별 최저가와 이상값 표시를 돌려준다", async () => {
    stubFetch(SITE_ROUTES);
    const client = await connect();
    const result = await call(client, "get_price_history", { productId: "77319413", months: "3" });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({
      periodMonths: 3,
      granularity: "week",
      lowest: 1066990,
      notice: expect.stringContaining("suspicious"),
    });
  });

  it("compare_prices / find_lowest_price / list_by_category가 스키마에 맞는 결과를 준다", async () => {
    stubFetch(SITE_ROUTES);
    const client = await connect();
    const compare = await call(client, "compare_prices", { query: "RTX 5070", category: "gpu" });
    expect(compare.isError).toBeFalsy();
    const groups = (compare.structuredContent as { groups: Array<{ products: Array<{ id: string }> }> }).groups;
    expect(groups.find((g) => g.products[0].id === "77379380")?.products.map((p) => p.id)).toEqual(["77379380", "132577674", "111192", "1219124"]);

    const lowest = await call(client, "find_lowest_price", { query: "RTX 5070 Ti", category: "gpu" });
    expect(lowest.isError).toBeFalsy();
    expect(lowest.structuredContent).toMatchObject({ model: "rtx5070ti", cheapest: { source: "enuri", id: "132215069" } });

    const list = await call(client, "list_by_category", { category: "gpu", sortBy: "price", limit: 2 });
    expect(list.isError).toBeFalsy();
    const listed = (list.structuredContent as { results: Array<{ source: string; price: number }>; errors: unknown[] });
    expect(listed.errors).toEqual([]);
    // 사이트마다 인기 상위 목록 중 가장 싼 2개
    expect(listed.results.map((p) => `${p.source}:${p.price}`)).toEqual([
      "danawa:698960", "danawa:746100",
      "enuri:670000", "enuri:1329000",
      "kjwwang:1372380", "kjwwang:1393100", // 견적왕 목록 POST는 검색 목록과 주소가 같아 검색 고정 데이터를 받는다
      "compuzone:374000", "compuzone:699000",
    ]);

    const one = await call(client, "list_by_category", { category: "gpu", source: "enuri", limit: 3 });
    expect((one.structuredContent as { results: Array<{ source: string }> }).results.map((p) => p.source)).toEqual(["enuri", "enuri", "enuri"]);
  });

  it("check_build: 합계·빠진 부품·호환성을 계산한다", async () => {
    const { calls } = stubFetch(SITE_ROUTES);
    const client = await connect();
    const result = await call(client, "check_build", { parts: [CPU, BOARD, RAM] });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({
      total: 560190 + 208790 + 60000 * 2,
      unpricedParts: [],
      missingCategories: ["ssd", "psu", "case"],
      compatibility: { checked: true, compatible: true },
    });
    const compat = calls.find((c) => c.url.includes("methods=compatibility"));
    expect(new URL(compat!.url).searchParams.get("productSeqList")).toBe("18965774,70531547,73892000");
  });

  it("check_build: 상품이 하나면 호환성 검사를 하지 않고 이유를 알려 준다", async () => {
    const { fn } = stubFetch(SITE_ROUTES);
    const client = await connect();
    const result = await call(client, "check_build", { parts: [{ ...CPU, price: 0 }] });
    expect(result.structuredContent).toMatchObject({
      total: 0,
      unpricedParts: [CPU.name],
      compatibility: { checked: false, compatible: null, pairs: [] },
      notice: expect.stringContaining("2개 이상"),
    });
    expect(fn).not.toHaveBeenCalled();
  });

  it("check_build: 호환성 검사가 실패해도 합계는 돌려준다", async () => {
    stubFetch([]);
    const client = await connect();
    const result = await call(client, "check_build", { parts: [CPU, BOARD] });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({
      total: 768980,
      compatibility: { checked: false },
      notice: expect.stringContaining("호환성 검사를 하지 못했습니다"),
    });
  });

  it("잘못된 입력은 isError로 돌려준다 (컴퓨존 형식이 아닌 코드)", async () => {
    const client = await connect();
    const result = await call(client, "check_build", { parts: [{ ...CPU, productId: "TH201_123" }] });
    expect(result.isError).toBe(true);
  });
});
