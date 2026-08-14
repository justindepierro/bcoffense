// @ts-check
/**
 * T-011b — representative Game Plan legacy dialog regression.
 *
 * Manage Boxes exercises a tall generated list, Box Info exercises a dense
 * stats report, and Matching Rules exercises the long editor form. Together
 * they prove the shared lifecycle without treating contextual menus or the
 * phone bulk sheet as dialogs.
 */
const { test, expect } = require("@playwright/test");
const { login, dismissFirstUse, goToTab, assertNoHorizontalOverflow } = require("./helpers");

const KEYBOARD_USABLE_HEIGHT = 360;

const GAMEPLAN_PLAYS = Array.from({ length: 64 }, (_, index) => ({
  id: `legacy-modal-${index + 1}`,
  type: ["Run", "Pass", "Screen", "Quick", "Play Action", "RPO", "Movement"][index % 7],
  personnel: ["10", "11", "12", "20"][index % 4],
  formation: ["Trips", "Doubles", "Bunch", "Empty"][index % 4],
  play: `Legacy Modal Call ${index + 1}`,
  basePlay: ["Buck", "Verts", "Bubble", "Counter"][index % 4],
  motion: ["Jet", "Orbit", "", "Return"][index % 4],
  protection: ["Slide", "Half Slide", "Quick", "Gap"][index % 4],
  tempo: ["Fast", "Normal", "NASCAR", "Check"][index % 4],
  preferredDown: String((index % 3) + 1),
  preferredDistance: ["Short", "Medium", "Long"][index % 3],
  preferredSituation: ["Open Field", "Red Zone", "Two Minute", "Goal Line"][index % 4],
  preferredFieldPosition: ["Left Hash", "Middle", "Right Hash", "Boundary"][index % 4],
  preferredHash: ["Left", "Middle", "Right"][index % 3],
  practiceCoverage: ["Cover 1", "Cover 2", "Cover 3", "Quarters"][index % 4],
  keyPlayer1: ["QB", "RB", "WR", "TE"][index % 4],
}));

const SURFACES = [
  {
    key: "manage",
    name: "Manage Boxes",
    overlay: "#gpManageBoxesOverlay",
    body: ".gp-manage-boxes-body",
    close: "[data-gp-manage-boxes-close]",
  },
  {
    key: "info",
    name: "Box Info",
    overlay: "#gpBoxInfoOverlay",
    body: ".gp-info-modal-body",
    close: "[data-gp-info-close]",
  },
  {
    key: "matching",
    name: "Matching Rules",
    overlay: "#gpBoxMatchingOverlay",
    body: ".gp-box-matching-body",
    close: "#gpMetaCloseBtn",
  },
];

async function seedLongGamePlan(page) {
  await page.evaluate((fixture) => {
    plays = fixture.map((play) => ({ ...play }));
    filteredPlays = plays.slice();

    const board = _gpCreateEmptyBoard();
    board.sheetTitle = "Legacy modal fixture";
    board.customBoxes = Array.from({ length: 28 }, (_, index) => ({
      id: `Legacy Custom ${index + 1}`,
      label: `Legacy Custom ${index + 1}`,
    }));
    board.customBoxes.forEach((box) => { board.assignments[box.id] = []; });
    board.assignments.Run = plays.map((play) => ({ ...play }));
    board.targets.Run = 32;
    board.notes.Run = "Dense coverage, personnel, and tendency detail keeps the Box Info report intentionally long.";
    storageManager.set(STORAGE_KEYS.GAME_PLAN_BOARDS, {
      [_gpActiveOpponentKey()]: board,
    });
    if (typeof invalidateFilterCache === "function") invalidateFilterCache();
    if (typeof renderGamePlan === "function") renderGamePlan();
  }, GAMEPLAN_PLAYS);
}

async function openSurface(page, surface, anchorId) {
  await page.evaluate(({ key, id }) => {
    document.getElementById(id)?.remove();
    const anchor = document.createElement("button");
    anchor.id = id;
    anchor.type = "button";
    anchor.textContent = "Game Plan dialog return target";
    anchor.style.cssText = "position:fixed;left:8px;top:8px;width:44px;height:44px;z-index:1;";
    document.body.appendChild(anchor);
    anchor.focus({ preventScroll: true });

    if (key === "manage") {
      void openGamePlanManageBoxes();
    } else if (key === "info") {
      showGamePlanBoxInfo("Run");
    } else {
      void editGamePlanBoxMatching("Run");
    }
  }, { key: surface.key, id: anchorId });
  await expect(page.locator(surface.overlay)).toBeVisible();
}

async function setKeyboardSizedViewport(page) {
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--app-vh", "3.6px");
  });
  await page.waitForTimeout(70);
}

async function resetKeyboardSizedViewport(page) {
  await page.evaluate(() => {
    document.documentElement.style.removeProperty("--app-vh");
  });
}

async function readSurfaceState(page, surface) {
  return page.evaluate(({ overlayQuery, bodyQuery, closeQuery }) => {
    const overlay = document.querySelector(overlayQuery);
    const body = overlay?.querySelector(bodyQuery);
    const close = overlay?.querySelector(closeQuery);
    const rect = (element) => {
      const box = element?.getBoundingClientRect();
      return box
        ? { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height }
        : null;
    };
    return {
      layerOpen: overlay?.dataset.layerOpen || "",
      layerActive: overlay?.classList.contains("app-layer-active") || false,
      scrollOwner: document.body.dataset.scrollOwner || "",
      locked: document.body.classList.contains("app-layer-locked"),
      focused: document.activeElement === close,
      overlay: rect(overlay),
      close: rect(close),
      outerOverflow: overlay ? getComputedStyle(overlay).overflowY : "",
      bodyOverflow: body ? getComputedStyle(body).overflowY : "",
      bodyClientHeight: body?.clientHeight || 0,
      bodyScrollHeight: body?.scrollHeight || 0,
    };
  }, {
    overlayQuery: surface.overlay,
    bodyQuery: surface.body,
    closeQuery: surface.close,
  });
}

test.describe("Game Plan legacy blocking modal layers", () => {
  test("Manage Boxes, Box Info, and Matching Rules keep a safe viewport, one scroll owner, and return focus on iPad", async ({ page }, testInfo) => {
    test.skip(
      !["ipad-portrait", "ipad-landscape"].includes(testInfo.project.name),
      "This contract requires the touch-enabled iPad projects.",
    );

    await login(page, { role: "coach", username: "coach" });
    await dismissFirstUse(page);
    await goToTab(page, "gameplan");
    await seedLongGamePlan(page);
    await expect(page.locator("#gpBoxes")).toBeVisible();

    for (const surface of SURFACES) {
      const anchorId = `gpLegacyModalAnchor-${surface.key}`;
      await openSurface(page, surface, anchorId);
      await setKeyboardSizedViewport(page);

      const state = await readSurfaceState(page, surface);
      expect(state.layerOpen, `${surface.name} registers a layer`).toBe("true");
      expect(state.layerActive, `${surface.name} activates visual viewport sizing`).toBe(true);
      expect(state.locked, `${surface.name} locks document scrolling`).toBe(true);
      expect(state.scrollOwner, `${surface.name} owns scrolling`).toBe("layer");
      expect(state.focused, `${surface.name} focuses its header Close control`).toBe(true);
      expect(state.outerOverflow, `${surface.name} keeps outer overlay non-scrolling`).toBe("hidden");
      expect(state.bodyOverflow, `${surface.name} body is its one scroll owner`).toBe("auto");
      expect(state.overlay?.height, `${surface.name} follows the modeled visual viewport`).toBeLessThanOrEqual(KEYBOARD_USABLE_HEIGHT + 1);
      expect(state.close?.bottom, `${surface.name} Close remains above the keyboard`).toBeLessThanOrEqual(KEYBOARD_USABLE_HEIGHT + 1);
      expect(state.close?.width, `${surface.name} Close target width`).toBeGreaterThanOrEqual(44);
      expect(state.close?.height, `${surface.name} Close target height`).toBeGreaterThanOrEqual(44);
      expect(state.bodyScrollHeight, `${surface.name} representative body overflows inside its own region`).toBeGreaterThan(state.bodyClientHeight);

      await page.keyboard.press("Escape");
      await expect(page.locator(surface.overlay)).toBeHidden();
      await expect.poll(() => page.evaluate((id) => ({
        focus: document.activeElement?.id || "",
        locked: document.body.classList.contains("app-layer-locked"),
        scrollOwner: document.body.dataset.scrollOwner || "",
      }), anchorId)).toMatchObject({
        focus: anchorId,
        locked: false,
      });
      // The shell may already own document scrolling. Closing a blocking
      // dialog restores that previous owner rather than deleting it; only the
      // transient `layer` owner must be gone.
      const closedScrollOwner = await page.evaluate(() => document.body.dataset.scrollOwner || "");
      expect(closedScrollOwner).not.toBe("layer");
      await resetKeyboardSizedViewport(page);
      await page.evaluate((id) => document.getElementById(id)?.remove(), anchorId);
    }

    await assertNoHorizontalOverflow(page);
  });
});
