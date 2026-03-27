#!/usr/bin/env node
/**
 * kr-pc-deals-mcp — 한국 PC 부품 가격 비교 MCP 서버
 *
 * MCP(Model Context Protocol) 서버로, Claude 등 AI 어시스턴트가
 * 다나와/컴퓨존 가격 검색과 부품 호환성 체크를 수행할 수 있게 한다.
 *
 * 제공하는 도구:
 *   [검색] search_parts, get_product_detail, get_price_history
 *   [비교] compare_prices, find_lowest_price, list_by_category
 *   [빌드] build_add, build_remove, build_status, build_check_compatibility
 *   [시스템] proxy_status
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// 다나와/컴퓨존 프로바이더
import {
  searchDanawa, listByCategory, getProductDetail, getPriceHistory,
  getBuild, addPartToBuild, removePartFromBuild, checkBuildCompatibility,
} from "./providers/danawa/index.js";
import { searchCompuzone, getCompuzoneProductDetail } from "./providers/compuzone/index.js";

// 가격 비교 서비스
import { comparePrices, findLowestPrice } from "./services/price-compare.js";

// 유틸리티
import { formatPrice } from "./utils/format.js";
import { getProxyStatus } from "./utils/http.js";
import { isZyteAvailable } from "./utils/zyte.js";
import { ScrapingError } from "./core/errors.js";
import type { PartCategory } from "./core/types.js";
import { CATEGORY_LABELS } from "./core/types.js";

/** 에러 객체를 사용자 친화적인 텍스트로 변환한다 */
function errorToText(error: unknown): string {
  if (error instanceof ScrapingError) {
    if (error.statusCode === 429 || error.statusCode === 403) {
      return `⚠️ ${error.source} 사이트에서 요청이 차단되었습니다. 잠시 후 다시 시도해주세요.\n(너무 많은 요청으로 인한 일시적 차단)`;
    }
    return `❌ ${error.message}`;
  }
  return `❌ 오류 발생: ${error instanceof Error ? error.message : String(error)}`;
}

// MCP 도구의 category 파라미터에 사용되는 enum 값 목록
const PART_CATEGORIES = [
  "cpu", "gpu", "motherboard", "ram", "ssd", "hdd", "psu", "case", "cooler", "monitor",
] as const;

const server = new McpServer({
  name: "kr-pc-deals-mcp",
  version: "1.0.0",
});

// ─── 검색 도구 ───
// 다나와/컴퓨존에서 제품을 검색하고, 가격/스펙/판매처 정보를 조회한다.

server.tool(
  "search_parts",
  "PC 부품을 키워드로 검색합니다. 다나와, 컴퓨존 또는 양쪽 모두에서 검색할 수 있습니다.",
  {
    query: z.string().describe("검색 키워드 (예: 'RTX 4070 SUPER', 'i7-14700K')"),
    category: z.enum(PART_CATEGORIES).optional().describe("부품 카테고리 필터"),
    source: z.enum(["danawa", "compuzone", "all"]).default("all").describe("검색 소스"),
    limit: z.number().min(1).max(50).default(10).describe("결과 수 제한"),
  },
  async ({ query, category, source, limit }) => {
    try {
    const results: { source: string; name: string; price: string; url: string }[] = [];
    const errors: string[] = [];

    if (source === "danawa" || source === "all") {
      try {
        const danawaProducts = await searchDanawa(query, { category: category as PartCategory, limit });
        for (const p of danawaProducts) {
          results.push({
            source: "다나와",
            name: p.name,
            price: p.lowestPrice > 0 ? formatPrice(p.lowestPrice) : "가격 미정",
            url: p.productUrl,
          });
        }
      } catch (e) {
        errors.push(`다나와: ${errorToText(e)}`);
      }
    }

    if (source === "compuzone" || source === "all") {
      try {
        const czProducts = await searchCompuzone(query, { category: category as PartCategory, limit });
        for (const p of czProducts) {
          results.push({
            source: "컴퓨존",
            name: p.name,
            price: p.lowestPrice > 0 ? formatPrice(p.lowestPrice) : "가격 미정",
            url: p.productUrl,
          });
        }
      } catch (e) {
        errors.push(`컴퓨존: ${errorToText(e)}`);
      }
    }

    if (results.length === 0 && errors.length === 0) {
      return { content: [{ type: "text" as const, text: `"${query}" 검색 결과가 없습니다.` }] };
    }

    let text = results
      .map((r, i) => `${i + 1}. [${r.source}] ${r.name}\n   가격: ${r.price}\n   링크: ${r.url}`)
      .join("\n\n");

    if (errors.length > 0) {
      text += `\n\n⚠️ 일부 소스에서 오류 발생:\n${errors.join("\n")}`;
    }

    return { content: [{ type: "text" as const, text: `🔍 "${query}" 검색 결과 (${results.length}건)\n\n${text}` }] };
    } catch (error) {
      return { content: [{ type: "text" as const, text: errorToText(error) }] };
    }
  }
);

server.tool(
  "get_product_detail",
  "특정 제품의 상세 정보(스펙, 판매처별 가격)를 조회합니다.",
  {
    productCode: z.string().describe("제품 코드/ID"),
    source: z.enum(["danawa", "compuzone"]).describe("제품 출처"),
  },
  async ({ productCode, source }) => {
    if (source === "danawa") {
      const detail = await getProductDetail(productCode);
      const specText = Object.entries(detail.specs)
        .map(([k, v]) => `• ${k}: ${v}`)
        .join("\n");
      const priceText = detail.prices
        .sort((a, b) => a.totalPrice - b.totalPrice)
        .slice(0, 10)
        .map((p) => `• ${p.sellerName}: ${formatPrice(p.totalPrice)} (배송비 ${formatPrice(p.shippingCost)})`)
        .join("\n");

      return {
        content: [{
          type: "text" as const,
          text: `📦 다나와 제품 상세 (코드: ${productCode})\n\n` +
            `【스펙】\n${specText || "스펙 정보 없음"}\n\n` +
            `【판매처별 가격】\n${priceText || "가격 정보 없음"}`,
        }],
      };
    } else {
      const detail = await getCompuzoneProductDetail(productCode);
      const specText = Object.entries(detail.specs)
        .map(([k, v]) => `• ${k}: ${v}`)
        .join("\n");

      return {
        content: [{
          type: "text" as const,
          text: `📦 컴퓨존 제품 상세 (ID: ${productCode})\n\n` +
            `【스펙】\n${specText || "스펙 정보 없음"}\n\n` +
            `【가격】\n${detail.prices.map((p) => `• ${formatPrice(p.totalPrice)}`).join("\n") || "가격 정보 없음"}`,
        }],
      };
    }
  }
);

server.tool(
  "get_price_history",
  "다나와에서 특정 제품의 가격 변동 이력을 조회합니다.",
  {
    productCode: z.string().describe("다나와 제품 코드"),
    period: z.enum(["1", "3", "6", "12"]).default("3").describe("기간 (개월)"),
  },
  async ({ productCode, period }) => {
    const history = await getPriceHistory(productCode, parseInt(period) as 1 | 3 | 6 | 12);

    if (history.data.length === 0) {
      return {
        content: [{
          type: "text" as const,
          text: `제품 ${productCode}의 가격 이력을 조회할 수 없습니다.`,
        }],
      };
    }

    const lines = history.data.map(
      (d) => `${d.date}: 최저 ${formatPrice(d.minPrice)} / 최고 ${formatPrice(d.maxPrice)}`
    );

    return {
      content: [{
        type: "text" as const,
        text: `📈 가격 변동 이력 (최근 ${period}개월)\n\n${lines.join("\n")}`,
      }],
    };
  }
);

// ─── 가격 비교 도구 ───
// 다나와와 컴퓨존 간 동일 제품의 가격을 비교하고 최저가를 찾는다.

server.tool(
  "compare_prices",
  "동일 제품의 다나와/컴퓨존 간 가격을 비교합니다.",
  {
    query: z.string().describe("검색 키워드"),
    category: z.enum(PART_CATEGORIES).optional().describe("부품 카테고리"),
  },
  async ({ query, category }) => {
    const result = await comparePrices(query, { category: category as PartCategory });

    const lines: string[] = [];
    lines.push(`🔍 "${query}" 가격 비교 결과\n`);
    lines.push(`다나와: ${result.danawa.length}건 / 컴퓨존: ${result.compuzone.length}건\n`);

    if (result.matched.length > 0) {
      lines.push(`【매칭된 제품 비교】`);
      for (const m of result.matched) {
        lines.push(
          `\n• ${m.danawa.name}` +
          `\n  다나와: ${formatPrice(m.danawa.lowestPrice)}` +
          `\n  컴퓨존: ${formatPrice(m.compuzone.lowestPrice)}` +
          `\n  → ${m.cheaperSource === "danawa" ? "다나와" : "컴퓨존"}가 ${formatPrice(m.priceDiff)} 저렴`
        );
      }
    } else {
      lines.push("동일 제품 매칭 결과가 없습니다. 각 사이트 결과를 개별 확인해주세요.");
    }

    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
  }
);

server.tool(
  "find_lowest_price",
  "특정 부품의 다나와/컴퓨존 통합 최저가를 찾습니다.",
  {
    query: z.string().describe("검색 키워드"),
    category: z.enum(PART_CATEGORIES).optional().describe("부품 카테고리"),
  },
  async ({ query, category }) => {
    const cheapest = await findLowestPrice(query, { category: category as PartCategory });

    if (!cheapest) {
      return { content: [{ type: "text" as const, text: `"${query}" 검색 결과가 없습니다.` }] };
    }

    const sourceName = cheapest.source === "danawa" ? "다나와" : "컴퓨존";
    return {
      content: [{
        type: "text" as const,
        text: `💰 "${query}" 최저가\n\n` +
          `제품: ${cheapest.name}\n` +
          `가격: ${formatPrice(cheapest.lowestPrice)}\n` +
          `출처: ${sourceName}\n` +
          `링크: ${cheapest.productUrl}`,
      }],
    };
  }
);

server.tool(
  "list_by_category",
  "카테고리별 인기/최저가 PC 부품 목록을 조회합니다.",
  {
    category: z.enum(PART_CATEGORIES).describe("부품 카테고리"),
    sortBy: z.enum(["price", "popularity"]).default("popularity").describe("정렬 기준"),
    limit: z.number().min(1).max(30).default(10).describe("결과 수"),
  },
  async ({ category, sortBy, limit }) => {
    const products = await listByCategory(category as PartCategory, {
      sortBy: sortBy as "price" | "popularity",
      limit,
    });

    if (products.length === 0) {
      return {
        content: [{
          type: "text" as const,
          text: `${CATEGORY_LABELS[category as PartCategory]} 카테고리에서 제품을 찾을 수 없습니다.`,
        }],
      };
    }

    const sortLabel = sortBy === "price" ? "최저가순" : "인기순";
    const lines = products.map(
      (p, i) =>
        `${i + 1}. ${p.name}\n   가격: ${p.lowestPrice > 0 ? formatPrice(p.lowestPrice) : "가격 미정"}\n   링크: ${p.productUrl}`
    );

    return {
      content: [{
        type: "text" as const,
        text: `📋 ${CATEGORY_LABELS[category as PartCategory]} - ${sortLabel} (${products.length}건)\n\n${lines.join("\n\n")}`,
      }],
    };
  }
);

// ─── 빌드(견적) 도구 ───
//
// 다나와 가상견적의 호환성 체크 API를 활용한다.
// 부품을 추가한 뒤 호환성을 체크하면 CPU-메인보드-RAM 등의 호환 여부를 확인할 수 있다.
// 다나와 제품만 빌드에 추가 가능하며, 컴퓨존은 가격 비교 전용.
//
// 사용 흐름: search_parts/list_by_category로 검색 → build_add → build_check_compatibility
// 부품 추가 순서에 제한 없음.

server.tool(
  "build_add",
  "빌드에 다나와 부품을 추가합니다. 같은 카테고리의 기존 부품은 새 부품으로 교체됩니다. 2개 이상 추가 시 자동으로 호환성을 체크합니다.",
  {
    productId: z.string().describe("다나와 제품 코드 (다나와 제품 URL의 pcode= 값. 컴퓨존 제품은 사용 불가)"),
    category: z.enum(PART_CATEGORIES).describe("부품 카테고리"),
    name: z.string().describe("제품명 (빌드 상태 표시용)"),
    price: z.number().min(0).default(0).describe("가격 (원)"),
  },
  async ({ productId, category, name, price }) => {
    try {
      addPartToBuild({
        id: productId,
        category: category as PartCategory,
        name,
        price,
      });

      const build = getBuild();
      const buildLines = build.parts.map(
        (p) => `• ${CATEGORY_LABELS[p.category]}: ${p.name}${p.price > 0 ? ` (${formatPrice(p.price)})` : ""}`
      );

      const totalPrice = build.parts.reduce((sum, p) => sum + p.price, 0);

      let compatText = "";
      // 부품이 2개 이상이면 자동으로 호환성 체크
      if (build.parts.length >= 2) {
        try {
          const compat = await checkBuildCompatibility();
          if (compat.pairs.length > 0) {
            const pairLines = compat.pairs.map((pair) => {
              const icon = pair.result === "0001" ? "✅" : "⚠️";
              const msgs = Object.values(pair.messages).join(" / ");
              return `  ${icon} ${pair.parts[0]}-${pair.parts[1]}: ${msgs}`;
            });
            compatText = `\n\n【호환성 체크】\n${compat.compatible ? "✅ 모든 부품 호환 가능" : "⚠️ 호환성 문제 발견"}\n${pairLines.join("\n")}`;
          }
        } catch {
          compatText = "\n\n⚠️ 호환성 체크에 실패했습니다. build_check_compatibility로 다시 시도해보세요.";
        }
      }

      return {
        content: [{
          type: "text" as const,
          text: `✅ "${name}" 추가 완료!\n\n` +
            `【현재 빌드】\n${buildLines.join("\n")}` +
            (totalPrice > 0 ? `\n\n합계: ${formatPrice(totalPrice)}` : "") +
            compatText,
        }],
      };
    } catch (error) {
      return { content: [{ type: "text" as const, text: errorToText(error) }] };
    }
  }
);

server.tool(
  "build_remove",
  "빌드에서 특정 카테고리의 부품을 제거합니다.",
  {
    category: z.enum(PART_CATEGORIES).describe("제거할 부품의 카테고리"),
  },
  async ({ category }) => {
    removePartFromBuild(category as PartCategory);
    const build = getBuild();

    if (build.parts.length === 0) {
      return {
        content: [{
          type: "text" as const,
          text: `${CATEGORY_LABELS[category as PartCategory]} 부품을 제거했습니다. 빌드가 비어있습니다.`,
        }],
      };
    }

    const buildLines = build.parts.map(
      (p) => `• ${CATEGORY_LABELS[p.category]}: ${p.name}${p.price > 0 ? ` (${formatPrice(p.price)})` : ""}`
    );

    return {
      content: [{
        type: "text" as const,
        text: `${CATEGORY_LABELS[category as PartCategory]} 부품을 제거했습니다.\n\n` +
          `【현재 빌드】\n${buildLines.join("\n")}`,
      }],
    };
  }
);

server.tool(
  "build_status",
  "현재 빌드 상태(추가된 부품 목록, 합계 가격)를 조회합니다.",
  {},
  async () => {
    const build = getBuild();

    if (build.parts.length === 0) {
      return {
        content: [{
          type: "text" as const,
          text: "현재 빌드에 추가된 부품이 없습니다.\nbuild_start로 새 빌드를 시작하세요.",
        }],
      };
    }

    const buildLines = build.parts.map(
      (p) => `• ${CATEGORY_LABELS[p.category]}: ${p.name}${p.price > 0 ? ` (${formatPrice(p.price)})` : ""}`
    );
    const totalPrice = build.parts.reduce((sum, p) => sum + p.price, 0);

    return {
      content: [{
        type: "text" as const,
        text: `🖥️ 현재 빌드 (${build.parts.length}개 부품)\n\n${buildLines.join("\n")}` +
          (totalPrice > 0 ? `\n\n합계: ${formatPrice(totalPrice)}` : ""),
      }],
    };
  }
);

server.tool(
  "build_check_compatibility",
  "현재 빌드에 추가된 부품 간 호환성을 다나와 API로 체크합니다. CPU-메인보드 소켓, CPU-RAM 규격, RAM-메인보드 슬롯 등을 확인합니다.",
  {},
  async () => {
    try {
      const build = getBuild();

      if (build.parts.length < 2) {
        return {
          content: [{
            type: "text" as const,
            text: "호환성 체크에는 최소 2개의 부품이 필요합니다.\nbuild_add로 부품을 추가해주세요.",
          }],
        };
      }

      const result = await checkBuildCompatibility();

      if (result.pairs.length === 0) {
        return {
          content: [{
            type: "text" as const,
            text: "현재 빌드의 부품 조합에 대한 호환성 정보가 없습니다.\n(CPU, 메인보드, RAM 조합에서 호환성 체크가 지원됩니다.)",
          }],
        };
      }

      const pairLines = result.pairs.map((pair) => {
        const icon = pair.result === "0001" ? "✅" : "⚠️";
        const msgs = Object.values(pair.messages).join(" / ");
        return `${icon} ${pair.parts[0]} ↔ ${pair.parts[1]}: ${msgs}`;
      });

      const buildLines = build.parts.map(
        (p) => `• ${CATEGORY_LABELS[p.category]}: ${p.name}`
      );

      return {
        content: [{
          type: "text" as const,
          text: `🔍 호환성 체크 결과\n\n` +
            `【빌드 구성】\n${buildLines.join("\n")}\n\n` +
            `【호환성】\n${result.compatible ? "✅ 모든 부품 호환 가능" : "⚠️ 호환성 문제가 있습니다"}\n\n` +
            pairLines.join("\n"),
        }],
      };
    } catch (error) {
      return { content: [{ type: "text" as const, text: errorToText(error) }] };
    }
  }
);

// ─── 시스템 도구 ───
// 프록시 상태 확인, 디버깅용

server.tool(
  "proxy_status",
  "현재 프록시/차단 상태를 확인합니다. Zyte API 키 설정 여부, 사이트별 차단 상태, 자동 프록시 전환 여부를 보여줍니다.",
  {},
  async () => {
    const zyteAvailable = isZyteAvailable();
    const status = getProxyStatus();

    const lines: string[] = [];
    lines.push(`🌐 프록시 상태\n`);
    lines.push(`Zyte API: ${zyteAvailable ? "✅ 활성화 (API 키 설정됨)" : "❌ 비활성화 (ZYTE_API_KEY 미설정)"}`);
    lines.push("");

    for (const [source, info] of Object.entries(status)) {
      const statusIcon = info.blocked ? "🔴" : info.zyteActive ? "🟡" : "🟢";
      lines.push(
        `${statusIcon} ${source}: ` +
        `${info.blocked ? "차단됨" : "정상"} | ` +
        `Zyte 모드: ${info.zyteActive ? "ON" : "OFF"} | ` +
        `연속 실패: ${info.failCount}회`
      );
    }

    if (!zyteAvailable) {
      lines.push("");
      lines.push("💡 Tip: ZYTE_API_KEY 환경변수를 설정하면 차단 시 자동으로 Zyte 프록시를 경유합니다.");
      lines.push("   → https://www.zyte.com 에서 API 키를 발급받을 수 있습니다.");
    }

    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
  }
);

// ─── 서버 시작 ───
// stdio 전송 방식: Claude Desktop, MCP Inspector 등에서 stdin/stdout으로 통신

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  const zyteStatus = isZyteAvailable() ? "Zyte 프록시 활성화" : "Zyte 미설정 (직접 요청만 사용)";
  console.error(`kr-pc-deals-mcp 서버가 시작되었습니다. [${zyteStatus}]`);
}

main().catch((error) => {
  console.error("서버 시작 실패:", error);
  process.exit(1);
});
