// @ts-check
/**
 * Game Plan constrained-landscape tablet workbench contract.
 *
 * Staff iPads keep a compact source rail alongside a genuinely usable board.
 * Portrait intentionally retains the existing document stack.
 */
const { test, expect } = require("@playwright/test");
const {
  login,
  dismissFirstUse,
  goToTab,
  assertNoHorizontalOverflow,
} = require("./helpers");

const TABLET_LANDSCAPE_VIEWPORTS = [
  { width: 1024, height: 768 },
  { width: 1366, height: 768 },
];

const GAMEPLAN_FIXTURE_PLAYS = Array.from({ length: 72 }, (_, index) => ({
  id: `gameplan-tablet-${index + 1}`,
  type: ["Run", "Pass", "Screen", "Quick", "Play Action", "RPO", "Movement"][index % 7],
  personnel: ["10", "11", "12", "20"][index % 4],
  formation: ["Trips", "Doubles", "Bunch", "Empty"][index % 4],
  play: `Tablet Board Call ${index + 1}`,
  basePlay: ["Buck", "Verts", "Bubble", "Counter"][index % 4],
  motion: index % 3 === 0 ? "Jet" : "",
  protection: "Slide",
  tempo: index % 2 ? "Fast" : "Normal",
  preferredDown: String((index % 3) + 1),
  preferredDistance: ["Short", "Medium", "Long"][index % 3],
}));

async function seedBusyGamePlan(page) {
  await page.evaluate((samplePlays) => {
    plays = samplePlays.map((play) => ({ ...play }));
    filteredPlays = plays.slice();
    if (typeof setGameWeek === "function") {
      setGameWeek({ opponentName: "Tablet City", weekLabel: "Camp" });
    }

    const board = _gpCreateEmptyBoard();
    board.sheetTitle = "Tablet Install";
    board.assignments = { [GP_HOLDING_ID]: [] };
    GP_DEFAULT_BOXES.forEach((box) => {
      board.assignments[box.id] = [];
    });
    board.customBoxes = Array.from({ length: 4 }, (_, index) => ({
      id: `Tablet Custom ${index + 1}`,
      label: `Tablet Custom ${index + 1}`,
    }));
    board.customBoxes.forEach((box) => {
      board.assignments[box.id] = [];
    });

    const destinations = [...GP_DEFAULT_BOXES, ...board.customBoxes];
    plays.forEach((play, index) => {
      const destination = destinations[index % destinations.length];
      board.assignments[destination.id].push({ ...play });
    });
    board.targets = Object.fromEntries(destinations.map((box) => [box.id, 8]));
    board.collapsed = [];
    const boards = { [_gpActiveOpponentKey()]: board };
    storageManager.set(STORAGE_KEYS.GAME_PLAN_BOARDS, boards);
    _gpOpenBoxMoreId = "";
    if (typeof invalidateFilterCache === "function") invalidateFilterCache();
    if (typeof requestRenderGamePlan === "function") requestRenderGamePlan();
  }, GAMEPLAN_FIXTURE_PLAYS);
}

async function getGamePlanTabletState(page) {
  return page.evaluate(() => {
    const rect = (element) => {
      if (!element) return null;
      const value = element.getBoundingClientRect();
      return {
        top: value.top,
        right: value.right,
        bottom: value.bottom,
        left: value.left,
        width: value.width,
        height: value.height,
      };
    };
    const style = (element) => (element ? getComputedStyle(element) : null);
    const root = document.getElementById("gameplan");
    const boardScroll = root?.querySelector(".gp-board-scroll");
    const layout = root?.querySelector(".gp-layout");
    const library = document.getElementById("gpLibraryPane");
    const libraryList = document.getElementById("gpLibraryList");
    const boxes = document.getElementById("gpBoxes");
    const toggle = document.getElementById("gpLibraryRailToggle");
    const close = document.getElementById("gpLibraryRailClose");
    const cards = Array.from(boxes?.querySelectorAll(":scope > .gp-box:not(.gp-box-holding)") || []);
    const firstCard = cards[0] || null;
    const more = firstCard?.querySelector(".gp-box-more-toggle") || null;
    const desktopActions = firstCard?.querySelector(".gp-box-header > .gp-box-actions:not(.gp-box-tablet-actions)") || null;
    const tabletActions = firstCard?.querySelector(".gp-box-tablet-actions") || null;

    return {
      bodyClass: document.body.className,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      rootClass: root?.className || "",
      layout: rect(layout),
      library: rect(library),
      libraryList: rect(libraryList),
      boxes: rect(boxes),
      boardScroll: rect(boardScroll),
      cards: cards.map(rect),
      toggle: rect(toggle),
      close: rect(close),
      more: rect(more),
      display: {
        library: style(library)?.display || "",
        toggle: style(toggle)?.display || "",
        desktopActions: style(desktopActions)?.display || "",
        tabletActions: style(tabletActions)?.display || "",
      },
      overflow: {
        boardScroll: style(boardScroll)?.overflowY || "",
        libraryList: style(libraryList)?.overflowY || "",
        boxes: style(boxes)?.overflowY || "",
      },
      scroll: {
        libraryClient: libraryList?.clientHeight || 0,
        libraryHeight: libraryList?.scrollHeight || 0,
        boxesClient: boxes?.clientHeight || 0,
        boxesHeight: boxes?.scrollHeight || 0,
      },
      aria: {
        paneHidden: library?.getAttribute("aria-hidden") || "",
        toggleExpanded: toggle?.getAttribute("aria-expanded") || "",
      },
      grid: {
        layout: style(layout)?.gridTemplateColumns || "",
        boxes: style(boxes)?.gridTemplateColumns || "",
      },
    };
  });
}

function assertLandscapeWorkbench(state, viewportWidth) {
  expect(state.bodyClass).toContain("shell-tablet");
  expect(state.bodyClass).toContain("is-landscape-screen");
  expect(state.bodyClass).toContain("is-staff-mobile-shell");
  expect(state.viewport.width).toBe(viewportWidth);
  expect(state.display.library).toBe("flex");
  expect(state.display.toggle).not.toBe("none");
  expect(state.display.desktopActions).toBe("none");
  expect(state.display.tabletActions).toBe("flex");
  expect(state.library?.width || 0).toBeGreaterThanOrEqual(240);
  expect(state.library?.width || 0).toBeLessThanOrEqual(281);
  expect(state.boxes?.left || 0).toBeGreaterThanOrEqual((state.library?.right || 0) - 1);
  expect(state.toggle?.width || 0).toBeGreaterThanOrEqual(44);
  expect(state.toggle?.height || 0).toBeGreaterThanOrEqual(44);
  expect(state.close?.width || 0).toBeGreaterThanOrEqual(44);
  expect(state.close?.height || 0).toBeGreaterThanOrEqual(44);
  expect(state.more?.width || 0).toBeGreaterThanOrEqual(44);
  expect(state.more?.height || 0).toBeGreaterThanOrEqual(44);
  expect(state.overflow.boardScroll).toBe("hidden");
  expect(state.overflow.libraryList).toBe("auto");
  expect(state.overflow.boxes).toBe("auto");
  expect(state.aria.paneHidden).toBe("false");
  expect(state.aria.toggleExpanded).toBe("true");
  expect(state.cards.length).toBeGreaterThanOrEqual(4);
  expect(Math.min(...state.cards.map((card) => card?.width || 0))).toBeGreaterThanOrEqual(300);
  const [firstCard, secondCard] = state.cards;
  expect(Math.abs((firstCard?.top || 0) - (secondCard?.top || 0))).toBeLessThanOrEqual(2);
  expect(firstCard?.right || 0).toBeLessThanOrEqual((secondCard?.left || 0) + 2);
}

test.describe("Game Plan tablet landscape rail", () => {
  test("coach keeps a collapsible 240–280px library rail and two usable board columns at 1024 and 1366", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "ipad-landscape",
      "This contract requires the touch-enabled iPad landscape project.",
    );

    await login(page, { role: "coach", username: "coach" });
    await dismissFirstUse(page);

    for (const viewport of TABLET_LANDSCAPE_VIEWPORTS) {
      await page.setViewportSize(viewport);
      await seedBusyGamePlan(page);
      await goToTab(page, "gameplan");
      await expect(page.locator("#gpLibraryList .gp-play-row").first()).toBeVisible();
      await expect(page.locator("#gpBoxes > .gp-box:not(.gp-box-holding)").first()).toBeVisible();

      const openState = await getGamePlanTabletState(page);
      assertLandscapeWorkbench(openState, viewport.width);
      expect(openState.scroll.libraryHeight).toBeGreaterThan(openState.scroll.libraryClient);
      expect(openState.scroll.boxesHeight).toBeGreaterThan(openState.scroll.boxesClient);

      const deliberateScroll = await page.evaluate(() => {
        const libraryList = document.getElementById("gpLibraryList");
        const boxes = document.getElementById("gpBoxes");
        if (libraryList) libraryList.scrollTop = 160;
        if (boxes) boxes.scrollTop = 160;
        return {
          library: libraryList?.scrollTop || 0,
          boxes: boxes?.scrollTop || 0,
          panel: document.getElementById("gameplan")?.scrollTop || 0,
        };
      });
      expect(deliberateScroll.library).toBeGreaterThan(0);
      expect(deliberateScroll.boxes).toBeGreaterThan(0);
      expect(deliberateScroll.panel).toBe(0);

      await page.evaluate(() => {
        const boxes = document.getElementById("gpBoxes");
        if (boxes) boxes.scrollTop = 0;
      });

      const firstBox = page.locator("#gpBoxes > .gp-box:not(.gp-box-holding)").first();
      const more = firstBox.locator(".gp-box-more-toggle");
      await more.click();
      const moreMenu = firstBox.locator(".gp-box-more-menu");
      await expect(moreMenu).toBeVisible();
      const menuTargets = await moreMenu.locator("button, select").evaluateAll((elements) =>
        elements.map((element) => {
          const rect = element.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        }),
      );
      expect(menuTargets.length).toBeGreaterThanOrEqual(6);
      menuTargets.forEach((target) => {
        expect(target.width).toBeGreaterThanOrEqual(44);
        expect(target.height).toBeGreaterThanOrEqual(44);
      });
      await page.keyboard.press("Escape");
      await expect(moreMenu).toBeHidden();

      const firstPlay = firstBox.locator(".gp-box-play").first();
      const playActions = firstPlay.locator(".gp-box-play-actions");
      const rowMenu = playActions.locator(".gp-box-play-tablet-menu");
      await expect(rowMenu).toBeVisible();
      const rowMenuRect = await rowMenu.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      });
      expect(rowMenuRect.width).toBeGreaterThanOrEqual(44);
      expect(rowMenuRect.height).toBeGreaterThanOrEqual(44);
      await expect(playActions.locator(".gp-box-play-flag").first()).toBeHidden();
      await expect(playActions.locator(".gp-box-play-up")).toBeHidden();

      await rowMenu.click();
      const playMenu = page.locator(".gp-play-context-menu");
      await expect(playMenu).toBeVisible();
      await expect(playMenu).toContainText("Mark for wristband");
      await expect(playMenu).toContainText("Mark as JV / freshmen");
      const playMenuTargets = await playMenu.locator("button").evaluateAll((elements) =>
        elements.map((element) => {
          const rect = element.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        }),
      );
      playMenuTargets.forEach((target) => {
        expect(target.height).toBeGreaterThanOrEqual(44);
      });
      await playMenu.getByText("Mark for wristband").click();
      await expect(firstPlay).toHaveClass(/gp-flag-wb/);

      const railClose = page.locator("#gpLibraryRailClose");
      await railClose.click();
      await expect(page.locator("#gameplan")).toHaveClass(/gp-library-collapsed/);
      await expect(page.locator("#gpLibraryPane")).toBeHidden();
      await expect(page.locator("#gpLibraryRailToggle")).toHaveAttribute("aria-expanded", "false");
      await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe("gpLibraryRailToggle");
      const collapsedBoxesWidth = await page.locator("#gpBoxes").evaluate((element) => element.getBoundingClientRect().width);
      expect(collapsedBoxesWidth).toBeGreaterThan((openState.boxes?.width || 0) + 180);

      await page.locator("#gpLibraryRailToggle").click();
      await expect(page.locator("#gpLibraryPane")).toBeVisible();
      await expect(page.locator("#gpLibraryRailToggle")).toHaveAttribute("aria-expanded", "true");
      await assertNoHorizontalOverflow(page);
    }
  });

  test("coach portrait retains the existing stacked Game Plan document layout", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "ipad-portrait",
      "This contract requires the touch-enabled iPad portrait project.",
    );

    await login(page, { role: "coach", username: "coach" });
    await dismissFirstUse(page);
    await seedBusyGamePlan(page);
    await goToTab(page, "gameplan");
    await expect(page.locator("#gpLibraryList .gp-play-row").first()).toBeVisible();

    const state = await getGamePlanTabletState(page);
    expect(state.bodyClass).toContain("shell-tablet");
    expect(state.bodyClass).toContain("is-portrait-screen");
    expect(state.bodyClass).not.toContain("is-landscape-screen");
    expect(state.display.toggle).toBe("none");
    expect(state.display.tabletActions).toBe("none");
    await expect(page.locator(".gp-box-play-tablet-menu").first()).toBeHidden();
    expect(state.library?.top || 0).toBeLessThan(state.boxes?.top || 0);
    await assertNoHorizontalOverflow(page);
  });
});
