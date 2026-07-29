import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser } from "playwright-core";
import { ScrapingError } from "../../core/errors.js";
import { isBlocked, markBlocked, clearBlocked } from "../../utils/http.js";

/** 쿠팡 브라우저 경로의 회로 차단·동시성 키 (http.ts limiter와 동일) */
export const COUPANG_SOURCE = "coupang-browser";

const SEARCH_URL = "https://www.coupang.com/np/search";
const NAVIGATION_TIMEOUT_MS = 30_000;
const PRODUCT_WAIT_TIMEOUT_MS = 15_000;

let browserPromise: Promise<Browser> | null = null;
let browserUserAgentPromise: Promise<string> | null = null;

function browserCandidates(): string[] {
  const home = homedir();

  if (process.platform === "darwin") {
    return [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      join(home, "Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ];
  }

  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA;
    const programFiles = process.env.PROGRAMFILES;
    const programFilesX86 = process.env["PROGRAMFILES(X86)"];
    return [
      localAppData && join(localAppData, "Google/Chrome/Application/chrome.exe"),
      programFiles && join(programFiles, "Google/Chrome/Application/chrome.exe"),
      programFilesX86 && join(programFilesX86, "Google/Chrome/Application/chrome.exe"),
      programFiles && join(programFiles, "Microsoft/Edge/Application/msedge.exe"),
      programFilesX86 && join(programFilesX86, "Microsoft/Edge/Application/msedge.exe"),
    ].filter((path): path is string => Boolean(path));
  }

  return [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/opt/google/chrome/chrome",
    "/snap/bin/chromium",
  ];
}

/** 쿠팡 브라우저 모드에서 사용할 Chrome 계열 실행 파일을 찾는다. */
export function findCoupangBrowserExecutable(): string | null {
  const configured = process.env.COUPANG_BROWSER_EXECUTABLE_PATH?.trim();
  if (configured) return existsSync(configured) ? configured : null;
  return browserCandidates().find((candidate) => existsSync(candidate)) ?? null;
}

/** 재사용 중인 브라우저와 UA 캐시를 비운다 (crash/disconnect 복구용). */
function resetBrowserCache(): void {
  browserPromise = null;
  browserUserAgentPromise = null;
}

async function getBrowser(): Promise<Browser> {
  // 캐시된 인스턴스가 살아있으면 재사용, 죽었으면(crash/disconnect) 캐시를 비우고 재기동.
  if (browserPromise) {
    try {
      const existing = await browserPromise;
      if (existing.isConnected()) return existing;
    } catch {
      // 이전 launch가 실패로 남아있는 경우 — 아래에서 재기동
    }
    resetBrowserCache();
  }

  const executablePath = findCoupangBrowserExecutable();
  if (!executablePath) {
    const configured = process.env.COUPANG_BROWSER_EXECUTABLE_PATH?.trim();
    const detail = configured
      ? `설정된 실행 파일을 찾을 수 없습니다: ${configured}`
      : "Google Chrome, Microsoft Edge 또는 Chromium을 찾을 수 없습니다.";
    throw new ScrapingError(
      "coupang",
      `쿠팡 브라우저 검색을 시작할 수 없습니다. ${detail}`
    );
  }

  const launching = chromium
    .launch({
      executablePath,
      headless: true,
      args: ["--lang=ko-KR"],
    })
    .then((browser) => {
      // 브라우저가 비정상 종료되면 캐시를 무효화해 다음 호출에서 재기동되게 한다.
      // 단, 이미 새 세대로 교체된 뒤라면(browserPromise !== launching) 건드리지 않는다.
      browser.on("disconnected", () => {
        if (browserPromise === launching) resetBrowserCache();
      });
      return browser;
    })
    .catch((error) => {
      if (browserPromise === launching) browserPromise = null;
      throw error;
    });

  browserPromise = launching;
  return launching;
}

/**
 * HeadlessChrome 표기만 실제 실행 중인 Chrome 버전의 일반 UA 표기로 바꾼다.
 * 별도의 쿠키나 로그인 세션은 사용하지 않는다.
 */
async function getBrowserUserAgent(browser: Browser): Promise<string> {
  if (!browserUserAgentPromise) {
    browserUserAgentPromise = (async () => {
      const page = await browser.newPage({ locale: "ko-KR" });
      try {
        const defaultUserAgent = await page.evaluate(() => navigator.userAgent);
        return defaultUserAgent.replace("HeadlessChrome/", "Chrome/");
      } finally {
        await page.close();
      }
    })().catch((error) => {
      browserUserAgentPromise = null;
      throw error;
    });
  }
  return browserUserAgentPromise;
}

/** 로그인/쿠키 없이 새 브라우저 컨텍스트에서 쿠팡 검색 결과 HTML을 렌더링한다. */
export async function renderCoupangSearchPage(query: string): Promise<string> {
  // 직전에 403/429/보안확인으로 차단됐다면 무거운 브라우저를 띄우지 않고 즉시 실패한다.
  if (isBlocked(COUPANG_SOURCE)) {
    throw new ScrapingError(
      "coupang",
      "쿠팡이 일시적으로 차단 상태입니다. 잠시 후 다시 시도해주세요.",
      429
    );
  }

  try {
    const browser = await getBrowser();
    const userAgent = await getBrowserUserAgent(browser);
    const context = await browser.newContext({
      locale: "ko-KR",
      userAgent,
    });

    try {
      const page = await context.newPage();
      const url = `${SEARCH_URL}?q=${encodeURIComponent(query)}`;
      const response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: NAVIGATION_TIMEOUT_MS,
      });

      const status = response?.status() ?? 0;
      if (status === 403 || status === 429) {
        // 차단 상태를 기록해 다음 호출들이 백오프(30초→최대 5분)되게 한다.
        markBlocked(COUPANG_SOURCE, status);
        throw new ScrapingError(
          "coupang",
          `브라우저 요청이 차단되었습니다. (HTTP ${status})`,
          status
        );
      }
      if (status >= 400) {
        throw new ScrapingError(
          "coupang",
          `쿠팡 검색 페이지 요청 실패 (HTTP ${status})`,
          status
        );
      }

      await page
        .waitForSelector('a[href*="/vp/products/"]', {
          timeout: PRODUCT_WAIT_TIMEOUT_MS,
        })
        .catch(() => undefined);

      const title = await page.title();
      if (/access denied|captcha|보안 확인/i.test(title)) {
        // 봇 감지(캡차/보안확인)도 차단으로 취급해 백오프한다.
        markBlocked(COUPANG_SOURCE, 429);
        throw new ScrapingError(
          "coupang",
          "쿠팡에서 추가 확인을 요구해 검색 결과를 가져오지 못했습니다.",
          429
        );
      }

      const html = await page.content();
      // 정상 응답을 받았으므로 이전 백오프를 리셋한다.
      clearBlocked(COUPANG_SOURCE);
      return html;
    } finally {
      await context.close();
    }
  } catch (error) {
    if (error instanceof ScrapingError) throw error;
    throw new ScrapingError(
      "coupang",
      `브라우저 검색 실패: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/** 테스트나 명시적 종료 시 재사용 중인 브라우저 프로세스를 닫는다. */
export async function closeCoupangBrowser(): Promise<void> {
  const activeBrowser = browserPromise;
  browserPromise = null;
  browserUserAgentPromise = null;
  if (activeBrowser) {
    try {
      await (await activeBrowser).close();
    } catch {
      // 시작 실패 또는 이미 종료된 브라우저는 별도 정리가 필요 없다.
    }
  }
}
