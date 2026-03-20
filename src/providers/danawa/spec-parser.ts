import * as cheerio from "cheerio";

export interface ParsedSpec {
  socket?: string;
  ddrType?: string;
  pcieVersion?: string;
  tdp?: number;
  wattage?: number;
  formFactor?: string;
}

export function parseSpecString(specStr: string): ParsedSpec {
  const result: ParsedSpec = {};
  const tokens = specStr.split(/\s*\/\s*/);

  for (const token of tokens) {
    const t = token.trim();

    // 소켓: 소켓AM5, 소켓LGA1700
    const socketMatch = t.match(/소켓([A-Z0-9]+)/i);
    if (socketMatch && !result.socket) {
      result.socket = socketMatch[1].toUpperCase();
    }

    // DDR 타입
    const ddrMatch = t.match(/\b(DDR[45])\b/i);
    if (ddrMatch && !result.ddrType) {
      result.ddrType = ddrMatch[1].toUpperCase();
    }

    // 폼팩터 (대소문자 구분: mATX, ATX, ITX)
    const ffMatch = t.match(/\b(mATX|ATX|ITX)\b/);
    if (ffMatch && !result.formFactor) {
      result.formFactor = ffMatch[1];
    }

    // TDP: "TDP:105W" 또는 "TDP: 105W"
    const tdpMatch = t.match(/TDP\s*[:：]\s*(\d+)\s*W/i);
    if (tdpMatch && result.tdp === undefined) {
      result.tdp = parseInt(tdpMatch[1], 10);
    }

    // PSU 와트수: 단독 "1000W" (3~4자리 숫자)
    // TDP 콜론 형식과 겹치지 않도록 콜론 없는 경우만
    const wattMatch = t.match(/^(\d{3,4})W$/i);
    if (wattMatch && result.wattage === undefined && !tdpMatch) {
      result.wattage = parseInt(wattMatch[1], 10);
    }

    // PCIe 버전
    const pcieMatch = t.match(/PCIe\s*(\d+\.\d+)/i);
    if (pcieMatch && !result.pcieVersion) {
      result.pcieVersion = `PCIe${pcieMatch[1]}`;
    }
  }

  return result;
}

export function parseSpecHtml(html: string): ParsedSpec[] {
  const $ = cheerio.load(html);
  const specs: ParsedSpec[] = [];

  $(".spec").each((_, el) => {
    const text = $(el).text().trim();
    if (text) {
      specs.push(parseSpecString(text));
    }
  });

  return specs;
}
