# AGENTS.md

이 저장소에서 일하는 사람과 코딩 에이전트를 위한 안내입니다. 사용자용 설명은 [README.md](README.md), 외부 사이트 주소와 파싱 위치는 [docs/data-sources.md](docs/data-sources.md)에 있습니다.

## 무엇을 하는 프로젝트인가

`kr-pc-deals-mcp`는 한국 PC 부품 가격을 가격비교 사이트(다나와·에누리·견적왕)와 쇼핑몰(컴퓨존) 공개 페이지에서 그때그때 읽어 오는 MCP 서버입니다. AI 앱(Claude Desktop, Claude Code, Cursor 등)이 `npx -y kr-pc-deals-mcp`로 띄우고 stdio로 도구 7개를 호출합니다.

## 지켜야 할 원칙

1. **설치 한 줄로 끝난다.** API 키 발급, 회원가입, 로그인, 인증서 설치가 필요한 데이터 소스는 쓰지 않는다. 환경변수도 없다.
2. **공개 페이지를 예의 있게 읽는다.** robots.txt가 막은 경로는 쓰지 않는다 (예외 하나는 아래 "사용자 결정"). `Crawl-delay`를 지키고, 같은 요청은 캐시하고, 사이트별 요청 간격·상한을 둔다.
3. **봇 차단을 우회하지 않는다.** 일반 GET에 403/429·캡차·챌린지 페이지를 주는 사이트는 쓰지 않는다. 헤드리스 브라우저, 프록시, 쿠키 재사용, User-Agent 돌려쓰기 같은 우회는 넣지 않는다.
4. **서버는 상태를 갖지 않는다.** 견적은 모델이 대화 속에서 들고 있다가 `check_build`에 통째로 넘긴다. 여러 대화가 서버 프로세스 하나를 같이 써도 섞이지 않게 하기 위해서다 (MCP 2026-07-28 스펙의 방향과도 맞다).
5. **틀린 답보다 빈 답이 낫다.** 사이트 간 같은 제품 짝짓기, 최저가 고르기는 확실할 때만 결과를 낸다. 가격이 의심스러우면 `priceWarning`·`notice`로 알린다.

## 명령어

```bash
npm install          # Node 20 이상
npm run typecheck    # tsc --noEmit
npm test             # vitest (네트워크 없이 고정 데이터로 실행)
npm run build        # dist/ 지우고 tsc로 다시 빌드
npm run dev          # tsx로 src/index.ts 실행 (stdio 서버)
```

`npm publish`를 하면 `prepublishOnly`가 typecheck → test → build를 먼저 돌린다.

## 구조

```
src/
├── index.ts              진입점. serveStdio(() => createServer())
├── server.ts             createServer(): McpServer + 서버 안내(instructions) + 도구 등록
├── tools/                MCP 도구 계층 (입력 검증, 출력 스키마, 결과 형식)
│   ├── search.ts         search_parts, get_product_detail, get_price_history
│   ├── compare.ts        compare_prices, find_lowest_price, list_by_category
│   ├── build.ts          check_build
│   ├── schemas.ts        공용 zod 스키마 (Product, ProductDetail …)
│   └── result.ts         toolResult / toolError / READ_ONLY_WEB annotations
├── services/
│   ├── sources.ts        사이트 표: 검색 함수(SEARCHERS)·상세 함수(DETAIL_FETCHERS), 여러 사이트 동시 검색
│   ├── price-compare.ts  같은 제품 묶기(groupSameProducts), 최저가 고르기
│   └── errors.ts         오류 → 사용자용 한 줄 문장
├── providers/            사이트별 요청·파싱 (MCP를 모른다)
│   ├── danawa/           search(JSON) · list(Next.js 데이터) · product(옛·새 템플릿) · price-history · compatibility · categories
│   ├── enuri/            search · product (둘 다 Next.js 데이터) · categories
│   ├── kjwwang/          search(검색 화면 → 목록 POST) · product · parser(EUC-KR HTML) · categories
│   └── compuzone/        search · product · parser(EUC-KR HTML) · categories
├── core/                 categories(부품 10종) · types(Source, SOURCE_LABELS …) · cache(node-cache) · errors(ScrapingError, InputError)
└── utils/
    ├── http.ts           모든 외부 요청 (limiter, 차단 감지, 재시도, 타임아웃, EUC-KR, POST)
    ├── next-flight.ts    Next.js 페이지의 직렬화 데이터(self.__next_f) 읽기 (다나와 목록·상세, 에누리)
    ├── normalize.ts      모델번호·용량 추출, 같은 제품 판정(scorePair)
    └── text.ts           HTML → 글자, 금액 읽기
tests/                    vitest. fixtures/는 실제 응답을 잘라 만든 고정 데이터
docs/data-sources.md      외부 주소·파라미터·필드·robots.txt 상태
server.json               공식 MCP Registry 등록 정보
```

요청은 한 방향으로만 흐릅니다.

```
MCP 클라이언트 ─stdio→ index.ts → server.ts → tools/* → services/* → providers/* → utils/http.ts → 사이트
```

`providers`는 `tools`나 MCP SDK를 import하지 않습니다. 새 데이터 소스를 붙일 때도 이 경계를 지킵니다.

## 도구 7개

모두 외부 사이트를 읽기만 하므로 annotations는 같습니다: `readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true` (`tools/result.ts`의 `READ_ONLY_WEB`). Claude 앱은 읽기 전용 도구를 호출마다 확인하지 않고, Claude Code는 병렬로 실행합니다.

| 도구 | 입력 | 출력 핵심 | 데이터 |
|---|---|---|---|
| `search_parts` | query, category?, source(all/danawa/enuri/kjwwang/compuzone), limit(1–40, 사이트마다) | results[], errors[], notice? | 네 사이트 검색 (`services/sources.ts`의 SEARCHERS 순서) |
| `get_product_detail` | source, productId | price, cashPrice?, specs[], offers[](최대 10곳), maker?, registeredAt?, notice? | 사이트별 상세 (DETAIL_FETCHERS) |
| `get_price_history` | productId, months(1/3/6/12/24) | granularity(week/month), lowest, highest, points[{date, minPrice, suspicious?}] | 다나와 가격 이력 ⚠️ (사용자 결정으로 robots.txt 금지 경로 사용) |
| `compare_prices` | query, category?, limit(묶음 수 1–30, 기본 10) | counts[], groups[{name, products[], cheapestSources[], lowestPrice, priceGap}], errors[], notice? | 네 사이트 첫 페이지 전체 + `groupSameProducts` |
| `find_lowest_price` | query, category? | cheapest(없으면 null), model, capacities, candidates, errors[], notice? | 네 사이트 첫 페이지 전체. 검색어에 모델번호가 있으면 같은 모델만, 용량(16GB 등)이 있으면 다른 용량이 적힌 상품은 빼고 후보로 삼음 |
| `list_by_category` | category, sortBy(popularity/price), limit(1–30) | results[] (priceWarning?) | 다나와 카테고리 첫 화면 30개 |
| `check_build` | parts[{category, productId, name, price, quantity}] | total, unpricedParts, missingCategories, compatibility{checked, compatible, pairs} | 다나와 호환성 검사 |

결과 형식 규칙 (`tools/result.ts`):

- 성공하면 `structuredContent`에 데이터를 넣고, **같은 JSON을 텍스트로도** 넣습니다 (MCP 스펙 권고). Claude Code는 `structuredContent`만 모델에 넘기고 다른 클라이언트는 텍스트를 넘기므로, 안내 문구는 텍스트가 아니라 데이터의 `notice` 필드에 넣습니다.
- `outputSchema`를 선언했으므로 모든 성공 경로가 스키마에 맞는 `structuredContent`를 돌려줘야 합니다. 빠지거나 틀리면 SDK가 그 응답을 오류로 바꿉니다.
- 실패는 `isError: true`와 고칠 방법이 담긴 한국어 문장입니다. 한 사이트만 실패하면 성공으로 돌려주고 `errors[]`에 담습니다. 모든 사이트가 실패했을 때만 `isError`입니다.
- 가격은 원 단위 정수, 0은 가격 미정입니다.

## 코드 규칙

- ESM + TypeScript strict. 상대 경로 import에는 `.js` 확장자를 붙입니다 (`moduleResolution: Node16`).
- MCP SDK는 v2(`@modelcontextprotocol/server`)입니다. 도구는 `server.registerTool(name, { title, description, inputSchema: z.object(…), outputSchema: z.object(…), annotations }, handler)`로 등록합니다. 옛 `server.tool()`과 raw shape(`{ a: z.string() }`)는 쓰지 않습니다.
- stdout은 MCP 프로토콜 전용입니다. `console.log`를 쓰지 말고 로그는 `console.error`로 씁니다.
- 외부 요청은 반드시 `utils/http.ts`의 `fetchText`/`fetchJson`으로 보냅니다. `fetch`를 직접 부르면 요청 간격·차단 감지·캐시를 건너뜁니다. 새 사이트는 `createDefaultLimiters()`에 limiter를 추가합니다.
- 파서는 순수 함수(`parse…(html | json)`)로 분리하고, 요청 함수는 캐시 → 요청 → 파싱 → 캐시 저장 순서를 따릅니다.
- 응답 형식이 예상과 다르면 빈 결과로 넘기지 말고 `ScrapingError`를 던집니다. 빈 결과는 "결과 없음"이 확실할 때만 돌려주고, 그때만 캐시합니다 (점검 화면이나 구조 변경을 30분 동안 "결과 없음"으로 굳히지 않기 위해).
- 사용자에게 보일 문장(도구 설명, notice, 오류)은 한국어로, 짧고 구체적으로 씁니다. 도구 설명에는 언제 쓰는지, ID를 어디서 얻는지, 단위, 실패하면 어떻게 되는지를 적습니다.
- 서버 안내(`SERVER_INSTRUCTIONS`)는 4,096자 안에서 앞부분에 핵심을 둡니다 (Claude Code는 4,096자에서 자르고, 도구 검색에 이 안내를 씁니다). 도구 설명을 되풀이하지 않습니다.

## 테스트

- `npm test`는 네트워크를 쓰지 않습니다. `tests/helpers.ts`의 `stubFetch(SITE_ROUTES)`가 URL별로 고정 데이터를 돌려주고, `useFastNetwork()`가 요청 간격을 없애고 캐시를 비웁니다.
- `SITE_ROUTES`의 검색 응답은 네 사이트 모두 실제 "RTX 5070"(그래픽카드) 검색 결과라, 사이트 간 묶음을 실제 상품명으로 검사합니다. provider 테스트는 각자 다른 검색(990 PRO, 7800X3D, 메모리 묶음 상품 등) 고정 데이터를 씁니다.
- `tests/server.test.ts`는 `InMemoryTransport`로 실제 MCP 클라이언트처럼 붙어 `tools/list`·`tools/call`을 검사합니다. 출력이 `outputSchema`에 안 맞으면 여기서 `isError`로 드러납니다.
- `tests/release.test.ts`는 `package.json`과 `server.json`의 이름·버전이 같은지 확인합니다.
- 고정 데이터를 새로 만들 때는 실제 응답에서 필요한 부분만 잘라 `tests/fixtures/`에 넣습니다. 컴퓨존 HTML은 UTF-8로 바꿔 저장합니다 (테스트가 `eucKr()`로 다시 인코딩).

### 실제 사이트 점검

파서를 고친 뒤에는 실제 사이트로 한 번 확인합니다. `npm run build` 뒤 `@modelcontextprotocol/client`의 `Client`와 `@modelcontextprotocol/client/stdio`의 `StdioClientTransport({ command: "node", args: ["dist/index.js"] })`로 도구를 호출해 봅니다. 요청 수는 꼭 필요한 만큼만 쓰고 (다나와 검색은 10초 간격), robots.txt 금지 경로인 가격 이력은 한두 번만 부릅니다.

## 사이트 구조가 바뀌었을 때

증상: 결과가 0건, 가격이 0원, 이름이 비어 있음, "형식이 바뀌었습니다" 오류.

1. 해당 주소를 한 번 받아 저장하고 [docs/data-sources.md](docs/data-sources.md)의 필드·선택자와 비교합니다. 다나와·에누리는 Next.js 페이지라 `self.__next_f.push` 안의 직렬화 데이터(`utils/next-flight.ts`)를 먼저 찾아봅니다.
2. 파서를 고치고, 새 응답에서 고정 데이터를 다시 잘라 테스트를 맞춥니다.
3. robots.txt를 다시 확인합니다. 새 주소가 막힌 경로면 쓰지 않습니다.
4. data-sources.md를 현재 구조로 고칩니다.

## 같은 제품 판정 (`utils/normalize.ts`, `services/price-compare.ts`)

`scorePair`가 두 상품명이 같은 제품인지 판단합니다. 아래를 모두 만족해야 같은 제품입니다.

1. 모델번호가 같습니다 (RTX 5070 ≠ RTX 5070 Ti, 7800X3D ≠ 7700X, DDR5-6000 ≠ DDR5-5600).
2. 포장 종류가 같습니다. 이름마다 포장을 하나로 정합니다: 해외구매 > 병행 > 멀티팩 > 밸류팩 > 벌크 > 정품 순서로 먼저 나오는 것 ("멀티팩 정품"은 멀티팩). 한쪽에만 적혀 있으면 따지지 않습니다.
3. 색상이 어긋나지 않습니다. WHITE·SILVER·PINK·ICE 같은 변형색은 양쪽에 똑같이 적혀 있어야 하고, 양쪽에 색이 있는데 겹치지 않아도(BLACK ≠ WHITE) 거부합니다.
4. 그래픽카드는 OC·SFF·LP 표기가 양쪽에 똑같아야 합니다 (같은 제품군에 OC판·소형판이 따로 나옵니다).
5. 공통어(지포스, D7 …)·유통사명(제이씨현, 이엠텍 …)·모델번호를 뺀 "제품군 단어"는 적게 적힌 쪽이 많이 적힌 쪽에 모두 들어 있어야 합니다. 사이트가 단어를 빼거나 더 붙인 것("[ZOTAC]" ↔ "ZOTAC GAMING")은 받아들이고, 다른 단어로 바뀐 것(CRAS ↔ URBANE, 8GB ↔ 16GB)은 거부합니다.
6. 제품군 단어가 0.7 이상 겹쳐야 합니다.

- CPU는 모델번호가 곧 제품이고 사이트마다 이름 체계가 크게 달라 1~3만 봅니다.
- "7700X"처럼 접두사 없는 4자리+접미 패턴은 이름에 CPU 표지(인텔·코어·AMD·라이젠 …)가 있거나 카테고리가 cpu일 때만 모델번호로 봅니다. 파워 "1000G", 케이스 "5000X" 같은 것을 CPU로 오인하지 않기 위해서입니다.

`compare_prices`의 묶기(`groupSameProducts`):

- 사이트 표 순서(다나와 → 에누리 → 견적왕 → 컴퓨존)대로 한 사이트씩, 그 사이트 상품을 지금까지의 묶음 대표(첫 상품)와 1:1로 짝짓습니다. 모든 쌍의 점수를 구해 높은 순서로 배정하므로 한 묶음에 사이트마다 한 상품만 들어갑니다.
- 짝을 못 찾은 상품은 새 묶음이 되어 뒤 사이트를 기다립니다. 그래서 다나와에 없는 제품도 에누리·컴퓨존끼리 묶입니다.
- 한 상품이 상대편의 서로 다른 제품 여럿과 모두 맞으면 짝짓지 않습니다. 예: 포장이 안 적힌 다나와 "7800X3D (라파엘)"은 에누리의 멀티팩·정품·벌크 상품과 모두 맞아 어느 것과 같은지 알 수 없습니다.
- 사이트마다 검색 순위가 달라 첫 페이지 결과를 모두 맞춰 보고(요청 수는 같음), 돌려줄 묶음 수만 자릅니다.

`find_lowest_price`도 같은 모델번호 추출을 씁니다. 검색어에 모델번호가 있는데 그 모델이 없으면 다른 모델로 대신하지 않습니다. 검색어의 용량(`extractCapacities`)과 다른 용량이 적힌 상품도 뺍니다 (이름에 용량이 없는 상품은 남깁니다). 다나와·에누리 검색의 용량별 묶음 상품은 이름 뒤에 용량을 붙이고 다른 용량도 별도 상품으로 펼쳐 두므로 용량 조건이 제대로 걸립니다.

브랜드·색의 한글·영문 표기(갤럭시/GALAX, 화이트/WHITE 등), 유통사 목록, 포장 종류, 그래픽카드 변형 표기는 `normalize.ts` 위쪽 표에 있습니다. 짝이 틀리게 지어지는 사례를 찾으면 그 이름 쌍을 `tests/services/normalize.test.ts`에 먼저 추가하세요.

## 새 데이터 소스를 붙일 때

- 기준: API 키·가입 없이 일반 GET(또는 페이지와 같은 익명 POST)으로 열리고, robots.txt가 허용하고, 403/429·챌린지가 없어야 합니다.
- 막힌 곳 목록은 data-sources.md 끝에 있습니다.
- 순서: `src/providers/<site>/`에 요청·파서 → `utils/http.ts`의 `createDefaultLimiters()`에 limiter → `core/types.ts`의 `SOURCES`·`SOURCE_LABELS`에 추가 (`sourceSchema`·도구의 source 목록은 여기서 따라옴) → `services/sources.ts`의 `SEARCHERS`·`DETAIL_FETCHERS`에 한 줄씩 → 고정 데이터와 테스트 (`tests/helpers.ts`의 limiter 목록·`SITE_ROUTES`도) → data-sources.md·README·이 파일 갱신.
- `SEARCHERS` 순서가 검색 결과 순서이자 묶음의 기준 순서입니다. 상품명이 정돈된 가격비교 카탈로그를 앞에, 쇼핑몰을 뒤에 둡니다.

## 배포

1. `package.json`의 `version`과 `server.json`의 `version`, `packages[0].version`을 같이 올립니다 (`tests/release.test.ts`가 확인).
2. `npm publish` (prepublishOnly가 검사·빌드).
3. 공식 MCP Registry(아직 preview)에 올리려면 `mcp-publisher login github` 후 `mcp-publisher publish`. `package.json`의 `mcpName`이 `server.json`의 `name`과 같아야 하며, 이 값이 들어간 버전이 npm에 먼저 올라가 있어야 합니다.

## 사용자 결정

- **`get_price_history`는 robots.txt 금지 경로를 씁니다 (2026-11-16 사용자 결정).** `prod.danawa.com/info/ajax/`는 robots.txt가 막았지만 가격 이력을 주는 다른 공개 경로가 없어 이 도구를 유지합니다. 다섯 기간을 한 번에 받아 상품당 6시간 캐시해 요청을 최소로 하고, 실제 사이트 점검에서도 한두 번만 부릅니다.
- robots.txt가 막은 경로를 새로 쓰려면 이처럼 사용자 결정을 먼저 받고 여기에 적습니다.

## 알려진 한계

- 다나와 상세는 옛 템플릿에서 상위 판매처만 줍니다 (전체 목록은 robots.txt 금지 경로).
- `list_by_category`는 카테고리 첫 화면(인기순 30개)만 볼 수 있습니다. 가격순은 그 30개를 다시 정렬한 것입니다.
- 검색은 사이트마다 첫 페이지만 읽습니다: 다나와·에누리 40개, 컴퓨존 20개, 견적왕 10개 (다나와·에누리는 용량별 옵션을 펼쳐 더 많을 수 있음).
- 에누리 검색은 "전체상품" 탭 첫 페이지라 오픈마켓 개별 상품이 섞여 오고, 그중 가격비교 카탈로그 상품만 씁니다.
- 가격비교 사이트의 검색 가격은 현금가 판매처를 포함한 최저가일 수 있어, 사이트 간 가격 차이가 판매 조건 차이일 수 있습니다.
- 가격 이력은 다나와만 됩니다. 에누리는 최저가 추이를 robots.txt가 막은 `/api/`로만 주고, 컴퓨존·견적왕은 이력이 없습니다.
- 다나와 검색은 10초 간격이라 같은 대화에서 여러 번 검색하면 기다립니다. 같은 검색은 30분 캐시됩니다.
- 캐시는 프로세스 메모리에만 있어 서버를 다시 켜면 비워집니다.
- 공개 페이지를 읽는 방식이라 사이트 화면이 바뀌면 그 부분이 깨집니다. 위 "사이트 구조가 바뀌었을 때"를 따릅니다.

## 문서 규칙

- 문서는 **현재 상태만** 적습니다. 과거에 시도했다 버린 방식이나 변경 이력은 남기지 않습니다 (그건 git 기록이 맡습니다).
- 도구·입출력을 바꾸면 README의 도구 표와 이 파일의 "도구 7개"를, 외부 주소·필드를 바꾸면 docs/data-sources.md를 같은 커밋에서 고칩니다.
