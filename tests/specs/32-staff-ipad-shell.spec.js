// @ts-check
/**
 * Staff iPad shell regression.
 *
 * A roomy coach workspace owns the full panel canvas. The global Quick Tools
 * tray must not float over that canvas; its utilities remain reachable through
 * header More and page-local Actions. Routes tucked under the rail's More
 * sheet must also leave a clear active orientation in both the closed rail and
 * the opened sheet.
 */
const { test, expect } = require("@playwright/test");
const {
  login,
  dismissFirstUse,
  goToTab,
  assertNoHorizontalOverflow,
} = require("./helpers");

const ROOMY_IPAD_VIEWPORTS = [
  { label: "1024×768 iPad", size: { width: 1024, height: 768 } },
  { label: "M1 iPad landscape", size: { width: 1194, height: 834 } },
];

async function waitForRoomyStaffLandscape(page, expectedViewport) {
  await page.waitForFunction((viewport) => {
    const body = document.body;
    const rail = document.getElementById("ipadRail");
    const railBox = rail?.getBoundingClientRect();
    return (
      window.innerWidth === viewport.width &&
      window.innerHeight === viewport.height &&
      body?.classList.contains("shell-tablet") &&
      body.classList.contains("is-staff-mobile-shell") &&
      body.classList.contains("is-landscape-screen") &&
      body.dataset.layoutProfile === "tablet-landscape" &&
      Boolean(railBox && railBox.width > 0 && railBox.height > 0)
    );
  }, expectedViewport);
}

async function shellGeometry(page) {
  return page.evaluate(() => {
    const visibleBox = (element) => {
      if (!element || element.hidden) return null;
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      if (style.display === "none" || style.visibility === "hidden" || box.width <= 0 || box.height <= 0) {
        return null;
      }
      return {
        left: box.left,
        top: box.top,
        right: box.right,
        bottom: box.bottom,
        width: box.width,
        height: box.height,
      };
    };
    const quickTools = document.getElementById("quickTools");
    const pageActions = document.getElementById("pageActionsFab");
    return {
      quickTools: visibleBox(quickTools),
      quickToolsDisplay: quickTools ? getComputedStyle(quickTools).display : "",
      pageActions: visibleBox(pageActions),
      rail: visibleBox(document.getElementById("ipadRail")),
      headerOverflow: visibleBox(document.getElementById("headerOverflowToggle")),
    };
  });
}

test.describe("staff iPad shell", () => {
  test("keeps the roomy coach canvas clear while Header More and rail More retain utility and route orientation", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "ipad-landscape",
      "Requires the touch-enabled WebKit iPad landscape project.",
    );

    await login(page, { role: "coach", username: "coach", password: "password" });
    await dismissFirstUse(page);

    for (const viewport of ROOMY_IPAD_VIEWPORTS) {
      await page.setViewportSize(viewport.size);
      await waitForRoomyStaffLandscape(page, viewport.size);
      await goToTab(page, "dashboard");

      const geometry = await shellGeometry(page);
      expect(geometry.rail, `${viewport.label}: the coach rail remains available`).not.toBeNull();
      expect(geometry.headerOverflow, `${viewport.label}: Header More remains available`).not.toBeNull();
      expect(geometry.headerOverflow?.width || 0).toBeGreaterThanOrEqual(44);
      expect(geometry.headerOverflow?.height || 0).toBeGreaterThanOrEqual(44);
      expect(geometry.quickToolsDisplay, `${viewport.label}: Quick Tools does not float over the canvas`).toBe("none");
      expect(geometry.quickTools, `${viewport.label}: no hidden fixed hit target remains`).toBeNull();
      expect(geometry.pageActions, `${viewport.label}: phone-only Actions FAB stays out of the rail workspace`).toBeNull();
      await expect(page.locator('#ipadRail [data-rail-tab="dashboard"]')).toHaveAttribute("aria-current", "page");

      await page.locator("#headerOverflowToggle").click();
      const headerMenu = page.locator(".header-overflow-menu");
      await expect(headerMenu).toBeVisible();
      await expect(headerMenu.locator(".header-overflow-help-item")).toBeVisible();
      const headerRows = await headerMenu.locator("button:visible").evaluateAll((buttons) =>
        buttons.map((button) => {
          const box = button.getBoundingClientRect();
          return {
            label: button.textContent?.trim() || "",
            width: box.width,
            height: box.height,
          };
        }),
      );
      expect(headerRows.length, `${viewport.label}: header More has reachable rows`).toBeGreaterThan(0);
      headerRows.forEach((row) => {
        expect(row.width, `${viewport.label}: ${row.label} menu row width`).toBeGreaterThanOrEqual(44);
        expect(row.height, `${viewport.label}: ${row.label} menu row height`).toBeGreaterThanOrEqual(44);
      });

      await headerMenu.locator(".header-overflow-help-item").click();
      await expect(page.locator("#helpOverlay")).toHaveClass(/visible/);
      await page.keyboard.press("Escape");
      await expect(page.locator("#helpOverlay")).not.toHaveClass(/visible/);

      await goToTab(page, "signals");
      const moreTrigger = page.locator("#ipadRail .ipad-rail-more-btn");
      await expect(moreTrigger).toHaveClass(/is-active/);
      await expect(moreTrigger).toHaveAttribute("data-active-destination", "signals");
      await expect(moreTrigger).toHaveAttribute("aria-label", /current: 📡 Signals/);

      await moreTrigger.click();
      const railMore = page.locator("#ipadRailMore");
      await expect(railMore).toHaveClass(/visible/);
      const activeMoreRoute = railMore.locator('[data-rail-more-tab="signals"]');
      await expect(activeMoreRoute).toHaveClass(/is-active/);
      await expect(activeMoreRoute).toHaveAttribute("aria-current", "page");

      await page.locator('[data-rail-more-tab="wristband"]').click();
      await expect(moreTrigger).toHaveClass(/is-active/);
      await expect(moreTrigger).toHaveAttribute("data-active-destination", "wristband");
      await moreTrigger.click();
      await expect(page.locator('[data-rail-more-tab="wristband"]')).toHaveAttribute("aria-current", "page");

      await goToTab(page, "script");
      await expect(railMore).not.toHaveClass(/visible/);
      await expect(moreTrigger).not.toHaveClass(/is-active/);
      await expect(moreTrigger).not.toHaveAttribute("data-active-destination", /.+/);
      await expect(page.locator('#ipadRail [data-rail-tab="script"]')).toHaveAttribute("aria-current", "page");

      await assertNoHorizontalOverflow(page);
    }
  });

  test("keeps the staff header More rows touch-safe on an M1 iPad portrait", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "ipad-portrait",
      "Requires the touch-enabled WebKit iPad portrait project.",
    );

    await page.setViewportSize({ width: 834, height: 1194 });
    await login(page, { role: "coach", username: "coach", password: "password" });
    await dismissFirstUse(page);
    await page.waitForFunction(() => {
      const body = document.body;
      const trigger = document.getElementById("headerOverflowToggle");
      const box = trigger?.getBoundingClientRect();
      return (
        body?.classList.contains("shell-tablet") &&
        body.classList.contains("is-staff-mobile-shell") &&
        body.classList.contains("is-portrait-screen") &&
        body.dataset.layoutProfile === "tablet-portrait" &&
        Boolean(box && box.width >= 44 && box.height >= 44)
      );
    });

    await page.locator("#headerOverflowToggle").click();
    const rows = await page.locator(".header-overflow-menu button:visible").evaluateAll((buttons) =>
      buttons.map((button) => {
        const box = button.getBoundingClientRect();
        return { label: button.textContent?.trim() || "", width: box.width, height: box.height };
      }),
    );
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((row) => {
      expect(row.width, `M1 portrait: ${row.label} menu row width`).toBeGreaterThanOrEqual(44);
      expect(row.height, `M1 portrait: ${row.label} menu row height`).toBeGreaterThanOrEqual(44);
    });
  });
});
