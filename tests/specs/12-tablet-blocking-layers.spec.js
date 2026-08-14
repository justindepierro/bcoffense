// @ts-check
/**
 * Tablet blocking-layer lifecycle contract.
 *
 * These are the three surfaces that historically each owned a bespoke overlay
 * path. Run them against real touch-enabled iPad projects so a regression in
 * focus, Escape, scroll ownership, or keyboard-sized viewport fitting is
 * caught before release.
 */
const { test, expect } = require("@playwright/test");
const { login, dismissFirstUse, goToTab, assertNoHorizontalOverflow } = require("./helpers");

const LAYER_SURFACES = [
  {
    key: "signals",
    name: "Signals selector",
    overlayId: "signalSelectorOverlay",
    closeSelector: ".signals-play-close",
    removedOnClose: true,
  },
  {
    key: "constraints",
    name: "Call Sheet constraints",
    overlayId: "constraintPanel",
    closeSelector: ".cr-close-btn",
    removedOnClose: false,
  },
  {
    key: "workflow",
    name: "Playbook workflow",
    overlayId: "pbWorkflowPanel",
    closeSelector: "#pbWfPanelClose",
    removedOnClose: false,
  },
];

async function seedPublishedSignal(page) {
  await page.evaluate(() => {
    const play = Array.isArray(plays) ? plays[0] : null;
    if (!play) throw new Error("The local layer fixture needs a seeded play.");
    const value = String(play.formation || "Trips");
    const compareKey = typeof normalizePlayCompareValue === "function"
      ? normalizePlayCompareValue(value)
      : value.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const record = {
      id: `formation:${compareKey}`,
      category: "CORE",
      componentType: "formation",
      componentValue: value,
      compareKey,
      clipKey: `signals/formation/${compareKey}`,
      clipCount: 1,
      visibility: "published",
    };
    // Use the module helper when available so its short-lived record cache is
    // synchronized as well as persisted. The fallback still proves the public
    // selector path after its cache TTL elapses.
    if (typeof _sigSaveRecords === "function") _sigSaveRecords([record]);
    else storageManager.set(STORAGE_KEYS.SIGNALS, [record]);
  });
  await page.waitForTimeout(80);
}

async function openSurface(page, surface) {
  if (surface.key === "signals") await seedPublishedSignal(page);

  await page.evaluate((key) => {
    // Route before capturing the trigger. Some legacy tab routes move focus
    // while their panel initializes, but a dialog must return to the actual
    // control that launched it.
    if (key === "constraints" && typeof showTab === "function") showTab("callsheet");
    if (key === "workflow" && typeof showTab === "function") showTab("playbook");

    document.getElementById("__tabletLayerFocusAnchor")?.remove();
    const anchor = document.createElement("button");
    anchor.type = "button";
    anchor.id = "__tabletLayerFocusAnchor";
    anchor.textContent = "Layer focus anchor";
    anchor.style.cssText = "position:fixed;left:8px;top:8px;width:44px;height:44px;z-index:1;";
    document.body.appendChild(anchor);
    anchor.focus({ preventScroll: true });

    if (key === "signals") {
      openSignalSelectorForPlay(plays[0], { sourceLabel: "Tablet layer test" });
      return;
    }
    if (key === "constraints") {
      runConstraintCheck();
      return;
    }
    if (key === "workflow") {
      filteredPlays = Array.isArray(plays) ? plays.slice() : [];
      openPlayWorkflowPanel(0);
    }
  }, surface.key);

  await expect(page.locator(`#${surface.overlayId}`)).toBeVisible();
}

async function getLayerState(page, surface) {
  return page.evaluate(({ overlayId, closeSelector }) => {
    const overlay = document.getElementById(overlayId);
    const close = overlay?.querySelector(closeSelector);
    const rect = close?.getBoundingClientRect();
    return {
      present: Boolean(overlay),
      visible: Boolean(overlay && getComputedStyle(overlay).display !== "none" && getComputedStyle(overlay).visibility !== "hidden"),
      role: overlay?.getAttribute("role") || "",
      modal: overlay?.getAttribute("aria-modal") || "",
      layerOpen: overlay?.dataset.layerOpen === "true",
      layerActive: overlay?.classList.contains("app-layer-active"),
      locked: document.body.classList.contains("app-layer-locked"),
      scrollOwner: document.body.dataset.scrollOwner || "",
      closeFocused: document.activeElement === close,
      close: rect
        ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }
        : null,
      viewport: { width: window.innerWidth, height: window.visualViewport?.height || window.innerHeight },
    };
  }, surface);
}

test.describe("tablet blocking layers", () => {
  test("Signals, Constraints, and Workflow share a safe modal lifecycle", async ({ page }, testInfo) => {
    test.skip(
      !["ipad-portrait", "ipad-landscape"].includes(testInfo.project.name),
      "This contract requires the touch-enabled iPad projects.",
    );

    await login(page, { role: "coach", username: "coach", password: "password" });
    await dismissFirstUse(page);
    await goToTab(page, "playbook");

    for (const surface of LAYER_SURFACES) {
      await openSurface(page, surface);
      await expect.poll(() => getLayerState(page, surface)).toMatchObject({
        present: true,
        visible: true,
        modal: "true",
        layerOpen: true,
        layerActive: true,
        locked: true,
        scrollOwner: "layer",
        closeFocused: true,
      });

      const opened = await getLayerState(page, surface);
      expect(opened.role, `${surface.name} is a dialog`).toBe("dialog");
      expect(opened.close?.width, `${surface.name} close width`).toBeGreaterThanOrEqual(44);
      expect(opened.close?.height, `${surface.name} close height`).toBeGreaterThanOrEqual(44);

      // Model the reduced usable height while an iPad software keyboard is
      // open. The app's visual viewport token is the contract used by each
      // repaired surface; the Close control must remain reachable inside it.
      await page.evaluate(() => {
        document.documentElement.style.setProperty("--app-vh", "3.6px");
      });
      await page.waitForTimeout(80);
      const keyboardSized = await getLayerState(page, surface);
      expect(keyboardSized.close?.top, `${surface.name} close remains onscreen`).toBeGreaterThanOrEqual(0);
      expect(keyboardSized.close?.right, `${surface.name} close remains horizontally reachable`).toBeLessThanOrEqual(keyboardSized.viewport.width + 1);
      expect(keyboardSized.close?.bottom, `${surface.name} close remains above keyboard`).toBeLessThanOrEqual(361);

      await page.keyboard.press("Escape");
      await expect.poll(() => page.evaluate(({ overlayId }) => {
        const overlay = document.getElementById(overlayId);
        return {
          stillOpen: overlay?.dataset.layerOpen === "true",
          locked: document.body.classList.contains("app-layer-locked"),
          scrollOwnerReleased: document.body.dataset.scrollOwner !== "layer",
          focusRestored: document.activeElement?.id === "__tabletLayerFocusAnchor",
        };
      }, surface), {
        message: `${surface.name} releases its layer and restores the launch focus`,
      }).toEqual({
        stillOpen: false,
        locked: false,
        scrollOwnerReleased: true,
        focusRestored: true,
      });

      const afterClose = await getLayerState(page, surface);
      if (surface.removedOnClose) expect(afterClose.present).toBe(false);
      else expect(afterClose.layerActive).toBe(false);

      await page.evaluate(() => {
        document.documentElement.style.removeProperty("--app-vh");
        document.getElementById("__tabletLayerFocusAnchor")?.remove();
      });
    }

    await assertNoHorizontalOverflow(page);
  });
});
