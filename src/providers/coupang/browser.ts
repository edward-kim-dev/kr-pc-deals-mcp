import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser } from "playwright-core";
import { ScrapingError } from "../../core/errors.js";

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

function getBrowser(): Promise<Browser> {
  if (browserPromise) return browserPromise;

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

  browserPromise = chromium
    .launch({
      executablePath,
      headless: true,
      args: ["--lang=ko-KR"],
    })
    .catch((error) => {
      browserPromise = null;
      throw error;
    });

  return browserPromise;
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
        throw new ScrapingError(
          "coupang",
          "쿠팡에서 추가 확인을 요구해 검색 결과를 가져오지 못했습니다."
        );
      }

      return await page.content();
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
