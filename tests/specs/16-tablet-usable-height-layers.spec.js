// @ts-check
/**
 * Tablet usable-height contract.
 *
 * Browser chrome and a soft keyboard shrink visualViewport without changing
 * the layout viewport on iPad Safari. These high-frequency Playbook, Quiz,
 * and Presentation surfaces must therefore size from --app-vh and keep their
 * close/action controls inside the modeled usable height.
 */
const { test, expect } = require("@playwright/test");
const { login, dismissFirstUse, goToTab, assertNoHorizontalOverflow } = require("./helpers");

const KEYBOARD_USABLE_HEIGHT = 360;

async function addFocusAnchor(page, id) {
  await page.evaluate((anchorId) => {
    document.getElementById(anchorId)?.remove();
    const anchor = document.createElement("button");
    anchor.type = "button";
    anchor.id = anchorId;
    anchor.textContent = "Tablet layer focus anchor";
    anchor.style.cssText = "position:fixed;left:8px;top:8px;width:44px;height:44px;z-index:1;";
    document.body.appendChild(anchor);
    anchor.focus({ preventScroll: true });
  }, id);
}

async function setKeyboardSizedViewport(page) {
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--app-vh", "3.6px");
  });
  await page.waitForTimeout(60);
}

async function resetKeyboardSizedViewport(page) {
  await page.evaluate(() => {
    document.documentElement.style.removeProperty("--app-vh");
  });
}

async function getLayerGeometry(page, overlaySelector, closeSelector, actionSelector = "") {
  return page.evaluate(({ overlaySelector: selector, closeSelector: closeQuery, actionSelector: actionQuery }) => {
    const overlay = document.querySelector(selector);
    const close = overlay?.querySelector(closeQuery);
    const action = actionQuery ? overlay?.querySelector(actionQuery) : null;
    const rect = (element) => {
      const box = element?.getBoundingClientRect();
      return box
        ? { top: box.top, right: box.right, bottom: box.bottom, left: box.left, width: box.width, height: box.height }
        : null;
    };
    return {
      open: overlay?.dataset.layerOpen === "true",
      active: overlay?.classList.contains("app-layer-active"),
      locked: document.body.classList.contains("app-layer-locked"),
      scrollOwner: document.body.dataset.scrollOwner || "",
      closeFocused: document.activeElement === close,
      close: rect(close),
      action: rect(action),
      overlay: rect(overlay),
    };
  }, { overlaySelector, closeSelector, actionSelector });
}

function expectKeyboardSafe(state, name, { action = false } = {}) {
  expect(state.open, `${name} registers an open layer`).toBe(true);
  expect(state.active, `${name} activates its layer class`).toBe(true);
  expect(state.locked, `${name} locks the document`).toBe(true);
  expect(state.scrollOwner, `${name} owns scroll`).toBe("layer");
  expect(state.closeFocused, `${name} initial focus is its Close control`).toBe(true);
  expect(state.overlay?.height, `${name} uses the visual viewport height`).toBeLessThanOrEqual(KEYBOARD_USABLE_HEIGHT + 1);
  expect(state.close?.bottom, `${name} Close remains above the modeled keyboard`).toBeLessThanOrEqual(KEYBOARD_USABLE_HEIGHT);
  expect(state.close?.width, `${name} Close target width`).toBeGreaterThanOrEqual(44);
  expect(state.close?.height, `${name} Close target height`).toBeGreaterThanOrEqual(44);
  if (action) {
    expect(state.action?.bottom, `${name} action footer remains above the modeled keyboard`).toBeLessThanOrEqual(KEYBOARD_USABLE_HEIGHT);
  }
}

test.describe("tablet usable-height blocking layers", () => {
  test("Playbook filters, Script quiz, and Presentation keep a usable visual viewport", async ({ page }, testInfo) => {
    test.skip(
      !["ipad-portrait", "ipad-landscape"].includes(testInfo.project.name),
      "This contract requires the touch-enabled iPad projects.",
    );

    await login(page, { role: "coach", username: "coach" });
    await dismissFirstUse(page);
    await goToTab(page, "playbook");
    await page.evaluate(async () => {
      if (typeof window.loadQuizSuite === "function") await window.loadQuizSuite();
    });

    const filterAnchor = "__tabletFilterFocusAnchor";
    await addFocusAnchor(page, filterAnchor);
    await page.evaluate(() => openPlayerPlaybookFilters());
    await expect(page.locator("#playerPlaybookFilterOverlay")).toBeVisible();
    await setKeyboardSizedViewport(page);
    expectKeyboardSafe(
      await getLayerGeometry(
        page,
        "#playerPlaybookFilterOverlay",
        ".pb-player-filter-close",
        "#playerPlaybookFilterApply",
      ),
      "Playbook player filters",
      { action: true },
    );
    await page.keyboard.press("Escape");
    await expect(page.locator("#playerPlaybookFilterOverlay")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe(filterAnchor);
    await resetKeyboardSizedViewport(page);

    const quizAnchor = "__tabletQuizFocusAnchor";
    await addFocusAnchor(page, quizAnchor);
    await page.evaluate(() => {
      const quizPlays = [
        { formation: "Trips", play: "Buck Sweep", preferredDown: "1", preferredDistance: "Medium", respQ: "Secure the edge." },
        { formation: "Doubles", play: "Four Verts", preferredDown: "2", preferredDistance: "Long", respQ: "Win vertical leverage." },
      ];
      plays = quizPlays;
      filteredPlays = quizPlays.slice();
      startScriptQuiz({
        items: quizPlays.map((play) => ({ play })),
        positionKey: "respQ",
        title: "Tablet Quiz",
      });
    });
    await expect(page.locator("#scriptQuizOverlay")).toBeVisible();
    await setKeyboardSizedViewport(page);
    expectKeyboardSafe(
      await getLayerGeometry(
        page,
        "#scriptQuizOverlay",
        "[data-action='closeScriptQuiz']",
        "#scriptQuizNextBtn",
      ),
      "Script quiz",
      { action: true },
    );
    // A live quiz intentionally asks for an exit choice first. Both Escapes
    // are owned by the layer rather than escaping to the Script/Playbook page.
    await page.keyboard.press("Escape");
    await expect(page.locator("#scriptQuizOverlay .sq-exit-card")).toBeVisible();
    await expect(page.locator("#scriptQuizOverlay")).toHaveAttribute("data-layer-open", "true");
    await page.keyboard.press("Escape");
    await expect(page.locator("#scriptQuizOverlay")).toHaveClass(/hidden/);
    await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe(quizAnchor);
    await resetKeyboardSizedViewport(page);

    const presentationAnchor = "__tabletPresentationFocusAnchor";
    await addFocusAnchor(page, presentationAnchor);
    await page.evaluate(() => {
      if (typeof storageManager !== "undefined") {
        storageManager.set(STORAGE_KEYS.PRESENTATION_IPAD_HELP_DISMISSED, true);
      }
      openPlaybookPresentation(0);
    });
    await expect(page.locator("#playPresentationOverlay")).toHaveClass(/is-open/);
    await setKeyboardSizedViewport(page);
    expectKeyboardSafe(
      await getLayerGeometry(
        page,
        "#playPresentationOverlay",
        "#playPresentationClose",
      ),
      "Play presentation",
    );

    // Setup is a nested layer: Escape closes the sheet and leaves the active
    // presentation safely locked until its own Escape closes it.
    await page.evaluate(() => openPlayPresentationSetup());
    await expect(page.locator("#playPresentationSetup")).toHaveClass(/is-open/);
    const setupState = await getLayerGeometry(
      page,
      "#playPresentationSetup",
      ".pp-sheet-close",
    );
    expectKeyboardSafe(setupState, "Presentation setup");
    await page.keyboard.press("Escape");
    await expect(page.locator("#playPresentationSetup")).toBeHidden();
    await expect(page.locator("#playPresentationOverlay")).toHaveAttribute("data-layer-open", "true");
    await expect.poll(() => page.evaluate(() => document.body.classList.contains("app-layer-locked"))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(page.locator("#playPresentationOverlay")).toHaveAttribute("aria-hidden", "true");
    await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe(presentationAnchor);
    await resetKeyboardSizedViewport(page);
    await assertNoHorizontalOverflow(page);
  });
});
