/**
 * MCP 서버 구성.
 * createServer()는 도구 7개를 등록한 McpServer를 만든다. 전송(stdio 등)은 호출하는 쪽이 붙인다.
 * 서버는 상태를 갖지 않는다 (캐시·요청 제한은 프로세스 공용이며 결과에 영향을 주지 않는다).
 */

import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/server";
import { registerSearchTools } from "./tools/search.js";
import { registerCompareTools } from "./tools/compare.js";
import { registerBuildTools } from "./tools/build.js";

const pkg = createRequire(import.meta.url)("../package.json") as { version: string };

/** 모델에게 주는 서버 사용 안내. 무엇을 하는 서버인지와 도구를 잇는 순서를 앞에 둔다. */
export const SERVER_INSTRUCTIONS = `한국 PC 부품(CPU·그래픽카드·메인보드·RAM·SSD·HDD·파워·케이스·쿨러·모니터)의 실시간 가격을 다나와·에누리·견적왕·컴퓨존 공개 페이지에서 읽어 오는 서버입니다. 가격은 원 단위 정수이고 0은 가격 미정입니다.

조립 PC 견적 흐름:
1. list_by_category(카테고리 인기 목록)나 search_parts(키워드)로 후보를 찾습니다.
2. compare_prices로 같은 제품의 사이트별 가격을 비교하거나 find_lowest_price로 최저가를 고릅니다.
3. 고른 다나와 상품(id = pcode)을 모아 check_build로 합계·빠진 부품·호환성을 확인합니다. 서버는 견적을 저장하지 않으니 부품을 바꿀 때마다 전체 목록을 다시 넘기세요.

다나와 검색은 사이트 규칙(Crawl-delay)에 따라 10초에 한 번만 요청해서 연달아 부르면 기다립니다. 같은 검색은 30분 동안 저장된 결과를 씁니다. 답할 때 상품 링크를 함께 주고, 실제 결제 가격은 판매처에서 달라질 수 있다고 알려 주세요.`;

export function createServer(): McpServer {
  const server = new McpServer(
    {
      name: "kr-pc-deals-mcp",
      title: "한국 PC 부품 가격비교",
      version: pkg.version,
      description: "다나와·에누리·견적왕·컴퓨존 PC 부품 가격 비교와 조립 견적 호환성 검사",
      websiteUrl: "https://github.com/edward-kim-dev/kr-pc-deals-mcp",
    },
    { instructions: SERVER_INSTRUCTIONS }
  );

  registerSearchTools(server);
  registerCompareTools(server);
  registerBuildTools(server);
  return server;
}
