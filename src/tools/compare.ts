/** 비교·목록 도구: compare_prices, find_lowest_price, list_by_category */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { comparePrices, DEFAULT_GROUP_LIMIT, findLowestPrice } from "../services/price-compare.js";
import { SEARCH_SOURCES } from "../services/sources.js";
import { listDanawaCategory, LIST_PAGE_SIZE } from "../providers/danawa/index.js";
import { SOURCE_LABELS } from "../core/types.js";
import { categorySchema, noticeSchema, productSchema, sourceErrorSchema, sourceSchema } from "./schemas.js";
import { READ_ONLY_WEB, toolError, toolResult } from "./result.js";

const SITE_NAMES = SEARCH_SOURCES.map((s) => SOURCE_LABELS[s]).join("·");

export function registerCompareTools(server: McpServer): void {
  server.registerTool(
    "compare_prices",
    {
      title: "사이트별 가격 비교",
      description:
        `같은 검색어로 ${SITE_NAMES}을 동시에 검색하고, 같은 제품끼리 묶어 사이트별 가격과 가장 싼 곳을 돌려준다. ` +
        "모델번호·브랜드·제품군·용량·색상·포장이 맞아야 같은 제품으로 보며, 확실하지 않으면 묶지 않는다. " +
        "두 사이트 이상에서 찾은 제품만 묶음이 되고, 앞 사이트의 검색 순위 순서로 나온다. category를 주면 정확도가 올라간다.",
      inputSchema: z.object({
        query: z.string().trim().min(1).describe("검색어 (예: 'RTX 5070', '7800X3D')"),
        category: categorySchema.optional().describe("부품 종류로 좁히기"),
        limit: z.number().int().min(1).max(30).default(DEFAULT_GROUP_LIMIT).describe("최대 몇 묶음"),
      }),
      outputSchema: z.object({
        query: z.string(),
        counts: z.array(z.object({ source: sourceSchema, count: z.number().int() })).describe("사이트별 검색 결과 수"),
        groups: z.array(
          z.object({
            name: z.string().describe("묶음 대표(첫 상품)의 상품명"),
            products: z.array(productSchema).describe("사이트마다 하나씩. 첫 상품이 묶음의 대표"),
            cheapestSources: z.array(sourceSchema).describe("가장 싼 사이트 (같은 값이면 여럿). 가격이 있는 상품이 없으면 빈 배열"),
            lowestPrice: z.number().int().describe("가장 싼 가격(원). 가격이 없으면 0"),
            priceGap: z.number().int().describe("가장 비싼 곳과 가장 싼 곳의 차이(원)"),
          })
        ),
        errors: z.array(sourceErrorSchema),
        notice: noticeSchema,
      }),
      annotations: READ_ONLY_WEB,
    },
    async ({ query, category, limit }) => {
      const result = await comparePrices(query, { category, limit });
      if (result.errors.length === result.counts.length) {
        return toolError(result.errors.map((e) => `${SOURCE_LABELS[e.source]}: ${e.message}`).join(" / "));
      }
      return toolResult({
        query,
        counts: result.counts,
        groups: result.groups,
        errors: result.errors,
        ...(result.groups.length === 0
          ? { notice: "여러 사이트에서 같은 제품을 찾지 못했습니다. search_parts로 사이트별 결과를 따로 확인해 보세요." }
          : {}),
      });
    }
  );

  server.registerTool(
    "find_lowest_price",
    {
      title: "통합 최저가 찾기",
      description:
        `${SITE_NAMES} 검색 결과에서 가장 싼 상품 하나를 고른다. 검색어에 모델번호(예: RTX 5070 Ti, i7-14700K, 7800X3D)가 있으면 ` +
        "그 모델로 확인되는 상품만, 용량(16GB, 2TB 등)이 있으면 다른 용량이 적힌 상품을 뺀 나머지만 후보로 삼는다. " +
        "가격 경고(priceWarning)가 붙은 상품은 빼고, 후보가 없으면 다른 모델로 대신하지 않고 cheapest를 null로 돌려준다.",
      inputSchema: z.object({
        query: z.string().trim().min(1).describe("검색어. 모델명을 넣을수록 정확하다"),
        category: categorySchema.optional().describe("부품 종류로 좁히기"),
      }),
      outputSchema: z.object({
        query: z.string(),
        cheapest: productSchema.nullable(),
        model: z.string().nullable().describe("검색어에서 뽑은 모델번호. 있으면 이 모델로 확인되는 상품만 후보로 삼았다"),
        capacities: z.array(z.string()).describe("검색어에 적힌 용량. 다른 용량이 적힌 상품은 후보에서 뺐다"),
        candidates: z.number().int().describe("비교한 후보 수"),
        errors: z.array(sourceErrorSchema),
        notice: noticeSchema,
      }),
      annotations: READ_ONLY_WEB,
    },
    async ({ query, category }) => {
      const result = await findLowestPrice(query, { category });
      if (!result.cheapest && result.errors.length === SEARCH_SOURCES.length) {
        return toolError(result.errors.map((e) => `${SOURCE_LABELS[e.source]}: ${e.message}`).join(" / "));
      }
      let notice: string | undefined;
      if (!result.cheapest) {
        const conditions = [result.model ? `모델 '${result.model}'` : "", result.capacities.length > 0 ? `용량 ${result.capacities.join("·")}` : ""]
          .filter(Boolean)
          .join(", ");
        notice = conditions
          ? `${conditions}에 맞는 상품이 없어 다른 상품으로 대신하지 않았습니다. 검색어를 바꾸거나 search_parts로 결과를 직접 확인해 보세요.`
          : "가격이 있는 검색 결과가 없습니다.";
      }
      return toolResult({ ...result, ...(notice ? { notice } : {}) });
    }
  );

  server.registerTool(
    "list_by_category",
    {
      title: "카테고리 인기 목록",
      description:
        `다나와 카테고리의 인기 상품을 최대 ${LIST_PAGE_SIZE}개 돌려준다. 무엇을 살지 정하기 전에 후보를 넓게 볼 때 쓴다. ` +
        `sortBy가 "price"면 인기 상위 ${LIST_PAGE_SIZE}개를 가격 낮은 순으로 다시 정렬한다 (카테고리 전체의 최저가순이 아니다).`,
      inputSchema: z.object({
        category: categorySchema.describe("부품 종류"),
        sortBy: z.enum(["popularity", "price"]).default("popularity").describe("popularity: 인기순, price: 인기 상위 중 가격 낮은 순"),
        limit: z.number().int().min(1).max(LIST_PAGE_SIZE).default(10).describe("최대 몇 개"),
      }),
      outputSchema: z.object({
        category: categorySchema,
        sortBy: z.enum(["popularity", "price"]),
        results: z.array(productSchema),
      }),
      annotations: READ_ONLY_WEB,
    },
    async ({ category, sortBy, limit }) => {
      try {
        const results = await listDanawaCategory(category, { sort: sortBy, limit });
        return toolResult({ category, sortBy, results });
      } catch (error) {
        return toolError(error);
      }
    }
  );
}
