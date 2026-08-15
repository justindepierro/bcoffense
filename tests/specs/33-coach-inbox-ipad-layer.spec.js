// @ts-check
/**
 * Player Inbox is the coach's existing triage work surface.  Verify its
 * real overlay becomes a safe managed dialog on both iPad orientations,
 * instead of relying on a static drawer class alone.
 */
const { test, expect } = require("@playwright/test");
const { login, dismissFirstUse, goToTab, assertNoHorizontalOverflow } = require("./helpers");

async function openInboxFromFocusedTrigger(page) {
  await page.evaluate(() => {
    document.getElementById("__coachInboxReturnTarget")?.remove();
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.id = "__coachInboxReturnTarget";
    trigger.textContent = "Open player inbox";
    trigger.style.cssText = "position:fixed;left:8px;top:8px;width:44px;height:44px;z-index:1;";
    document.body.appendChild(trigger);
    trigger.focus({ preventScroll: true });
    openQuestionInbox("open", trigger);
  });
  await expect(page.locator("#qInboxOverlay")).toBeVisible();
}

async function inboxState(page) {
  return page.evaluate(() => {
    const overlay = document.getElementById("qInboxOverlay");
    const panel = overlay?.querySelector(".q-inbox-panel");
    const body = document.getElementById("qInboxBody");
    const close = overlay?.querySelector(".q-inbox-close");
    const controls = Array.from(overlay?.querySelectorAll(".q-inbox-select") || []);
    const panelRect = panel?.getBoundingClientRect();
    const closeRect = close?.getBoundingClientRect();
    return {
      layerOpen: overlay?.dataset.layerOpen === "true",
      layerId: overlay?.dataset.layerId || "",
      active: overlay?.classList.contains("app-layer-active"),
      safeArea: overlay?.classList.contains("app-layer-safe-area"),
      locked: document.body.classList.contains("app-layer-locked"),
      scrollOwner: document.body.dataset.scrollOwner || "",
      closeFocused: document.activeElement === close,
      overlayOverflow: overlay ? getComputedStyle(overlay).overflowY : "",
      panelOverflow: panel ? getComputedStyle(panel).overflowY : "",
      bodyOverflow: body ? getComputedStyle(body).overflowY : "",
      visualHeight: window.visualViewport?.height || window.innerHeight,
      panelHeight: panelRect?.height || 0,
      close: closeRect && { width: closeRect.width, height: closeRect.height, top: closeRect.top, bottom: closeRect.bottom },
      controls: controls.map((control) => {
        const rect = control.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      }),
    };
  });
}

test.describe("Coach Inbox iPad layer", () => {
  test("keeps Player Inbox focused, safe-height bounded, and return-focus managed", async ({ page }, testInfo) => {
    test.skip(
      !["ipad-portrait", "ipad-landscape"].includes(testInfo.project.name),
      "The Inbox tablet workbench requires touch-enabled WebKit iPad projects.",
    );

    await login(page, { role: "coach", username: "coach", password: "password" });
    await dismissFirstUse(page);
    await goToTab(page, "dashboard");
    await openInboxFromFocusedTrigger(page);

    const state = await inboxState(page);
    expect(state.layerOpen).toBe(true);
    expect(state.layerId).toBe("qInboxOverlay");
    expect(state.active).toBe(true);
    expect(state.safeArea).toBe(true);
    expect(state.locked).toBe(true);
    expect(state.scrollOwner).toBe("layer");
    expect(state.closeFocused).toBe(true);
    expect(state.overlayOverflow).toBe("hidden");
    expect(state.panelOverflow).toBe("hidden");
    expect(state.bodyOverflow).toMatch(/auto|scroll/);
    expect(state.panelHeight).toBeLessThanOrEqual(state.visualHeight + 1);
    expect(state.close?.width || 0).toBeGreaterThanOrEqual(44);
    expect(state.close?.height || 0).toBeGreaterThanOrEqual(44);
    expect(state.close?.top || 0).toBeGreaterThanOrEqual(0);
    expect(state.close?.bottom || Infinity).toBeLessThanOrEqual(state.visualHeight + 1);
    expect(state.controls.length).toBe(3);
    state.controls.forEach((control) => {
      expect(control.height).toBeGreaterThanOrEqual(44);
    });
    await assertNoHorizontalOverflow(page);

    await page.keyboard.press("Escape");
    await expect(page.locator("#qInboxOverlay")).toBeHidden();
    const afterClose = await page.evaluate(() => ({
      focused: document.activeElement?.id || "",
      locked: document.body.classList.contains("app-layer-locked"),
      scrollOwner: document.body.dataset.scrollOwner || "",
    }));
    expect(afterClose.focused).toBe("__coachInboxReturnTarget");
    expect(afterClose.locked).toBe(false);
    expect(afterClose.scrollOwner).not.toBe("layer");
  });
});
