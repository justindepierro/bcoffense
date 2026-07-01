// @ts-check
/**
 * Screenshot capture tests — #2, #14
 *
 * #2  Screenshots of all six pages at desktop, iPad portrait, iPad landscape, phone
 * #14 Screenshots for empty, populated, and active Opponent Scout states
 *
 * Run: npm run screenshots
 */
const { test, expect } = require("@playwright/test");
const { login, goToTab, dismissFirstUse } = require("./helpers");
const path = require("path");
const fs = require("fs");

const SCREENSHOTS_DIR = path.join(__dirname, "..", "screenshots");

test.describe("@screenshots App screenshots (#2 #14)", () => {
  test.beforeEach(async ({ page }) => {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    await login(page);
    await dismissFirstUse(page);
  });

  const PAGE_TABS = [
    "playbook", "script", "wristband", "callsheet", "tendencies",
    "installation", "offensebuilder", "dashboard",
  ];

  test("#2 All pages at current viewport", async ({ page, browserName }, testInfo) => {
    const device = testInfo.project.name;

    for (const tab of PAGE_TABS) {
      await goToTab(page, tab);
      await page.waitForTimeout(500);

      const fname = `page-${tab}-${device}.png`;
      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, fname),
        fullPage: false,
      });
    }

    const files = fs.readdirSync(SCREENSHOTS_DIR).filter((f) => f.startsWith("page-"));
    expect(files.length).toBeGreaterThan(0);
  });

  test("#14 Scout page: empty state screenshot", async ({ page }, testInfo) => {
    const device = testInfo.project.name;
    await goToTab(page, "tendencies");
    await page.waitForTimeout(400);

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, `scout-empty-${device}.png`),
    });
  });

  test("#14 Scout page: populated state screenshot (if data exists)", async ({ page }, testInfo) => {
    const device = testInfo.project.name;
    await goToTab(page, "tendencies");

    // Click first opponent if any
    const firstOpp = page.locator(".td-opp-card, .td-opponent-item").first();
    if (await firstOpp.count() > 0) {
      await firstOpp.click();
      await page.waitForTimeout(400);
    }

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, `scout-populated-${device}.png`),
    });
  });
});
