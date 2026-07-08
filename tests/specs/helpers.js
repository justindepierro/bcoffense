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

module.exports = { login, goToTab, dismissFirstUse, assertNoHorizontalOverflow, getTouchTargetViolations };
