/**
 * 도구 입력·출력 스키마 (zod).
 * 출력 스키마는 tools/list의 outputSchema로 공개되고, SDK가 structuredContent를 이 스키마로 검증한다.
 */

import { z } from "zod";
import { PART_CATEGORIES } from "../core/categories.js";
import { SOURCES } from "../core/types.js";

export const categorySchema = z.enum(PART_CATEGORIES);
export const sourceSchema = z.enum(SOURCES);

const won = z.number().int().nonnegative();

export const noticeSchema = z.string().optional().describe("결과를 해석하거나 다음에 할 일을 알려 주는 안내");

export const productIdSchema = z.string().trim().regex(/^\d+$/, "숫자로 된 상품 코드여야 합니다");

export const productSchema = z.object({
  source: sourceSchema,
  id: z.string().describe("그 사이트의 상품 코드 (다나와 pcode, 에누리 modelno, 견적왕 pd_no, 컴퓨존 상품 번호)"),
  name: z.string(),
  price: won.describe("원 단위 가격. 가격비교 사이트(다나와·에누리·견적왕)는 판매처 최저가로 현금 결제가가 섞일 수 있고, 컴퓨존은 자체 판매가. 0이면 가격 미정"),
  url: z.string(),
  category: categorySchema.optional(),
  shopCount: z.number().int().optional().describe("가격비교에 등록된 판매처 수 (다나와·에누리·견적왕)"),
  priceWarning: z.string().optional().describe("가격이 비정상으로 보일 때의 경고. 있으면 가격을 그대로 믿지 말고 링크에서 확인"),
});

export const sourceErrorSchema = z.object({
  source: sourceSchema,
  message: z.string(),
});

export const sellerOfferSchema = z.object({
  seller: z.string(),
  price: won,
  shippingFee: won.nullable().describe("배송비(원). 0은 무료배송, null은 알 수 없음"),
  url: z.string().optional(),
});

export const productDetailSchema = z.object({
  source: sourceSchema,
  id: z.string(),
  name: z.string(),
  url: z.string(),
  price: won.describe("최저가(원). 0이면 가격 미정"),
  cashPrice: won.optional().describe("현금 결제 판매처의 최저가 (사이트가 따로 보여 줄 때)"),
  specs: z.array(z.string()).describe("스펙 요약 항목"),
  offers: z.array(sellerOfferSchema).describe("판매처별 가격. 가격비교 사이트는 상위 판매처 최대 10곳. 판매처 이름 뒤의 (현금)·(카드)는 결제 방식별 가격"),
  maker: z.string().optional(),
  registeredAt: z.string().optional().describe("사이트에 적힌 등록일·등록월 (형식은 사이트마다 다름, 예: 2025.03, 2025-03-06)"),
});

export const pricePointSchema = z.object({
  date: z.string().describe('주 단위면 "2026-10-20", 월 단위면 "2026-10"'),
  minPrice: won.describe("그 시점의 최저가(원)"),
  suspicious: z.boolean().optional().describe("한 주만 크게 떨어졌다 회복한 값. 판매처 등록 오류일 수 있다"),
});

export const compatibilityPairSchema = z.object({
  parts: z.tuple([z.string(), z.string()]).describe("비교한 부품 종류 쌍 (다나와 표기, 예: cpu·mainboard·ram)"),
  compatible: z.boolean(),
  code: z.string().describe('다나와 결과 코드. "0001"이 호환'),
  messages: z.array(z.string()),
});
