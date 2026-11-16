import { describe, it, expect } from "vitest";
import { extractDehydratedQueries } from "../../src/utils/next-flight.js";
import { fixture } from "../helpers.js";

function page(payload: string, chunks = 1): string {
  const size = Math.ceil(payload.length / chunks);
  const parts = Array.from({ length: chunks }, (_, i) => payload.slice(i * size, (i + 1) * size));
  return parts.map((p) => `<script>self.__next_f.push([1,${JSON.stringify(p)}])</script>`).join("");
}

describe("extractDehydratedQueries", () => {
  it("조각으로 나뉜 페이지에서 React Query 항목을 꺼낸다", () => {
    const queries = extractDehydratedQueries(fixture("danawa-list.html"));
    const list = queries.find((q) => q.queryKey[0] === "productList");
    expect(list).toBeDefined();
    expect((list!.data as { products: unknown[] }).products).toHaveLength(4);
  });

  it("문자열 안의 중괄호에 속지 않는다", () => {
    const state = { state: { mutations: [], queries: [{ queryKey: ["x"], state: { data: { s: 'a } b { c "q"' } } }] } };
    const queries = extractDehydratedQueries(page(`7:${JSON.stringify(state)}\n`, 3));
    expect(queries).toEqual([{ queryKey: ["x"], data: { s: 'a } b { c "q"' } }]);
  });

  it("데이터가 없으면 빈 배열", () => {
    expect(extractDehydratedQueries("<html><body>없음</body></html>")).toEqual([]);
  });
});
