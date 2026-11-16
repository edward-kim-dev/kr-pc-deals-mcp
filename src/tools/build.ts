/**
 * 견적 도구: check_build
 *
 * 서버는 견적을 저장하지 않는다. 모델이 대화 속에서 부품 목록을 들고 있다가 통째로 넘기면
 * 합계, 빠진 필수 부품, 다나와 호환성 검사 결과를 돌려준다.
 * (MCP 2026-07-28 스펙의 무상태 방향. 여러 대화가 서버 하나를 같이 써도 견적이 섞이지 않는다.)
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { checkDanawaCompatibility } from "../providers/danawa/index.js";
import { describeError } from "../services/errors.js";
import { CATEGORY_LABELS, type PartCategory } from "../core/categories.js";
import type { CompatibilityPair } from "../core/types.js";
import { categorySchema, compatibilityPairSchema, noticeSchema, productIdSchema } from "./schemas.js";
import { READ_ONLY_WEB, toolResult } from "./result.js";

/** 조립 PC에 꼭 있어야 하는 부품 (그래픽카드는 내장 그래픽이 있으면 없어도 된다) */
const ESSENTIAL_CATEGORIES: PartCategory[] = ["cpu", "motherboard", "ram", "ssd", "psu", "case"];

const buildPartSchema = z.object({
  category: categorySchema,
  productId: productIdSchema.describe("다나와 상품 코드(pcode). 컴퓨존 번호는 호환성 검사에 쓸 수 없다"),
  name: z.string().trim().min(1).describe("상품명"),
  price: z.number().int().nonnegative().default(0).describe("개당 가격(원). 모르면 0"),
  quantity: z.number().int().min(1).max(8).default(1).describe("수량 (예: 램 2개)"),
});

export function registerBuildTools(server: McpServer): void {
  server.registerTool(
    "check_build",
    {
      title: "견적 합계·호환성 검사",
      description:
        "조립 PC 견적의 부품 목록을 받아 합계 금액, 빠진 필수 부품, 다나와 PC견적 호환성 검사 결과" +
        "(CPU–메인보드 소켓, CPU–RAM 규격, RAM–메인보드 슬롯 등)를 돌려준다. 서버는 견적을 저장하지 않으므로 " +
        "부품을 바꿀 때마다 전체 목록을 다시 넘긴다. productId는 search_parts·list_by_category의 다나와 결과 id(pcode)다.",
      inputSchema: z.object({
        parts: z.array(buildPartSchema).min(1).max(15).describe("견적 부품 목록"),
      }),
      outputSchema: z.object({
        parts: z.array(
          buildPartSchema.extend({
            subtotal: z.number().int().describe("가격 × 수량"),
          })
        ),
        total: z.number().int().describe("합계(원). 가격 미정(0) 부품은 빠져 있다"),
        unpricedParts: z.array(z.string()).describe("가격이 0이라 합계에 들어가지 않은 부품 이름"),
        missingCategories: z.array(categorySchema).describe("빠진 필수 부품 (CPU·메인보드·RAM·SSD·파워·케이스)"),
        compatibility: z.object({
          checked: z.boolean().describe("다나와 검사를 실행했는지 (상품이 2개 이상이어야 한다)"),
          compatible: z.boolean().nullable().describe("모든 조합이 호환되면 true. 검사하지 않았으면 null"),
          pairs: z.array(compatibilityPairSchema),
        }),
        notice: noticeSchema,
      }),
      annotations: READ_ONLY_WEB,
    },
    async ({ parts }) => {
      const priced = parts.map((p) => ({ ...p, subtotal: p.price * p.quantity }));
      const total = priced.reduce((sum, p) => sum + p.subtotal, 0);
      const unpricedParts = priced.filter((p) => p.price === 0).map((p) => p.name);
      const present = new Set(parts.map((p) => p.category));
      const missingCategories = ESSENTIAL_CATEGORIES.filter((c) => !present.has(c));

      const productIds = [...new Set(parts.map((p) => p.productId))];
      let compatibility: { checked: boolean; compatible: boolean | null; pairs: CompatibilityPair[] } = {
        checked: false,
        compatible: null,
        pairs: [],
      };
      const notices: string[] = [];

      if (productIds.length >= 2) {
        try {
          const result = await checkDanawaCompatibility(productIds);
          compatibility = { checked: true, compatible: result.pairs.length > 0 ? result.compatible : null, pairs: result.pairs };
          if (result.pairs.length === 0) {
            notices.push("다나와가 판정할 부품 조합이 없습니다. 호환성은 CPU·메인보드·RAM 조합 위주로 판정합니다.");
          }
        } catch (error) {
          notices.push(`호환성 검사를 하지 못했습니다: ${describeError(error)}`);
        }
      } else {
        notices.push("호환성 검사에는 서로 다른 다나와 상품이 2개 이상 필요합니다.");
      }
      if (missingCategories.length > 0) {
        notices.push(`빠진 필수 부품: ${missingCategories.map((c) => CATEGORY_LABELS[c]).join(", ")}.`);
      }
      if (unpricedParts.length > 0) {
        notices.push("가격이 0인 부품은 합계에 들어가지 않았습니다.");
      }

      return toolResult({
        parts: priced,
        total,
        unpricedParts,
        missingCategories,
        compatibility,
        ...(notices.length > 0 ? { notice: notices.join(" ") } : {}),
      });
    }
  );
}
