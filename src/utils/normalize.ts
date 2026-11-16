/**
 * 사이트 간 같은 제품 찾기.
 *
 * 사이트마다 같은 제품을 조금씩 다르게 부른다
 * (예: "갤럭시 GALAX 지포스 RTX 5070 BLACK OC D7 12GB" ↔ "[GALAX] 지포스 RTX 5070 BLACK OC D7 12GB").
 * 이름 전체의 단어 유사도만으로는 같은 브랜드의 다른 제품군(AERO ↔ GAMING OC)이나
 * 다른 브랜드(ZOTAC ↔ GIGABYTE)를 구분하지 못해서, 아래 조건을 모두 따진다.
 *  1. 모델번호가 같다 (RTX 5070 ≠ RTX 5070 Ti, 7800X3D ≠ 7700X)
 *  2. 포장 종류가 다르지 않다 (정품 ≠ 멀티팩 정품 ≠ 벌크)
 *  3. 색상이 어긋나지 않는다 (BLACK ≠ WHITE, WHITE·ICE 같은 변형색은 양쪽에 똑같이 있어야 함)
 *  4. 그래픽카드는 OC·SFF·LP 표기가 양쪽에 똑같이 있다 (GAMINGPRO-S ≠ GAMINGPRO-S OC, ULTRA OC ≠ ULTRA OC SFF)
 *  5. 공통어·유통사명·모델번호를 뺀 "제품군 단어"(브랜드·제품군·사양)는 적게 적힌 쪽이 많이 적힌 쪽에 모두 들어 있다.
 *     양쪽에 서로 없는 단어가 있으면 다른 제품이다 (CRAS ≠ URBANE, 8GB ≠ 16GB, 750W ≠ 850W)
 *  6. 제품군 단어가 0.7 이상 겹친다 (한쪽에만 붙은 단어가 너무 많지 않다)
 * CPU는 모델번호가 곧 제품이고 사이트마다 이름 체계가 크게 달라 1~4만 따진다 (4는 그래픽카드에만 해당).
 */

import type { PartCategory } from "../core/categories.js";

export function normalizeProductName(name: string): string {
  return name
    .replace(/\s+/g, " ")
    .replace(/[()[\]{}]/g, " ")
    .replace(/[,.:;!?](?!\d)/g, " ")
    .replace(/\s*\/\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

type ModelKind = "gpu" | "cpu" | "ram" | "ssd";

/** 이름에 이 단어가 있으면 CPU로 본다 (카테고리를 모를 때 CPU 패턴을 쓸지 정하는 데 쓴다) */
const CPU_CONTEXT = /인텔|intel|코어|\bcore\b|amd|라이젠|ryzen|애슬론|athlon|펜티엄|pentium|셀러론|celeron/i;

/**
 * 모델번호 패턴. 앞에서부터 먼저 맞는 것을 쓴다.
 * - 접미(Ti/SUPER/XT/X3D/K/F 등)가 다르면 다른 모델이 되도록 접미까지 포함한다.
 * - CPU는 브랜드·세대 표기가 사이트마다 영문/한글로 갈려 캡처 그룹으로 핵심 SKU만 뽑는다.
 * - cpuContext가 true인 패턴은 이름이 CPU로 보일 때만 쓴다 (파워 "1000G", 케이스 "5000X" 오인 방지).
 */
const MODEL_PATTERNS: Array<{ pattern: RegExp; kind: ModelKind; cpuContext?: boolean }> = [
  { pattern: /RTX\s*\d{4}\s*(?:Ti\s*SUPER|SUPER|Ti)?/i, kind: "gpu" }, // 5070, 5070 Ti, 4070 SUPER
  { pattern: /GTX\s*\d{3,4}\s*(?:Ti\s*SUPER|SUPER|Ti)?/i, kind: "gpu" }, // 1660, 1660 SUPER, 1660 Ti
  { pattern: /RX\s*\d{4}\s*(?:XTX|XT|GRE)?/i, kind: "gpu" }, // 7900 XTX, 7800 XT
  // Core Ultra 7 265K / 코어 울트라7 시리즈2 270K Plus → 265k / 270kplus
  { pattern: /Core\s*Ultra\s*[3579][-\s]?(?:Series\s*\d+\s*)?(\d{3}[A-Z]*(?:\s*Plus)?)/i, kind: "cpu" },
  { pattern: /울트라\s*[3579]\s*(?:시리즈\s*\d+\s*)?(\d{3}[A-Z]*(?:\s*Plus)?)/i, kind: "cpu" },
  // 코어i7-14세대 14700K (다나와 표기) → 14700k
  { pattern: /i[3579]\s*-?\s*\d{1,2}\s*세대\s*(\d{4,5}[A-Z]*)/i, kind: "cpu" },
  // i7-14700K / i7 14700K → 14700k
  { pattern: /\bi[3579][-\s]?(\d{4,5}[A-Z]*)\b/i, kind: "cpu" },
  // Ryzen 7 7800X3D / 라이젠7-5세대 7800X3D / 라이젠7 라파엘 7800X3D / 라이젠5-4세대 5600 → 7800x3d, 5600
  { pattern: /(?:Ryzen|라이젠)\s*[3579](?:\s*-\s*\d+\s*세대)?(?:\s+[가-힣]+)?\s+(\d{4}[A-Z0-9]*)/i, kind: "cpu" },
  { pattern: /\b(\d{4}X3D)\b/i, kind: "cpu" }, // 접두사 없는 7800X3D, 9800X3D
  { pattern: /\b(1[0-4]\d{3}(?:KF|KS|K|F|T))\b/i, kind: "cpu" }, // 접두사 없는 14700K, 14600KF
  { pattern: /\b(\d{4}(?:XTX|XT|KF|KS|K|GE|G|F|X))\b/i, kind: "cpu", cpuContext: true }, // 7700X, 5600G (접미 필수)
  { pattern: /DDR[45][-\s]?\d{4}/i, kind: "ram" }, // DDR5-6000 / DDR5 6000
  { pattern: /\b\d{3,4}\s*(?:PRO|EVO|PLUS)\b/i, kind: "ssd" }, // 970 EVO PLUS
];

function detectModel(name: string, category?: PartCategory): { model: string; kind: ModelKind } | null {
  const cpuContext = category === "cpu" || CPU_CONTEXT.test(name);
  for (const { pattern, kind, cpuContext: needsCpu } of MODEL_PATTERNS) {
    if (needsCpu && !cpuContext) continue;
    const match = name.match(pattern);
    if (!match) continue;
    // 구분자(공백·하이픈)를 지워 'RTX 5070 Ti'와 'RTX 5070Ti', 'DDR5-6000'과 'DDR5 6000'을 같게 본다.
    return { model: (match[1] ?? match[0]).toLowerCase().replace(/[\s-]+/g, ""), kind };
  }
  return null;
}

/**
 * 제품명(또는 검색어)에서 모델번호를 뽑는다. 없으면 null.
 * 예: "RTX 5070 Ti" → "rtx5070ti", "인텔 코어i7-14세대 14700K" → "14700k".
 * category를 주면 그 부품 종류에 맞는 패턴을 더 쓴다 (cpu면 "7700X" 같은 접두사 없는 표기도 읽는다).
 */
export function extractModelNumber(name: string, category?: PartCategory): string | null {
  return detectModel(name, category)?.model ?? null;
}

/** 이름·검색어에 적힌 용량 (예: "D7 16GB" → ["16gb"], "990 PRO 2TB" → ["2tb"]) */
export function extractCapacities(text: string): string[] {
  return [...new Set((text.match(/\d+(?:\.\d+)?\s*(?:GB|TB)\b/gi) ?? []).map((c) => c.replace(/\s+/g, "").toLowerCase()))];
}

/** 이름 전체의 단어 자카드 유사도 (0~1) */
export function calculateSimilarity(a: string, b: string): number {
  return jaccard(new Set(normalizeProductName(a).split(" ")), new Set(normalizeProductName(b).split(" ")));
}

/** 같은 브랜드·색의 한글·영문 표기 */
const TOKEN_ALIASES: Record<string, string> = {
  갤럭시: "galax",
  인텔: "intel",
  삼성: "samsung",
  삼성전자: "samsung",
  마이크로닉스: "micronics",
  기가바이트: "gigabyte",
  에이수스: "asus",
  조텍: "zotac",
  팔릿: "palit",
  이노3d: "inno3d",
  웨스턴디지털: "wd",
  씨게이트: "seagate",
  마이크론: "micron",
  커세어: "corsair",
  시소닉: "seasonic",
  쿨러마스터: "coolermaster",
  리안리: "lianli",
  써멀라이트: "thermalright",
  에즈락: "asrock",
  애즈락: "asrock",
  블랙: "black",
  화이트: "white",
  실버: "silver",
  핑크: "pink",
};

/** 변형색: 양쪽에 똑같이 적혀 있어야 같은 제품이다 (GIGABYTE "ICE"는 화이트 에디션) */
const VARIANT_COLORS = new Set(["white", "silver", "pink", "ice"]);
/** 모든 색 단어: 양쪽에 색이 적혀 있는데 겹치지 않으면 다른 제품이다 */
const COLOR_TOKENS = new Set(["black", ...VARIANT_COLORS]);

/** 포장 종류. 앞에서부터 먼저 맞는 것을 그 이름의 포장으로 본다 ("멀티팩 정품"은 멀티팩) */
const PACKAGING_KINDS: Array<[kind: string, tokens: string[]]> = [
  ["overseas", ["해외구매"]],
  ["parallel", ["병행"]],
  ["multipack", ["멀티팩"]],
  ["valuepack", ["밸류팩"]],
  ["bulk", ["벌크", "tray", "트레이"]],
  ["box", ["정품", "박스"]],
];

/**
 * 그래픽카드에서 같은 제품군 안의 다른 제품을 가르는 표기: 공장 오버클럭(OC), 소형(SFF), 로우프로파일(LP).
 * 제품군 단어로는 한 단어 차이라 0.7 기준을 넘어 버리므로 따로 맞춰 본다.
 */
const GPU_VARIANT_TOKENS = new Set(["oc", "sff", "lp"]);

/** 제품을 구분하는 데 쓸모없는 공통어 */
const GENERIC_TOKENS = new Set([
  "지포스", "geforce", "라데온", "radeon", "nvidia", "엔비디아", "그래픽카드",
  "d6", "d6x", "d7", "gddr6", "gddr6x", "gddr7",
]);

/** 같은 카드를 들여오는 국내 유통사 (같은 제품이라도 사이트마다 다를 수 있다) */
const DISTRIBUTORS = new Set([
  "이엠텍", "제이씨현", "피씨디렉트", "대원씨티에스", "인텍앤컴퍼니", "도우정보",
  "디앤디컴", "에스티컴", "stcom", "웨이코스", "코잇", "서린씨앤아이", "브라보텍", "아이티센", "리더스시스템즈", "한성컴퓨터",
]);

/** 제품군 단어가 이만큼 겹쳐야 같은 제품으로 본다 */
const LINE_SIMILARITY_THRESHOLD = 0.7;

interface ProductSignature {
  model: string | null;
  /** CPU처럼 모델번호만으로 제품이 정해지는지 */
  strongModel: boolean;
  /** 모델번호·공통어·유통사명을 뺀 단어 (브랜드·제품군·사양) */
  line: Set<string>;
  colors: Set<string>;
  packaging: string | null;
  /** 그래픽카드의 변형 표기(GPU_VARIANT_TOKENS)를 정렬해 이은 값 (없으면 ""). 그래픽카드가 아니면 null */
  gpuVariant: string | null;
}

function signature(name: string, category?: PartCategory): ProductSignature {
  const detected = detectModel(name, category);
  const model = detected?.model ?? null;
  const tokens = normalizeProductName(name)
    .split(" ")
    .filter(Boolean)
    .map((raw) => TOKEN_ALIASES[raw] ?? raw);

  const line = new Set<string>();
  for (const token of tokens) {
    if (GENERIC_TOKENS.has(token) || DISTRIBUTORS.has(token)) continue;
    const compact = token.replace(/-/g, "");
    if (model && compact.length >= 2 && model.includes(compact)) continue;
    line.add(token);
  }

  const packaging = PACKAGING_KINDS.find(([, words]) => words.some((w) => tokens.includes(w)))?.[0] ?? null;
  return {
    model,
    strongModel: detected?.kind === "cpu",
    line,
    colors: new Set(tokens.filter((t) => COLOR_TOKENS.has(t))),
    packaging,
    gpuVariant: detected?.kind === "gpu" ? [...new Set(tokens.filter((t) => GPU_VARIANT_TOKENS.has(t)))].sort().join(" ") : null,
  };
}

function jaccard(a: Set<string>, b: Set<string>): number {
  const union = new Set([...a, ...b]);
  if (union.size === 0) return 1;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / union.size;
}

function isSubset(a: Set<string>, b: Set<string>): boolean {
  for (const t of a) if (!b.has(t)) return false;
  return true;
}

function colorsConflict(a: Set<string>, b: Set<string>): boolean {
  const variantsA = [...a].filter((c) => VARIANT_COLORS.has(c));
  const variantsB = [...b].filter((c) => VARIANT_COLORS.has(c));
  if (variantsA.length !== variantsB.length || variantsA.some((c) => !b.has(c))) return true;
  return a.size > 0 && b.size > 0 && ![...a].some((c) => b.has(c));
}

/**
 * 두 상품명이 같은 제품인지 판정한다. 같은 제품이면 점수를, 아니면 null을 돌려준다.
 * - similarity: 제품군 단어 겹침 (0~1)
 * - overall: 이름 전체 단어 겹침 (0~1). 점수가 같을 때 순위를 정하는 데 쓴다.
 */
export function scorePair(
  a: string,
  b: string,
  category?: PartCategory
): { similarity: number; overall: number } | null {
  const sa = signature(a, category);
  const sb = signature(b, category);
  if (sa.model !== sb.model) return null;
  if (sa.packaging && sb.packaging && sa.packaging !== sb.packaging) return null;
  if (colorsConflict(sa.colors, sb.colors)) return null;
  if (sa.gpuVariant !== null && sb.gpuVariant !== null && sa.gpuVariant !== sb.gpuVariant) return null;

  const similarity = jaccard(sa.line, sb.line);
  if (!(sa.model && sa.strongModel)) {
    // 제품군 단어는 적게 적힌 쪽이 많이 적힌 쪽에 모두 들어 있어야 한다.
    // 사이트가 단어를 빼거나 더 붙이는 것("[ZOTAC]" ↔ "ZOTAC GAMING")은 받아들이고,
    // 서로 다른 단어로 바뀐 것(CRAS ↔ URBANE, 8GB ↔ 16GB)은 다른 제품으로 본다.
    const [fewer, more] = sa.line.size <= sb.line.size ? [sa.line, sb.line] : [sb.line, sa.line];
    if (!isSubset(fewer, more)) return null;
    if (similarity < LINE_SIMILARITY_THRESHOLD) return null;
  }
  return { similarity, overall: calculateSimilarity(a, b) };
}

/**
 * candidates 중 target과 같은 제품을 찾는다. 없으면 null.
 * 조건을 통과한 후보가 여럿이면 제품군 단어가 가장 많이 겹치는 것을 고른다.
 */
export function matchProduct(
  target: string,
  candidates: string[],
  category?: PartCategory
): { index: number; similarity: number } | null {
  let best: { index: number; similarity: number; overall: number } | null = null;
  candidates.forEach((candidate, index) => {
    const score = scorePair(target, candidate, category);
    if (!score) return;
    if (!best || score.similarity > best.similarity || (score.similarity === best.similarity && score.overall > best.overall)) {
      best = { index, ...score };
    }
  });
  const found = best as { index: number; similarity: number } | null;
  return found ? { index: found.index, similarity: found.similarity } : null;
}
