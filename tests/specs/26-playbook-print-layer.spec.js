// @ts-check
/**
 * T-011e — Playbook Print options on iPad.
 *
 * The Print surface retains a side-drawer appearance but is a blocking layer
 * above the Playbook filter workbench. Verify the real deferred action,
 * modeled keyboard viewport, focus return, backdrop/Escape dismissal, and a
 * shared reorder dialog nested above it.
 */
const { test, expect } = require("@playwright/test");
const { login, dismissFirstUse, goToTab, assertNoHorizontalOverflow } = require("./helpers");

const KEYBOARD_USABLE_HEIGHT = 360;
const VIEWPORT_STYLE_ID = "__playbookPrintLayerViewport";

async function setKeyboardSizedViewport(page) {
  await page.evaluate((styleId) => {
    document.getElementById(styleId)?.remove();
    const style = document.createElement("style");
    style.id = styleId;
    // The shell derives this token from visualViewport. Override it only in
    // this test to model the keyboard-shortened iPad viewport.
    style.textContent = ":root { --app-vh: 3.6px !important; }";
    document.head.appendChild(style);
  }, VIEWPORT_STYLE_ID);
  await page.waitForTimeout(70);
}

async function resetKeyboardSizedViewport(page) {
  await page.evaluate((styleId) => document.getElementById(styleId)?.remove(), VIEWPORT_STYLE_ID);
}

async function readPrintLayerState(page) {
  return page.evaluate(() => {
    const overlay = document.getElementById("pbPrintPanel");
    const drawer = overlay?.querySelector(".pb-drawer");
    const body = overlay?.querySelector(".pb-drawer-body");
    const close = overlay?.querySelector(".pb-drawer-close");
    const rect = (element) => {
      const box = element?.getBoundingClientRect();
      return box
        ? { top: box.top, right: box.right, bottom: box.bottom, left: box.left, width: box.width, height: box.height }
        : null;
    };
    const viewportUnit = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--app-vh")) || 1;
    return {
      ariaHidden: overlay?.getAttribute("aria-hidden") || "",
      inert: overlay?.hasAttribute("inert") || false,
      open: overlay?.classList.contains("open") || false,
      layerOpen: overlay?.dataset.layerOpen || "",
      layerId: overlay?.dataset.layerId || "",
      layerEscape: overlay?.dataset.layerEscape || "",
      layerActive: overlay?.classList.contains("app-layer-active") || false,
      safeArea: overlay?.classList.contains("app-layer-safe-area") || false,
      locked: document.body.classList.contains("app-layer-locked"),
      scrollOwner: document.body.dataset.scrollOwner || "",
      closeFocused: document.activeElement === close,
      outerOverflow: overlay ? getComputedStyle(overlay).overflowY : "",
      drawerOverflow: drawer ? getComputedStyle(drawer).overflowY : "",
      bodyOverflow: body ? getComputedStyle(body).overflowY : "",
      bodyClientHeight: body?.clientHeight || 0,
      bodyScrollHeight: body?.scrollHeight || 0,
      usableHeight: viewportUnit * 100,
      overlay: rect(overlay),
      drawer: rect(drawer),
      close: rect(close),
      triggerExpanded: document.getElementById("pbPrintOptionsTrigger")?.getAttribute("aria-expanded") || "",
      triggerFocused: document.activeElement === document.getElementById("pbPrintOptionsTrigger"),
    };
  });
}

function expectTouchTarget(rect, label) {
  expect(rect, `${label} exists`).not.toBeNull();
  // WebKit can report a CSS 44px box as 43.99994px after device-pixel
  // conversion. Preserve the 44px design requirement while allowing only
  // that sub-pixel measurement noise, not a genuinely smaller control.
  const minimum = 44 - 0.01;
  expect(rect?.width || 0, `${label} width`).toBeGreaterThanOrEqual(minimum);
  expect(rect?.height || 0, `${label} height`).toBeGreaterThanOrEqual(minimum);
}

async function openFilterAndPrint(page) {
  const filterToggle = page.locator("#pbFilterToggleBtn");
  const filterDrawer = page.locator("#pbFilterDrawer");
  const printTrigger = page.locator("#pbPrintOptionsTrigger");
  const printPanel = page.locator("#pbPrintPanel");

  await filterToggle.click();
  await expect(filterDrawer).toHaveAttribute("aria-hidden", "false");
  await expect(printTrigger).toBeVisible();
  // iPad touch activation is allowed not to move focus by the browser. Focus
  // the real trigger first to verify the declared return target exactly.
  await printTrigger.focus();
  await printTrigger.click();
  await expect(printPanel).toHaveClass(/open/, { timeout: 15_000 });
  await expect(printPanel).toHaveAttribute("aria-hidden", "false");
  return { filterToggle, filterDrawer, printTrigger, printPanel };
}

test.describe("Playbook Print blocking drawer", () => {
  test("Print options own the iPad visual viewport and safely nest shared reorder", async ({ page }, testInfo) => {
    test.skip(
      !["ipad-portrait", "ipad-landscape"].includes(testInfo.project.name),
      "This contract requires the touch-enabled iPad projects.",
    );

    await login(page, { role: "coach", username: "coach" });
    await dismissFirstUse(page);
    await goToTab(page, "playbook");
    await setKeyboardSizedViewport(page);

    try {
      const { filterDrawer, printTrigger, printPanel } = await openFilterAndPrint(page);
      const close = printPanel.locator(".pb-drawer-close");
      await expect(close).toBeFocused();

      const opened = await readPrintLayerState(page);
      expect(opened.ariaHidden).toBe("false");
      expect(opened.inert).toBe(false);
      expect(opened.open).toBe(true);
      expect(opened.layerOpen).toBe("true");
      expect(opened.layerId).toBe("pb-print-panel");
      expect(opened.layerEscape).toBe("managed");
      expect(opened.layerActive).toBe(true);
      expect(opened.safeArea).toBe(true);
      expect(opened.locked).toBe(true);
      expect(opened.scrollOwner).toBe("layer");
      expect(opened.closeFocused).toBe(true);
      expect(opened.outerOverflow).toBe("hidden");
      expect(opened.drawerOverflow).toBe("hidden");
      expect(opened.bodyOverflow).toBe("auto");
      expect(opened.overlay?.height || 0).toBeLessThanOrEqual(KEYBOARD_USABLE_HEIGHT + 1);
      expect(opened.drawer?.bottom || 0).toBeLessThanOrEqual(KEYBOARD_USABLE_HEIGHT + 1);
      expect(opened.triggerExpanded).toBe("true");
      expectTouchTarget(opened.close, "Print Close");

      // Custom sort opens the shared reorder layer. It must leave this Print
      // dialog registered and locked underneath, then restore focus to the
      // actual opener in the Print drawer when it closes.
      const reorderOpener = printPanel.locator('.custom-order-btn[data-action="openCustomOrderModal"]').first();
      await expect(reorderOpener).toBeVisible();
      await reorderOpener.evaluate((element) => {
        element.id = "__playbookPrintCustomOrderOpener";
        // Touch activation does not consistently retain keyboard focus in
        // iPad emulation. Run the product handler with the real opener
        // focused, so this verifies LayerManager return focus rather than a
        // browser tap heuristic.
        element.focus({ preventScroll: true });
        openCustomOrderModal(element.dataset.sortField || "formation");
      });
      const reorder = page.locator("#_reorderModal");
      const reorderClose = reorder.locator(".reorder-modal-close");
      await expect(reorder).toBeVisible();
      await expect(reorderClose).toBeFocused();
      expect(
        await page.evaluate(() => ({
          printOpen: document.getElementById("pbPrintPanel")?.dataset.layerOpen || "",
          reorderOpen: document.getElementById("_reorderModal")?.dataset.layerOpen || "",
          locked: document.body.classList.contains("app-layer-locked"),
        })),
      ).toEqual({ printOpen: "true", reorderOpen: "true", locked: true });

      await page.keyboard.press("Escape");
      await expect(reorder).toHaveCount(0);
      await expect(reorderOpener).toBeFocused();
      await expect(printPanel).toHaveClass(/open/);
      expect((await readPrintLayerState(page)).locked).toBe(true);

      // LayerManager's capture Escape closes Print before the legacy document
      // Escape handler can close its parent workbench. Its explicit return
      // target remains the exact Print button on both iPad orientations.
      await page.keyboard.press("Escape");
      await expect(printPanel).not.toHaveClass(/open/);
      await expect.poll(readPrintLayerState.bind(null, page)).toMatchObject({
        ariaHidden: "true",
        inert: true,
        layerOpen: "false",
        triggerExpanded: "false",
        triggerFocused: true,
      });
      await expect(printTrigger).toBeFocused();

      const parentState = await page.evaluate(() => ({
        portrait: document.body.classList.contains("is-portrait-screen"),
        filterLayerOpen: document.getElementById("pbFilterDrawer")?.dataset.layerOpen === "true",
        locked: document.body.classList.contains("app-layer-locked"),
      }));
      if (parentState.portrait) {
        expect(parentState.filterLayerOpen).toBe(true);
        expect(parentState.locked).toBe(true);
      } else {
        expect(parentState.filterLayerOpen).toBe(false);
        expect(parentState.locked).toBe(false);
      }

      // Backdrop dismissal follows the same closing lifecycle and focus rule.
      await printTrigger.click();
      await expect(printPanel).toHaveClass(/open/);
      await printPanel.click({ position: { x: 8, y: 8 } });
      await expect(printPanel).not.toHaveClass(/open/);
      await expect(printTrigger).toBeFocused();

      // The original workbench can still close normally after its child
      // dialog has returned focus to the Print trigger.
      await filterDrawer.locator(".pb-filter-drawer-close").click();
      await expect(filterDrawer).toHaveAttribute("aria-hidden", "true");
      await expect.poll(() => page.evaluate(() => document.body.classList.contains("app-layer-locked"))).toBe(false);
    } finally {
      await resetKeyboardSizedViewport(page);
    }

    await assertNoHorizontalOverflow(page);
  });
});
