// @ts-check
/**
 * Playbook report blocking-layer regression coverage.
 *
 * Exercise the production analytics menu actions rather than constructing a
 * test-only modal. The deferred report bundle is part of the interaction, so
 * this also covers its first-use LayerManager handoff on iPad touch shells.
 */
const { test, expect } = require("@playwright/test");
const { login, dismissFirstUse, goToTab, assertNoHorizontalOverflow } = require("./helpers");

const REPORT_SURFACES = [
  {
    name: "Balance",
    action: "openPlaybookBalanceReport",
    overlayId: "playbookBalanceOverlay",
    layerId: "playbook-balance-report",
    scrollSelector: ".pb-balance-body",
  },
  {
    name: "Situation Coverage",
    action: "openPlaybookSituationCoverage",
    overlayId: "playbookSituationOverlay",
    layerId: "playbook-situation-report",
    scrollSelector: ".pb-balance-body",
  },
  {
    name: "Touches",
    action: "openPlaybookTouchReport",
    overlayId: "playbookTouchOverlay",
    layerId: "playbook-touch-report",
    scrollSelector: ".pb-balance-body",
  },
  {
    name: "Data Health",
    action: "openPlaybookDataHealth",
    overlayId: "playbookDataHealthOverlay",
    layerId: "playbook-data-health-report",
    scrollSelector: "#playbookDataHealthBody",
  },
  // A normal close/open cycle must install a fresh managed Escape handler;
  // keep one real report action in the set twice to cover that lifecycle.
  {
    name: "Balance (reopened)",
    action: "openPlaybookBalanceReport",
    overlayId: "playbookBalanceOverlay",
    layerId: "playbook-balance-report",
    scrollSelector: ".pb-balance-body",
  },
];

async function triggerReport(page, surface) {
  await page.evaluate((action) => {
    document.getElementById("__playbookReportReturnTarget")?.remove();
    const returnTarget = document.createElement("button");
    returnTarget.type = "button";
    returnTarget.id = "__playbookReportReturnTarget";
    returnTarget.textContent = "Playbook report return target";
    returnTarget.style.cssText = "position:fixed;left:8px;top:8px;width:44px;height:44px;z-index:1;";
    document.body.appendChild(returnTarget);
    returnTarget.focus({ preventScroll: true });

    // This invokes the same delegated action used by the Analytics menu. It
    // intentionally allows the deferred feature bridge to load on first use.
    const trigger = document.querySelector(`[data-action="${action}"]`);
    if (!(trigger instanceof HTMLButtonElement)) {
      throw new Error(`Missing Playbook report trigger: ${action}`);
    }
    trigger.click();
  }, surface.action);

  await expect(page.locator(`#${surface.overlayId}`)).toBeVisible({ timeout: 15_000 });
}

async function getReportLayerState(page, surface) {
  return page.evaluate(({ overlayId, layerId, scrollSelector }) => {
    const overlay = document.getElementById(overlayId);
    const close = overlay?.querySelector(".modal-close");
    const scroll = overlay?.querySelector(scrollSelector);
    const overlayRect = overlay?.getBoundingClientRect();
    const closeRect = close?.getBoundingClientRect();
    return {
      layerOpen: overlay?.dataset.layerOpen === "true",
      layerId: overlay?.dataset.layerId || "",
      layerActive: overlay?.classList.contains("app-layer-active"),
      safeArea: overlay?.classList.contains("app-layer-safe-area"),
      layerEscape: overlay?.dataset.layerEscape || "",
      bodyLocked: document.body.classList.contains("app-layer-locked"),
      scrollOwner: document.body.dataset.scrollOwner || "",
      closeFocused: document.activeElement === close,
      overlayOverflow: overlay ? getComputedStyle(overlay).overflowY : "",
      scrollOverflow: scroll ? getComputedStyle(scroll).overflowY : "",
      visualHeight: window.visualViewport?.height || window.innerHeight,
      overlayHeight: overlayRect?.height || 0,
      close: closeRect
        ? { width: closeRect.width, height: closeRect.height, top: closeRect.top, right: closeRect.right, bottom: closeRect.bottom }
        : null,
      viewportWidth: window.innerWidth,
      expectedLayerId: layerId,
    };
  }, surface);
}

async function installLegacyEscapeSentinel(page) {
  await page.evaluate(() => {
    const existing = window.__playbookReportEscapeSentinel;
    if (existing) {
      document.removeEventListener("keydown", existing.capture, true);
      document.removeEventListener("keydown", existing.bubble);
    }
    const state = { captureHits: 0, bubbleHits: 0 };
    const capture = (event) => {
      if (event.key === "Escape") state.captureHits += 1;
    };
    const bubble = (event) => {
      if (event.key === "Escape") state.bubbleHits += 1;
    };
    window.__playbookReportEscapeSentinel = { state, capture, bubble };
    // Register after LayerManager has opened the dialog. A well-managed layer
    // consumes Escape before an unrelated legacy document handler can run.
    document.addEventListener("keydown", capture, true);
    document.addEventListener("keydown", bubble);
  });
}

async function removeLegacyEscapeSentinel(page) {
  return page.evaluate(() => {
    const sentinel = window.__playbookReportEscapeSentinel;
    if (!sentinel) return { captureHits: 0, bubbleHits: 0 };
    document.removeEventListener("keydown", sentinel.capture, true);
    document.removeEventListener("keydown", sentinel.bubble);
    delete window.__playbookReportEscapeSentinel;
    return sentinel.state;
  });
}

test.describe("Playbook report layers", () => {
  test("Balance, Situations, Touches, and Data Health are safe blocking iPad dialogs", async ({ page }, testInfo) => {
    test.skip(
      !["ipad-portrait", "ipad-landscape"].includes(testInfo.project.name),
      "This contract requires the touch-enabled iPad projects.",
    );

    await login(page, { role: "coach", username: "coach", password: "password" });
    await dismissFirstUse(page);
    await goToTab(page, "playbook");

    for (const surface of REPORT_SURFACES) {
      await triggerReport(page, surface);
      const overlay = page.locator(`#${surface.overlayId}`);
      const close = overlay.locator(".modal-close");

      await expect(close).toBeFocused();
      await expect.poll(() => getReportLayerState(page, surface)).toMatchObject({
        layerOpen: true,
        layerId: surface.layerId,
        layerActive: true,
        safeArea: true,
        layerEscape: "managed",
        bodyLocked: true,
        scrollOwner: "layer",
        closeFocused: true,
        overlayOverflow: "hidden",
        scrollOverflow: "auto",
      });

      const opened = await getReportLayerState(page, surface);
      expect(opened.overlayHeight, `${surface.name} stays in the visual viewport`).toBeLessThanOrEqual(opened.visualHeight + 1);
      expect(opened.close?.width, `${surface.name} Close target width`).toBeGreaterThanOrEqual(44);
      expect(opened.close?.height, `${surface.name} Close target height`).toBeGreaterThanOrEqual(44);
      expect(opened.close?.top, `${surface.name} Close target top`).toBeGreaterThanOrEqual(0);
      expect(opened.close?.right, `${surface.name} Close target right`).toBeLessThanOrEqual(opened.viewportWidth + 1);
      expect(opened.close?.bottom, `${surface.name} Close target bottom`).toBeLessThanOrEqual(opened.visualHeight + 1);

      await installLegacyEscapeSentinel(page);
      await page.keyboard.press("Escape");
      await expect.poll(() => page.evaluate((id) => {
        const overlay = document.getElementById(id);
        return {
          layerOpen: overlay?.dataset.layerOpen === "true",
          locked: document.body.classList.contains("app-layer-locked"),
          scrollOwnerReleased: document.body.dataset.scrollOwner !== "layer",
          activeId: document.activeElement?.id || "",
        };
      }, surface.overlayId)).toEqual({
        layerOpen: false,
        locked: false,
        scrollOwnerReleased: true,
        activeId: "__playbookReportReturnTarget",
      });
      expect(
        await removeLegacyEscapeSentinel(page),
        `${surface.name} consumes Escape before legacy document handlers`,
      ).toEqual({ captureHits: 0, bubbleHits: 0 });
      await expect(overlay).toHaveCount(0);
      await page.evaluate(() => document.getElementById("__playbookReportReturnTarget")?.remove());
    }

    await assertNoHorizontalOverflow(page);
  });
});
