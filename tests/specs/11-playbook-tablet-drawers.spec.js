// @ts-check
/**
 * Playbook tablet drawer contract.
 *
 * The landscape coach shell replaces tabs with a 78px iPad rail. These checks
 * protect the filter rail from regressing to the phone's full-width sheet at
 * the two widths coaches use most often.
 */
const { test, expect } = require("@playwright/test");
const { login, dismissFirstUse, goToTab, assertNoHorizontalOverflow } = require("./helpers");

const TABLET_LANDSCAPE_VIEWPORTS = [
  { width: 1024, height: 768 },
  { width: 1366, height: 768 },
];

test.describe("Playbook tablet drawers", () => {
  test("coach filter rail clears the iPad navigation rail at standard landscape widths", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "ipad-landscape",
      "This contract requires the touch-enabled iPad landscape project.",
    );

    await login(page, { role: "coach", username: "coach" });
    await dismissFirstUse(page);

    for (const viewport of TABLET_LANDSCAPE_VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(180);
      await goToTab(page, "playbook");

      const toggle = page.locator("#pbFilterToggleBtn");
      const drawer = page.locator("#pbFilterDrawer");
      const close = drawer.getByRole("button", { name: /Close filters/i });
      await expect(toggle).toBeVisible();
      await toggle.click();
      await expect(drawer).toBeVisible();
      await page.waitForTimeout(260);

      const geometry = await page.evaluate(() => {
        const body = document.body;
        const rail = document.getElementById("ipadRail")?.getBoundingClientRect();
        const drawer = document.getElementById("pbFilterDrawer")?.getBoundingClientRect();
        const close = document.querySelector("#pbFilterDrawer .pb-filter-drawer-close")?.getBoundingClientRect();
        const printClose = document.querySelector("#pbPrintPanel .pb-drawer-close")?.getBoundingClientRect();
        const collectionsClose = document.querySelector("#pbCollectionsPanel .pb-drawer-close")?.getBoundingClientRect();
        const actionSheet = document.getElementById("pbActionSheet");
        const overlapsRail = Boolean(
          rail && drawer &&
          drawer.left < rail.right && drawer.right > rail.left &&
          drawer.top < rail.bottom && drawer.bottom > rail.top,
        );
        return {
          classes: body.className,
          layerOpen: document.getElementById("pbFilterDrawer")?.dataset.layerOpen === "true",
          bodyLocked: body.classList.contains("app-layer-locked"),
          actionSheetDisplay: actionSheet ? getComputedStyle(actionSheet).display : "",
          overflow: document.body.scrollWidth > window.innerWidth,
          overlapsRail,
          rail,
          drawer,
          close,
          printClose,
          collectionsClose,
          viewport: { width: window.innerWidth, height: window.innerHeight },
        };
      });

      expect(geometry.classes).toContain("shell-tablet");
      expect(geometry.classes).toContain("is-landscape-screen");
      expect(geometry.rail?.width).toBeGreaterThanOrEqual(78);
      expect(geometry.drawer?.left).toBeGreaterThanOrEqual(geometry.rail?.right || 0);
      expect(geometry.drawer?.right).toBeLessThanOrEqual(geometry.viewport.width);
      expect(geometry.drawer?.top).toBeGreaterThan(0);
      expect(geometry.drawer?.bottom).toBeLessThanOrEqual(geometry.viewport.height);
      expect(geometry.overlapsRail).toBe(false);
      expect(geometry.overflow).toBe(false);
      expect(geometry.close?.width).toBeGreaterThanOrEqual(44);
      expect(geometry.close?.height).toBeGreaterThanOrEqual(44);
      expect(geometry.printClose?.width).toBeGreaterThanOrEqual(44);
      expect(geometry.collectionsClose?.height).toBeGreaterThanOrEqual(44);
      // The iPad filter rail is contextual, not a phone-style modal sheet.
      expect(geometry.layerOpen).toBe(false);
      expect(geometry.bodyLocked).toBe(false);
      expect(geometry.actionSheetDisplay).toBe("none");

      await close.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(drawer).toHaveAttribute("aria-hidden", "true");
    }

    // Action sheets are phone-only. A stale command must not create an
    // invisible app layer after the shell promotes to tablet landscape.
    const actionSheetState = await page.evaluate(() => {
      openPbActionSheet();
      const sheet = document.getElementById("pbActionSheet");
      return {
        open: sheet?.classList.contains("open") || false,
        layerOpen: sheet?.dataset.layerOpen === "true",
        bodyLocked: document.body.classList.contains("app-layer-locked"),
      };
    });
    expect(actionSheetState).toEqual({ open: false, layerOpen: false, bodyLocked: false });
    await assertNoHorizontalOverflow(page);
  });

  test("coach portrait filter sheet owns scroll and releases it on Escape", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "ipad-portrait",
      "This contract requires the touch-enabled iPad portrait project.",
    );

    await login(page, { role: "coach", username: "coach" });
    await dismissFirstUse(page);
    await goToTab(page, "playbook");

    const toggle = page.locator("#pbFilterToggleBtn");
    const drawer = page.locator("#pbFilterDrawer");
    const close = drawer.getByRole("button", { name: /Close filters/i });
    await toggle.click();
    await expect(drawer).toBeVisible();

    const openState = await page.evaluate(() => {
      const rect = document.querySelector("#pbFilterDrawer .pb-filter-drawer-close")?.getBoundingClientRect();
      return {
        classes: document.body.className,
        layerId: document.getElementById("pbFilterDrawer")?.dataset.layerId || "",
        layerOpen: document.getElementById("pbFilterDrawer")?.dataset.layerOpen === "true",
        bodyLocked: document.body.classList.contains("app-layer-locked"),
        close: rect ? { width: rect.width, height: rect.height } : null,
      };
    });
    expect(openState.classes).toContain("shell-tablet");
    expect(openState.classes).toContain("is-portrait-screen");
    expect(openState.layerId).toBe("pb-filter-drawer");
    expect(openState.layerOpen).toBe(true);
    expect(openState.bodyLocked).toBe(true);
    expect(openState.close?.width).toBeGreaterThanOrEqual(44);
    expect(openState.close?.height).toBeGreaterThanOrEqual(44);

    await close.press("Escape");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(drawer).toHaveAttribute("aria-hidden", "true");
    await expect.poll(() => page.evaluate(() => document.body.classList.contains("app-layer-locked"))).toBe(false);
  });

});
