// @ts-check
/**
 * Call Sheet Constraints blocking-layer contract.
 *
 * Constraints is opened from the shared Actions hub, so this verifies the
 * handoff between two dialogs as well as the final dialog's tablet geometry.
 */
const { test, expect } = require("@playwright/test");
const {
  login,
  dismissFirstUse,
  goToTab,
  assertNoHorizontalOverflow,
} = require("./helpers");

async function openConstraintsFromActions(page, trigger) {
  await expect(trigger).toBeVisible();
  await trigger.focus();
  await trigger.click();
  const action = page
    .locator("#pageActionsSheet")
    .getByRole("button", { name: /Check Constraints/i });
  await expect(action).toBeVisible();
  await action.click();
  await expect(page.locator("#constraintPanel")).toHaveClass(/visible/);
}

async function getConstraintLayerState(page) {
  return page.evaluate(() => {
    const overlay = document.getElementById("constraintPanel");
    const panel = overlay?.querySelector(".constraint-panel");
    const close = overlay?.querySelector(".cr-close-btn");
    const rect = overlay?.getBoundingClientRect();
    const panelRect = panel?.getBoundingClientRect();
    const closeRect = close?.getBoundingClientRect();
    const visualHeight = window.visualViewport?.height || window.innerHeight;
    const chromeHit = document.elementFromPoint(12, 12);
    return {
      layerId: overlay?.dataset.layerId || "",
      layerOpen: overlay?.dataset.layerOpen === "true",
      bodyLocked: document.body.classList.contains("app-layer-locked"),
      scrollOwner: document.body.dataset.scrollOwner || "",
      ariaHidden: overlay?.getAttribute("aria-hidden"),
      activeIsClose: document.activeElement === close,
      activeWithinLayer: Boolean(overlay?.contains(document.activeElement)),
      close: closeRect
        ? { width: closeRect.width, height: closeRect.height }
        : null,
      overlay: rect
        ? {
          top: rect.top,
          left: rect.left,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        }
        : null,
      panel: panelRect
        ? { top: panelRect.top, right: panelRect.right, bottom: panelRect.bottom }
        : null,
      visualHeight,
      chromeIsBlocked: Boolean(chromeHit && overlay?.contains(chromeHit)),
    };
  });
}

test.describe("Call Sheet Constraints layer", () => {
  test("coach portrait tablet traps the Constraints report and restores the Actions trigger", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "ipad-portrait",
      "This contract requires the touch-enabled iPad portrait project.",
    );

    await login(page, { role: "coach", username: "coach" });
    await dismissFirstUse(page);
    await goToTab(page, "callsheet");

    const trigger = page.locator("#pageActionsFab");
    await openConstraintsFromActions(page, trigger);
    await expect.poll(() => getConstraintLayerState(page).then((state) => state.activeIsClose)).toBe(true);

    const openState = await getConstraintLayerState(page);
    expect(openState.layerId).toBe("constraintPanel");
    expect(openState.layerOpen).toBe(true);
    expect(openState.bodyLocked).toBe(true);
    expect(openState.scrollOwner).toBe("layer");
    expect(openState.ariaHidden).toBe("false");
    expect(openState.close?.width).toBeGreaterThanOrEqual(44);
    expect(openState.close?.height).toBeGreaterThanOrEqual(44);

    // Bucket rows are keyboard controls after the report renders. Tab must
    // remain within the dialog rather than reaching the Call Sheet behind it.
    await page.keyboard.press("Tab");
    await expect.poll(() => getConstraintLayerState(page).then((state) => state.activeWithinLayer)).toBe(true);

    await page.keyboard.press("Escape");
    await expect(page.locator("#constraintPanel")).toHaveAttribute("aria-hidden", "true");
    await expect.poll(() => page.evaluate(() => document.body.classList.contains("app-layer-locked"))).toBe(false);
    await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe("pageActionsFab");
    await assertNoHorizontalOverflow(page);
  });

  test("coach landscape tablet keeps the Constraints scrim over the entire visual viewport", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "ipad-landscape",
      "This contract requires the touch-enabled iPad landscape project.",
    );

    await login(page, { role: "coach", username: "coach" });
    await dismissFirstUse(page);
    await page.setViewportSize({ width: 1024, height: 768 });
    await goToTab(page, "callsheet");

    const trigger = page.locator("#callsheet .page-actions-open-btn");
    await openConstraintsFromActions(page, trigger);
    await expect.poll(() => getConstraintLayerState(page).then((state) => state.activeIsClose)).toBe(true);

    const openState = await getConstraintLayerState(page);
    expect(openState.layerOpen).toBe(true);
    expect(openState.bodyLocked).toBe(true);
    expect(openState.scrollOwner).toBe("layer");
    expect(openState.overlay?.top).toBeCloseTo(0, 0);
    expect(openState.overlay?.left).toBeCloseTo(0, 0);
    expect(openState.overlay?.right).toBeCloseTo(1024, 0);
    expect(openState.overlay?.bottom).toBeCloseTo(openState.visualHeight, 0);
    expect(openState.panel?.top).toBeGreaterThanOrEqual(0);
    expect(openState.panel?.bottom).toBeLessThanOrEqual(openState.visualHeight);
    expect(openState.chromeIsBlocked).toBe(true);

    await page.keyboard.press("Escape");
    await expect.poll(() => page.evaluate(() => document.body.classList.contains("app-layer-locked"))).toBe(false);
    await expect.poll(() => page.evaluate(() => document.activeElement?.classList.contains("page-actions-open-btn"))).toBe(true);
    await assertNoHorizontalOverflow(page);
  });
});
