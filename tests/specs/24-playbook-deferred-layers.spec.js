// @ts-check
/**
 * T-011d — deferred Playbook blocking dialogs on iPad.
 *
 * Category Cleanup, Constraint Map, and Identity Alignment intentionally use
 * full blocking layers. Exercise the real deferred actions in portrait and
 * landscape, including Category Cleanup's first-Escape-clears-search rule.
 */
const { test, expect } = require("@playwright/test");
const { login, dismissFirstUse, goToTab, assertNoHorizontalOverflow } = require("./helpers");

const KEYBOARD_USABLE_HEIGHT = 360;
const VIEWPORT_STYLE_ID = "__playbookDeferredLayerViewport";

const DEFERRED_FIXTURE = Array.from({ length: 42 }, (_, index) => ({
  id: `deferred-playbook-${index + 1}`,
  type: index % 3 === 0 ? "Run" : index % 3 === 1 ? "Pass" : "Screen",
  personnel: index % 2 ? "10" : "11",
  formation: index % 2 ? "Doubles" : "Trips",
  play: `Deferred ${index % 3 === 0 ? "Buck" : index % 3 === 1 ? "Verts" : "Bubble"} ${index + 1}`,
  basePlay: index % 3 === 0 ? "Buck" : index % 3 === 1 ? "Verts" : "Bubble",
  preferredDown: String((index % 4) + 1),
  preferredDistance: index % 2 ? "Long" : "Short",
  preferredSituation: index % 4 === 0 ? "Red Zone" : "Open Field",
  constraint1: index % 2 ? "Counter" : "Play Action",
  constraint2: index % 5 === 0 ? "Screen" : "",
  keyPlayerName1: index % 2 ? "Avery Runner" : "Mason Receiver",
}));

const SURFACES = [
  {
    name: "Category Cleanup",
    action: "openPlaybookCategoryCleanup",
    overlayId: "playbookCatCleanupOverlay",
    layerId: "playbook-category-cleanup",
    bodySelector: ".cat-cleanup-body",
    listSelector: ".cat-cleanup-list",
    closeAction: "closePlaybookCategoryCleanup",
  },
  {
    name: "Constraint Map",
    action: "openPlaybookConstraintMap",
    overlayId: "playbookConstraintOverlay",
    layerId: "playbook-constraint-report",
    bodySelector: ".pb-balance-body",
    closeAction: "closePlaybookConstraintMap",
  },
  {
    name: "Identity Alignment",
    action: "openPlaybookIdentityAlignment",
    overlayId: "playbookIdentityOverlay",
    layerId: "playbook-identity-report",
    bodySelector: ".pb-balance-body",
    closeAction: "closePlaybookIdentityAlignment",
  },
];

async function seedDeferredFixture(page) {
  await page.evaluate((fixture) => {
    plays = fixture.map((play) => ({ ...play }));
    filteredPlays = plays.slice();
    if (typeof invalidateFilterCache === "function") invalidateFilterCache();
    if (typeof populateFilters === "function") populateFilters();
    if (typeof filterPlays === "function") filterPlays();
    if (typeof renderPlaybook === "function") renderPlaybook();
  }, DEFERRED_FIXTURE);
}

async function setKeyboardSizedViewport(page) {
  await page.evaluate((styleId) => {
    document.getElementById(styleId)?.remove();
    const style = document.createElement("style");
    style.id = styleId;
    // The application derives its viewport token from visualViewport. This
    // test-only override models an on-screen keyboard while retaining the
    // production visual-viewport geometry path.
    style.textContent = ":root { --app-vh: 3.6px !important; }";
    document.head.appendChild(style);
  }, VIEWPORT_STYLE_ID);
  await page.waitForTimeout(70);
}

async function resetKeyboardSizedViewport(page) {
  await page.evaluate((styleId) => document.getElementById(styleId)?.remove(), VIEWPORT_STYLE_ID);
}

async function triggerSurface(page, surface) {
  const returnTargetId = `__${surface.layerId}ReturnTarget`;
  await page.evaluate(({ action, targetId }) => {
    document.getElementById(targetId)?.remove();
    const returnTarget = document.createElement("button");
    returnTarget.type = "button";
    returnTarget.id = targetId;
    returnTarget.textContent = "Playbook deferred dialog return target";
    returnTarget.style.cssText = "position:fixed;left:8px;top:8px;width:44px;height:44px;z-index:1;";
    document.body.appendChild(returnTarget);
    returnTarget.focus({ preventScroll: true });

    // Click the real delegated Analytics/Data action so this also covers the
    // deferred feature bridge that owns these dialogs in production.
    const trigger = document.querySelector(`[data-action="${action}"]`);
    if (!(trigger instanceof HTMLButtonElement)) {
      throw new Error(`Missing Playbook deferred dialog trigger: ${action}`);
    }
    trigger.click();
  }, { action: surface.action, targetId: returnTargetId });
  await expect(page.locator(`#${surface.overlayId}`)).toBeVisible({ timeout: 15_000 });
  return returnTargetId;
}

async function readLayerState(page, surface) {
  return page.evaluate(({ overlayId, bodySelector, listSelector }) => {
    const overlay = document.getElementById(overlayId);
    const dialog = overlay?.querySelector("[role=dialog]");
    const close = overlay?.querySelector(".modal-close");
    const body = overlay?.querySelector(bodySelector);
    const list = listSelector ? overlay?.querySelector(listSelector) : null;
    const rect = (element) => {
      const box = element?.getBoundingClientRect();
      return box
        ? { top: box.top, right: box.right, bottom: box.bottom, left: box.left, width: box.width, height: box.height }
        : null;
    };
    const viewportUnit = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--app-vh")) || 1;
    return {
      layerOpen: overlay?.dataset.layerOpen || "",
      layerId: overlay?.dataset.layerId || "",
      layerEscape: overlay?.dataset.layerEscape || "",
      layerActive: overlay?.classList.contains("app-layer-active") || false,
      safeArea: overlay?.classList.contains("app-layer-safe-area") || false,
      locked: document.body.classList.contains("app-layer-locked"),
      scrollOwner: document.body.dataset.scrollOwner || "",
      closeFocused: document.activeElement === close,
      outerOverflow: overlay ? getComputedStyle(overlay).overflowY : "",
      bodyOverflow: body ? getComputedStyle(body).overflowY : "",
      listOverflow: list ? getComputedStyle(list).overflowY : "",
      bodyClientHeight: body?.clientHeight || 0,
      bodyScrollHeight: body?.scrollHeight || 0,
      usableHeight: viewportUnit * 100,
      overlay: rect(overlay),
      dialog: rect(dialog),
      close: rect(close),
      viewportWidth: window.innerWidth,
    };
  }, surface);
}

function expectTouchTarget(rect, label) {
  expect(rect, `${label} exists`).not.toBeNull();
  expect(rect?.width || 0, `${label} width`).toBeGreaterThanOrEqual(44);
  expect(rect?.height || 0, `${label} height`).toBeGreaterThanOrEqual(44);
}

test.describe("deferred Playbook blocking layers", () => {
  test("Category Cleanup, Constraint Map, and Identity Alignment fit the iPad visual viewport", async ({ page }, testInfo) => {
    test.skip(
      !["ipad-portrait", "ipad-landscape"].includes(testInfo.project.name),
      "This contract requires the touch-enabled iPad projects.",
    );

    await login(page, { role: "coach", username: "coach" });
    await dismissFirstUse(page);
    await goToTab(page, "playbook");
    await seedDeferredFixture(page);
    await setKeyboardSizedViewport(page);

    try {
      for (const surface of SURFACES) {
        const returnTargetId = await triggerSurface(page, surface);
        const overlay = page.locator(`#${surface.overlayId}`);
        const close = overlay.locator(".modal-close");
        await expect(close, `${surface.name} initial focus`).toBeFocused();

        const state = await readLayerState(page, surface);
        expect(state.layerOpen, `${surface.name} registers a LayerManager layer`).toBe("true");
        expect(state.layerId, `${surface.name} stable layer id`).toBe(surface.layerId);
        expect(state.layerEscape, `${surface.name} owns Escape`).toBe("managed");
        expect(state.layerActive, `${surface.name} uses visual viewport geometry`).toBe(true);
        expect(state.safeArea, `${surface.name} applies safe-area padding`).toBe(true);
        expect(state.locked, `${surface.name} locks background scrolling`).toBe(true);
        expect(state.scrollOwner, `${surface.name} records layer scrolling`).toBe("layer");
        expect(state.outerOverflow, `${surface.name} overlay does not own a second vertical scroll`).toBe("hidden");
        expect(state.bodyOverflow, `${surface.name} body owns vertical scroll`).toBe("auto");
        if (surface.listSelector) {
          expect(state.listOverflow, `${surface.name} list does not become a nested tablet scroller`).toBe("visible");
        }
        expect(state.overlay?.height || 0, `${surface.name} stays within the modeled keyboard viewport`).toBeLessThanOrEqual(KEYBOARD_USABLE_HEIGHT + 1);
        expect(state.dialog?.bottom || 0, `${surface.name} dialog stays within its visual viewport`).toBeLessThanOrEqual(KEYBOARD_USABLE_HEIGHT + 1);
        expect(state.close?.top || -1, `${surface.name} Close stays visible`).toBeGreaterThanOrEqual(0);
        expect(state.close?.right || Infinity, `${surface.name} Close stays horizontally visible`).toBeLessThanOrEqual(state.viewportWidth + 1);
        expect(state.close?.bottom || 0, `${surface.name} Close stays vertically visible`).toBeLessThanOrEqual(KEYBOARD_USABLE_HEIGHT + 1);
        expectTouchTarget(state.close, `${surface.name} Close`);

        if (surface.action === "openPlaybookCategoryCleanup") {
          const search = overlay.locator("#catCleanupSearch");
          await search.fill("Buck");
          await search.press("Escape");
          await expect(overlay, "Category Cleanup stays open while Escape clears search").toBeVisible();
          await expect(search, "Category Cleanup first Escape clears the search").toHaveValue("");
          await expect(search, "Category Cleanup keeps the cleared search focused").toBeFocused();
        }

        await page.keyboard.press("Escape");
        await expect.poll(() => page.evaluate((id) => ({
          closed: !document.getElementById(id) || document.getElementById(id)?.dataset.layerOpen === "false",
          locked: document.body.classList.contains("app-layer-locked"),
          layerOwnsScroll: document.body.dataset.scrollOwner === "layer",
          activeId: document.activeElement?.id || "",
        }), surface.overlayId)).toEqual({
          closed: true,
          locked: false,
          layerOwnsScroll: false,
          activeId: returnTargetId,
        });
        await expect(overlay).toHaveCount(0);
        await page.evaluate((id) => document.getElementById(id)?.remove(), returnTargetId);
      }
    } finally {
      await resetKeyboardSizedViewport(page);
    }

    await assertNoHorizontalOverflow(page);
  });
});
