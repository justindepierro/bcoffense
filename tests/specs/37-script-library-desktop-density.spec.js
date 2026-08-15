// @ts-check
const { test, expect } = require("@playwright/test");
const { login, dismissFirstUse, goToTab, assertNoHorizontalOverflow } = require("./helpers");

test("desktop Script library keeps advanced filters compact", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "Targets the desktop coach workbench.");
  await login(page, { role: "coach", username: "coach", password: "password" });
  await dismissFirstUse(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await goToTab(page, "script");
  const libraryToggle = page.locator("#scriptPlayRailToggle");
  if (await libraryToggle.isVisible()) await libraryToggle.click();
  await expect(page.locator("#scriptPlayRail")).toBeVisible();
  await expect(page.locator("#scriptFiltersContainer")).toHaveClass(/collapsed/);
  await expect(page.locator("#availablePlays .script-library-row").first()).toBeVisible();

  const commandGeometry = await page.locator("#script .script-toolbar").evaluate((toolbar) => {
    const toolbarRect = toolbar.getBoundingClientRect();
    const controls = Array.from(toolbar.querySelectorAll("button, input, select, label"));
    return {
      toolbarRight: toolbarRect.right,
      viewportRight: window.innerWidth,
      controls: controls.map((control) => {
        const rect = control.getBoundingClientRect();
        const style = getComputedStyle(control);
        return {
          visible: style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0,
          right: rect.right,
          left: rect.left,
        };
      }),
    };
  });
  expect(commandGeometry.toolbarRight).toBeLessThanOrEqual(commandGeometry.viewportRight + 1);
  commandGeometry.controls.filter((control) => control.visible).forEach((control) => {
    expect(control.left).toBeGreaterThanOrEqual(-1);
    expect(control.right).toBeLessThanOrEqual(commandGeometry.toolbarRight + 1);
  });

  await page.locator("#toggleFiltersBtn").click();
  await expect(page.locator("#scriptFiltersContainer")).not.toHaveClass(/collapsed/);

  const geometry = await page.locator("#scriptFiltersContainer").evaluate((container) => {
    const style = getComputedStyle(container);
    const title = container.querySelector(".checkbox-filters-title");
    const selects = Array.from(container.querySelectorAll("select"));
    return {
      columns: style.gridTemplateColumns.split(" ").length,
      titleHeight: title?.getBoundingClientRect().height || 0,
      selectHeights: selects.map((select) => select.getBoundingClientRect().height),
    };
  });
  expect(geometry.columns).toBe(2);
  expect(geometry.titleHeight).toBeLessThanOrEqual(32);
  geometry.selectHeights.forEach((height) => expect(height).toBeLessThanOrEqual(34));
  await assertNoHorizontalOverflow(page);
});
