/**
 * 크로스사이트 제품 매칭을 위한 제품명 정규화 유틸리티
 */

export function normalizeProductName(name: string): string {
  return name
    .replace(/\s+/g, " ")
    .replace(/[()[\]{}]/g, "")
    .replace(/[,.:;!?]/g, "")
    .replace(/\s*\/\s*/g, " ")
    .trim()
    .toLowerCase();
}

export function extractBrandAndModel(
  name: string
): { brand: string; model: string } | null {
  const normalized = name.trim();

  // 일반적 패턴: "브랜드 모델명 부가정보"
  const patterns = [
    // Intel/AMD CPU: "인텔 코어 i7-14700K" or "AMD 라이젠 9 7950X"
    /^(인텔|intel|amd|AMD)\s+(.+?)(?:\s+정품|\s+벌크|\s+멀티팩)?$/i,
    // GPU: "ASUS GeForce RTX 4070 SUPER" or "사파이어 라데온 RX 7900 XTX"
    /^(\w+)\s+(GeForce|Radeon|라데온)\s+(.+?)(?:\s+D\d+)?(?:\s+\d+GB)?$/i,
    // 일반: "삼성전자 990 PRO 2TB"
    /^([\w가-힣]+)\s+(.+)$/,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) {
      return { brand: match[1].toLowerCase(), model: match.slice(2).join(" ").toLowerCase() };
    }
  }

  return null;
}

export function extractModelNumber(name: string): string | null {
  // 모델번호 패턴 매칭 (예: RTX 4070, i7-14700K, RX 7900 XTX, DDR5-6000)
  const patterns = [
    /RTX\s*\d{4}\s*(?:Ti|SUPER)?/i,
    /RX\s*\d{4}\s*(?:XTX|XT)?/i,
    /i[3579]-\d{4,5}\w*/i,
    /Ryzen\s*\d\s*\d{4}\w*/i,
    /DDR[45]-\d{4}/i,
    /\b\d{3,4}\s*(?:PRO|EVO|PLUS)\b/i,
  ];

  for (const pattern of patterns) {
    const match = name.match(pattern);
    if (match) return match[0].toLowerCase().replace(/\s+/g, " ");
  }

  return null;
}

export function calculateSimilarity(a: string, b: string): number {
  const tokensA = new Set(normalizeProductName(a).split(/\s+/));
  const tokensB = new Set(normalizeProductName(b).split(/\s+/));

  const intersection = new Set([...tokensA].filter((t) => tokensB.has(t)));
  const union = new Set([...tokensA, ...tokensB]);

  if (union.size === 0) return 0;
  return intersection.size / union.size; // Jaccard similarity
}

export function findBestMatch(
  target: string,
  candidates: string[],
  threshold = 0.4
): { index: number; similarity: number } | null {
  // 먼저 모델번호 기반 정확 매칭 시도
  const targetModel = extractModelNumber(target);

  if (targetModel) {
    for (let i = 0; i < candidates.length; i++) {
      const candidateModel = extractModelNumber(candidates[i]);
      if (candidateModel && candidateModel === targetModel) {
        return { index: i, similarity: 1.0 };
      }
    }
  }

  // 토큰 유사도 기반 매칭
  let bestIndex = -1;
  let bestSimilarity = 0;

  for (let i = 0; i < candidates.length; i++) {
    const similarity = calculateSimilarity(target, candidates[i]);
    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestIndex = i;
    }
  }

  if (bestIndex >= 0 && bestSimilarity >= threshold) {
    return { index: bestIndex, similarity: bestSimilarity };
  }

  return null;
}
