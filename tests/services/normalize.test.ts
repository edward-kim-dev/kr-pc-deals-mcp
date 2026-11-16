import { describe, it, expect } from "vitest";
import {
  normalizeProductName,
  calculateSimilarity,
  extractModelNumber,
  matchProduct,
} from "../../src/utils/normalize.js";

describe("normalizeProductName", () => {
  it("공백·괄호·구두점을 정리하고 소문자로 바꾼다", () => {
    expect(normalizeProductName("인텔  코어   i7")).toBe("인텔 코어 i7");
    expect(normalizeProductName("RTX 4070 (12GB)")).toBe("rtx 4070 12gb");
    expect(normalizeProductName("[MSI] RTX 5070, OC")).toBe("msi rtx 5070 oc");
  });

  it("숫자 사이의 점은 남긴다 (ATX3.1, 2025.03)", () => {
    expect(normalizeProductName("850W ATX3.1")).toBe("850w atx3.1");
  });
});

describe("calculateSimilarity", () => {
  it("같은 이름은 1, 다른 제품은 낮다", () => {
    expect(calculateSimilarity("RTX 4070", "RTX 4070")).toBe(1);
    expect(calculateSimilarity("RTX 4070", "RX 7900 XTX")).toBeLessThan(0.3);
  });
});

describe("extractModelNumber", () => {
  it.each([
    ["MSI 지포스 RTX 5070 Ti 게이밍 트리오", "rtx5070ti"],
    ["RTX 5070Ti", "rtx5070ti"],
    ["GIGABYTE GTX 1660 SUPER", "gtx1660super"],
    ["인텔 코어 i7-14700K", "14700k"],
    ["Intel Core i7 14700K", "14700k"],
    ["AMD 라이젠7-5세대 7800X3D (라파엘)", "7800x3d"],
    ["AMD Ryzen 7 7800X3D", "7800x3d"],
    ["Intel Core Ultra 7 265K", "265k"],
    ["삼성 DDR5 6000 16GB", "ddr56000"],
    ["마이크로닉스 Classic II 850W", null],
    // 다나와·컴퓨존의 실제 CPU 표기
    ["인텔 코어i7-14세대 14700K (랩터레이크 리프레시) (정품)", "14700k"],
    ["인텔 코어i5-14세대 14600KF (랩터레이크 리프레시)", "14600kf"],
    ["인텔 코어 울트라7 시리즈2 265K (애로우레이크)", "265k"],
    ["인텔 코어 울트라7 시리즈2 270K Plus (애로우레이크 리프레시)", "270kplus"],
    ["AMD 라이젠5-4세대 5600 (버미어)", "5600"],
    ["[AMD] 라이젠5 버미어 5600 (6코어/12스레드/3.5GHz)", "5600"],
    ["AMD 라이젠7-6세대 9700X (그래니트 릿지)", "9700x"],
    ["14700K", "14700k"],
    // CPU가 아닌 부품의 숫자+알파벳은 CPU 모델로 보지 않는다
    ["ASUS ROG STRIX 1000G AURA Gaming", null],
    ["CORSAIR iCUE 5000X RGB", null],
  ])("%s → %s", (name, model) => {
    expect(extractModelNumber(name)).toBe(model);
  });

  it("category가 cpu면 접두사 없는 SKU도 읽는다", () => {
    expect(extractModelNumber("7700X")).toBeNull();
    expect(extractModelNumber("7700X", "cpu")).toBe("7700x");
  });
});

describe("matchProduct", () => {
  it("이름 표기만 다른 같은 제품을 찾는다", () => {
    expect(
      matchProduct("MSI 지포스 RTX 5070 게이밍 트리오 OC D7 12GB 트라이프로져4", [
        "[MSI] 지포스 RTX 5070 게이밍 트리오 OC D7 12GB 트라이프로져4",
      ])
    ).toEqual({ index: 0, similarity: 1 });
  });

  it("브랜드의 한글·영문 표기를 같게 본다 (갤럭시 = GALAX)", () => {
    expect(matchProduct("갤럭시 GALAX 지포스 RTX 5070 BLACK OC D7 12GB", ["[GALAX] 지포스 RTX 5070 BLACK OC D7 12GB"])).not.toBeNull();
  });

  it("유통사만 다른 같은 카드는 같은 제품이다", () => {
    expect(
      matchProduct("GIGABYTE 지포스 RTX 5070 AERO OC D7 12GB 제이씨현", ["[GIGABYTE] 지포스 RTX 5070 AERO OC D7 12GB 피씨디렉트"])
    ).toEqual({ index: 0, similarity: 1 });
  });

  it("모델번호가 다르면 짝짓지 않는다", () => {
    expect(matchProduct("MSI 지포스 RTX 5070 Ti 게이밍 트리오 OC D7 16GB", ["[MSI] 지포스 RTX 5070 게이밍 트리오 OC D7 12GB"])).toBeNull();
    expect(matchProduct("ASUS RTX 4070 SUPER DUAL 12GB", ["ASUS RTX 4070 DUAL 12GB"])).toBeNull();
    expect(matchProduct("AMD 라이젠7 7800X3D 정품", ["AMD 라이젠7 7700X 정품"])).toBeNull();
    expect(matchProduct("GIGABYTE GTX 1660 OC 6GB", ["GIGABYTE GTX 1660 SUPER OC 6GB"])).toBeNull();
    expect(matchProduct("Intel Core Ultra 7 265K", ["Intel Core Ultra 7 265KF"])).toBeNull();
  });

  it("모델번호가 같아도 브랜드가 다르면 짝짓지 않는다", () => {
    expect(
      matchProduct("ZOTAC GAMING 지포스 RTX 5070 SOLID OC D7 12GB", ["[GIGABYTE] 지포스 RTX 5070 GAMING OC D7 12GB 제이씨현"])
    ).toBeNull();
    expect(
      matchProduct("PALIT 지포스 RTX 5070 Ti GAMINGPRO-S D7 16GB 이엠텍", ["[GIGABYTE] 지포스 RTX 5070 Ti WINDFORCE OC SFF D7 16GB 피씨디렉트"])
    ).toBeNull();
  });

  it("같은 브랜드라도 제품군이 다르면 짝짓지 않고, 맞는 제품군을 고른다", () => {
    const candidates = [
      "[GIGABYTE] 지포스 RTX 5070 GAMING OC D7 12GB 제이씨현",
      "[GIGABYTE] 지포스 RTX 5070 AERO OC D7 12GB 피씨디렉트",
    ];
    expect(matchProduct("GIGABYTE 지포스 RTX 5070 AERO OC D7 12GB 제이씨현", candidates)?.index).toBe(1);
    expect(matchProduct("GIGABYTE 지포스 RTX 5070 AERO OC D7 12GB 제이씨현", candidates.slice(0, 1))).toBeNull();
  });

  it("제품군 이름이 서로 다른 단어면 나머지가 많이 겹쳐도 짝짓지 않는다", () => {
    // 다나와 919,000원 ↔ 에누리 840,000원으로 실제로 잘못 묶였던 쌍 (단어 12개 중 10개가 겹친다)
    expect(
      matchProduct("ESSENCORE KLEVV DDR5-6000 CL28 CRAS V RGB WHITE 패키지 서린 (32GB(16Gx2))", [
        "ESSENCORE KLEVV DDR5-6000 CL28 URBANE V RGB 화이트 패키지 서린 32GB(16Gx2)",
      ])
    ).toBeNull();
    // 한쪽이 단어를 더 붙인 것은 같은 제품이다
    expect(
      matchProduct("ESSENCORE KLEVV DDR5-6000 CL28 CRAS V RGB WHITE 패키지 서린 (32GB(16Gx2))", [
        "ESSENCORE KLEVV DDR5-6000 CL28 CRAS V RGB 화이트 패키지 서린 32GB(16Gx2)",
      ])
    ).not.toBeNull();
  });

  it("용량·와트 같은 숫자 사양이 다르면 짝짓지 않는다", () => {
    expect(matchProduct("MSI 지포스 RTX 5060 Ti 벤투스 2X OC D7 8GB", ["[MSI] 지포스 RTX 5060 Ti 벤투스 2X OC D7 16GB"])).toBeNull();
    expect(matchProduct("마이크로닉스 Classic II 750W 80PLUS브론즈", ["[마이크로닉스] Classic II 850W 80PLUS브론즈"])).toBeNull();
    expect(matchProduct("마이크로닉스 Classic II 850W 80PLUS브론즈", ["[마이크로닉스] Classic II 850W 80PLUS브론즈"])).not.toBeNull();
  });

  it("CPU는 사이트마다 이름 체계가 달라도 모델번호가 같으면 같은 제품이다", () => {
    expect(
      matchProduct("AMD 라이젠7-5세대 7800X3D (라파엘)", ["[AMD] 라이젠7 라파엘 7800X3D (8코어/16스레드/4.2GHz/쿨러미포함)"])
    ).not.toBeNull();
  });

  it("포장이 서로 다르게 적혀 있으면 다른 제품이다 (정품 ↔ 멀티팩)", () => {
    expect(matchProduct("AMD 라이젠7-6세대 9800X3D (그래니트 릿지) (정품)", ["[AMD] 라이젠7 9800X3D (멀티팩)"])).toBeNull();
    // 다나와는 멀티팩을 "(멀티팩 정품)"으로 적는다. "정품"이 겹쳐도 멀티팩과 정품(박스)은 다른 제품이다
    expect(matchProduct("AMD 라이젠7-5세대 7800X3D (라파엘) (멀티팩 정품)", ["[AMD] 라이젠7-5세대 7800X3D (라파엘) (정품)"])).toBeNull();
    expect(matchProduct("AMD 라이젠7-5세대 7800X3D (라파엘) (멀티팩 정품)", ["[AMD] 라이젠7 라파엘 7800X3D 멀티팩"])).not.toBeNull();
    expect(matchProduct("AMD 라이젠7-6세대 9700X (벌크 정품)", ["[AMD] 라이젠7 9700X (벌크 병행)"])).toBeNull();
  });

  it("CPU 모델로 오인할 수 있는 파워·케이스는 제품군까지 따진다", () => {
    expect(matchProduct("ASUS ROG STRIX 1000G AURA Gaming", ["[ASUS] TUF Gaming 1000G"])).toBeNull();
    expect(matchProduct("CORSAIR iCUE 5000X RGB", ["[CORSAIR] 5000X RGB QL Edition"])).toBeNull();
  });

  it("변형색(WHITE·ICE)은 양쪽에 똑같이 적혀 있어야 한다", () => {
    expect(
      matchProduct("MSI 지포스 RTX 5070 게이밍 트리오 OC WHITE D7 12GB", ["[MSI] 지포스 RTX 5070 게이밍 트리오 OC D7 12GB"])
    ).toBeNull();
    expect(
      matchProduct("GIGABYTE 지포스 RTX 5070 Ti EAGLE OC ICE SFF D7 16GB 제이씨현", ["[GIGABYTE] 지포스 RTX 5070 Ti EAGLE OC SFF D7 16GB 피씨디렉트"])
    ).toBeNull();
  });

  it("그래픽카드는 OC판·SFF(소형)판과 일반판을 다른 제품으로 본다", () => {
    // 에누리에 따로 등록된 두 제품 (2,111,100원 / 2,191,990원)
    expect(
      matchProduct("PALIT 지포스 RTX 5070 Ti GAMINGPRO-S D7 16GB 이엠텍", ["PALIT 지포스 RTX 5070 Ti GAMINGPRO-S OC D7 16GB 이엠텍"], "gpu")
    ).toBeNull();
    // 다나와 2,259,000원 ↔ 에누리 1,825,000원으로 실제로 잘못 묶였던 쌍
    expect(
      matchProduct(
        "COLORFUL iGame 지포스 RTX 5070 Ti ULTRA OC SFF White D7 16GB 피씨디렉트",
        ["COLORFUL iGame 지포스 RTX 5070 Ti ULTRA OC White D7 16GB 피씨디렉트"],
        "gpu"
      )
    ).toBeNull();
    expect(
      matchProduct("ZOTAC GAMING 지포스 RTX 5070 SOLID OC D7 12GB", ["[ZOTAC] 지포스 RTX 5070 SOLID OC D7 12GB"], "gpu")
    ).not.toBeNull();
  });

  it("색상이 서로 다르게 적혀 있으면 다른 제품이다", () => {
    expect(
      matchProduct("갤럭시 GALAX 지포스 RTX 5070 Ti EX GAMER BLACK OC D7 16GB", ["[GALAX] 지포스 RTX 5070 Ti EX GAMER WHITE OC D7 16GB"])
    ).toBeNull();
  });
});
