import { chromium } from "playwright";

const url = process.argv[2];
const timeoutMs = Number(process.argv[3] || 15000);
const rawOptions = process.argv[4];
const DEFAULT_BROWSER_PROFILE = {
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  acceptLanguage: "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
  locale: "zh-CN",
  timezoneId: "Asia/Shanghai",
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  colorScheme: "light",
  extraHTTPHeaders: {
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Upgrade-Insecure-Requests": "1",
  },
  stealth: {
    disableAutomationControlled: true,
    maskWebdriver: true,
    mockLanguages: true,
    mockPlugins: true,
    mockChromeRuntime: true,
  },
  interaction: {
    mouseMove: true,
    scroll: true,
    settleMs: 300,
  },
};
const hardTimeout = setTimeout(() => {
  writeResult({ ok: false, error: `Playwright browse timed out after ${timeoutMs}ms.` });
  process.exit(1);
}, timeoutMs + 3000);

function writeResult(result) {
  process.stdout.write(JSON.stringify(result));
}

if (!url) {
  writeResult({ ok: false, error: "URL is required." });
  process.exit(1);
}

function numberInRange(value, fallback, min, max) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function stringValue(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function mergeHeaders(value, fallback) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const headers = { ...fallback };
  for (const [key, headerValue] of Object.entries(value)) {
    if (!/^[A-Za-z0-9-]+$/.test(key)) continue;
    if (["cookie", "authorization", "proxy-authorization", "host", "connection"].includes(key.toLowerCase())) continue;
    if (typeof headerValue !== "string") continue;
    headers[key] = headerValue.slice(0, 1024);
  }
  return headers;
}

function readBrowserProfile() {
  if (!rawOptions) return DEFAULT_BROWSER_PROFILE;
  try {
    const raw = JSON.parse(rawOptions);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return DEFAULT_BROWSER_PROFILE;
    return {
      userAgent: stringValue(raw.userAgent, DEFAULT_BROWSER_PROFILE.userAgent),
      acceptLanguage: stringValue(raw.acceptLanguage, DEFAULT_BROWSER_PROFILE.acceptLanguage),
      locale: stringValue(raw.locale, DEFAULT_BROWSER_PROFILE.locale),
      timezoneId: stringValue(raw.timezoneId, DEFAULT_BROWSER_PROFILE.timezoneId),
      viewport: {
        width: numberInRange(raw.viewport?.width, DEFAULT_BROWSER_PROFILE.viewport.width, 320, 3840),
        height: numberInRange(raw.viewport?.height, DEFAULT_BROWSER_PROFILE.viewport.height, 320, 2160),
      },
      deviceScaleFactor: numberInRange(raw.deviceScaleFactor, DEFAULT_BROWSER_PROFILE.deviceScaleFactor, 1, 3),
      colorScheme: ["light", "dark", "no-preference"].includes(raw.colorScheme) ? raw.colorScheme : DEFAULT_BROWSER_PROFILE.colorScheme,
      extraHTTPHeaders: mergeHeaders(raw.extraHTTPHeaders, DEFAULT_BROWSER_PROFILE.extraHTTPHeaders),
      stealth: {
        disableAutomationControlled: raw.stealth?.disableAutomationControlled !== false,
        maskWebdriver: raw.stealth?.maskWebdriver !== false,
        mockLanguages: raw.stealth?.mockLanguages !== false,
        mockPlugins: raw.stealth?.mockPlugins !== false,
        mockChromeRuntime: raw.stealth?.mockChromeRuntime !== false,
      },
      interaction: {
        mouseMove: raw.interaction?.mouseMove !== false,
        scroll: raw.interaction?.scroll !== false,
        settleMs: numberInRange(raw.interaction?.settleMs, DEFAULT_BROWSER_PROFILE.interaction.settleMs, 0, 3000),
      },
    };
  } catch {
    return DEFAULT_BROWSER_PROFILE;
  }
}

const browserProfile = readBrowserProfile();

let browser;
try {
  browser = await chromium.launch({
    headless: true,
    args: [
      ...(browserProfile.stealth.disableAutomationControlled ? ["--disable-blink-features=AutomationControlled"] : []),
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--no-default-browser-check",
    ],
  });
  const context = await browser.newContext({
    viewport: browserProfile.viewport,
    screen: browserProfile.viewport,
    userAgent: browserProfile.userAgent,
    locale: browserProfile.locale,
    timezoneId: browserProfile.timezoneId,
    deviceScaleFactor: browserProfile.deviceScaleFactor,
    isMobile: false,
    hasTouch: false,
    colorScheme: browserProfile.colorScheme,
    extraHTTPHeaders: {
      "Accept-Language": browserProfile.acceptLanguage,
      ...browserProfile.extraHTTPHeaders,
    },
  });
  await context.addInitScript((profile) => {
    if (profile.stealth.maskWebdriver) {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    }
    if (profile.stealth.mockLanguages) {
      const languages = profile.acceptLanguage.split(",").map((item) => item.split(";")[0].trim()).filter(Boolean);
      Object.defineProperty(navigator, "languages", { get: () => languages.length > 0 ? languages : ["zh-CN", "zh", "en-US", "en"] });
    }
    if (profile.stealth.mockPlugins) {
      Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
    }
    if (profile.stealth.mockChromeRuntime) {
      window.chrome ??= { runtime: {} };
    }
  }, browserProfile);
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  await page.waitForLoadState("networkidle", { timeout: Math.min(timeoutMs, 8000) }).catch(() => undefined);
  if (browserProfile.interaction.mouseMove) {
    await page.mouse.move(Math.min(320, browserProfile.viewport.width - 20), Math.min(240, browserProfile.viewport.height - 20)).catch(() => undefined);
  }
  if (browserProfile.interaction.settleMs > 0) {
    await page.waitForTimeout(browserProfile.interaction.settleMs).catch(() => undefined);
  }
  if (browserProfile.interaction.scroll) {
    await page.evaluate(() => window.scrollBy(0, Math.min(window.innerHeight * 0.75, 700))).catch(() => undefined);
  }
  if (browserProfile.interaction.settleMs > 0) {
    await page.waitForTimeout(browserProfile.interaction.settleMs).catch(() => undefined);
  }
  const result = await page.evaluate(() => {
    document.querySelectorAll("script, style, noscript, svg, canvas").forEach((node) => node.remove());
    const title = document.title.trim();
    const root = document.querySelector("article") || document.querySelector("main") || document.body || document.documentElement;
    const text = (root.textContent || "").replace(/\s+/g, " ").trim();
    return { title, text };
  });
  writeResult({ ok: true, title: result.title, content: result.text });
} catch (error) {
  writeResult({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
} finally {
  clearTimeout(hardTimeout);
  await browser?.close().catch(() => undefined);
}
