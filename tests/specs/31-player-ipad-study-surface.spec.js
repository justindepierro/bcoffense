// @ts-check
/**
 * Native 11-inch M1 iPad Safari study-surface regression.
 *
 * Player Playbook, Signals, and Swipe View are information-first surfaces.
 * At 1194x834 they must not inherit the coach workbench's floating Actions
 * control or first-use projector interruption.
 */
const { test, expect } = require("@playwright/test");
const {
  login,
  dismissFirstUse,
  goToTab,
  assertNoHorizontalOverflow,
} = require("./helpers");

const M1_IPAD_LANDSCAPE = { width: 1194, height: 834 };

const PLAYER_PLAYBOOK_FIXTURE = [
  {
    id: "player-ipad-study-run",
    type: "Run",
    personnel: "11",
    formation: "Trips",
    play: "M1 Buck Sweep",
    basePlay: "Buck",
    motion: "Jet",
    protection: "Slide",
    tempo: "Fast",
    playerNotes: "Seal the edge, then find the alley.",
  },
  {
    id: "player-ipad-study-pass",
    type: "Pass",
    personnel: "10",
    formation: "Doubles",
    play: "M1 Four Verts",
    basePlay: "Verts",
    motion: "Orbit",
    protection: "Half Slide",
    tempo: "NASCAR",
    playerNotes: "Own the depth of the safety.",
  },
  {
    id: "player-ipad-study-screen",
    type: "Screen",
    personnel: "11",
    formation: "Trips",
    play: "M1 Bubble",
    basePlay: "Bubble",
    motion: "Rocket",
    protection: "Quick",
    tempo: "Fast",
  },
];

async function configureM1IpadSafari(page) {
  // Keep the test on the reported physical iPad viewport before application
  // startup. The WebKit project provides the iPad user agent and touch
  // capabilities; this makes its physical orientation explicit as well.
  await page.addInitScript(() => {
    try {
      Object.defineProperty(window.screen, "orientation", {
        configurable: true,
        value: { type: "landscape-primary", angle: 90 },
      });
    } catch (_error) {}
    try {
      Object.defineProperty(window, "orientation", {
        configurable: true,
        value: 90,
      });
    } catch (_error) {}
    // Desktop WebKit can implement the Fullscreen API even though iPad Safari
    // cannot offer it to a page. Exercise the actual iPad fallback/guide path.
    try {
      Object.defineProperty(document, "fullscreenEnabled", {
        configurable: true,
        value: false,
      });
    } catch (_error) {}
  });
  await page.setViewportSize(M1_IPAD_LANDSCAPE);
}

async function seedPlayerPlaybook(page) {
  await page.evaluate((fixture) => {
    plays = fixture.map((play) => ({ ...play }));
    filteredPlays = plays.slice();
    currentPage = 0;
    if (typeof invalidateFilterCache === "function") invalidateFilterCache();
    if (typeof populateFilters === "function") populateFilters();
    if (typeof renderPlaybook === "function") renderPlaybook();
  }, PLAYER_PLAYBOOK_FIXTURE);
  await expect(page.locator("#playerPlaybookSummary")).toBeVisible();
  await expect(page.locator("#playbook .pb-card-action--ask").first()).toBeVisible();
}

async function expectM1PlayerTabletShell(page) {
  await expect.poll(() => page.evaluate(() => ({
    role: document.body.dataset.authRole,
    profile: document.body.dataset.layoutProfile,
    tablet: document.body.classList.contains("shell-tablet"),
    player: document.body.classList.contains("is-player-mobile-shell"),
  }))).toEqual({
    role: "player",
    profile: "tablet-landscape",
    tablet: true,
    player: true,
  });
}

test.describe("Player M1 iPad study surfaces", () => {
  test("Playbook removes the fixed Actions overlay while Filters, Present, and Ask stay directly usable", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "ipad-landscape",
      "This regression requires the touch-enabled WebKit iPad landscape project.",
    );

    await configureM1IpadSafari(page);
    await login(page, { role: "player", username: "player", password: "password" });
    await dismissFirstUse(page);
    await expectM1PlayerTabletShell(page);
    await goToTab(page, "playbook");
    await seedPlayerPlaybook(page);

    const pageActions = page.locator("#pageFabCluster");
    await expect(pageActions).toBeHidden();

    const playbookGeometry = await page.evaluate(() => {
      const rect = (element) => {
        if (!element) return null;
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden" || box.width <= 0 || box.height <= 0) {
          return null;
        }
        return {
          left: box.left,
          top: box.top,
          right: box.right,
          bottom: box.bottom,
          width: box.width,
          height: box.height,
        };
      };
      const askButton = document.querySelector("#playbook .pb-card-action--ask");
      // Diagram readiness intentionally re-renders the card list. Keep the
      // scroll and geometry read in one document turn so the test never holds a
      // stale card handle while that non-visual status refresh settles.
      askButton?.scrollIntoView({ block: "center", inline: "nearest" });
      const askRect = rect(askButton);
      return {
        actions: rect(document.getElementById("pageActionsFab")),
        ask: askRect,
        askEnabled: Boolean(askButton && !askButton.disabled),
        askAction: askButton?.dataset.action || "",
        viewportHeight: window.innerHeight,
      };
    });
    expect(playbookGeometry.actions).toBeNull();
    expect(playbookGeometry.ask).not.toBeNull();
    expect(playbookGeometry.askEnabled).toBe(true);
    expect(playbookGeometry.askAction).toBe("askCoachAboutPlay");
    expect(playbookGeometry.ask?.width || 0, "Ask remains touch-safe").toBeGreaterThanOrEqual(44);
    expect(playbookGeometry.ask?.height || 0, "Ask remains touch-safe").toBeGreaterThanOrEqual(44);
    expect(playbookGeometry.ask?.top || 0, "Ask scrolls into the unobstructed viewport").toBeGreaterThanOrEqual(0);
    expect(playbookGeometry.ask?.bottom || 0, "Ask scrolls into the unobstructed viewport").toBeLessThanOrEqual(
      playbookGeometry.viewportHeight,
    );

    const summary = page.locator("#playerPlaybookSummary");
    const filters = summary.getByRole("button", { name: "Filters", exact: true });
    const present = summary.getByRole("button", { name: "Present Showing", exact: true });
    await expect(filters).toBeVisible();
    await expect(present).toBeVisible();
    const actionRects = await page.locator("#playerPlaybookSummary .pb-player-summary__actions .btn").evaluateAll((buttons) =>
      buttons.map((button) => {
        const box = button.getBoundingClientRect();
        return { label: button.textContent?.trim() || "", width: box.width, height: box.height };
      }),
    );
    for (const action of actionRects) {
      expect(action.width, `${action.label} action width`).toBeGreaterThanOrEqual(44);
      expect(action.height, `${action.label} action height`).toBeGreaterThanOrEqual(44);
    }

    await filters.click();
    const filterOverlay = page.locator("#playerPlaybookFilterOverlay");
    await expect(filterOverlay).toBeVisible();
    await expect(filterOverlay.getByRole("button", { name: "Clear Filters", exact: true })).toBeVisible();
    await expect(filterOverlay.locator("#playerPlaybookFilterApply")).toContainText(/Show 3 plays/i);
    await filterOverlay.getByRole("button", { name: /Close filters/i }).click();
    await expect(filterOverlay).toHaveCount(0);

    // Present Showing remains a direct, unobstructed study action; its open
    // state is also the player Safari presentation-policy regression below.
    await present.click();
    const presentation = page.locator("#playPresentationOverlay");
    await expect(presentation).toBeVisible();
    await expect(presentation).toHaveAttribute("data-presentation-open", "true");
    await expect(page.locator("#playPresentationIpadHelp")).toBeHidden();
    await expect(page.locator("#playPresentationProjectorPrompt")).toBeHidden();

    const fullscreenGuide = page.locator("#playPresentationFullscreenBtn");
    await expect(fullscreenGuide).toBeVisible();
    await expect(fullscreenGuide).toHaveAttribute("aria-label", "How to go Full Screen on iPad");
    await fullscreenGuide.click();
    await expect(page.locator("#playPresentationIpadHelp")).toBeVisible();
    await page.locator("#playPresentationIpadHelp").getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.locator("#playPresentationIpadHelp")).toBeHidden();
    await expect(presentation).toBeVisible();

    await presentation.locator("#playPresentationClose").click();
    await expect(presentation).toBeHidden();
    await assertNoHorizontalOverflow(page);
  });

  test("Signals keeps the player study header compact with its metrics on one line", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "ipad-landscape",
      "This regression requires the touch-enabled WebKit iPad landscape project.",
    );

    await configureM1IpadSafari(page);
    await login(page, { role: "player", username: "player", password: "password" });
    await dismissFirstUse(page);
    await expectM1PlayerTabletShell(page);
    await goToTab(page, "signals");
    await expect(page.locator("#signals .signals-header")).toBeVisible();

    const signalGeometry = await page.evaluate(() => {
      const read = (element) => {
        const box = element.getBoundingClientRect();
        return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
      };
      const header = document.querySelector("#signals .signals-header");
      const stats = Array.from(document.querySelectorAll("#signals .signals-stats .signals-stat"));
      const statRects = stats.map(read);
      const headerRect = header ? read(header) : null;
      return {
        header: headerRect,
        stats: statRects,
        statsGrid: getComputedStyle(document.querySelector("#signals .signals-stats")).gridTemplateColumns,
        statsWithinHeader: Boolean(headerRect && statRects.every((stat) =>
          stat.left >= headerRect.left && stat.right <= headerRect.right && stat.top >= headerRect.top && stat.bottom <= headerRect.bottom,
        )),
      };
    });
    expect(signalGeometry.header).not.toBeNull();
    expect(signalGeometry.header?.height || 0).toBeLessThan(130);
    expect(signalGeometry.stats).toHaveLength(3);
    expect(signalGeometry.statsWithinHeader).toBe(true);
    const statTops = signalGeometry.stats.map((stat) => stat.top);
    expect(Math.max(...statTops) - Math.min(...statTops), "player metrics share one horizontal row").toBeLessThanOrEqual(1);
    signalGeometry.stats.forEach((stat, index) => {
      expect(stat.width, `metric ${index + 1} has readable width`).toBeGreaterThanOrEqual(72);
      expect(stat.height, `metric ${index + 1} has a compact readable height`).toBeGreaterThanOrEqual(50);
    });
    expect(signalGeometry.statsGrid.trim().split(/\s+/)).toHaveLength(3);
    await assertNoHorizontalOverflow(page);
  });

  test("coach retains the existing first-use iPad projector guidance", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "ipad-landscape",
      "This regression requires the touch-enabled WebKit iPad landscape project.",
    );

    await configureM1IpadSafari(page);
    await login(page, { role: "coach", username: "coach", password: "password" });
    await dismissFirstUse(page);
    await goToTab(page, "playbook");
    await page.evaluate((fixture) => {
      plays = fixture.map((play) => ({ ...play }));
      filteredPlays = plays.slice();
      currentPage = 0;
      if (typeof invalidateFilterCache === "function") invalidateFilterCache();
      if (typeof populateFilters === "function") populateFilters();
      if (typeof renderPlaybook === "function") renderPlaybook();
      openSelectedPlaybookPresentation();
    }, PLAYER_PLAYBOOK_FIXTURE);

    await expect(page.locator("#playPresentationOverlay")).toBeVisible();
    const help = page.locator("#playPresentationIpadHelp");
    await expect(help).toBeVisible();
    await help.getByRole("button", { name: "Got it", exact: true }).click();
    await expect(help).toBeHidden();
    await expect(page.locator("#playPresentationProjectorPrompt")).toBeVisible();
  });
});
