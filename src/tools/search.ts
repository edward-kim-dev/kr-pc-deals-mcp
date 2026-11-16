/** 검색 도구: search_parts, get_product_detail, get_price_history */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { getDanawaPriceHistory, type HistoryPeriod } from "../providers/danawa/index.js";
import { DETAIL_SOURCES, SEARCH_SOURCES, getProductDetail, searchSources } from "../services/sources.js";
import { SOURCE_LABELS, type Source } from "../core/types.js";
import {
  categorySchema,
  noticeSchema,
  pricePointSchema,
  productDetailSchema,
  productIdSchema,
  productSchema,
  sourceErrorSchema,
} from "./schemas.js";
import { READ_ONLY_WEB, toolError, toolResult } from "./result.js";

export function registerSearchTools(server: McpServer): void {
  server.registerTool(
    "search_parts",
    {
      title: "PC 부품 검색",
      description:
        `PC 부품을 키워드로 ${SEARCH_SOURCES.map((s) => SOURCE_LABELS[s]).join("·")}에서 검색한다. 상품명, 가격(원), 상품 코드, 링크를 돌려준다. ` +
        "다나와 결과의 id(pcode)는 get_price_history·check_build에, 모든 결과의 id는 같은 사이트의 get_product_detail에 쓴다. " +
        "category를 주면 그 부품 종류만 나온다. 한 사이트가 실패해도 다른 사이트 결과를 주고 실패 내용은 errors에 담는다. " +
        "다나와 검색은 사이트 규칙상 10초에 한 번만 요청하므로 연달아 부르면 기다릴 수 있다.",
      inputSchema: z.object({
        query: z.string().trim().min(1).describe("검색어. 모델명이 구체적일수록 정확하다 (예: 'RTX 5070 Ti', '7800X3D', 'DDR5 32GB')"),
        category: categorySchema.optional().describe("부품 종류로 좁히기"),
        source: z.enum(["all", ...SEARCH_SOURCES] as [string, ...string[]]).default("all").describe("검색할 사이트"),
        limit: z.number().int().min(1).max(40).default(10).describe("사이트마다 최대 몇 개 (사이트마다 검색 첫 페이지만 읽는다)"),
      }),
      outputSchema: z.object({
        query: z.string(),
        results: z.array(productSchema),
        errors: z.array(sourceErrorSchema),
        notice: noticeSchema,
      }),
      annotations: READ_ONLY_WEB,
    },
    async ({ query, category, source, limit }) => {
      const sources = source === "all" ? undefined : [source as Source];
      const { bySource, errors } = await searchSources(query, { category, limit, sources });
      const results = bySource.flatMap(({ products }) => products);

      if (results.length === 0 && errors.length === bySource.length) {
        return toolError(errors.map((e) => `${SOURCE_LABELS[e.source]}: ${e.message}`).join(" / "));
      }
      return toolResult({
        query,
        results,
        errors,
        ...(results.length === 0 ? { notice: "검색 결과가 없습니다. 검색어를 줄이거나 category를 빼고 다시 검색해 보세요." } : {}),
      });
    }
  );

  server.registerTool(
    "get_product_detail",
    {
      title: "상품 상세",
      description:
        "상품 하나의 스펙 요약과 판매처별 가격을 돌려준다. productId는 search_parts·list_by_category 결과의 id이고, source는 그 결과의 source다. " +
        "가격비교 사이트(다나와·에누리·견적왕)는 최저가와 상위 판매처(최대 10곳)를, 쇼핑몰(컴퓨존)은 자체 판매가와 배송비를 준다. " +
        `지원 사이트: ${DETAIL_SOURCES.map((s) => SOURCE_LABELS[s]).join("·")}.`,
      inputSchema: z.object({
        source: z.enum(DETAIL_SOURCES as [string, ...string[]]).describe("상품 코드가 나온 사이트"),
        productId: productIdSchema.describe("그 사이트의 상품 코드 (search_parts 결과의 id)"),
      }),
      outputSchema: productDetailSchema.extend({ notice: noticeSchema }),
      annotations: READ_ONLY_WEB,
    },
    async ({ source, productId }) => {
      try {
        const detail = await getProductDetail(source as Source, productId);
        const incomplete = detail.specs.length === 0 && detail.offers.length === 0;
        return toolResult({
          ...detail,
          ...(incomplete
            ? { notice: "사이트가 스펙·판매처 정보 없이 응답했습니다. 잠시 후 다시 시도하거나 링크에서 직접 확인하세요." }
            : {}),
        });
      } catch (error) {
        return toolError(error);
      }
    }
  );

  server.registerTool(
    "get_price_history",
    {
      title: "다나와 가격 변동 이력",
      description:
        "다나와 상품의 최저가 변동 이력을 돌려준다. 1·3개월은 주 단위, 6·12·24개월은 월 단위 최저가다 (최고가 이력은 없다). " +
        "지금 사도 되는지 판단할 때 쓴다. 한 주만 크게 떨어졌다 회복한 값은 suspicious로 표시하고 기간 최저가 계산에서 뺀다. 다나와 상품만 된다.",
      inputSchema: z.object({
        productId: productIdSchema.describe("다나와 상품 코드(pcode)"),
        months: z.enum(["1", "3", "6", "12", "24"]).default("3").describe("기간(개월)"),
      }),
      outputSchema: z.object({
        productCode: z.string(),
        periodMonths: z.number().int(),
        granularity: z.enum(["week", "month"]).describe("week: 주 단위, month: 월 단위"),
        lowest: z.number().int().describe("이상값을 뺀 기간 최저가(원). 자료가 없으면 0"),
        highest: z.number().int().describe("이상값을 뺀 기간 중 가장 높았던 최저가(원)"),
        points: z.array(pricePointSchema),
        notice: noticeSchema,
      }),
      annotations: READ_ONLY_WEB,
    },
    async ({ productId, months }) => {
      try {
        const history = await getDanawaPriceHistory(productId, Number(months) as HistoryPeriod);
        const notices: string[] = [];
        if (history.points.length === 0) notices.push(`최근 ${months}개월 가격 이력이 없습니다.`);
        if (history.points.some((p) => p.suspicious)) {
          notices.push("한 주만 크게 떨어졌다 회복한 값은 판매처 등록 오류일 수 있어 suspicious로 표시하고 최저가 계산에서 뺐습니다.");
        }
        if (history.granularity === "month" && history.points.length > 0) {
          notices.push("월 단위 값은 그 달의 가장 낮은 주간 최저가라 일시적인 이상값이 섞일 수 있습니다. 자세히 보려면 3개월(주 단위)로 확인하세요.");
        }
        return toolResult({ ...history, ...(notices.length > 0 ? { notice: notices.join(" ") } : {}) });
      } catch (error) {
        return toolError(error);
      }
    }
  );
}
