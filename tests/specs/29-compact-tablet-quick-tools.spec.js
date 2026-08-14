// @ts-check
/**
 * Compact tablet utility fallback.
 *
 * A landscape iPad in a 744px Split View uses the tablet-compact profile.
 * The fixed Quick Tools tray must yield its lower-right slot to Page Actions,
 * while Help remains reachable from the already-visible header overflow.
 */
const { test, expect } = require("@playwright/test");
const {
  login,
  dismissFirstUse,
  goToTab,
  assertNoHorizontalOverflow,
} = require("./helpers");

const COMPACT_VIEWPORT = { width: 744, height: 768 };
const CALL_SHEET_CONTROL_IDS = [
  "callsheetFrontBtn",
  "callsheetBackBtn",
  "callsheetPersonnelBtn",
  "callsheetIndexCardsBtn",
  "callsheetPortraitBtn",
  "callsheetLandscapeBtn",
];

async function compactShellState(page) {
  return page.evaluate(() => ({
    profile: document.body?.dataset.layoutProfile || "",
    staff: document.body?.classList.contains("is-staff-mobile-shell") || false,
    quickToolsVisible: (() => {
      const element = document.getElementById("quickTools");
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    })(),
  }));
}

async function compactControlGeometry(page, selectors) {
  return page.evaluate((controlSelectors) => {
    const rect = (element) => {
      if (!element) return null;
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        box.width <= 0 ||
        box.height <= 0
      ) {
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
    const overlaps = (first, second) =>
      Boolean(
        first && second &&
        first.left < second.right - 1 &&
        first.right > second.left + 1 &&
        first.top < second.bottom - 1 &&
        first.bottom > second.top + 1,
      );
    const targetState = (selector) => {
      const element = document.querySelector(selector);
      const box = rect(element);
      const hit = box
        ? document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
        : null;
      return {
        selector,
        rect: box,
        receivesCenterHit: Boolean(hit && element && (hit === element || element.contains(hit))),
      };
    };
    const pageActions = rect(document.getElementById("pageActionsFab"));
    const controls = controlSelectors.map(targetState);
    return {
      pageActions,
      controls,
      overlaps: controls
        .filter((control) => overlaps(pageActions, control.rect))
        .map((control) => control.selector),
    };
  }, selectors);
}

function expectUnobstructedControls(state, label) {
  expect(state.pageActions, `${label}: Page Actions remains visible`).not.toBeNull();
  expect(state.overlaps, `${label}: Page Actions does not cover live controls`).toEqual([]);
  for (const control of state.controls) {
    expect(control.rect, `${label}: ${control.selector} is visible`).not.toBeNull();
    expect(control.receivesCenterHit, `${label}: ${control.selector} receives its center hit`).toBe(true);
  }
}

test.describe("compact iPad utility fallback", () => {
  test("744×768 staff Split View preserves Actions and overflow Help without covering Script or Call Sheet controls", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "ipad-landscape",
      "Requires a landscape iPad hardware profile with a compact Split View viewport.",
    );

    // The WebKit descriptor's window can be portrait-sized even when this
    // scenario represents a landscape iPad running narrow Split View. Match
    // the physical-orientation contract before app-shell reads it at startup.
    await page.addInitScript(() => {
      try {
        Object.defineProperty(window.screen, "orientation", {
          configurable: true,
          value: { type: "landscape-primary", angle: 90 },
        });
      } catch (_error) {}
      try {
        Object.defineProperty(window, "orientation", {
          configurable: true,
          value: 90,
        });
      } catch (_error) {}
    });
    await login(page, { role: "coach", username: "coach", password: "password" });
    await dismissFirstUse(page);
    await page.setViewportSize(COMPACT_VIEWPORT);
    await expect.poll(() => compactShellState(page)).toMatchObject({
      profile: "tablet-compact",
      staff: true,
      quickToolsVisible: false,
    });

    await goToTab(page, "script");
    const pageActions = page.locator("#pageActionsFab");
    await expect(pageActions).toBeVisible();
    await pageActions.click();
    await expect(page.locator("#pageActionsSheet")).toHaveClass(/visible/);
    await page.keyboard.press("Escape");
    await expect(page.locator("#pageActionsSheet")).not.toHaveClass(/visible/);

    const overflow = page.locator(".header-overflow-btn").filter({ visible: true }).first();
    await expect(overflow).toBeVisible();
    await overflow.click();
    const help = page.locator(".header-overflow-help-item").filter({ visible: true }).first();
    await expect(help).toBeVisible();
    await help.click();
    await expect(page.locator("#helpOverlay")).toHaveClass(/visible/);
    await page.keyboard.press("Escape");
    await expect(page.locator("#helpOverlay")).not.toHaveClass(/visible/);

    const scriptControls = await compactControlGeometry(page, [
      '#script .period-buttons [data-action="insertPeriodFromTemplate"]',
    ]);
    expectUnobstructedControls(scriptControls, "Script");

    await goToTab(page, "callsheet");
    const callSheetSelectors = [
      ...CALL_SHEET_CONTROL_IDS.map((id) => `#${id}`),
      ".csb-finalize-btn",
    ];
    const callSheetControls = await compactControlGeometry(page, callSheetSelectors);
    expectUnobstructedControls(callSheetControls, "Call Sheet");

    await assertNoHorizontalOverflow(page);
  });
});
