# 🖥️ kr-pc-deals-mcp

> AI한테 "100만원으로 게이밍 PC 짜줘"라고 하면, 다나와/컴퓨존 최저가를 비교해서 진짜 견적을 짜줍니다.

한국 PC 부품 가격비교 및 조립 견적 MCP 서버입니다.
Claude, ChatGPT, Cursor 등 MCP를 지원하는 모든 AI 앱에서 사용할 수 있습니다.

<!-- TODO: 데모 GIF 추가 -->
<!-- ![demo](docs/demo.gif) -->

## 주요 기능

- **부품 검색** — 다나와 + 컴퓨존 통합 검색
- **가격 비교** — 동일 제품의 크로스사이트 최저가 비교
- **가격 이력** — 다나와 가격 변동 추적 (1/3/6/12개월)
- **PC 견적** — 예산과 용도(게이밍/사무/워크스테이션/방송)에 맞는 자동 견적 추천
- **호환성 체크** — CPU↔메인보드 소켓, 메인보드↔RAM DDR, GPU↔케이스, 전력 체크
- **견적 최적화** — 기존 견적의 가격 절감 또는 성능 향상 제안
- **프록시 지원** — 차단 시 Zyte 프록시 자동 폴백

---

## 빠른 시작

### Claude Desktop

`Settings` → `Developer` → `Edit Config`에서 `claude_desktop_config.json`을 열고 아래를 추가:

```json
{
  "mcpServers": {
    "kr-pc-deals-mcp": {
      "command": "npx",
      "args": ["-y", "kr-pc-deals-mcp"]
    }
  }
}
```

### Claude CLI

```bash
claude mcp add kr-pc-deals-mcp npx -- -y kr-pc-deals-mcp
```

### Cursor

프로젝트 루트에 `.cursor/mcp.json` 파일 생성:

```json
{
  "mcpServers": {
    "kr-pc-deals-mcp": {
      "command": "npx",
      "args": ["-y", "kr-pc-deals-mcp"]
    }
  }
}
```

---

## 직접 설치

### 요구사항

- Node.js 20 이상
- npm 또는 yarn

### 설치

```bash
git clone https://github.com/yourname/kr-pc-deals-mcp.git
cd kr-pc-deals-mcp
npm install
```

### 빌드

```bash
npm run build
```

### 실행

```bash
# 개발 모드 (TypeScript 직접 실행)
npm run dev

# 프로덕션 모드
npm run build
npm start
```

### 테스트

```bash
npm test
```

---

## 환경 변수 (선택)

`.env.example`을 `.env`로 복사하여 설정합니다.

```bash
cp .env.example .env
```

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `ZYTE_API_KEY` | Zyte 프록시 API 키 (차단 시 자동 우회) | 미설정 (직접 요청만) |

> Zyte 없이도 정상 동작합니다. 다나와/컴퓨존에서 반복 요청으로 차단될 때만 필요합니다.
> https://www.zyte.com 에서 무료 체험 API 키를 발급받을 수 있습니다.

---

## 사용 예시

Claude나 Cursor에서 아래처럼 자연어로 질문하면 됩니다:

### 부품 검색
> "RTX 4070 SUPER 검색해줘"
> "i7-14700K 다나와에서 찾아봐"

### 가격 비교
> "RTX 4070 SUPER 다나와랑 컴퓨존 가격 비교해줘"
> "DDR5 32GB 최저가 찾아줘"

### PC 견적
> "100만원으로 게이밍 PC 견적 짜줘"
> "200만원 워크스테이션 추천해줘"
> "70만원 사무용 컴퓨터 구성해줘"

### 호환성 체크
> "i7-14700K랑 B650 메인보드 호환되나?"
> "이 견적 호환성 체크해줘"

### 가격 이력
> "이 제품 최근 3개월 가격 변동 보여줘"

### 견적 최적화
> "이 견적에서 가격 더 줄일 수 있어?"

---

## MCP 도구 목록

| 도구 | 설명 |
|------|------|
| `search_parts` | PC 부품 키워드 검색 (다나와/컴퓨존/전체) |
| `get_product_detail` | 상품 상세 정보 (스펙, 판매처별 가격) |
| `get_price_history` | 가격 변동 이력 (1/3/6/12개월) |
| `compare_prices` | 다나와↔컴퓨존 동일 제품 가격 비교 |
| `find_lowest_price` | 통합 최저가 검색 |
| `list_by_category` | 카테고리별 인기/최저가 목록 |
| `estimate_build` | 예산/용도별 PC 견적 추천 |
| `check_compatibility` | 부품 호환성 체크 |
| `optimize_build` | 기존 견적 가격/성능 최적화 |
| `proxy_status` | 프록시/차단 상태 확인 |

### 지원 카테고리

CPU, 그래픽카드, 메인보드, RAM, SSD, HDD, 파워서플라이, 케이스, CPU 쿨러, 모니터

### 견적 용도

| 용도 | 설명 | GPU 비중 |
|------|------|---------|
| `gaming` | 게이밍 | 35% |
| `office` | 사무용 | 10% |
| `workstation` | 워크스테이션 (3D/영상편집) | 30% |
| `streaming` | 방송/스트리밍 | 30% |

---

## 아키텍처

```
사용자 (Claude/Cursor/ChatGPT)
  ↓ MCP Protocol (stdio)
kr-pc-deals-mcp MCP Server
  ├── 다나와 Provider (HTML 스크래핑)
  ├── 컴퓨존 Provider (HTML 스크래핑)
  ├── 가격 비교 Service (크로스사이트 매칭)
  ├── 호환성 Service (규칙 기반 체크)
  ├── 견적 엔진 Service (예산 배분 + 추천)
  └── Zyte Proxy (차단 시 자동 폴백)
```

### 차단 방지 메커니즘

1. **사이트별 독립 Rate Limiter** — 다나와/컴퓨존 각 2초 간격, 큐 직렬화
2. **인메모리 캐시** — 동일 검색 30분 재사용
3. **지수 백오프** — 차단 시 30초→60초→120초→최대 5분
4. **Zyte 자동 폴백** — 3회 연속 실패 시 프록시 모드 전환

---

## 개발

```bash
# TypeScript 타입 체크
npx tsc --noEmit

# 테스트
npm test

# 테스트 (watch 모드)
npm run test:watch

# 빌드
npm run build
```

---

## 라이선스

MIT

---

## 참고

이 프로젝트는 [daiso-mcp](https://github.com/hmmhmmhm/daiso-mcp)의 아키텍처 패턴을 참고하여 개발되었습니다.

### 관련 리소스
- [Danawa-Crawler](https://github.com/sammy310/Danawa-Crawler) — 다나와 PC 부품 크롤러 (Python)
- [danawa-py](https://github.com/MineEric64/danawa-py) — 다나와 Python 라이브러리
- [awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers) — MCP 서버 목록
