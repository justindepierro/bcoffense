// @ts-check
/**
 * Shared test helpers for BCOffense Playwright specs.
 * The app is behind Cloudflare auth — these helpers handle login
 * and shared navigation utilities.
 */

const { expect } = require("@playwright/test");

// Credentials pulled from env so they never land in source.
const COACH_USER = process.env.BCOFFENSE_USER || "coach";
const COACH_PASS = process.env.BCOFFENSE_PASS || "password";

/**
 * Log in via the Cloudflare-protected login form.
 * Skips if already authenticated (session cookie present).
 * @param {import('@playwright/test').Page} page
 */
async function login(page) {
  await page.goto("/");

  // If redirected to login, fill the form
  const loginForm = page.locator("form#loginForm, form[action*='login'], input[name='username']");
  if (await loginForm.count() > 0) {
    await page.fill("input[name='username'], input[type='text']", COACH_USER);
    await page.fill("input[name='password'], input[type='password']", COACH_PASS);
    await page.locator("button[type='submit'], input[type='submit']").click();
    await page.waitForLoadState("networkidle");
  }
}

/**
 * Navigate to a named tab by clicking the tab bar button.
 * @param {import('@playwright/test').Page} page
 * @param {string} tabName - data-arg value, e.g. "playbook", "script"
 */
async function goToTab(page, tabName) {
  await page.locator(`[data-action="showTab"][data-arg="${tabName}"]`).click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(300); // allow animations
}

/**
 * Dismiss the first-use walkthrough modal if it appears.
 * @param {import('@playwright/test').Page} page
 */
async function dismissFirstUse(page) {
  const modal = page.locator(".modal-overlay.visible, .modal-wrap.visible");
  if (await modal.count() > 0) {
    const confirmBtn = modal.locator("button.btn-primary, button:has-text('OK'), button:has-text('Close')").first();
    if (await confirmBtn.count() > 0) {
      await confirmBtn.click();
      await page.waitForTimeout(200);
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
