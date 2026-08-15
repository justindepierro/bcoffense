// @ts-check
const { test, expect } = require("@playwright/test");
const { login, dismissFirstUse, goToTab, assertNoHorizontalOverflow } = require("./helpers");

function boxIsCentered(box, viewport) {
  return Math.abs(box.left + (box.width / 2) - (viewport.left + (viewport.width / 2))) <= 3
    && Math.abs(box.top + (box.height / 2) - (viewport.top + (viewport.height / 2))) <= 3;
}

test.describe("Script Workspace Tools modal", () => {
  test("opens as a focused centered modal without squeezing the Script workspace", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "ipad-landscape", "Exercises the roomy staff iPad workspace.");

    await login(page, { role: "coach", username: "coach", password: "password" });
    await dismissFirstUse(page);
    await page.setViewportSize({ width: 1024, height: 768 });
    await goToTab(page, "script");
    await page.waitForFunction(() => document.body.dataset.layoutProfile === "tablet-landscape");

    const opener = page.locator("#script .page-actions-open-btn");
    await opener.click();
    await page.locator("#pageActionsSheet").getByRole("button", { name: /Workspace Tools/i }).click();

    const modal = page.locator("#scriptToolsDrawer");
    await expect(modal).toHaveAttribute("role", "dialog");
    await expect(modal).toHaveAttribute("data-layer-open", "true");
    await expect(modal.locator(".script-tools-drawer-close")).toBeFocused();
    await page.waitForFunction(() => {
      const transform = getComputedStyle(document.getElementById("scriptToolsDrawer")).transform;
      const values = transform.match(/^matrix\(([^)]+)\)$/)?.[1].split(",").map(Number) || [];
      return Math.abs((values[0] || 0) - 1) < 0.002;
    });

    const geometry = await modal.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const body = element.querySelector(".script-tools-drawer-body");
      return {
        rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        viewport: {
          left: window.visualViewport?.offsetLeft || 0,
          top: window.visualViewport?.offsetTop || 0,
          width: window.visualViewport?.width || window.innerWidth,
          height: window.visualViewport?.height || window.innerHeight,
        },
        bodyScroll: body ? body.scrollHeight > body.clientHeight : false,
        documentOwner: document.body.dataset.scrollOwner || "",
      };
    });
    expect(boxIsCentered(geometry.rect, geometry.viewport), JSON.stringify(geometry)).toBe(true);
    expect(geometry.rect.width).toBeLessThan(geometry.viewport.width);
    expect(geometry.rect.height).toBeLessThan(geometry.viewport.height);
    expect(geometry.documentOwner).toBe("layer");

    await assertNoHorizontalOverflow(page);
    await page.keyboard.press("Escape");
    await expect(modal).toHaveAttribute("data-layer-open", "false");
    await expect(opener).toBeFocused();
  });
});
