// @ts-check
/**
 * Call Sheet iPad portrait control geometry.
 *
 * The Call Sheet retains a dense coaching grid, but its page/orientation
 * controls must remain distinct, readable, and touch-safe on iPad portrait.
 * The Game Plan launcher is intentionally removed only for the short compact
 * tier where its fixed position would cover Finalize.
 */
const { test, expect } = require("@playwright/test");
const {
  login,
  dismissFirstUse,
  goToTab,
  assertNoHorizontalOverflow,
} = require("./helpers");

const PAGE_CONTROL_IDS = [
  "callsheetFrontBtn",
  "callsheetBackBtn",
  "callsheetPersonnelBtn",
  "callsheetIndexCardsBtn",
  "callsheetPortraitBtn",
  "callsheetLandscapeBtn",
];

async function openCallSheetAt(page, viewport) {
  await login(page, { role: "coach", username: "coach" });
  await dismissFirstUse(page);
  await page.setViewportSize(viewport);
  await expect.poll(() => page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }))).toEqual(viewport);
  await goToTab(page, "callsheet");
}

async function getCallSheetControlGeometry(page) {
  return page.evaluate((ids) => {
    const rect = (element) => {
      const box = element?.getBoundingClientRect();
      return box
        ? {
          x: box.x,
          y: box.y,
          right: box.right,
          bottom: box.bottom,
          width: box.width,
          height: box.height,
        }
        : null;
    };
    const isVisible = (element) => {
      if (!element) return false;
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return box.width > 0 && box.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const overlapArea = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x))
      * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));

    const controls = ids.map((id) => {
      const element = document.getElementById(id);
      const box = rect(element);
      return {
        id,
        visible: isVisible(element),
        rect: box,
        clientWidth: element?.clientWidth || 0,
        scrollWidth: element?.scrollWidth || 0,
      };
    });
    const intersections = [];
    for (let i = 0; i < controls.length; i += 1) {
      for (let j = i + 1; j < controls.length; j += 1) {
        const area = overlapArea(controls[i].rect, controls[j].rect);
        if (area > 0) intersections.push({ first: controls[i].id, second: controls[j].id, area });
      }
    }

    const finalize = document.querySelector(".csb-finalize-btn");
    const drawer = document.getElementById("gpDrawerToggleBtn");
    const finalizeRect = rect(finalize);
    const finalizeCenter = finalizeRect
      ? document.elementFromPoint(finalizeRect.x + finalizeRect.width / 2, finalizeRect.y + finalizeRect.height / 2)
      : null;
    return {
      controls,
      intersections,
      drawerVisible: isVisible(drawer),
      drawerFinalizeArea: finalizeRect && drawer ? overlapArea(rect(drawer), finalizeRect) : 0,
      finalizeReceivesHit: Boolean(finalize && finalizeCenter && (finalizeCenter === finalize || finalize.contains(finalizeCenter))),
    };
  }, PAGE_CONTROL_IDS);
}

function expectReadableTouchControls(state) {
  expect(state.intersections, "page and orientation controls do not overlap").toEqual([]);
  for (const control of state.controls) {
    expect(control.visible, `${control.id} remains visible`).toBe(true);
    expect(control.rect?.width, `${control.id} touch width`).toBeGreaterThanOrEqual(44);
    expect(control.rect?.height, `${control.id} touch height`).toBeGreaterThanOrEqual(44);
    expect(control.scrollWidth, `${control.id} label fits its button`).toBeLessThanOrEqual(control.clientWidth);
  }
}

test.describe("Call Sheet iPad portrait control geometry", () => {
  test("short compact iPad keeps page controls separate and leaves Finalize unobstructed", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "ipad-portrait", "Requires the touch-enabled iPad portrait project.");

    await openCallSheetAt(page, { width: 744, height: 768 });
    const state = await getCallSheetControlGeometry(page);

    expectReadableTouchControls(state);
    expect(state.drawerVisible, "short compact tablet suppresses the redundant fixed pull-tab").toBe(false);
    expect(state.drawerFinalizeArea, "no fixed drawer tab overlaps Finalize").toBe(0);
    expect(state.finalizeReceivesHit, "Finalize receives its center hit").toBe(true);
    await assertNoHorizontalOverflow(page);
  });

  test("large portrait iPad keeps page controls readable and touch-safe", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "ipad-portrait", "Requires the touch-enabled iPad portrait project.");

    await openCallSheetAt(page, { width: 1024, height: 1366 });
    const state = await getCallSheetControlGeometry(page);

    expectReadableTouchControls(state);
    expect(state.drawerVisible, "full-height portrait keeps the Game Plan pull-tab").toBe(true);
    expect(state.drawerFinalizeArea, "pull-tab stays clear of Finalize").toBe(0);
    expect(state.finalizeReceivesHit, "Finalize receives its center hit").toBe(true);
    await assertNoHorizontalOverflow(page);
  });

  test("landscape tablet keeps the existing Game Plan pull-tab available", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "ipad-landscape", "Requires the touch-enabled iPad landscape project.");

    await openCallSheetAt(page, { width: 1024, height: 768 });
    const state = await getCallSheetControlGeometry(page);

    expect(state.drawerVisible, "landscape retains the existing pull-tab").toBe(true);
    expect(state.drawerFinalizeArea, "landscape pull-tab stays clear of Finalize").toBe(0);
    expect(state.finalizeReceivesHit, "Finalize receives its center hit").toBe(true);
    await assertNoHorizontalOverflow(page);
  });
});
