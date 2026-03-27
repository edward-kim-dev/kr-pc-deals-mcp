# External API Reference

kr-pc-deals-mcp가 호출하는 외부 API 엔드포인트 목록.

---

## 다나와 (Danawa)

### 1. 키워드 검색

다나와 통합검색 페이지에서 제품 목록을 가져온다.

```
GET https://search.danawa.com/dsearch.php
```

| 파라미터 | 값 | 설명 |
|---|---|---|
| `query` | 검색어 (URL-encoded) | 검색 키워드 |
| `tab` | `goods` (고정) | 상품 탭 |

- **응답**: HTML
- **파싱**: `.product_list .prod_item` 또는 `.main_prodlist .prod_item` 셀렉터로 제품 ID, 이름, 가격, 이미지 추출
- **사용처**: `searchDanawa()` — 카테고리 미지정 시 폴백

---

### 2. 가상견적 제품 목록

카테고리별 제품 목록 조회. 키워드 필터링도 지원.

```
GET https://shop.danawa.com/virtualestimate/
```

| 파라미터 | 값 | 설명 |
|---|---|---|
| `controller` | `estimateMain` | 컨트롤러 |
| `methods` | `product` | 제품 목록 메서드 |
| `marketPlaceSeq` | `16` | 마켓플레이스 ID |
| `categorySeq` | 카테고리 시퀀스 | 아래 테이블 참조 |
| `categoryDepth` | `2` | 카테고리 depth |
| `pseq` | `2` | 고정값 |
| `serviceSectionSeq` | 섹션 시퀀스 | 카테고리 필터 (아래 테이블 참조) |
| `page` | 페이지 번호 | 1부터 시작 |
| `minPrice` | `0` | 최소 가격 |
| `maxPrice` | `0` | 최대 가격 (0 = 무제한) |
| `name` | 검색어 (선택) | 키워드 필터링 |

**카테고리 매핑:**

| 카테고리 | categorySeq | serviceSectionSeq |
|---|---|---|
| cpu | 873 | 266 |
| ram | 874 | 268 |
| motherboard | 875 | 267 |
| gpu | 876 | 269 |
| hdd | 877 | 270 |
| ssd | 32617 | 272 |
| case | 879 | 273 |
| psu | 880 | 274 |
| cooler | 887 | 280 |
| monitor | 13735 | 276 |

> **주의**: `name=` 파라미터 사용 시 `categorySeq`는 항상 `887`로 고정하고, `serviceSectionSeq`로 실제 카테고리를 필터링한다.

- **응답**: HTML
- **파싱**: `tr[class*='productList_']` 셀렉터에서 `productInfoPopup(\d+)` 패턴으로 ID 추출
- **사용처**: `searchDanawa()`, `listByCategory()`

---

### 3. 카테고리 목록 (폴백)

가상견적 API 실패 시 사용하는 폴백 엔드포인트.

```
GET https://prod.danawa.com/list/
```

| 파라미터 | 값 | 설명 |
|---|---|---|
| `cate` | 카테고리 코드 | 아래 테이블 참조 |
| `sort` | `lowprice` \| `bestsell` | 정렬 기준 |

**카테고리 코드:**

| 카테고리 | cate |
|---|---|
| cpu | 112747 |
| gpu | 112753 |
| motherboard | 112751 |
| ram | 112752 |
| ssd | 112760 |
| hdd | 112763 |
| psu | 112777 |
| case | 112775 |
| cooler | 11236855 |
| monitor | 112757 |

- **응답**: HTML
- **사용처**: `listByCategory()` 폴백

---

### 4. 제품 상세

개별 제품의 스펙, 판매처별 가격 조회.

```
GET https://prod.danawa.com/info/
```

| 파라미터 | 값 | 설명 |
|---|---|---|
| `pcode` | 제품 코드 | 다나와 제품 ID |

- **응답**: HTML
- **파싱**: 스펙 테이블, 판매처별 가격 목록 추출
- **사용처**: `getProductDetail()`

---

### 5. 가격 이력

제품의 과거 가격 변동 데이터 조회.

```
GET https://prod.danawa.com/info/ajax/getProductPriceList.ajax.php
```

| 파라미터 | 값 | 설명 |
|---|---|---|
| `productCode` | 제품 코드 | 다나와 제품 ID |
| `period` | `1` \| `3` \| `6` \| `12` | 기간 (개월) |

**요청 헤더:**
- `Referer: https://prod.danawa.com/info/?pcode={productCode}`
- `X-Requested-With: XMLHttpRequest`

**응답 (JSON):**
```json
{
  "data": {
    "priceList": [
      { "date": "2025-01-15", "minPrice": 450000, "maxPrice": 520000 }
    ]
  }
}
```

- **사용처**: `getPriceHistory()`

---

### 6. 호환성 체크

부품 간 호환성 검증 (CPU-메인보드 소켓, CPU-RAM 규격 등).

```
GET https://shop.danawa.com/virtualestimate/
```

| 파라미터 | 값 | 설명 |
|---|---|---|
| `controller` | `estimateMain` | 컨트롤러 |
| `methods` | `compatibility` | 호환성 메서드 |
| `productSeqList` | 제품ID 쉼표 구분 | 최소 2개 필요 |
| `_` | 타임스탬프 | 캐시 무효화 |

**요청 헤더:**
- `Referer: https://shop.danawa.com/virtualestimate/`
- `X-Requested-With: XMLHttpRequest`

**응답 (JSON):**
```json
{
  "result": {
    "cpu-ram": {
      "result": "0001",
      "cpuMessage": "호환 가능",
      "ramMessage": "DDR5 지원"
    },
    "cpu-mainboard": {
      "result": "0002",
      "cpuMessage": "소켓 불일치",
      "mainboardMessage": "LGA1700 필요"
    }
  }
}
```

- `result === "0001"`: 호환 가능
- 그 외: 호환 문제 있음
- 키에서 `Message`로 끝나는 필드가 부품별 상세 메시지
- **사용처**: `checkBuildCompatibility()`

---

## 컴퓨존 (Compuzone)

### 7. 키워드 검색

```
GET https://www.compuzone.co.kr/search/search_list.php
```

| 파라미터 | 값 | 설명 |
|---|---|---|
| `actype` | `list` | 액션 타입 |
| `SearchType` | `small` | 검색 타입 |
| `SearchText` | 검색어 (URL-encoded) | 검색 키워드 |
| `PreOrder` | `recommand` | 정렬 |
| `PageCount` | `20` | 페이지당 결과 수 |
| `StartNum` | `0` | 시작 인덱스 |
| `PageNum` | `1` | 페이지 번호 |
| `ListType` | (빈 문자열) | |
| `BigDivNo` | 대분류 코드 (선택) | 카테고리 필터 |
| `MediumDivNo` | 중분류 코드 (선택) | 카테고리 필터 |
| `DivNo` | (빈 문자열) | |

**카테고리 매핑:**

| 카테고리 | BigDivNo | MediumDivNo |
|---|---|---|
| cpu | 4 | 1012 |
| gpu | 4 | 1016 |
| motherboard | 4 | 1013 |
| ram | 4 | 1014 |
| ssd | 4 | 1276 |
| hdd | 4 | 1015 |
| psu | 4 | 1148 |
| case | 4 | 1147 |
| cooler | 4 | 1020 |
| monitor | 4 | 1022 |

**요청 헤더:**
- `Referer: https://www.compuzone.co.kr/search/search.htm`
- `X-Requested-With: XMLHttpRequest`

- **응답**: HTML (EUC-KR 인코딩)
- **파싱**: `div.prd_price`에서 `data-pricetable` (제품 ID), `data-price` (가격) 추출
- **사용처**: `searchCompuzone()`

---

### 8. 제품 상세

```
GET https://www.compuzone.co.kr/product/product_detail.htm
```

| 파라미터 | 값 | 설명 |
|---|---|---|
| `ProductNo` | 제품 ID | 컴퓨존 제품 번호 |

- **응답**: HTML (EUC-KR 인코딩)
- **파싱**: 스펙 테이블, 가격 정보 추출
- **사용처**: `getCompuzoneProductDetail()`

---

## Zyte 프록시 (선택적)

직접 요청이 차단(429/403)될 때 자동으로 전환되는 프록시 서비스.

`ZYTE_API_KEY` 환경변수가 설정된 경우에만 활성화.

```
POST https://api.zyte.com/v1/extract
```

**인증**: HTTP Basic Auth (`{apiKey}:` Base64 인코딩)

**요청 본문:**
```json
{
  "url": "대상 URL",
  "httpResponseBody": true,
  "browserHtml": false
}
```

| 필드 | 설명 |
|---|---|
| `httpResponseBody` | Base64 인코딩된 응답 바디 반환 |
| `httpResponseHeaders` | 응답 헤더 반환 |
| `browserHtml` | JS 렌더링된 HTML 반환 (비용 높음) |
| `httpRequestMethod` | HTTP 메서드 지정 |
| `httpRequestText` | 요청 바디 |
| `customHttpRequestHeaders` | 커스텀 헤더 배열 |

**응답:**
```json
{
  "url": "string",
  "statusCode": 200,
  "httpResponseBody": "Base64 인코딩된 바디",
  "httpResponseHeaders": [{ "name": "string", "value": ["string"] }],
  "browserHtml": "렌더링된 HTML"
}
```

---

## HTTP 클라이언트 설정

### 동시성 제어

| 사이트 | 최대 동시 요청 | 최소 요청 간격 |
|---|---|---|
| 다나와 | 3 | 500ms |
| 컴퓨존 | 2 | 1,000ms |
| 기본값 | 2 | 1,000ms |

### User-Agent 로테이션

요청마다 아래 풀에서 랜덤 선택:

- Firefox 138 (Windows)
- Chrome 146 (macOS)
- Chrome 146 (Windows)

### 재시도 및 차단 대응

- **재시도**: HTML 요청 최대 2회, JSON 요청 재시도 없음
- **백오프**: 1s → 2s → 4s (최대 10s)
- **차단 감지**: 429/403 응답 시 지수 백오프 (30s → 60s → 120s, 최대 5분)
- **Zyte 전환**: 직접 요청 3회 연속 실패 시 자동으로 Zyte 프록시 모드 전환
