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

export function extractModelNumber(name: string): string | null {
  // 모델번호 패턴 매칭 (예: RTX 5070 Ti, RTX 4070 SUPER, i7-14700K, RX 7900 XTX, 7800X3D, DDR5-6000)
  //
  // - 접미(Ti/SUPER/XT/X3D 등)가 다르면 다른 모델로 구분되도록 접미까지 포함한다.
  // - 브랜드 접두가 사이트별 언어로 갈리는 CPU(Ryzen/라이젠, Core Ultra, i7)는 캡처 그룹으로
  //   핵심 SKU만 뽑아, 영문/한글 표기 차이에도 같은 모델로 인식되게 한다.
  // - 반환 시 구분자(공백·하이픈)를 모두 제거해 'RTX 5070 Ti'와 'RTX 5070Ti',
  //   'i7-14700K'와 'i7 14700K', 'DDR5-6000'과 'DDR5 6000'을 동일하게 취급한다.
  const patterns: RegExp[] = [
    /RTX\s*\d{4}\s*(?:Ti\s*SUPER|SUPER|Ti)?/i, // 5070, 5070 Ti, 4070 SUPER
    /GTX\s*\d{3,4}\s*(?:Ti\s*SUPER|SUPER|Ti)?/i, // 1660, 1660 SUPER, 1660 Ti
    /RX\s*\d{4}\s*(?:XTX|XT|GRE)?/i, // 7900 XTX, 7800 XT
    /Core\s*Ultra\s*[3579][-\s]?(\d{3}[A-Z]*)/i, // Core Ultra 7 265K → 265K
    /\bi[3579][-\s]?(\d{4,5}[A-Z]*)\b/i, // i7-14700K / i7 14700K → 14700K
    /Ryzen\s*[3579]\s*(\d{4}[A-Z0-9]*)/i, // Ryzen 7 7800X3D → 7800X3D
    /\b(\d{4}X3D)\b/i, // 접두사 없는 7800X3D, 9800X3D
    /\b(\d{4}(?:XTX|XT|KF|KS|K|GE|G|F|X))\b/i, // 7700X, 14700K, 5600G (접미 필수)
    /DDR[45][-\s]?\d{4}/i, // DDR5-6000 / DDR5 6000
    /\b\d{3,4}\s*(?:PRO|EVO|PLUS)\b/i, // 970 EVO PLUS
  ];

  for (const pattern of patterns) {
    const match = name.match(pattern);
    if (!match) continue;
    // 캡처 그룹이 있으면 핵심 SKU만(브랜드 접두 제외), 없으면 전체 매치를 사용한다.
    const core = match[1] ?? match[0];
    // 구분자(공백·하이픈)를 제거해 표기 차이를 흡수한다.
    return core.toLowerCase().replace(/[\s-]+/g, "");
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

/** 후보 배열에서 유사도 최댓값을 threshold 이상으로 만족하는 인덱스를 찾는다. */
function bestBySimilarity(
  target: string,
  candidates: string[],
  eligible: (index: number) => boolean,
  threshold: number
): { index: number; similarity: number } | null {
  let bestIndex = -1;
  let bestSimilarity = 0;

  for (let i = 0; i < candidates.length; i++) {
    if (!eligible(i)) continue;
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

export function findBestMatch(
  target: string,
  candidates: string[],
  threshold = 0.4
): { index: number; similarity: number } | null {
  const targetModel = extractModelNumber(target);

  // 모델번호 게이트: target에서 모델번호가 추출되면, 서로 다른 모델은 매칭을 '거부'한다.
  if (targetModel) {
    // 1) 모델번호가 정확히 일치하는 후보를 최우선으로 반환.
    for (let i = 0; i < candidates.length; i++) {
      if (extractModelNumber(candidates[i]) === targetModel) {
        return { index: i, similarity: 1.0 };
      }
    }
    // 2) 정확 일치가 없으면, 모델번호가 추출되지 '않는'(모호한) 후보에 한해서만 유사도 폴백.
    //    모델번호가 추출됐으나 다른 후보(예: RTX 5070 vs RTX 5070 Ti)는 서로 다른 모델이므로 제외.
    return bestBySimilarity(
      target,
      candidates,
      (i) => extractModelNumber(candidates[i]) === null,
      threshold
    );
  }

  // target에 모델번호가 없으면 순수 토큰 유사도 매칭.
  return bestBySimilarity(target, candidates, () => true, threshold);
}
