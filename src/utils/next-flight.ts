/**
 * Next.js 페이지에서 서버가 넣어 둔 데이터를 꺼낸다 (다나와·에누리 공용).
 *
 * 페이지는 React 서버 컴포넌트 데이터(flight)를 `self.__next_f.push([1, "…"])` 스크립트 여러 개에 나눠 담는다.
 * 조각을 이어 붙인 문자열 안에서
 * - 검색 화면: 목록 컴포넌트에 넘기는 props `"initProductList":{…}`
 * - 상품 화면: React Query 캐시 `{"state":{"mutations":[…],"queries":[{ queryKey, state: { data } }]}}`
 * 를 JSON으로 읽는다. 같은 값을 가리키는 참조 문자열("$31:props:data:…")은 건너뛴다.
 */

const PUSH_PATTERN = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
const QUERY_STATE_MARKER = /\{\s*"state"\s*:\s*\{\s*"mutations"\s*:/g;

export interface FlightQuery {
  queryKey: unknown[];
  data: unknown;
}

/** `self.__next_f.push([1, "..."])` 조각의 문자열을 디코딩해 이어 붙인다. 조각이 없으면 "" */
export function joinFlightChunks(html: string): string {
  let payload = "";
  for (const match of html.matchAll(PUSH_PATTERN)) {
    try {
      payload += JSON.parse(match[1]) as string;
    } catch {
      // 디코딩할 수 없는 조각은 건너뛴다
    }
  }
  return payload;
}

/**
 * payload에서 `"key":` 바로 뒤에 오는 JSON 객체를 읽는다.
 * 같은 키가 참조 문자열로도 나오므로, 객체로 읽히는 첫 번째 값을 돌려준다. 없으면 undefined.
 */
export function findFlightObject(payload: string, key: string): Record<string, unknown> | undefined {
  const marker = `"${key}":`;
  for (let at = payload.indexOf(marker); at >= 0; at = payload.indexOf(marker, at + marker.length)) {
    let start = at + marker.length;
    while (payload[start] === " " || payload[start] === "\n") start++;
    if (payload[start] !== "{") continue;
    const json = sliceJsonObject(payload, start);
    if (!json) continue;
    try {
      const value: unknown = JSON.parse(json);
      if (isObject(value)) return value;
    } catch {
      // 다음 후보를 본다
    }
  }
  return undefined;
}

/** payload에 들어 있는 모든 React Query 직렬화 항목. 없으면 빈 배열 */
export function extractFlightQueries(payload: string): FlightQuery[] {
  // (HTML에서 바로 꺼내려면 extractDehydratedQueries를 쓴다)
  const queries: FlightQuery[] = [];
  let consumedUntil = 0;
  for (const marker of payload.matchAll(QUERY_STATE_MARKER)) {
    const start = marker.index ?? 0;
    if (start < consumedUntil) continue; // 이미 읽은 객체 안쪽은 다시 읽지 않는다
    const json = sliceJsonObject(payload, start);
    if (!json) continue;
    consumedUntil = start + json.length;
    try {
      const parsed = JSON.parse(json) as {
        state?: { queries?: Array<{ queryKey?: unknown; state?: { data?: unknown } }> };
      };
      for (const query of parsed.state?.queries ?? []) {
        if (Array.isArray(query?.queryKey)) queries.push({ queryKey: query.queryKey, data: query.state?.data });
      }
    } catch {
      // 다른 형태의 객체면 건너뛴다
    }
  }
  return queries;
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** start 위치의 `{`부터 짝이 맞는 `}`까지 잘라낸다. 문자열 안의 괄호는 무시한다. */
function sliceJsonObject(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** HTML에 들어 있는 모든 React Query 직렬화 항목을 꺼낸다. 없으면 빈 배열 */
export function extractDehydratedQueries(html: string): FlightQuery[] {
  return extractFlightQueries(joinFlightChunks(html));
}
