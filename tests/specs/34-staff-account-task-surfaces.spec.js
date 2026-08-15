// @ts-check
/**
 * Account management is a coach/admin workbench on iPad—not a tiny desktop
 * popup.  Exercise the production openers and actual account payload shape.
 */
const { test, expect } = require("@playwright/test");
const { login, dismissFirstUse } = require("./helpers");

const STAFF_ACCOUNTS = [
  { id: "player-one", role: "player", status: "active", email: "player.one@example.test", displayName: "Player One", permissions: [] },
  { id: "coach-one", role: "coach", status: "active", email: "coach.one@example.test", displayName: "Coach One", permissions: ["tab:dashboard", "tab:playbook", "feature:questions"] },
  { id: "coach-two", role: "coach", status: "active", email: "coach.two@example.test", displayName: "Coach Two", permissions: ["tab:dashboard", "tab:playbook", "feature:edit_workspace"] },
];

async function seedAccountApi(page) {
  await page.route(/\/auth\/players(?:\/[^/?]+)?(?:\?.*)?$/, async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          permissions: ["tab:dashboard", "tab:playbook", "feature:questions", "feature:print"],
        }),
      });
      return;
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, players: STAFF_ACCOUNTS }) });
  });
}

async function openFromFocusedTrigger(page, kind) {
  await page.evaluate((surface) => {
    document.getElementById("__staffAccountReturnTarget")?.remove();
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.id = "__staffAccountReturnTarget";
    trigger.textContent = "Open staff account surface";
    trigger.style.cssText = "position:fixed;left:8px;top:8px;width:44px;height:44px;z-index:1;";
    document.body.appendChild(trigger);
    trigger.focus({ preventScroll: true });
    if (surface === "players") openPlayersAdmin("", trigger);
    else openCoachAccessManager(trigger);
  }, kind);
}

async function getSurfaceState(page, overlayId) {
  return page.evaluate((id) => {
    const overlay = document.getElementById(id);
    const panel = overlay?.querySelector(".pa-panel");
    const body = overlay?.querySelector(".pa-body");
    const close = overlay?.querySelector(".pa-close-btn");
    const save = overlay?.querySelector(".coach-access-save .btn");
    const list = overlay?.querySelector(".coach-access-list");
    const detail = overlay?.querySelector(".coach-access-detail");
    const rect = (element) => {
      const box = element?.getBoundingClientRect();
      return box && { width: box.width, height: box.height, top: box.top, bottom: box.bottom };
    };
    return {
      layerOpen: overlay?.dataset.layerOpen === "true",
      layerId: overlay?.dataset.layerId || "",
      safeArea: overlay?.classList.contains("app-layer-safe-area"),
      locked: document.body.classList.contains("app-layer-locked"),
      scrollOwner: document.body.dataset.scrollOwner || "",
      closeFocused: document.activeElement === close,
      panelOverflow: panel ? getComputedStyle(panel).overflowY : "",
      bodyOverflow: body ? getComputedStyle(body).overflowY : "",
      visualHeight: window.visualViewport?.height || window.innerHeight,
      panel: rect(panel),
      close: rect(close),
      save: rect(save),
      list: rect(list),
      detail: rect(detail),
      savePosition: save ? getComputedStyle(save.closest(".coach-access-save")).position : "",
    };
  }, overlayId);
}

test.describe("Staff account task surfaces", () => {
  test("keeps Accounts and Coach Access focused and reachable on both iPad orientations", async ({ page }, testInfo) => {
    test.skip(!["ipad-portrait", "ipad-landscape"].includes(testInfo.project.name), "Requires WebKit iPad projects.");
    await page.setViewportSize(testInfo.project.name === "ipad-landscape" ? { width: 1024, height: 768 } : { width: 768, height: 1024 });
    await login(page, { role: "admin", username: "admin", password: "password" });
    await dismissFirstUse(page);
    await seedAccountApi(page);

    await openFromFocusedTrigger(page, "players");
    await expect(page.locator("#playersAdminOverlay .pa-row").first()).toBeVisible();
    let state = await getSurfaceState(page, "playersAdminOverlay");
    expect(state.layerOpen).toBe(true);
    expect(state.layerId).toBe("playersAdminOverlay");
    expect(state.safeArea).toBe(true);
    expect(state.locked).toBe(true);
    expect(state.scrollOwner).toBe("layer");
    expect(state.closeFocused).toBe(true);
    expect(state.panelOverflow).toBe("hidden");
    expect(state.bodyOverflow).toMatch(/auto|scroll/);
    expect(state.panel?.height || 0).toBeLessThanOrEqual(state.visualHeight + 1);
    expect(state.close?.width || 0).toBeGreaterThanOrEqual(44);
    expect(state.close?.height || 0).toBeGreaterThanOrEqual(44);
    await page.keyboard.press("Escape");
    let afterClose = await page.evaluate(() => ({ focused: document.activeElement?.id || "", locked: document.body.classList.contains("app-layer-locked") }));
    expect(afterClose).toEqual({ focused: "__staffAccountReturnTarget", locked: false });

    await openFromFocusedTrigger(page, "access");
    await expect(page.locator("#coachAccessOverlay .coach-access-person").first()).toBeVisible();
    state = await getSurfaceState(page, "coachAccessOverlay");
    expect(state.layerOpen).toBe(true);
    expect(state.layerId).toBe("coachAccessOverlay");
    expect(state.safeArea).toBe(true);
    expect(state.locked).toBe(true);
    expect(state.scrollOwner).toBe("layer");
    expect(state.closeFocused).toBe(true);
    expect(state.bodyOverflow).toMatch(/auto|scroll/);
    expect(state.close?.width || 0).toBeGreaterThanOrEqual(44);
    expect(state.close?.height || 0).toBeGreaterThanOrEqual(44);
    expect(state.save?.width || 0).toBeGreaterThanOrEqual(44);
    expect(state.save?.height || 0).toBeGreaterThanOrEqual(44);
    expect(state.savePosition).toBe("sticky");
    if (testInfo.project.name === "ipad-landscape") {
      expect(state.list?.width || 0).toBeGreaterThan(200);
      expect(state.detail?.width || 0).toBeGreaterThan((state.list?.width || 0));
    }
    await page.locator('#coachAccessOverlay input[data-permission="feature:print"]').check();
    await page.locator("#coachAccessOverlay .coach-access-save .btn").click();
    await expect(page.locator("#coachAccessOverlay .coach-access-save .btn")).toContainText("Save access");
    await expect(page.locator("#coachAccessOverlay .coach-access-state")).toContainText(/coach tool|edit workspace|view-only/i);
    await page.keyboard.press("Escape");
    afterClose = await page.evaluate(() => ({ focused: document.activeElement?.id || "", locked: document.body.classList.contains("app-layer-locked") }));
    expect(afterClose).toEqual({ focused: "__staffAccountReturnTarget", locked: false });
  });
});
