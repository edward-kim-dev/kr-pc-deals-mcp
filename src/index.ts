#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { searchDanawa, listByCategory, getProductDetail, getPriceHistory } from "./providers/danawa/index.js";
import { searchCompuzone, getCompuzoneProductDetail } from "./providers/compuzone/index.js";
import { comparePrices, findLowestPrice } from "./services/price-compare.js";
import { checkCompatibility, extractSocket, extractDDRType, extractTDP, extractWattage } from "./services/compatibility.js";
import { estimateBuild, optimizeBuild } from "./services/build-estimator.js";
import { formatPrice } from "./utils/format.js";
import { getProxyStatus } from "./utils/http.js";
import { isZyteAvailable } from "./utils/zyte.js";
import { ScrapingError } from "./core/errors.js";
import type { PartCategory, Purpose, Source } from "./core/types.js";
import { CATEGORY_LABELS } from "./core/types.js";

function errorToText(error: unknown): string {
  if (error instanceof ScrapingError) {
    if (error.statusCode === 429 || error.statusCode === 403) {
      return `⚠️ ${error.source} 사이트에서 요청이 차단되었습니다. 잠시 후 다시 시도해주세요.\n(너무 많은 요청으로 인한 일시적 차단)`;
    }
    return `❌ ${error.message}`;
  }
  return `❌ 오류 발생: ${error instanceof Error ? error.message : String(error)}`;
}

const PART_CATEGORIES = [
  "cpu", "gpu", "motherboard", "ram", "ssd", "hdd", "psu", "case", "cooler", "monitor",
] as const;

const server = new McpServer({
  name: "kr-pc-deals-mcp",
  version: "1.0.0",
});

// ─── 검색 도구 ───

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

// ─── PC 견적 도구 ───

server.tool(
  "estimate_build",
  "예산과 용도에 맞는 PC 조립 견적을 추천합니다.",
  {
    budget: z.number().min(300000).describe("예산 (원, 최소 30만원)"),
    purpose: z.enum(["gaming", "office", "workstation", "streaming"]).describe("용도"),
  },
  async ({ budget, purpose }) => {
    const estimate = await estimateBuild(budget, purpose as Purpose);

    const purposeLabels: Record<Purpose, string> = {
      gaming: "게이밍",
      office: "사무용",
      workstation: "워크스테이션",
      streaming: "방송/스트리밍",
    };

    const lines: string[] = [];
    lines.push(`🖥️ ${purposeLabels[purpose as Purpose]} PC 견적 (예산: ${formatPrice(budget)})\n`);

    for (const part of estimate.parts) {
      lines.push(
        `• ${CATEGORY_LABELS[part.category]}: ${part.product.name}` +
        `\n  가격: ${formatPrice(part.product.lowestPrice)} (배정: ${formatPrice(part.allocatedBudget)})` +
        `\n  링크: ${part.product.productUrl}`
      );
    }

    lines.push(`\n─────────────────`);
    lines.push(`총 금액: ${formatPrice(estimate.totalPrice)}`);
    lines.push(`잔액: ${formatPrice(estimate.remainingBudget)}`);

    if (estimate.warnings.length > 0) {
      lines.push(`\n【주의사항】`);
      for (const w of estimate.warnings) {
        lines.push(`• ${w}`);
      }
    }

    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
  }
);

server.tool(
  "check_compatibility",
  "선택한 PC 부품 간 호환성을 체크합니다.",
  {
    cpu: z.string().optional().describe("CPU 제품명 (예: '인텔 코어 i7-14700K')"),
    motherboard: z.string().optional().describe("메인보드 제품명"),
    ram: z.string().optional().describe("RAM 제품명"),
    gpu: z.string().optional().describe("그래픽카드 제품명"),
    psu: z.string().optional().describe("파워서플라이 제품명"),
  },
  async ({ cpu, motherboard, ram, gpu, psu }) => {
    const parts: Record<string, any> = {};

    if (cpu) {
      parts.cpu = {
        name: cpu,
        socket: extractSocket({}, cpu),
        tdp: extractTDP({}, cpu),
      };
    }
    if (motherboard) {
      parts.motherboard = {
        name: motherboard,
        socket: extractSocket({}, motherboard),
        ddrType: extractDDRType({}, motherboard),
      };
    }
    if (ram) {
      parts.ram = {
        name: ram,
        ddrType: extractDDRType({}, ram),
      };
    }
    if (gpu) {
      parts.gpu = { name: gpu, tdp: extractTDP({}, gpu) };
    }
    if (psu) {
      parts.psu = { name: psu, wattage: extractWattage({}, psu) };
    }

    const result = checkCompatibility(parts);

    const lines: string[] = [];
    lines.push(`🔧 호환성 체크 결과: ${result.compatible ? "✅ 호환 가능" : "❌ 호환 문제 발견"}\n`);

    if (result.errors.length > 0) {
      lines.push(`【오류】`);
      for (const e of result.errors) lines.push(`❌ ${e}`);
    }

    if (result.warnings.length > 0) {
      lines.push(`\n【경고】`);
      for (const w of result.warnings) lines.push(`⚠️ ${w}`);
    }

    if (Object.keys(result.details).length > 0) {
      lines.push(`\n【상세】`);
      for (const [k, v] of Object.entries(result.details)) {
        lines.push(`✅ ${k}: ${v}`);
      }
    }

    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
  }
);

server.tool(
  "optimize_build",
  "기존 PC 견적을 가격 또는 성능 기준으로 최적화합니다.",
  {
    parts: z
      .array(
        z.object({
          category: z.enum(PART_CATEGORIES),
          productName: z.string(),
          price: z.number(),
        })
      )
      .describe("현재 부품 목록"),
    optimizeFor: z.enum(["price", "performance"]).default("price").describe("최적화 기준"),
  },
  async ({ parts, optimizeFor }) => {
    const result = await optimizeBuild(
      parts.map((p) => ({
        category: p.category as PartCategory,
        productName: p.productName,
        price: p.price,
      })),
      optimizeFor as "price" | "performance"
    );

    if (result.suggestions.length === 0) {
      return {
        content: [{
          type: "text" as const,
          text: "현재 견적에서 더 나은 대안을 찾지 못했습니다. 이미 최적화된 구성입니다.",
        }],
      };
    }

    const lines: string[] = [];
    lines.push(
      `🔄 견적 최적화 결과 (${optimizeFor === "price" ? "가격 절감" : "성능 향상"} 기준)\n`
    );

    for (const s of result.suggestions) {
      lines.push(
        `• ${CATEGORY_LABELS[s.category]}:` +
        `\n  현재: ${s.current}` +
        `\n  제안: ${s.suggested.name} (${formatPrice(s.suggested.lowestPrice)})` +
        `\n  ${s.saving > 0 ? `절감: ${formatPrice(s.saving)}` : `추가: ${formatPrice(-s.saving)}`}`
      );
    }

    if (result.totalSaving > 0) {
      lines.push(`\n💰 총 절감액: ${formatPrice(result.totalSaving)}`);
    }

    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
  }
);

// ─── 시스템 도구 ───

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
