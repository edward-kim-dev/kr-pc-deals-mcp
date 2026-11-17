# 데이터 출처

kr-pc-deals-mcp가 읽는 외부 페이지와 데이터 주소를 정리한 문서입니다. 사이트가 화면을 바꿔 결과가 비거나 가격이 이상하게 나오면 이 문서를 보고 해당 파서와 고정 데이터를 고칩니다.

모든 요청은 `src/utils/http.ts`의 `fetchText`/`fetchJson`을 거칩니다. 사이트별 요청 간격·상한, 차단 감지, 재시도는 맨 아래 [요청 규칙](#요청-규칙)에 있습니다.

## 한눈에 보기

| 용도 | 주소 | 형식 | robots.txt | 코드 | 고정 데이터 |
|---|---|---|---|---|---|
| 다나와 키워드 검색 | `search.danawa.com/api/search/product-list/` | JSON | 허용 (Crawl-delay 10) | `providers/danawa/search.ts` | `danawa-search.json`, `danawa-search-ram.json` |
| 다나와 카테고리 인기 목록 | `prod.danawa.com/list/?cate=` | HTML + Next.js 데이터 | 허용 | `providers/danawa/list.ts` | `danawa-list.html` |
| 다나와 상품 상세 | `prod.danawa.com/info/?pcode=` | HTML (옛·새 템플릿) | 허용 | `providers/danawa/product.ts` | `danawa-product.html`, `danawa-product-next.html` |
| 다나와 가격 이력 | `prod.danawa.com/info/ajax/getProductPriceList.ajax.php` | JSON | **금지** (`/info/ajax/`, 사용자 결정으로 사용) | `providers/danawa/price-history.ts` | `danawa-price-history.json` |
| 다나와 호환성 검사 | `shop.danawa.com/virtualestimate/?methods=compatibility` | JSON | 허용 | `providers/danawa/compatibility.ts` | `danawa-compatibility.json` |
| 에누리 키워드 검색 | `price.enuri.com/search?keyword=` | HTML + Next.js 데이터 | 허용 (Crawl-delay 1) | `providers/enuri/search.ts` | `enuri-search.html`, `enuri-search-rtx5070.html` |
| 에누리 카테고리 인기 목록 | `price.enuri.com/list?category=` | HTML + Next.js 데이터 | 허용 (Crawl-delay 1) | `providers/enuri/list.ts` | `enuri-list-gpu.html` |
| 에누리 상품 상세 | `price.enuri.com/catalog/{modelno}` | HTML + Next.js 데이터 | 허용 (Crawl-delay 1) | `providers/enuri/product.ts` | `enuri-product.html` |
| 견적왕 검색 화면 (토큰) | `kjwwang.com/shop/product_search.html?main_search=` | HTML (EUC-KR) | 허용 | `providers/kjwwang/search.ts`, `parser.ts` | `kjwwang-search.html`, `kjwwang-search-rtx5070.html` |
| 견적왕 검색 목록 | `kjwwang.com/skin/shop/basic/product_list_include_plist.php` (POST) | HTML 조각 (EUC-KR) | 허용 | `providers/kjwwang/search.ts`, `parser.ts` | `kjwwang-list.html`, `kjwwang-list-rtx5070.html` |
| 견적왕 카테고리 인기 목록 | `kjwwang.com/skin/shop/basic/product_list_include_plist.php` (POST, 분류 폼) | HTML 조각 (EUC-KR) | 허용 | `providers/kjwwang/list.ts` | `kjwwang-category-gpu.html` |
| 견적왕 상품 상세 | `kjwwang.com/shop/product_detail.html?pd_no=` | HTML (EUC-KR) | 허용 | `providers/kjwwang/product.ts`, `parser.ts` | `kjwwang-product.html` |
| 컴퓨존 키워드 검색 | `www.compuzone.co.kr/search/search_list.php` | HTML 조각 (EUC-KR) | 허용 | `providers/compuzone/search.ts`, `parser.ts` | `compuzone-search.html` |
| 컴퓨존 카테고리 인기 목록 | `www.compuzone.co.kr/product/product_list.php` (POST) | HTML 조각 (EUC-KR) | 허용 | `providers/compuzone/list.ts` | `compuzone-list-gpu.html` |
| 컴퓨존 상품 상세 | `www.compuzone.co.kr/product/product_detail.htm` | HTML (EUC-KR) | 허용 | `providers/compuzone/product.ts`, `parser.ts` | `compuzone-product.html` |

고정 데이터는 `tests/fixtures/`에 있고, 실제 응답에서 필요한 부분만 잘라 만든 것입니다 (컴퓨존·견적왕은 UTF-8로 바꿔 저장, 테스트에서 다시 EUC-KR로 인코딩). 이름에 `rtx5070`이 붙은 것과 `danawa-search.json`·`compuzone-search.html`은 네 사이트의 같은 "RTX 5070" 검색 응답이라 사이트 간 묶음 테스트에 함께 쓴다.

## 카테고리 코드

부품 종류(`src/core/categories.ts`)와 사이트별 코드의 대응입니다. 다나와 `cate2`는 검색 필터, 상품 데이터의 `categorySeq2`, 호환성 검사의 부품 코드에 똑같이 쓰입니다.

| 부품 | 다나와 목록 `cate` | 다나와 `cate1` / `cate2` | 에누리 `category` | 견적왕 `search_cate` | 컴퓨존 `BigDivNo` / `MediumDivNo` |
|---|---|---|---|---|---|
| cpu | 112747 | 861 / 873 | 0707 | 9 | 4 / 1012 |
| gpu | 112753 | 861 / 876 | 0705 | 12 | 4 / 1016 |
| motherboard | 112751 | 861 / 875 | 0708 | 11 | 4 / 1013 |
| ram | 112752 | 861 / 874 | 0703 | 10 | 4 / 1014 |
| ssd | 112760 | 861 / 32617 | 071307 | 243 | 4 / 1276 |
| hdd | 112763 | 861 / 877 | 071306 | 13 | 4 / 1015 |
| psu | 112777 | 861 / 880 | 0718 | 15 | 4 / 1148 |
| case | 112775 | 861 / 879 | 0711 | 16 | 4 / 1147 |
| cooler | 11236855 | 862 / 887 | 0719 | 574 | 4 / 1020 |
| monitor | 112757 | 860 / 13735 | 0405 | 6090 | 4 / 1022 |

코드는 각 사이트의 `src/providers/<site>/categories.ts`에 있습니다. 에누리는 4자리가 중분류, 6자리가 소분류이고 상품 데이터의 `category.categoryId` 앞자리로 부품 종류를 알아낸다 (SSD·HDD는 같은 중분류 0713이라 소분류를 쓴다). 견적왕은 목록 상품의 분류 이름(`ul.prd_cate li`, 예: "그래픽카드")으로 부품 종류를 알아낸다. 다나와 `cooler`(887)는 "쿨러/튜닝" 전체라 팬·서멀구리스도 검색 결과에 섞일 수 있습니다.

## 다나와

### 키워드 검색

검색 화면(`search.danawa.com/?query=…`)이 쓰는 상품 목록 JSON입니다. 검색 화면 HTML(약 1.5MB)과 같은 데이터를 16KB 안팎으로 받습니다.

```
GET https://search.danawa.com/api/search/product-list/?keyword={검색어}&sort=saveDESC&page=1&limit=40[&cate1={cate1}&cate2={cate2}]
Referer: https://search.danawa.com/?query={검색어}&tab=goods
```

| 파라미터 | 값 |
|---|---|
| `sort` | `saveDESC`(인기, 사용 중), `priceASC`, `priceDESC`, `dateDESC`, `opinionDESC` |
| `limit` | 한 페이지 상품 수. 40을 쓴다 |
| `cate1`, `cate2` | 카테고리 필터 (위 표) |

응답 `data.products[]`에서 쓰는 필드:

| 필드 | 뜻 |
|---|---|
| `prodType` | `1` 가격비교 카탈로그 상품, `3` 오픈마켓 개별 상품. **1만 쓴다** (3은 pcode가 없어 상세·견적에 쓸 수 없음) |
| `productSeq` | 상품 코드(pcode). 숫자가 아니면 버린다 (`TH201_…` 같은 오픈마켓 코드) |
| `productName` | 상품명. 검색어가 `<b>` 태그로 감싸져 있어 태그를 지운다. 용량별 묶음 상품은 용량이 빠져 있다 |
| `bundleName` | 이 상품 코드의 묶음 옵션 이름 (예: `32GB(16Gx2)`). 상품명 뒤에 괄호로 붙인다. 그래픽카드처럼 묶음이 없으면 없다 |
| `bundleList[]` | 같은 묶음의 다른 옵션 (`productSeq`, `bundleName`, `minPrice`, `shopCount`). 옵션마다 pcode·가격이 따로 있어 별도 상품으로 펼쳐 대표 상품들 뒤에 붙인다 |
| `minPrice` | 판매처 최저가(원). 0이면 가격 미정 |
| `shopCount` | 판매처 수 |
| `categorySeq2` | 카테고리 코드 → 부품 종류로 바꾼다 |

- robots.txt: `search.danawa.com`은 `/api_ui/` 등만 막고 `Crawl-delay: 10`을 둔다. 그래서 `danawa-search` limiter가 10초에 한 번만 보낸다.
- 검색 화면 URL에 `cate=`를 붙여도 서버 렌더 결과는 걸러지지 않는다. 카테고리는 이 JSON의 `cate1`/`cate2`로만 거른다.

### 카테고리 인기 목록

```
GET https://prod.danawa.com/list/?cate={목록 cate}
```

- Next.js 페이지다. 서버가 React Query 캐시를 `self.__next_f.push([1, "…"])` 스크립트 조각에 직렬화해 넣는다. `src/utils/next-flight.ts`가 조각을 이어 붙이고 `{"state":{"mutations":…,"queries":[…]}}` 객체를 꺼낸다 (에누리도 같은 방식).
- `queryKey[0] === "productList"`인 항목의 `data.products[]` 30개(인기상품순 `BEST`)를 쓴다.

| 필드 | 뜻 |
|---|---|
| `id` | pcode |
| `productName` | 상품명 |
| `bundleProductName` | 용량별 묶음 상품의 옵션 이름 (예: `32GB(16Gx2)`). 있으면 상품명 뒤에 괄호로 붙인다 |
| `price.min` | 판매처 최저가 |
| `price.promotionMinPriceQ` | 같은 상품의 다른 기준가. `price.min`이 이것의 절반도 안 되면 판매처 등록 오류로 보고 `priceWarning`을 붙인다 |
| `stats.shopCount` | 판매처 수 |

- 서버가 그려 주는 것은 첫 화면(인기순 30개)뿐이다. URL의 `sort`·`page`는 무시되고, 다른 정렬·페이지는 robots.txt가 막은 `/api/`로만 받을 수 있다. 그래서 `list_by_category`의 가격순은 이 30개를 다시 정렬한 결과다 (다른 사이트도 같은 방식).
- 가상견적 상품 목록(`shop.danawa.com/virtualestimate/?methods=product`)은 쓰지 않는다. 그 가격은 견적용 판매처(`marketPlaceSeq`) 가격이라 다나와 최저가와 다르다.

### 상품 상세

```
GET https://prod.danawa.com/info/?pcode={pcode}
```

다나와가 상세 페이지를 새 구조로 옮기는 중이라 상품마다 두 템플릿이 섞여 나온다. `parseDanawaProductPage`가 새 템플릿 데이터를 먼저 찾고, 없으면 옛 템플릿을 읽는다.

**새 템플릿 (Next.js)**: 직렬화된 React Query 항목 두 개를 쓴다. `queryKey[2]`가 요청한 pcode인 항목만 쓰고, 값이 다른 조각을 가리키는 참조 문자열(`"$4f"` 같은 값)이면 버린다. 가격을 못 읽으면 `og:description`의 최저가로 대신한다.

| queryKey | 쓰는 필드 |
|---|---|
| `["productInfo", "productBasicInfo", pcode]` | `price.min`, `maker.name`, `brand.name`, `productName`, `productBundleName`, `makeDate`, `simpleDescription` (`항목$값` 을 `\|`로 잇고, 여러 값은 `^`로 잇는다) |
| `["productInfo", "priceCompareTab", …]` | `sections[].items[]`: `shop`, `price`("359,310"), `delivery`("무료배송", "배송비 2,400원"), `productUrl` |

**옛 템플릿 (서버 렌더 HTML)**:

| 정보 | 위치 |
|---|---|
| 상품명 | `meta[property="og:title"]` ("[다나와] " 접두 제거) |
| 최저가 | `#min_price_{pcode}`, `#intMinFee`, `og:description` |
| 현금최저가 | `og:description`의 "현금최저가: …원" (두 템플릿 공통) |
| 스펙 요약 | `.spec_list` 글자를 " / "로 나눈다 |
| 등록월·제조사 | `.made_info` |
| 쇼핑몰별 최저가 | `ul.list__mall-price > li`: `.box__logo img[alt]`(쇼핑몰), `.sell-price[data-base-price]`, 배송비는 `data-delivery-price` 또는 `.box__delivery` 글자 |

- 옛 템플릿의 전체 판매처 목록은 `/info/ajax/getAllPriceCompareMallList.ajax.php`(robots.txt 금지)로 따로 불러오므로 쓰지 않는다. 첫 화면의 상위 판매처(보통 10곳 안팎)만 준다.
- 옛 템플릿이 가끔 본문 없이(스펙·판매처 없이) 응답한다. 그런 결과는 캐시하지 않고, 도구 결과에 `notice`를 붙인다.
- 판매처 링크(`prod.danawa.com/bridge/…`)는 사용자에게 보여 주기만 하고 서버가 요청하지 않는다 (robots.txt 금지 경로).

### 가격 이력 ⚠️

```
GET https://prod.danawa.com/info/ajax/getProductPriceList.ajax.php?productCode={pcode}&period={개월}
Referer: https://prod.danawa.com/info/?pcode={pcode}
X-Requested-With: XMLHttpRequest
```

응답(Content-Type은 text/html이지만 내용은 JSON) 한 번에 **모든 기간**이 들어 있다. `period` 값과 상관없다.

```json
{ "1":  { "count": 4,  "result": [{ "Fulldate": "26-10-20", "date": "10-20", "minPrice": 1291680 }, …], "minPrice": "645220", "maxPrice": "1355520" },
  "3":  { … 주 단위 12점 },
  "6":  { "count": 6,  "result": [{ "date": "26-06", "minPrice": 944390 }, …] },
  "12": { … 월 단위 }, "24": { … 월 단위 } }
```

- 1·3개월은 주 단위(`Fulldate` "YY-MM-DD"), 6·12·24개월은 월 단위(`date` "YY-MM")다. 시점마다 **최저가 하나만** 있다 (최고가 이력은 없다).
- 월 단위 값은 그 달의 가장 낮은 주간 최저가라, 한 주짜리 이상값(판매처 등록 오류로 보이는 급락)이 그대로 섞인다.
- `parseDanawaPriceHistory`가 날짜를 "2026-10-20"·"2026-10"으로 바꾸고, 주 단위에서 앞뒤 주보다 25% 넘게 낮았다가 회복한 값을 `suspicious`로 표시해 기간 최저·최고가 계산에서 뺀다.
- 상품당 한 번만 받아 다섯 기간을 함께 6시간 캐시한다. 응답이 이 형식이 아니면 오류를 내고 캐시하지 않는다.
- **`prod.danawa.com` robots.txt가 막은 `/info/ajax/` 아래 주소다.** 가격 이력을 주는 다른 공개 경로가 없어, 2026-11-16 사용자 결정으로 쓴다. 요청을 최소로 유지한다 (상품당 6시간에 한 번).
- 고정 데이터: `danawa-price-history.json` (실제 응답).

### 호환성 검사

```
GET https://shop.danawa.com/virtualestimate/?controller=estimateMain&methods=compatibility&productSeqList={pcode,pcode,…}
Referer: https://shop.danawa.com/virtualestimate/
X-Requested-With: XMLHttpRequest
```

응답 예:

```json
{ "desc": "", "result": {
  "cpu-mainboard": { "result": "0001", "cpuCode": "873", "cpuMessage": "호환 문제 없습니다.", "mainboardCode": "875", "mainboardMessage": "호환 문제 없습니다." }
} }
```

- 쌍 이름(`cpu-ram`, `cpu-mainboard`, `ram-mainboard` …)마다 `result`가 `"0001"`이면 호환이다. `…Message`로 끝나는 필드를 안내 문구로 모은다.
- 최상위 `result`가 빈 배열(`[]`)이면 판정할 조합이 없는 것이다. 객체도 빈 배열도 아니면(예: `null`과 `desc` 오류 문구) 형식 오류로 보고 캐시하지 않는다.
- 다나와는 CPU·메인보드·RAM 조합 위주로 판정한다. 그래픽카드·파워 조합은 결과가 없을 수 있다.
- robots.txt: `shop.danawa.com`은 AI **학습 전용** 봇(GPTBot, ClaudeBot 등)만 막고, "일반 검색엔진 및 AI 검색/인용 봇"은 기본 정책(`Allow: /`, `/b2b/`만 금지)을 따른다고 적어 두었다.

## 에누리

`price.enuri.com`은 Next.js 페이지다. 서버가 그려 보내는 첫 화면의 직렬화 데이터(`self.__next_f`)만 읽는다. 탭·정렬·페이지를 바꾸면 화면이 robots.txt가 막은 `/api/`로 다시 불러오므로 그 값들은 쓰지 않는다. robots.txt `Crawl-delay: 1`.

### 키워드 검색

```
GET https://price.enuri.com/search?keyword={검색어}[&category={에누리 카테고리 코드}]
```

- 직렬화 데이터에서 `"initProductList"` 객체를 찾는다 (`findFlightObject`). `items[]`는 "전체상품" 탭 인기순 40개다.
- 오픈마켓 개별 상품(`type: "normal"`)이 섞여 오므로 가격비교 카탈로그 상품(`type: "model"`)만 쓰고, 렌탈 상품(`isRental: true`, 월 요금)은 뺀다.
- 결과가 없으면 목록 대신 `SearchEmptySection` 컴포넌트와 추천 상품(`initRecommendedProducts`, 검색 결과 아님)이 온다. 목록도 이 표시도 없으면 오류를 낸다.

| 필드 | 뜻 |
|---|---|
| `id` | 카탈로그 번호(modelno) |
| `name`, `condiName` | 상품명과 대표 옵션 이름 (예: "2TB"). 이어 붙여 상품명으로 쓴다 |
| `priceInfo.price` | 판매처 최저가. 현금가 판매처까지 포함한 값일 수 있다 (상세의 대표 최저가는 일반 판매가 기준) |
| `mallCount` | 판매처 수 |
| `category.categoryId` | 카테고리 코드 → 부품 종류 |
| `purchaseOptions[]` | 같은 묶음의 다른 옵션 (`modelId`, `optionName`, `price`, `mallCount`). 옵션마다 카탈로그 번호가 따로 있어 별도 상품으로 펼쳐 대표 상품들 뒤에 붙인다. 이름 없는 옵션은 뺀다 |

### 카테고리 인기 목록

```
GET https://price.enuri.com/list?category={에누리 카테고리 코드}
```

- 첫 화면(인기순 `POPULAR` 40개)을 서버가 그려 보낸다. 직렬화 데이터의 `"initProductList"`가 검색 화면과 같은 형식이라 검색 파서로 읽는다 (같은 필드, 가격비교 카탈로그 상품만).
- 정렬(`initListControls.sortOptions`: 인기순·최저가순·신상품순 …)과 다음 페이지는 화면이 `/api/`(robots.txt 금지)로 다시 불러오므로 쓰지 않는다.
- 카테고리 목록이 비어 있으면 점검 화면이나 구조 변경으로 보고 오류를 낸다 (캐시하지 않음).

### 상품 상세

```
GET https://price.enuri.com/catalog/{modelno}
```

직렬화된 React Query 항목 두 개를 쓴다 (`extractFlightQueries`).

| queryKey | 쓰는 필드 |
|---|---|
| `["catalog", "overview", modelno, …]` | `initCatalogSummaryInfo.catalogInfo`: `catalogName`, `catalogOptionName`, `minPrice`(화면 대표 최저가, 일반 판매가 기준), `specs[]`(제조사·등록일 포함). `initCatalogLowestPrice.priceList[]`: 상위 판매처와 판매처 링크(`bridgePageLink`) |
| `["catalog", "priceComparison", modelno, …, "price_asc", 1]` | 쇼핑몰별 가격 첫 페이지: `data.priceList[]`(일반 판매가)와 `cashList[]`(현금가 판매처). 항목마다 `shopName`, `price`, `deliveryPrice`·`deliveryText`, `plno` |

- 현금가 판매처는 이름 뒤에 " (현금)"을 붙이고, 가장 싼 현금가를 `cashPrice`로 준다. 판매처는 가격순 최대 10곳.
- 쇼핑몰별 가격 항목이 없으면 상위 판매처 요약으로 대신한다 (카드 할인가 항목은 판매가가 아니라 뺀다).
- 최저가 추이 그래프는 robots.txt가 막은 `/api/`로 불러오므로 쓰지 않는다.

## 견적왕

`kjwwang.com`. 응답은 모두 **EUC-KR**이다. robots.txt는 `/shop/`·`/skin/`을 막지 않는다 (`/ajax/` 등 관리용 경로만 막음).

### 키워드 검색 (두 단계)

```
1) GET  https://kjwwang.com/shop/product_search.html?main_search={EUC-KR 퍼센트 인코딩 검색어}
2) POST https://kjwwang.com/skin/shop/basic/product_list_include_plist.php
   Content-Type: application/x-www-form-urlencoded; charset=UTF-8
   X-Requested-With: XMLHttpRequest
   Referer: (1의 주소)
```

- 1의 검색어는 EUC-KR로 인코딩해야 한다 (UTF-8로 보내면 글자가 깨져 0건). 응답에서 `#search_query`(서버가 만든 16진수 검색 토큰), `input[name=main_search]`(되돌려 준 검색어), "부품(N)" 탭의 N을 읽는다. N이 0이면 2를 보내지 않는다.
- 2는 검색 화면 스크립트 `searchListAjax()`와 같은 폼이다: `sort[]`×4(`"", "", "", "X"`), `action=pc_estimate_keyword`, `search_word`, `search_query`(토큰), `search_cate`(카테고리, 0은 전체), `page=1`, `list_sort_type`(빈 값 = 인기상품순), `timeid`. 토큰이 없으면 "검색결과가 없습니다"가 온다.
- 2의 응답은 한 번에 10개다. 첫 페이지만 읽는다.

| 정보 | 위치 (`li.list` 안) |
|---|---|
| 상품 번호·이름 | `a.name`의 `href`(`pd_no=`)와 글자 |
| 최저가 | `ul.price span.card` (class는 card지만 현금가·카드가를 통틀어 가장 싼 판매처 가격) |
| 판매처 수 | `a.shop` ("판매처 13") |
| 분류 | `ul.prd_cate li` (예: "PC주요부품", "그래픽카드") |

- 결과가 없으면 `#total_num` 값이 0이고 "검색결과가 없습니다"가 나온다. 상품도 이 문구도 없으면 오류를 낸다.

### 카테고리 인기 목록

분류 화면(`/shop/product_list.html?ct_no={분류}`)은 상품을 직접 그리지 않고 화면 스크립트가 검색과 같은 목록 주소에 POST로 불러온다. 검색과 달리 토큰이 필요 없다.

```
POST https://kjwwang.com/skin/shop/basic/product_list_include_plist.php
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
X-Requested-With: XMLHttpRequest
Referer: https://kjwwang.com/shop/product_list.html?ct_no={분류}

depth=2&cate1={상위 분류}&cate2={분류}&search_cate=0&search=&search1=&sprice=&eprice=&page=1&list_sort_type=&view_type=list&estimate_company=
```

- 부품 10종은 모두 2단계 분류다. 상위 분류(`cate1`)는 부품이 "PC주요부품"(2), 모니터가 "모니터/노트북/미니PC"(6082)다.
- `list_sort_type` 빈 값이 인기상품순이다 (`lowPrice`·`highPrice`·`newProduct`도 있다). 한 번에 10개를 주며 첫 페이지만 읽는다.
- 응답은 검색 목록과 같은 형식이라 같은 파서로 읽는다.

### 상품 상세

```
GET https://kjwwang.com/shop/product_detail.html?pd_no={상품 번호}
```

| 정보 | 위치 |
|---|---|
| 상품명 | `.detail_top .data_head .info .name` |
| 제조사·등록일 | `.data_head .desc p` ("제조회사 : ZOTAC \| 등록일 2025-03-06") |
| 스펙 요약 | `.desc .spec` 글자를 " / "로 나눈다 |
| 최저가 | `.price_compare ul.tab > li`의 "현금가"·"카드가" 최저 중 낮은 값 |
| 판매처 | `table.compare_table` 두 개 (`th` "현금판매가", "카드판매가"). 행마다 `span.name`, `span.price`, `li.fee`(배송비) |

- 판매처 이름 뒤에 " (현금)"·" (카드)"를 붙인다. 가격순 최대 10곳.
- 가격 변동 이력은 없다.

## 컴퓨존

### 키워드 검색

검색 화면이 AJAX로 부르는 목록 조각입니다. 응답은 **EUC-KR**입니다.

```
GET https://www.compuzone.co.kr/search/search_list.php?actype=list&SearchType=small&SearchText={검색어}&PreOrder=recommand&PageCount=20&StartNum=0&PageNum=1&ListType=&BigDivNo={big}&MediumDivNo={medium}&DivNo=
Referer: https://www.compuzone.co.kr/search/search.htm
X-Requested-With: XMLHttpRequest
```

- 상품마다 `li.li-obj` 안에 `div.prd_price[data-pricetable=상품번호][data-price="1,449,000"][data-discountprice="…"]`와 `a.prd_info_name`(상품명)이 있다. 할인 중이면 `data-discountprice`(판매가)가 `data-price`(정가)보다 작아서 그것을 쓴다.
- 목록 전체는 `.listView`/`.prdH_wrap`이 감싼다. 상품 이름은 반드시 그 상품의 `li` 안에서만 찾는다.
- 결과가 없으면 "(총 0 개의 상품)", "해당 검색어로 검색된 상품이 없습니다."가 나온다. 상품도 이 문구도 없으면 점검 화면이나 구조 변경으로 보고 오류를 낸다 (빈 결과로 캐시하지 않음).
- 한 페이지(최대 20개)만 읽는다. 검색어는 UTF-8로 보내도 된다 (한글 검색 확인).

### 카테고리 인기 목록

분류 화면(`/product/product_list.htm?BigDivNo=&MediumDivNo=`)은 상품을 화면 스크립트(`script/product_list.js`의 `getProductList`)가 숨은 폼(`global_form`)을 POST해 불러온다.

```
POST https://www.compuzone.co.kr/product/product_list.php
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
X-Requested-With: XMLHttpRequest
Referer: https://www.compuzone.co.kr/product/product_list.htm?BigDivNo={big}&MediumDivNo={medium}

actype=getList&BigDivNo={big}&MediumDivNo={medium}&DivNo=0&PageCount=60&StartNum=0&PageNum=1&PreOrder=sale_order&lvm=L&ScrollPage=1&ProductType=list
```

- `PreOrder`: `recommand`(추천순, 화면 기본), `sale_order`(판매량순), `low_price`, `hi_price`, `new`, `sale_price`(할인율순), `used_count`(후기순). 인기 목록이므로 판매량순을 쓴다.
- 한 번에 20개(스크롤 한 단위)를 준다. 첫 단위만 읽는다. 응답은 검색 목록과 같은 `li.li-obj` 조각이라 같은 파서로 읽는다.

### 상품 상세

```
GET https://www.compuzone.co.kr/product/product_detail.htm?ProductNo={상품번호}
```

| 정보 | 위치 |
|---|---|
| 상품명 | `h2.tit_p_name` |
| 스펙 요약 | `span.p_spec` 글자를 "/"로 나눈다 |
| 가격 | `.price_real` — 화면에 안 보이는 가짜 가격(`display:none` 요소)이 함께 들어 있다. 숨은 요소를 지우고 남은 글자를 읽는다 |
| 배송비 | `.delivery_price_inner .txt` ("무료배송" → 0) |

## 요청 규칙

`src/utils/http.ts`

| 대상 | limiter 키 | 동시 요청 | 요청 간격 | 분당 / 하루 상한 |
|---|---|---|---|---|
| search.danawa.com | `danawa-search` | 1 | 10초 (robots.txt Crawl-delay) | 6 / 1,000 |
| prod.danawa.com, shop.danawa.com | `danawa` | 2 | 1초 | 30 / 3,000 |
| price.enuri.com | `enuri` | 1 | 1초 (robots.txt Crawl-delay) | 30 / 2,000 |
| kjwwang.com | `kjwwang` | 1 | 1초 | 30 / 2,000 |
| www.compuzone.co.kr | `compuzone` | 2 | 1초 | 30 / 3,000 |

- User-Agent는 일반 Chrome 하나로 고정하고 요청마다 바꾸지 않는다. `Accept-Language: ko-KR` 우선.
- 요청마다 15초 타임아웃. 네트워크 오류·타임아웃·5xx만 1초, 2초 쉬고 다시 시도한다 (최대 3번). 4xx와 상한 초과는 다시 시도하지 않는다.
- 403/429를 받으면 그 사이트를 30초 쉰다. 쉬는 시간이 끝난 뒤 또 막히면 60 → 120 → 240 → 300초(상한)로 늘린다 (쉬는 중에 받은 403으로는 늘리지 않는다). 한 번 성공하면 초기화한다.
- 쉬는 동안의 요청은 보내지 않고 오류를 낸다. 대기열에서 순서를 기다리던 요청도 보내기 직전에 다시 확인한다.
- 분당·하루 상한을 넘으면 오류를 낸다. 대기열에서 순서를 기다린 뒤 보내기 직전에 상한에 걸려 거부될 수도 있다.

캐시(`src/core/cache.ts`, 메모리)

| 종류 | 유지 시간 |
|---|---|
| 검색 결과 (네 사이트) | 30분 |
| 카테고리 인기 목록 (네 사이트) | 30분 |
| 상품 상세 | 1시간 |
| 가격 이력 | 6시간 |
| 호환성 검사 (같은 상품 조합) | 24시간 |

## 다른 사이트의 가격 이력

가격 이력은 다나와만 준다 (위 "가격 이력"). 2026-11-16 조사:

- 에누리: 상품 화면에 최저가 추이 그래프가 있지만 robots.txt가 막은 `/api/`로 불러온다. 쓰지 않는다.
- 컴퓨존: 가격 이력이 없다 (상세 화면의 `product_detail_ajax.php?actype=getBigDataMining`은 주간 조회·판매 통계일 뿐이다).
- 견적왕: 가격 이력이 없다.

## 쓰지 않는 사이트

새 사이트를 붙일 때는 "API 키·가입 없이 일반 GET으로 열리고, robots.txt가 허용하고, 봇 차단 우회가 필요 없는 곳"만 쓴다 ([AGENTS.md](../AGENTS.md) 원칙). 2026-11 조사에서 이 기준으로 제외한 곳:

- 쿠팡: 일반 요청에 검색·홈·robots.txt까지 403 (Akamai)
- G마켓·옥션: 403 (Cloudflare 챌린지)
- SSG: 403 (Akamai)
- 네이버쇼핑 웹: 418
- 퀘이사존·아카라이브: 403 (Cloudflare)
- 롯데ON·쿨엔조이·에펨코리아·루리웹·다음 쇼핑하우: 열리지만 robots.txt가 막음
