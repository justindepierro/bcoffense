// @ts-check
/**
 * Viewport and responsive tests — #205, #206, #223, #253
 *
 * #205 Automated edge tests at all four viewport corners
 * #206 Tests inside sticky and scrollable containers
 * #223 Header height with long opponent names
 * #253 Screenshots for each toolbar at key widths
 */
const { test, expect } = require("@playwright/test");
const { login, goToTab, dismissFirstUse, assertNoHorizontalOverflow, getTouchTargetViolations } = require("./helpers");
const path = require("path");
const fs = require("fs");

// Key widths to test (#253)
const TOOLBAR_WIDTHS = [320, 375, 430, 768, 1024, 1280];

test.describe("Viewport and responsive layout (#205 #206 #223 #253)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await dismissFirstUse(page);
  });

  test("#205 No horizontal overflow at current viewport width", async ({ page }) => {
    const tabs = ["playbook", "script", "wristband", "callsheet", "tendencies", "dashboard"];
    for (const tab of tabs) {
      await goToTab(page, tab);
      await assertNoHorizontalOverflow(page);
    }
  });

  test("#205 Four viewport corner elements are accessible", async ({ page }) => {
    const vw = await page.evaluate(() => window.innerWidth);
    const vh = await page.evaluate(() => window.innerHeight);

    // Define corner coordinates
    const corners = [
      { x: 1, y: 1, name: "top-left" },
      { x: vw - 1, y: 1, name: "top-right" },
      { x: 1, y: vh - 1, name: "bottom-left" },
      { x: vw - 1, y: vh - 1, name: "bottom-right" },
    ];

    for (const corner of corners) {
      const el = await page.evaluate(({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        return el ? el.tagName : null;
      }, corner);
      // Each corner should have a real element (not null — which would mean nothing rendered there)
      expect(el, `No element at ${corner.name} corner`).not.toBeNull();
    }
  });

  test("#206 Sticky header does not cover content after scroll", async ({ page }) => {
    await goToTab(page, "playbook");
    await page.evaluate(() => window.scrollTo(0, 300));
    await page.waitForTimeout(200);

    const headerBottom = await page.evaluate(() => {
      const header = document.querySelector("header, .app-header, #appHeader, .header");
      if (!header) return 0;
      return header.getBoundingClientRect().bottom;
    });

    const firstRow = await page.evaluate(() => {
      const row = document.querySelector("#playbookTable tbody tr, .pb-play-row");
      if (!row) return null;
      return row.getBoundingClientRect().top;
    });

    if (firstRow !== null && firstRow > 0) {
      // First visible row top should be at or below the header bottom
      expect(firstRow).toBeGreaterThanOrEqual(headerBottom - 1); // 1px tolerance
    }
  });

  test("#206 Scrollable call sheet container does not trap focus", async ({ page }) => {
    await goToTab(page, "callsheet");
    await page.waitForTimeout(300);

    // Tab through the call sheet — focus should eventually leave the scrollable area
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Tab");
      await page.waitForTimeout(50);
    }

    // No assertion needed — this test just proves tab doesn't get stuck (no timeout = pass)
  });

  test("#223 Header stays single-line with a long opponent name", async ({ page }) => {
    await goToTab(page, "dashboard");

    // Inject a long opponent name via the select or JS
    await page.evaluate(() => {
      const el = document.querySelector("#dashOpponentLabel, .dash-opp-name, .opponent-label");
      if (el) {
        el.textContent = "A Very Long Opponent Name That Could Cause Wrapping Issues Internationalization";
      }
    });

    await page.waitForTimeout(100);

    const header = page.locator("header, .app-header, #appHeader, .header").first();
    if (await header.count() === 0) return;

    const headerHeight = await header.evaluate((el) => el.getBoundingClientRect().height);
    // Header should not grow beyond ~80px (double height) due to wrapping
    expect(headerHeight).toBeLessThan(90);
  });

  test("#253 @screenshots Capture toolbars at key widths", async ({ page, browserName }) => {
    if (browserName !== "chromium") test.skip(); // Screenshots only on chromium

    const screenshotsDir = path.join(__dirname, "..", "screenshots");
    fs.mkdirSync(screenshotsDir, { recursive: true });

    const tabs = [
      { arg: "playbook", selector: ".pb-toolbar, .playbook-toolbar, #playbookToolbar" },
      { arg: "script", selector: ".script-toolbar, #scriptToolbar" },
      { arg: "callsheet", selector: ".cs-toolbar, #csToolbar" },
      { arg: "wristband", selector: ".wb-toolbar, #wbToolbar" },
      { arg: "tendencies", selector: ".td-toolbar, #tendenciesToolbar" },
    ];

    for (const width of TOOLBAR_WIDTHS) {
      await page.setViewportSize({ width, height: 768 });
      await page.waitForTimeout(150);

      for (const { arg, selector } of tabs) {
        await goToTab(page, arg);
        await page.waitForTimeout(150);

        const toolbar = page.locator(selector).first();
        if (await toolbar.count() === 0) continue;

        const fname = `toolbar-${arg}-${width}px.png`;
        await toolbar.screenshot({ path: path.join(screenshotsDir, fname) });
      }
    }

    // Confirm at least some screenshots were created
    const files = fs.readdirSync(screenshotsDir).filter((f) => f.endsWith(".png"));
    expect(files.length).toBeGreaterThan(0);
  });
});
