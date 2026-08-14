// @ts-check
const { test, expect } = require("@playwright/test");
const { login, dismissFirstUse } = require("./helpers");

async function openWithReturnTrigger(page, triggerId, openExpression) {
  await page.evaluate(({ id, expression }) => {
    let trigger = document.getElementById(id);
    if (!trigger) {
      trigger = document.createElement("button");
      trigger.id = id;
      trigger.type = "button";
      trigger.textContent = "Modal return target";
      document.body.appendChild(trigger);
    }
    trigger.focus();
    // This deliberately exercises the public Game Plan opener with a real
    // focused trigger; the dialog itself is still entirely production DOM.
    if (expression === "index") openGamePlanIndexCards();
    else void openGamePlanPrintModal();
  }, { id: triggerId, expression: openExpression });
}

async function readLayerState(page, overlayId, scrollSelector, targetSelector) {
  return page.evaluate(({ overlayId: id, scrollSelector: scrollQuery, targetSelector: targetQuery }) => {
    const overlay = document.getElementById(id);
    const scroll = overlay?.querySelector(scrollQuery);
    const target = overlay?.querySelector(targetQuery);
    const overlayStyle = overlay ? getComputedStyle(overlay) : null;
    const scrollStyle = scroll ? getComputedStyle(scroll) : null;
    const targetRect = target?.getBoundingClientRect();
    const overlayRect = overlay?.getBoundingClientRect();
    return {
      layerOpen: overlay?.dataset.layerOpen || "",
      scrollOwner: document.body.dataset.scrollOwner || "",
      activeId: document.activeElement?.id || "",
      overlayHeight: overlayRect?.height || 0,
      visualHeight: window.visualViewport?.height || window.innerHeight,
      overlayOverflow: overlayStyle?.overflowY || "",
      scrollOverflow: scrollStyle?.overflowY || "",
      scrollClientHeight: scroll?.clientHeight || 0,
      scrollHeight: scroll?.scrollHeight || 0,
      targetWidth: targetRect?.width || 0,
      targetHeight: targetRect?.height || 0,
    };
  }, { overlayId, scrollSelector, targetSelector });
}

test.describe("Game Plan index and print modal layers", () => {
  test("use a safe viewport, one scroll owner, managed Escape, and return focus on iPad", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "ipad-landscape",
      "This modal geometry check requires the touch-enabled iPad landscape project.",
    );

    await login(page, { role: "coach", username: "coach" });
    await dismissFirstUse(page);
    await page.waitForFunction(() =>
      Boolean(window.openGamePlanIndexCards && window.openGamePlanPrintModal),
    );

    await openWithReturnTrigger(page, "gpIndexCardsReturnTarget", "index");
    const indexOverlay = page.locator("#gpIndexCardBuilder");
    await expect(indexOverlay).toBeVisible();
    await expect(indexOverlay.locator(".gp-index-close")).toBeFocused();
    const indexState = await readLayerState(
      page,
      "gpIndexCardBuilder",
      ".gp-index-scroll",
      ".gp-index-close",
    );
    expect(indexState.layerOpen).toBe("true");
    expect(indexState.scrollOwner).toBe("layer");
    expect(indexState.overlayOverflow).toBe("hidden");
    expect(indexState.scrollOverflow).toBe("auto");
    expect(indexState.overlayHeight).toBeLessThanOrEqual(indexState.visualHeight + 1);
    expect(indexState.targetWidth).toBeGreaterThanOrEqual(44);
    expect(indexState.targetHeight).toBeGreaterThanOrEqual(44);
    await page.keyboard.press("Escape");
    await expect(indexOverlay).toBeHidden();
    await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe("gpIndexCardsReturnTarget");

    await openWithReturnTrigger(page, "gpPrintReturnTarget", "print");
    const printOverlay = page.locator("#gpPrintModalOverlay");
    await expect(printOverlay).toBeVisible();
    await expect(printOverlay.locator("#gpPrintClose")).toBeFocused();
    const printState = await readLayerState(
      page,
      "gpPrintModalOverlay",
      ".gp-print-modal-body",
      "#gpPrintClose",
    );
    expect(printState.layerOpen).toBe("true");
    expect(printState.scrollOwner).toBe("layer");
    expect(printState.overlayOverflow).toBe("hidden");
    expect(printState.scrollOverflow).toBe("auto");
    expect(printState.scrollHeight).toBeGreaterThan(printState.scrollClientHeight);
    expect(printState.overlayHeight).toBeLessThanOrEqual(printState.visualHeight + 1);
    expect(printState.targetWidth).toBeGreaterThanOrEqual(44);
    expect(printState.targetHeight).toBeGreaterThanOrEqual(44);
    await page.keyboard.press("Escape");
    await expect(printOverlay).toBeHidden();
    await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe("gpPrintReturnTarget");
  });
});
