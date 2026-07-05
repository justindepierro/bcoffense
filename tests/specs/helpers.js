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

  // App-native role login overlay (localhost/dev and production app shell).
  const appLogin = page.locator("#authLoginOverlay");
  if (await appLogin.count() > 0) {
    const roleButton = appLogin.locator(`[data-login-role="${role}"]`);
    if (await roleButton.count() > 0) await roleButton.click();
    await appLogin.locator("#authUsername").fill(username);
    await appLogin.locator("#authPassword").fill(password);
    await appLogin.locator("#authLoginSubmit").click();
    await expect(appLogin).toBeHidden({ timeout: 10_000 });
    await expect(page.locator("#mainApp")).toBeVisible({ timeout: 10_000 }).catch(() => {});
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
