// @ts-check
/**
 * T-011c — shared reorder dialog on iPad.
 *
 * Script proves the standalone helper, including deterministic touch moves and
 * the multi-period list-picker handoff. Call Sheet proves a child reorder
 * layer stays above and returns to its still-open parent sort dialog.
 */
const { test, expect } = require("@playwright/test");
const { login, dismissFirstUse, goToTab, assertNoHorizontalOverflow } = require("./helpers");

const KEYBOARD_USABLE_HEIGHT = 360;
const VIEWPORT_STYLE_ID = "__reorderModalModeledViewport";

function scriptFixture(count = 30) {
  return Array.from({ length: count }, (_, index) => ({
    id: `reorder-script-${index + 1}`,
    type: index % 2 ? "Pass" : "Run",
    personnel: index % 2 ? "10" : "11",
    formation: index % 2 ? "Doubles" : "Trips",
    play: `Script Reorder ${index + 1}`,
    basePlay: index % 2 ? "Verts" : "Buck",
  }));
}

async function addFocusAnchor(page, id) {
  await page.evaluate((anchorId) => {
    document.getElementById(anchorId)?.remove();
    const anchor = document.createElement("button");
    anchor.type = "button";
    anchor.id = anchorId;
    anchor.textContent = "Reorder dialog return target";
    anchor.style.cssText = "position:fixed;left:8px;top:8px;width:44px;height:44px;z-index:1;";
    document.body.appendChild(anchor);
    anchor.focus({ preventScroll: true });
  }, id);
}

async function setKeyboardSizedViewport(page) {
  await page.evaluate((styleId) => {
    document.getElementById(styleId)?.remove();
    const style = document.createElement("style");
    style.id = styleId;
    // app-shell refreshes its inline --app-vh token from visualViewport.
    // A test-only important stylesheet is stable across that refresh while
    // still exercising the production derived viewport tokens.
    style.textContent = ":root { --app-vh: 3.6px !important; }";
    document.head.appendChild(style);
  }, VIEWPORT_STYLE_ID);
  await page.waitForTimeout(70);
}

async function resetKeyboardSizedViewport(page) {
  await page.evaluate((styleId) => document.getElementById(styleId)?.remove(), VIEWPORT_STYLE_ID);
}

async function readReorderState(page) {
  return page.evaluate(() => {
    const overlay = document.getElementById("_reorderModal");
    const dialog = overlay?.querySelector(".reorder-modal-dialog");
    const body = overlay?.querySelector(".reorder-modal-body");
    const list = overlay?.querySelector("#_reorderList");
    const close = overlay?.querySelector(".reorder-modal-close");
    const move = overlay?.querySelector(".reorder-modal-move:not(:disabled)");
    const rect = (element) => {
      const box = element?.getBoundingClientRect();
      return box
        ? { top: box.top, right: box.right, bottom: box.bottom, left: box.left, width: box.width, height: box.height }
        : null;
    };
    return {
      layerOpen: overlay?.dataset.layerOpen || "",
      layerEscape: overlay?.dataset.layerEscape || "",
      layerActive: overlay?.classList.contains("app-layer-active") || false,
      locked: document.body.classList.contains("app-layer-locked"),
      scrollOwner: document.body.dataset.scrollOwner || "",
      closeFocused: document.activeElement === close,
      outerOverflow: overlay ? getComputedStyle(overlay).overflowY : "",
      bodyOverflow: body ? getComputedStyle(body).overflowY : "",
      listOverflow: list ? getComputedStyle(list).overflowY : "",
      bodyClientHeight: body?.clientHeight || 0,
      bodyScrollHeight: body?.scrollHeight || 0,
      overlay: rect(overlay),
      dialog: rect(dialog),
      close: rect(close),
      move: rect(move),
      zIndex: Number.parseInt(overlay ? getComputedStyle(overlay).zIndex : "0", 10),
    };
  });
}

function expectTouchTarget(rect, label) {
  expect(rect, `${label} exists`).not.toBeNull();
  expect(rect?.width || 0, `${label} width`).toBeGreaterThanOrEqual(44);
  expect(rect?.height || 0, `${label} height`).toBeGreaterThanOrEqual(44);
}

test.describe("shared reorder dialog managed layers", () => {
  test("Script reorder has one iPad scroll owner, deterministic moves, and a safe multi-period chooser handoff", async ({ page }, testInfo) => {
    test.skip(
      !["ipad-portrait", "ipad-landscape"].includes(testInfo.project.name),
      "This contract requires the touch-enabled iPad projects.",
    );

    await login(page, { role: "coach", username: "coach" });
    await dismissFirstUse(page);
    await goToTab(page, "script");
    await setKeyboardSizedViewport(page);

    const anchorId = "__scriptReorderReturnTarget";
    await addFocusAnchor(page, anchorId);
    await page.evaluate((fixture) => {
      script = fixture;
      renderScript();
      openScriptReorderModal();
    }, scriptFixture());

    const modal = page.locator("#_reorderModal");
    const close = modal.locator('[data-action="_reorderClose"][aria-label="Close reorder modal"]');
    await expect(modal).toBeVisible();
    await expect(modal.locator('#_reorderList [data-drag="reorder"]')).toHaveCount(30);

    const state = await readReorderState(page);
    expect(state.layerOpen, "Script reorder registers a layer").toBe("true");
    expect(state.layerEscape, "Script reorder owns Escape").toBe("managed");
    expect(state.layerActive, "Script reorder activates visual viewport sizing").toBe(true);
    expect(state.locked, "Script reorder locks document scrolling").toBe(true);
    expect(state.scrollOwner, "Script reorder owns document scrolling").toBe("layer");
    expect(state.closeFocused, "Script reorder focuses Close first").toBe(true);
    expect(state.outerOverflow, "outer reorder layer does not scroll").toBe("hidden");
    expect(state.bodyOverflow, "reorder body is the one interior scroller").toBe("auto");
    expect(state.listOverflow, "reorder list does not nest a scroller").toBe("visible");
    expect(state.bodyScrollHeight, "long reorder content overflows inside its named body").toBeGreaterThan(state.bodyClientHeight);
    expect(state.overlay?.height, "reorder layer follows the modeled visual viewport").toBeLessThanOrEqual(KEYBOARD_USABLE_HEIGHT + 1);
    expect(state.zIndex, "reorder layer stacks above legacy top modal token").toBeGreaterThan(99_999);
    expectTouchTarget(state.close, "Reorder Close");
    expectTouchTarget(state.move, "Reorder move control");

    await close.press("Shift+Tab");
    expect(
      await page.evaluate(() => document.activeElement?.closest("#_reorderModal")?.id || ""),
      "focus trap keeps Shift+Tab inside reorder",
    ).toBe("_reorderModal");

    await page.keyboard.press("Escape");
    await expect(modal).toHaveCount(0);
    await expect.poll(() => page.evaluate((id) => ({
      focus: document.activeElement?.id || "",
      locked: document.body.classList.contains("app-layer-locked"),
      scrollOwner: document.body.dataset.scrollOwner || "",
    }), anchorId)).toMatchObject({ focus: anchorId, locked: false });
    expect(
      await page.evaluate(() => document.body.dataset.scrollOwner || ""),
      "closing standalone reorder releases its layer scroll ownership",
    ).not.toBe("layer");

    // Arrow controls use the exact same temp order as Save; they are the
    // deterministic touch alternative to HTML5 drag-and-drop.
    await page.evaluate(() => {
      document.getElementById("__scriptReorderReturnTarget")?.focus({ preventScroll: true });
      openScriptReorderModal();
    });
    await expect(modal).toBeVisible();
    await modal.locator('[data-reorder-move="down"][data-idx="0"]').click();
    await expect(modal.locator('#_reorderList [data-idx="0"] .order-value')).toContainText("Script Reorder 2");
    await modal.locator('[data-action="_reorderSave"]').click();
    await expect(modal).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => script[0]?.id || "")).toBe("reorder-script-2");

    // Multi-period Script uses the real list picker. The narrow handoff delay
    // must leave focus on the new reorder Close, not let the picker steal it
    // back during its 200ms visual teardown.
    await page.evaluate(() => {
      script = [
        { id: "period-a", isSeparator: true, label: "Inside Run", minutes: 8 },
        { id: "period-a-1", type: "Run", formation: "Trips", play: "Inside Buck", basePlay: "Buck" },
        { id: "period-a-2", type: "Run", formation: "Bunch", play: "Iso", basePlay: "Iso" },
        { id: "period-b", isSeparator: true, label: "Team Pass", minutes: 10 },
        { id: "period-b-1", type: "Pass", formation: "Doubles", play: "Verts", basePlay: "Verts" },
        { id: "period-b-2", type: "Pass", formation: "Empty", play: "Mesh", basePlay: "Mesh" },
      ];
      renderScript();
      document.getElementById("__scriptReorderReturnTarget")?.focus({ preventScroll: true });
      void openScriptReorderModal();
    });
    const chooser = page.locator(".custom-modal-overlay.visible").last();
    await expect(chooser.locator(".custom-modal-list-item")).toHaveCount(2);
    await chooser.locator(".custom-modal-list-item").first().click();
    await expect(modal).toBeVisible();
    await page.waitForTimeout(260);
    await expect.poll(() => page.evaluate(() => (
      document.activeElement?.matches("#_reorderModal .reorder-modal-close") || false
    ))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(modal).toHaveCount(0);

    await resetKeyboardSizedViewport(page);
    await assertNoHorizontalOverflow(page);
  });

  test("Call Sheet custom order nests above Sort and returns to its parent before the page", async ({ page }, testInfo) => {
    test.skip(
      !["ipad-portrait", "ipad-landscape"].includes(testInfo.project.name),
      "This contract requires the touch-enabled iPad projects.",
    );

    await login(page, { role: "coach", username: "coach" });
    await dismissFirstUse(page);
    await goToTab(page, "callsheet");
    await setKeyboardSizedViewport(page);

    const anchorId = "__callSheetReorderReturnTarget";
    await addFocusAnchor(page, anchorId);
    await page.evaluate(() => {
      const categoryId = CALLSHEET_CATEGORIES[0]?.id;
      if (!categoryId) throw new Error("Call Sheet fixture needs a category");
      callSheet = {
        [categoryId]: {
          left: Array.from({ length: 28 }, (_, index) => ({
            id: `callsheet-reorder-${index + 1}`,
            personnel: `P${String(index + 1).padStart(2, "0")}`,
            type: index % 2 ? "Pass" : "Run",
            formation: index % 2 ? "Doubles" : "Trips",
            play: `Call Sheet Reorder ${index + 1}`,
            basePlay: index % 2 ? "Verts" : "Buck",
          })),
          right: [],
        },
      };
      csSortCriteria = [{ field: "personnel", direction: "asc" }];
      csSortCustomOrders = {};
      openCsSortModal(categoryId);
    });

    const parent = page.locator("#csSortOverlay");
    await expect(parent).toBeVisible();
    const opener = parent.locator('[data-action="openCsCustomOrderModal"][data-arg="personnel"]');
    await expect(opener).toBeVisible();
    await opener.evaluate((element) => { element.id = "__callSheetCustomOrderOpener"; });
    // Touch activation does not consistently move keyboard focus in iPad
    // emulation. Invoke the real Call Sheet handler while the real nested
    // trigger is focused so this test verifies LayerManager return focus rather
    // than browser tap heuristics.
    await opener.evaluate((element) => {
      element.focus({ preventScroll: true });
      openCsCustomOrderModal(element.dataset.arg || "personnel");
    });

    const child = page.locator("#_reorderModal");
    await expect(child).toBeVisible();
    const nestedState = await readReorderState(page);
    expect(nestedState.layerOpen, "nested Call Sheet reorder registers its own layer").toBe("true");
    expect(nestedState.layerEscape, "nested Call Sheet reorder owns Escape").toBe("managed");
    expect(nestedState.locked, "parent and child keep the document locked").toBe(true);
    expect(nestedState.scrollOwner, "top child remains the active scroll owner").toBe("layer");
    expect(nestedState.closeFocused, "nested child focuses its Close control").toBe(true);
    expect(nestedState.zIndex, "child sits above the legacy modal stack").toBeGreaterThan(99_999);
    expect(await parent.getAttribute("data-layer-open"), "outer Call Sheet Sort remains registered").toBe("true");

    await page.keyboard.press("Escape");
    await expect(child).toHaveCount(0);
    await expect(parent).toBeVisible();
    await expect(parent).toHaveAttribute("data-layer-open", "true");
    await expect.poll(() => page.evaluate(() => ({
      focus: document.activeElement?.id || "",
      locked: document.body.classList.contains("app-layer-locked"),
      scrollOwner: document.body.dataset.scrollOwner || "",
    }))).toEqual({
      focus: "__callSheetCustomOrderOpener",
      locked: true,
      scrollOwner: "layer",
    });

    // The next Escape belongs to the preserved parent layer and only then
    // returns focus to the page trigger that opened Call Sheet Sort.
    await page.keyboard.press("Escape");
    await expect(parent).toHaveCount(0);
    await expect.poll(() => page.evaluate((id) => ({
      focus: document.activeElement?.id || "",
      locked: document.body.classList.contains("app-layer-locked"),
      scrollOwner: document.body.dataset.scrollOwner || "",
    }), anchorId)).toMatchObject({ focus: anchorId, locked: false });
    expect(
      await page.evaluate(() => document.body.dataset.scrollOwner || ""),
      "closing the parent releases the blocking layer scroll owner",
    ).not.toBe("layer");

    await resetKeyboardSizedViewport(page);
    await assertNoHorizontalOverflow(page);
  });
});
