// @ts-check
/**
 * T-011e — Game Plan's phone Bulk Actions uses a body-level blocking layer.
 * The sheet must survive Game Plan rerenders and safely nest the existing
 * shared list picker without becoming available at tablet widths.
 */
const { test, expect } = require("@playwright/test");
const { login, dismissFirstUse, goToTab, assertNoHorizontalOverflow } = require("./helpers");

const BULK_FIXTURE_PLAYS = Array.from({ length: 34 }, (_, index) => ({
  id: `phone-bulk-${index + 1}`,
  type: ["Run", "Pass", "Screen", "Quick"][index % 4],
  personnel: ["10", "11", "12"][index % 3],
  formation: ["Trips", "Doubles", "Bunch"][index % 3],
  play: `Phone Bulk Call ${index + 1}`,
  basePlay: ["Buck", "Verts", "Bubble"][index % 3],
  preferredDown: String((index % 3) + 1),
  preferredDistance: ["Short", "Medium", "Long"][index % 3],
}));

async function seedPhoneBulkBoard(page) {
  await page.evaluate((fixture) => {
    plays = fixture.map((play) => ({ ...play }));
    filteredPlays = plays.slice();
    const board = _gpCreateEmptyBoard();
    board.sheetTitle = "Phone bulk fixture";
    storageManager.set(STORAGE_KEYS.GAME_PLAN_BOARDS, {
      [_gpActiveOpponentKey()]: board,
    });
    _gpSelected.clear();
    _gpShowBulkSheet = false;
    if (typeof invalidateFilterCache === "function") invalidateFilterCache();
    if (typeof renderGamePlan === "function") renderGamePlan();
  }, BULK_FIXTURE_PLAYS);
}

async function readBulkLayerState(page) {
  return page.evaluate(() => {
    const overlay = document.getElementById("gpBulkSheetOverlay");
    const sheet = overlay?.querySelector(".gp-bulk-sheet");
    const body = overlay?.querySelector(".gp-bulk-sheet-body");
    const close = overlay?.querySelector(".gp-bulk-close");
    const rect = (element) => {
      const box = element?.getBoundingClientRect();
      return box ? {
        top: box.top,
        right: box.right,
        bottom: box.bottom,
        left: box.left,
        width: box.width,
        height: box.height,
      } : null;
    };
    return {
      exists: Boolean(overlay),
      parentIsBody: overlay?.parentElement === document.body,
      insideGamePlan: Boolean(document.getElementById("gameplan")?.contains(overlay)),
      layerOpen: overlay?.dataset.layerOpen || "",
      layerActive: overlay?.classList.contains("app-layer-active") || false,
      bodyLocked: document.body.classList.contains("app-layer-locked"),
      scrollOwner: document.body.dataset.scrollOwner || "",
      focusedClose: document.activeElement === close,
      overlayOverflow: overlay ? getComputedStyle(overlay).overflowY : "",
      sheetOverflow: sheet ? getComputedStyle(sheet).overflowY : "",
      bodyOverflow: body ? getComputedStyle(body).overflowY : "",
      overlay: rect(overlay),
      sheet: rect(sheet),
      close: rect(close),
      selected: typeof _gpSelected !== "undefined" ? _gpSelected.size : 0,
    };
  });
}

test.describe("Game Plan phone Bulk Actions layer", () => {
  test("is a managed phone-only body portal that survives bulk rerenders and nests the box picker", async ({ page }, testInfo) => {
    test.skip(
      !["iphone", "phone-narrow"].includes(testInfo.project.name),
      "This flow requires a phone-sized touch viewport.",
    );

    await login(page, { role: "coach", username: "coach" });
    await dismissFirstUse(page);
    await seedPhoneBulkBoard(page);
    await goToTab(page, "gameplan");

    const trigger = page.locator("#gpBulkSheetTrigger");
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    await trigger.click();

    const overlay = page.locator("#gpBulkSheetOverlay");
    const close = overlay.locator(".gp-bulk-close");
    await expect(overlay).toBeVisible();
    await expect(close).toBeFocused();
    // The production sheet has a short bottom-up transition. Inspect settled
    // safe geometry rather than its intentionally off-canvas first frame.
    await page.waitForTimeout(230);
    const opened = await readBulkLayerState(page);
    expect(opened.parentIsBody).toBe(true);
    expect(opened.insideGamePlan).toBe(false);
    expect(opened.layerOpen).toBe("true");
    expect(opened.layerActive).toBe(true);
    expect(opened.bodyLocked).toBe(true);
    expect(opened.scrollOwner).toBe("layer");
    expect(opened.overlayOverflow).toBe("hidden");
    expect(opened.sheetOverflow).toBe("hidden");
    expect(opened.bodyOverflow).toBe("auto");
    expect(opened.close?.width || 0).toBeGreaterThanOrEqual(44);
    expect(opened.close?.height || 0).toBeGreaterThanOrEqual(44);
    expect(opened.sheet?.bottom || 0).toBeLessThanOrEqual((opened.overlay?.bottom || 0) + 1);

    // This action renders Game Plan again. The sheet must remain a live,
    // managed layer above that newly replaced board root.
    await overlay.locator('[data-action="gpSelectAllVisible"]').click();
    await expect.poll(async () => (await readBulkLayerState(page)).selected).toBe(BULK_FIXTURE_PLAYS.length);
    const afterRerender = await readBulkLayerState(page);
    expect(afterRerender.layerOpen).toBe("true");
    expect(afterRerender.parentIsBody).toBe(true);
    await expect(overlay).toBeVisible();

    // Existing `showListPicker()` is deliberately nonexclusive, so it layers
    // above (rather than destroys) the still-open Bulk Actions sheet.
    await overlay.locator('[data-action="gpAddAllVisibleToBox"]').click();
    const picker = page.locator(".custom-modal-overlay.visible").last();
    await expect(picker).toBeVisible();
    await expect(picker.getByRole("dialog", { name: /Add Visible to Box/i })).toBeVisible();
    expect((await readBulkLayerState(page)).layerOpen).toBe("true");
    await picker.getByRole("button", { name: "Cancel" }).click();
    await expect(picker).toBeHidden();
    await expect(overlay).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(overlay).toBeHidden();
    await expect.poll(() => page.evaluate(() => ({
      focused: document.activeElement?.id || "",
      locked: document.body.classList.contains("app-layer-locked"),
      scrollOwner: document.body.dataset.scrollOwner || "",
    }))).toMatchObject({ focused: "gpBulkSheetTrigger", locked: false });
    expect((await page.evaluate(() => document.body.dataset.scrollOwner || ""))).not.toBe("layer");

    // A genuine backdrop click has the same explicit close path and focus
    // return; the close button is not a toggle hidden in the board root.
    await trigger.click();
    await expect(overlay).toBeVisible();
    await overlay.click({ position: { x: 8, y: 8 } });
    await expect(overlay).toBeHidden();
    await expect.poll(() => page.evaluate(() => document.activeElement?.id || "")).toBe("gpBulkSheetTrigger");
    await assertNoHorizontalOverflow(page);
  });

  test("cleans up on tab change and cannot open at a tablet width", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "iphone",
      "One representative phone project covers lifecycle cleanup.",
    );

    await login(page, { role: "coach", username: "coach" });
    await dismissFirstUse(page);
    await seedPhoneBulkBoard(page);
    await goToTab(page, "gameplan");
    await page.locator("#gpBulkSheetTrigger").click();
    await expect(page.locator("#gpBulkSheetOverlay")).toBeVisible();

    await goToTab(page, "playbook");
    await expect(page.locator("#gpBulkSheetOverlay")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => ({
      locked: document.body.classList.contains("app-layer-locked"),
      scrollOwner: document.body.dataset.scrollOwner || "",
    }))).toMatchObject({ locked: false });

    await page.setViewportSize({ width: 810, height: 1080 });
    await page.waitForTimeout(120);
    await goToTab(page, "gameplan");
    await expect(page.locator("#gpBulkSheetTrigger")).toBeHidden();
    const tabletOpenResult = await page.evaluate(() => openGamePlanBulkSheet());
    expect(tabletOpenResult).toBe(false);
    await expect(page.locator("#gpBulkSheetOverlay")).toHaveCount(0);
  });
});
