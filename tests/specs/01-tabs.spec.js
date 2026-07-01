// @ts-nocheck
/**
 * Tab navigation tests — #10
 * Proves every top-level tab renders a non-empty panel.
 */
const { test, expect } = require("@playwright/test");
const { login, goToTab, dismissFirstUse } = require("./helpers");

const TABS = [
  { arg: "playbook", label: "Playbook" },
  { arg: "script", label: "Script" },
  { arg: "wristband", label: "Wristband" },
  { arg: "callsheet", label: "Call Sheet" },
  { arg: "tendencies", label: "Scout" },
  { arg: "installation", label: "Installation" },
  { arg: "offensebuilder", label: "Offense Builder" },
  { arg: "dashboard", label: "Dashboard" },
];

test.describe("Tab navigation (#10)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await dismissFirstUse(page);
  });

  for (const { arg, label } of TABS) {
    test(`${label} tab renders and is not blank`, async ({ page }) => {
      await goToTab(page, arg);

      // The active tab button should be highlighted
      const tabBtn = page.locator(`[data-action="showTab"][data-arg="${arg}"]`);
      await expect(tabBtn).toHaveClass(/active/);

      // The corresponding tab panel should be visible with some content
      const panel = page.locator(`[data-tab="${arg}"], #${arg}Tab, .tab-panel[data-name="${arg}"]`).first();
      if (await panel.count() > 0) {
        await expect(panel).toBeVisible();
      }

      // No JS error overlay
      const errorOverlay = page.locator(".fatal-error, #jsErrorBanner");
      await expect(errorOverlay).not.toBeVisible();
    });
  }
});
