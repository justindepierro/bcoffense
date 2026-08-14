// @ts-check
/**
 * Shared test helpers for BCOffense Playwright specs.
 * The app is behind Cloudflare auth — these helpers handle login
 * and shared navigation utilities.
 */

const { expect } = require("@playwright/test");

// Credentials pulled from env so they never land in source.
const TEST_ROLE = process.env.BCOFFENSE_ROLE || "";
const COACH_USER = process.env.BCOFFENSE_USER || TEST_ROLE || "coach";
const COACH_PASS = process.env.BCOFFENSE_PASS || "password";
const E2E_LOCAL = process.env.BCOFFENSE_E2E_LOCAL === "1";

const RUNTIME_IGNORE_PATTERNS = [
  /ResizeObserver loop/i,
  /The play\(\) request was interrupted/i,
  /requestfailed net::ERR_ABORTED .*\/api\/threads\/batch-counts/i,
];
// Local E2E validates our loopback app, not a third-party font CDN. Routes
// normally stub these requests, but Chromium can surface a late stylesheet
// subresource from the prior document while a hydration test intentionally
// reloads. Keep that external-only flake out of the local runtime ledger; a
// production font failure remains visible to non-local checks.
const LOCAL_RUNTIME_IGNORE_PATTERNS = E2E_LOCAL
  ? [/https:\/\/fonts\.(?:gstatic|googleapis)\.com\//i]
  : [];

const LOCAL_SEED_PLAYS = [
  {
    type: "Run",
    personnel: "11",
    formation: "Trips",
    play: "Buck Sweep",
    basePlay: "Buck",
    motion: "Jet",
    protection: "Slide",
    tempo: "Fast",
    preferredDown: "1",
    preferredDistance: "Medium",
  },
  {
    type: "Pass",
    personnel: "10",
    formation: "Doubles",
    play: "Four Verts",
    basePlay: "Verts",
    protection: "Half Slide",
    tempo: "NASCAR",
    preferredDown: "2",
    preferredDistance: "Long",
  },
  {
    type: "Screen",
    personnel: "11",
    formation: "Trips",
    play: "Bubble",
    basePlay: "Bubble",
    motion: "Orbit",
    protection: "Quick",
    tempo: "Fast",
    preferredDown: "3",
    preferredDistance: "Short",
  },
];

async function ensureLocalWorkspaceReady(page) {
  if (!E2E_LOCAL) return;
  await page.evaluate(async (samplePlays) => {
    const waitForStorage = async () => {
      const started = Date.now();
      while (Date.now() - started < 5000) {
        if (typeof storageManager !== "undefined" && typeof STORAGE_KEYS !== "undefined") return;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    };
    await waitForStorage();
    if (typeof storageManager !== "undefined" && typeof STORAGE_KEYS !== "undefined") {
      if (typeof storageManager.setPlaybook === "function") {
        await storageManager.setPlaybook(samplePlays);
      }
      storageManager.set(STORAGE_KEYS.FIRST_USE_DISMISSED, true);
      storageManager.set(STORAGE_KEYS.LAST_ACTIVE_TAB, "playbook");
    }
    try { plays = samplePlays.map((play) => ({ ...play })); } catch (_err) {}
    try { filteredPlays = plays.slice(); } catch (_err) {}
    if (typeof invalidateFilterCache === "function") invalidateFilterCache();
    if (typeof populateFilters === "function") populateFilters();
    if (typeof filterPlays === "function") filterPlays();
    if (typeof setWorkspaceSurface === "function") {
      setWorkspaceSurface("app", { initModules: true });
    } else if (typeof backToApp === "function") {
      backToApp();
    } else {
      document.getElementById("uploadSection")?.classList.add("hidden");
      document.getElementById("mainApp")?.classList.remove("hidden");
    }
    if (typeof showTab === "function") showTab("playbook");
  }, LOCAL_SEED_PLAYS);
  await expect(page.locator("#mainApp")).toBeVisible({ timeout: 10_000 });
}

/**
 * Log in via the Cloudflare-protected login form.
 * Skips if already authenticated (session cookie present).
 * @param {import('@playwright/test').Page} page
 */
async function login(page, opts = {}) {
  await page.goto("/");
  await page
    .waitForSelector('#authLoginOverlay, #mainApp:not(.hidden), form#loginForm, input[name="username"]', {
      timeout: 10_000,
    })
    .catch(() => {});

  const role = opts.role || TEST_ROLE || COACH_USER || "coach";
  const username = opts.username || (["admin", "coach", "player"].includes(role) ? role : COACH_USER);
  const password = opts.password || COACH_PASS;

  if (await page.locator("#mainApp:not(.hidden)").count() > 0) {
    const locked = await page.evaluate(() => document.body?.classList.contains("auth-locked")).catch(() => false);
    if (!locked) {
      await ensureLocalWorkspaceReady(page);
      return;
    }
  }

  // App-native role login overlay (localhost/dev and production app shell).
  const appLogin = page.locator("#authLoginOverlay");
  if ((await appLogin.count()) > 0 && await appLogin.isVisible()) {
    const roleButton = appLogin.locator(`[data-login-role="${role}"]`);
    if (await roleButton.count() > 0) await roleButton.click();
    await appLogin.locator("#authUsername").fill(username);
    await appLogin.locator("#authPassword").fill(password);
    await appLogin.locator("#authLoginSubmit").click();
    const hidden = await appLogin.waitFor({ state: "hidden", timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    if (!hidden) {
      const message = await appLogin
        .locator(".auth-login-error, [aria-live='assertive'], [role='alert']")
        .first()
        .textContent()
        .catch(() => "");
      throw new Error(
        `Login did not complete${message ? `: ${message.trim()}` : ""}. ` +
        "For reliable E2E runs use `npm run test:e2e:local`, or set valid BCOFFENSE_USER/BCOFFENSE_PASS for production.",
      );
    }
    await expect(page.locator("#mainApp")).toBeVisible({ timeout: 10_000 }).catch(() => {});
    await ensureLocalWorkspaceReady(page);
    return;
  }

  // If redirected to a hosting/login form, fill that form.
  const loginForm = page.locator("form#loginForm, form[action*='login'], input[name='username']");
  if (await loginForm.count() > 0) {
    await page.fill("input[name='username'], input[type='text']", username);
    await page.fill("input[name='password'], input[type='password']", password);
    await page.locator("button[type='submit'], input[type='submit']").click();
    await page.waitForLoadState("networkidle");
  }

  await expect(page.locator("#mainApp")).toBeVisible({ timeout: 10_000 }).catch(() => {});
  await ensureLocalWorkspaceReady(page);
}

/**
 * Navigate to a named tab by clicking the tab bar button.
 * @param {import('@playwright/test').Page} page
 * @param {string} tabName - data-arg value, e.g. "playbook", "script"
 */
async function goToTab(page, tabName) {
  const tab = page.locator(`#tab-${tabName}`);
  if ((await tab.count()) > 0 && await tab.isVisible()) {
    await tab.click();
  } else {
    await page.evaluate((name) => {
      if (typeof showTab === "function") showTab(name);
    }, tabName);
  }

  const activePanel = page.locator(`#${tabName}.panel.active`).first();
  if ((await activePanel.count()) > 0) {
    await expect(activePanel).toBeVisible({ timeout: 5_000 });
  }
  await page.waitForTimeout(150); // allow short shell transitions
}

/**
 * Dismiss the first-use walkthrough modal if it appears.
 * @param {import('@playwright/test').Page} page
 */
async function dismissFirstUse(page) {
  for (let i = 0; i < 3; i++) {
    const modal = page
      .locator(".custom-modal-overlay.visible, .modal-overlay.visible, .modal-wrap.visible")
      .first();
    if ((await modal.count()) === 0 || !(await modal.isVisible())) return;

    const confirmBtn = modal
      .locator("button.btn-primary, button:has-text('OK'), button:has-text('Close')")
      .first();
    if (await confirmBtn.count() > 0) {
      await confirmBtn.click();
      await expect(modal).toBeHidden({ timeout: 2_000 }).catch(() => {});
    } else {
      await page.keyboard.press("Escape");
    }
  }
}

/**
 * Assert no horizontal overflow at the current viewport width.
 * @param {import('@playwright/test').Page} page
 */
async function assertNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => {
    const body = document.body;
    return body.scrollWidth > window.innerWidth;
  });
  expect(overflow, "Page has horizontal overflow").toBe(false);
}

/**
 * Assert all interactive elements meet the 44px touch target minimum.
 * Returns count of violating elements.
 * @param {import('@playwright/test').Page} page
 */
async function getTouchTargetViolations(page) {
  return page.evaluate(() => {
    const interactives = Array.from(
      document.querySelectorAll("button, [role='button'], a[href], input, select, [data-action]")
    );
    return interactives.filter((el) => {
      const r = el.getBoundingClientRect();
      // Only visible elements
      if (r.width === 0 || r.height === 0) return false;
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") return false;
      return r.width < 44 || r.height < 44;
    }).map((el) => ({
      tag: el.tagName,
      action: el.getAttribute("data-action") || "",
      text: el.textContent?.trim().substring(0, 40) || "",
      w: Math.round(el.getBoundingClientRect().width),
      h: Math.round(el.getBoundingClientRect().height),
    }));
  });
}

function isIgnoredRuntimeIssue(issue, extraPatterns = []) {
  const text = [issue.type, issue.message, issue.url, issue.source]
    .filter(Boolean)
    .join(" ");
  return [...RUNTIME_IGNORE_PATTERNS, ...LOCAL_RUNTIME_IGNORE_PATTERNS, ...extraPatterns]
    .some((pattern) => pattern.test(text));
}

function isExpectedReloadCancellation(request) {
  if (
    request.method() !== "GET" ||
    request.failure()?.errorText !== "net::ERR_ABORTED"
  ) return false;

  const url = request.url();
  return (
    /\/auth\/me(?:\?|$)/.test(url) ||
    /^https:\/\/fonts\.(?:gstatic|googleapis)\.com\//i.test(url)
  );
}

// A spec can opt into one exact prior-document request cancellation while it
// deliberately reloads the page. Keep this separate from the global reload
// allowance above: application/API requests remain failures unless the spec
// names the exact URL immediately around its own page.reload() call.
function isExplicitExpectedReloadCancellation(page, request) {
  if (
    request.method() !== "GET" ||
    request.failure()?.errorText !== "net::ERR_ABORTED"
  ) return false;

  const expectedUrls = page.__bcExpectedReloadAbortUrls;
  if (!Array.isArray(expectedUrls)) return false;
  try {
    const url = new URL(request.url());
    return expectedUrls.includes(`${url.pathname}${url.search}`);
  } catch (_err) {
    return false;
  }
}

async function reloadWithExpectedAbort(page, expectedUrls = [], options = {}) {
  page.__bcExpectedReloadAbortUrls = Array.isArray(expectedUrls)
    ? expectedUrls.slice()
    : [];
  try {
    return await page.reload(options);
  } finally {
    page.__bcExpectedReloadAbortUrls = [];
  }
}

// The performance telemetry beacon (js/perf-monitor.js) fires on
// visibilitychange/pagehide via navigator.sendBeacon (or fetch keepalive).
// When the page is torn down between tests the browsing context is destroyed
// mid-flight, which Chromium reports as an ERR_ABORTED POST. That is the
// designed best-effort behavior of a fire-and-forget beacon, not an app
// failure, so exempt exactly that request.
function isExpectedTelemetryBeaconAbort(request) {
  if (
    request.method() !== "POST" ||
    request.failure()?.errorText !== "net::ERR_ABORTED"
  ) return false;
  return /\/api\/telemetry(?:\?|$)/.test(request.url());
}

async function installLocalFontStubs(page) {
  if (!E2E_LOCAL || page.__bcLocalFontStubsInstalled) return;
  page.__bcLocalFontStubsInstalled = true;
  // Local integration runs validate our app shell, not Google Fonts uptime.
  // An empty stylesheet preserves system-font fallback without letting a
  // third-party 404 make a hydration assertion flaky.
  await page.route(/^https:\/\/fonts\.googleapis\.com\//i, (route) => route.fulfill({
    status: 200,
    contentType: "text/css; charset=utf-8",
    body: "",
  }));
  await page.route(/^https:\/\/fonts\.gstatic\.com\//i, (route) => route.fulfill({
    status: 204,
    body: "",
  }));
}

async function installRuntimeErrorGuards(page) {
  page.__bcRuntimeIssues = [];
  page.__bcMainFrameNavigations = 0;

  await installLocalFontStubs(page);

  await page.addInitScript(() => {
    window.__bcRuntimeIssues = [];
    window.addEventListener("error", (event) => {
      window.__bcRuntimeIssues.push({
        type: "window-error",
        message: event.message || String(event.error || ""),
        source: event.filename || "",
        line: event.lineno || 0,
      });
    });
    window.addEventListener("unhandledrejection", (event) => {
      window.__bcRuntimeIssues.push({
        type: "unhandledrejection",
        message: String(event.reason?.message || event.reason || ""),
      });
    });
  });

  page.on("pageerror", (err) => {
    page.__bcRuntimeIssues.push({
      type: "pageerror",
      message: err?.message || String(err),
      stack: err?.stack || "",
    });
  });

  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    page.__bcRuntimeIssues.push({
      type: "console",
      message: msg.text(),
      location: msg.location(),
    });
  });

  page.on("requestfailed", (request) => {
    const url = request.url();
    if (/^(data|blob|about):/i.test(url)) return;
    // A test-issued page.reload() intentionally cancels prior-document work.
    // Chromium reports those cancellations as ERR_ABORTED. Only the prior
    // /auth/me probe and Google font GETs are exempt; an individual spec may
    // also name one exact prior-document URL through reloadWithExpectedAbort.
    // Any other app/API/local asset, host, method, or error class remains a
    // test failure.
    if (isExpectedReloadCancellation(request)) return;
    if (isExplicitExpectedReloadCancellation(page, request)) return;
    if (isExpectedTelemetryBeaconAbort(request)) return;
    page.__bcRuntimeIssues.push({
      type: "requestfailed",
      message: request.failure()?.errorText || "request failed",
      url,
      method: request.method(),
    });
  });

  page.on("response", (response) => {
    const status = response.status();
    if (status < 400) return;
    const url = response.url();
    if (/\/favicon\.ico(?:\?|$)/.test(url)) return;
    page.__bcRuntimeIssues.push({
      type: "http",
      message: `HTTP ${status}`,
      url,
    });
  });

  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) page.__bcMainFrameNavigations += 1;
  });
}

async function resetRuntimeErrorGuards(page) {
  page.__bcRuntimeIssues = [];
  page.__bcMainFrameNavigations = 0;
  page.__bcExpectedReloadAbortUrls = [];
  await page.evaluate(() => {
    window.__bcRuntimeIssues = [];
  }).catch(() => {});
}

async function getRuntimeIssues(page, opts = {}) {
  const browserIssues = await page.evaluate(() => window.__bcRuntimeIssues || []).catch(() => []);
  const all = [...(page.__bcRuntimeIssues || []), ...browserIssues];
  const ignorePatterns = opts.ignorePatterns || [];
  return all.filter((issue) => !isIgnoredRuntimeIssue(issue, ignorePatterns));
}

async function assertRuntimeClean(page, opts = {}) {
  const issues = await getRuntimeIssues(page, opts);
  expect(issues, "Unexpected runtime/network issues").toEqual([]);
  if (opts.maxMainFrameNavigations !== undefined) {
    expect(
      page.__bcMainFrameNavigations || 0,
      "Unexpected repeated main-frame navigation/reload",
    ).toBeLessThanOrEqual(opts.maxMainFrameNavigations);
  }
}

module.exports = {
  login,
  goToTab,
  dismissFirstUse,
  assertNoHorizontalOverflow,
  getTouchTargetViolations,
  installRuntimeErrorGuards,
  resetRuntimeErrorGuards,
  reloadWithExpectedAbort,
  getRuntimeIssues,
  assertRuntimeClean,
};
