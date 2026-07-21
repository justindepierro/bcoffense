// @ts-check
/**
 * Header, app chrome, and toolbar professionalization checks.
 *
 * These tests intentionally seed a tiny in-memory playbook so they can run
 * against a local static server without production data.
 */
const { test, expect } = require("@playwright/test");
const { login, goToTab, dismissFirstUse, assertNoHorizontalOverflow } = require("./helpers");

const SAMPLE_PLAYS = [
  {
    type: "Run",
    personnel: "11",
    formation: "Trips",
    play: "Buck Sweep",
    basePlay: "Buck",
    motion: "Jet",
    protection: "Slide",
    tempo: "Fast",
    preferredDown: "1",
    preferredDistance: "Medium",
  },
  {
    type: "Pass",
    personnel: "10",
    formation: "Doubles",
    play: "Four Verts",
    basePlay: "Verts",
    motion: "",
    protection: "Half Slide",
    tempo: "NASCAR",
    preferredDown: "2",
    preferredDistance: "Long",
  },
  {
    type: "Screen",
    personnel: "11",
    formation: "Trips",
    play: "Bubble",
    basePlay: "Bubble",
    motion: "Orbit",
    protection: "Quick",
    tempo: "Fast",
    preferredDown: "3",
    preferredDistance: "Short",
  },
];

const BUSY_GAME_PLAN_PLAYS = Array.from({ length: 72 }, (_, index) => {
  const types = ["Run", "Pass", "Screen", "Quick", "Play Action", "RPO", "Run Option", "Movement"];
  const formations = ["Trips", "Doubles", "Bunch", "Empty", "Pro", "Navy Rt"];
  const downs = ["1", "2", "3", "3", "3", "4"];
  const distances = ["Short", "Medium", "Long"];
  const fieldPositions = ["Green", "Lo-RZ", "Hi-RZ", "Goal Line", "Backed Up"];
  const situations = ["", "2 Minute", "4 Minute", "Short Yardage"];
  return {
    type: types[index % types.length],
    personnel: String([10, 11, 12, 20, 21][index % 5]),
    formation: formations[index % formations.length],
    play: `${["Buck", "Verts", "Bubble", "Stick", "Boot", "Zone Read", "Counter", "Hack"][index % 8]} ${index + 1}`,
    basePlay: ["Buck", "Verts", "Bubble", "Stick", "Boot", "Zone", "Counter", "Hack"][index % 8],
    preferredDown: downs[index % downs.length],
    preferredDistance: distances[index % distances.length],
    preferredFieldPosition: fieldPositions[index % fieldPositions.length],
    preferredSituation: situations[index % situations.length],
    keyPlayerName1: ["Marco", "Lucas", "Lebron", "Ali", "Warren", "Michael"][index % 6],
  };
});

async function seedTinyPlaybook(page) {
  await page.evaluate((samplePlays) => {
    if (typeof plays === "undefined") return;
    plays = samplePlays.map((play) => ({ ...play }));
    filteredPlays = plays.slice();
    if (typeof invalidateFilterCache === "function") invalidateFilterCache();
    if (typeof populateFilters === "function") populateFilters();
    if (typeof filterPlays === "function") filterPlays();
    if (typeof setWorkspaceSurface === "function") {
      setWorkspaceSurface("app", { initModules: true });
    } else if (typeof backToApp === "function") {
      backToApp();
    }
    if (typeof requestRenderGamePlan === "function") requestRenderGamePlan();
    if (typeof requestRenderPlaybook === "function") requestRenderPlaybook();
  }, SAMPLE_PLAYS);
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const mainApp = document.getElementById("mainApp");
          return Boolean(
            mainApp &&
              !mainApp.classList.contains("hidden") &&
              !document.body.classList.contains("auth-locked")
          );
        }),
      { timeout: 5_000 }
    )
    .toBe(true);
}

async function seedBusyGamePlan(page) {
  await page.evaluate((samplePlays) => {
    if (typeof plays === "undefined") return;
    plays = samplePlays.map((play) => ({ ...play }));
    filteredPlays = plays.slice();
    if (typeof setWorkspaceSurface === "function") {
      setWorkspaceSurface("app", { initModules: true });
    }
    if (typeof setGameWeek === "function") {
      setGameWeek({ opponentName: "Monticello", weekLabel: "Camp" });
    }
    const assignments = { [GP_HOLDING_ID]: [] };
    GP_DEFAULT_BOXES.forEach((box) => {
      assignments[box.id] = [];
    });
    plays.forEach((play, index) => {
      const boxId = index < 4
        ? GP_HOLDING_ID
        : (GP_DEFAULT_BOXES[index % GP_DEFAULT_BOXES.length]?.id || "Run");
      assignments[boxId].push({ ...play });
    });
    const board = _gpCreateEmptyBoard();
    board.assignments = assignments;
    board.targets = {
      Run: 8,
      Pass: 8,
      Screen: 6,
      Quick: 6,
      "Play Action": 6,
      RPO: 6,
      "Run Option": 4,
      Movement: 4,
    };
    board.sheetTitle = "Camp";
    const allBoards = {};
    allBoards[_gpActiveOpponentKey()] = board;
    storageManager.set(STORAGE_KEYS.GAME_PLAN_BOARDS, allBoards);
    if (typeof requestRenderGamePlan === "function") requestRenderGamePlan();
  }, BUSY_GAME_PLAN_PLAYS);
}

async function assertAppChromeTopLayer(page) {
  const result = await page.evaluate(() => {
    const header = document.querySelector(".app-header");
    const tabs = document.querySelector("#mainApp .tabs");
    const topAtCenter = (element) => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      const x = Math.max(1, Math.min(window.innerWidth - 2, rect.left + rect.width / 2));
      const y = Math.max(1, Math.min(window.innerHeight - 2, rect.top + rect.height / 2));
      const top = document.elementFromPoint(x, y);
      return {
        tag: top?.tagName || "",
        id: top?.id || "",
        className: String(top?.className || ""),
        insideTarget: Boolean(top && (top === element || element.contains(top))),
      };
    };
    return {
      header: topAtCenter(header),
      tabs: topAtCenter(tabs),
      z: {
        header: getComputedStyle(document.documentElement).getPropertyValue("--z-header").trim(),
        tabBar: getComputedStyle(document.documentElement).getPropertyValue("--z-tab-bar").trim(),
        drawer: getComputedStyle(document.documentElement).getPropertyValue("--z-drawer").trim(),
      },
    };
  });

  expect(result.z.header).toBe("9210");
  expect(result.z.tabBar).toBe("9200");
  expect(result.z.drawer).toBe("3000");
  expect(result.header?.insideTarget, `Header covered by ${JSON.stringify(result.header)}`).toBe(true);
  expect(result.tabs?.insideTarget, `Tabs covered by ${JSON.stringify(result.tabs)}`).toBe(true);
}

test.describe("Header and toolbar contract", () => {
  test("app chrome remains above panel drawers", async ({ page }) => {
    await login(page, { role: "coach", username: "coach" });
    await dismissFirstUse(page);
    await seedTinyPlaybook(page);
    await goToTab(page, "playbook");

    await page.locator("#pbFilterToggleBtn").click();
    await expect(page.locator("#playbook")).toHaveClass(/pb-filter-open/);
    await assertAppChromeTopLayer(page);
    await assertNoHorizontalOverflow(page);
  });

  test("game plan command bar uses the shared header/toolbar pattern", async ({ page }) => {
    await login(page, { role: "coach", username: "coach" });
    await dismissFirstUse(page);
    await seedTinyPlaybook(page);
    await seedBusyGamePlan(page);
    await goToTab(page, "gameplan");

    const commandBar = page.locator(".gp-cmd-bar");
    await expect(commandBar).toBeVisible();
    await expect(commandBar).toHaveClass(/page-header-surface/);
    await expect(page.locator(".gp-cmd-main")).toHaveClass(/page-header-row/);
    await expect(page.locator(".gp-cmd-actions")).toHaveClass(/toolbar-secondary/);

    for (const label of ["Filters", "Build Plan", "Print", "Actions"]) {
      await expect(commandBar.getByRole("button", { name: new RegExp(label, "i") })).toBeVisible();
    }

    await page.getByRole("button", { name: /Filters/i }).click();
    const filterToolbar = page.locator(".gp-toolbar");
    await expect(filterToolbar).toBeVisible();
    await expect(filterToolbar).toHaveClass(/toolbar-surface--compact/);

    const spacing = await page.evaluate(() => {
      const tabs = document.querySelector("#mainApp .tabs")?.getBoundingClientRect();
      const gameWeek = document.querySelector(".gw-bar:not([hidden])")?.getBoundingClientRect();
      const panel = document.querySelector("#gameplan.panel.active")?.getBoundingClientRect();
      const bar = document.querySelector(".gp-cmd-bar")?.getBoundingClientRect();
      return tabs && panel && bar
        ? {
          tabsBottom: tabs.bottom,
          anchorBottom: gameWeek?.bottom || tabs.bottom,
          panelTop: panel.top,
          barTop: bar.top,
        }
        : null;
    });
    expect(spacing).not.toBeNull();
    expect(spacing.panelTop).toBeGreaterThanOrEqual(spacing.tabsBottom);
    expect(spacing.panelTop - spacing.anchorBottom).toBeLessThanOrEqual(36);
    expect(spacing.barTop).toBeGreaterThanOrEqual(spacing.tabsBottom - 1);

    const statsLayout = await page.evaluate(() => {
      const stats = document.querySelector(".gp-stats-bar");
      const children = Array.from(document.querySelectorAll(".gp-stats-bar > *"));
      const centers = children.map((el) => {
        const rect = el.getBoundingClientRect();
        return Math.round(rect.top + rect.height / 2);
      });
      return {
        centerSpread: centers.length ? Math.max(...centers) - Math.min(...centers) : 0,
        height: Math.round(stats?.getBoundingClientRect().height || 0),
        overflow: document.body.scrollWidth > window.innerWidth,
      };
    });
    expect(statsLayout.centerSpread).toBeLessThanOrEqual(8);
    // 44px controls plus compact vertical padding should still stay in one row.
    expect(statsLayout.height).toBeLessThanOrEqual(64);
    expect(statsLayout.overflow).toBe(false);
    await assertAppChromeTopLayer(page);
    await assertNoHorizontalOverflow(page);
  });

  test("wristband command bar uses the shared header/toolbar pattern", async ({ page }) => {
    await login(page, { role: "coach", username: "coach" });
    await dismissFirstUse(page);
    await seedTinyPlaybook(page);
    await goToTab(page, "wristband");

    const classicChoice = page.getByRole("button", { name: /Classic Wristband/i });
    if (await classicChoice.isVisible().catch(() => false)) {
      await classicChoice.click();
      await expect(page.locator("#wbTypeChoice")).toHaveClass(/hidden/);
    }

    await expect(page.locator(".wb-page-header")).toHaveClass(/page-header-surface/);
    await expect(page.locator(".wb-page-header-row")).toHaveClass(/page-header-row/);

    const commandBar = page.locator(".wb-cmd-bar");
    await expect(commandBar).toBeVisible();
    await expect(commandBar).toHaveClass(/page-header-surface/);
    await expect(page.locator(".wb-cmd-main")).toHaveClass(/page-header-row/);
    await expect(page.locator(".wb-cmd-identity")).toHaveClass(/toolbar-status/);
    await expect(page.locator(".wb-cmd-actions")).toHaveClass(/toolbar-secondary/);

    for (const label of ["Colors", "Library", "Actions", "Save"]) {
      await expect(commandBar.getByRole("button", { name: new RegExp(label, "i") })).toBeVisible();
    }

    await assertAppChromeTopLayer(page);
    await assertNoHorizontalOverflow(page);

    await commandBar.getByRole("button", { name: /Actions/i }).click();
    await expect(page.locator("#pageActionsSheet")).toBeVisible();
    await expect(page.locator("#pageActionsSheet").getByRole("button", { name: /Display Options/i })).toBeVisible();
  });

  test("player playbook shows study actions and hides staff tools", async ({ page }) => {
    await login(page, { role: "player", username: "player" });
    await dismissFirstUse(page);
    await seedTinyPlaybook(page);
    await goToTab(page, "playbook");

    await expect(page.getByRole("button", { name: /^Filters$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Present Showing/i })).toBeVisible();
    await expect(page.locator(".pb-player-summary__filter-pill", { hasText: "Game Plan" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Add Play/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Data/i })).toHaveCount(0);
    await assertAppChromeTopLayer(page);

    await page.getByRole("button", { name: /^Filters$/i }).click();
    const filterModal = page.locator("#playerPlaybookFilterOverlay");
    await expect(filterModal).toBeVisible();
    await expect(filterModal.locator('[data-filter-group="gamePlan"]')).toBeVisible();
    await expect(filterModal.getByRole("button", { name: /Current Game Plan/i })).toBeVisible();
  });

  test("player leaderboard keeps the tab bar fully visible", async ({ page }) => {
    await login(page, { role: "player", username: "player" });
    await dismissFirstUse(page);
    await seedTinyPlaybook(page);
    await goToTab(page, "leaderboard");

    const layout = await page.evaluate(() => {
      const tabs = document.querySelector("#mainApp .tabs")?.getBoundingClientRect();
      const tab = document.getElementById("tab-leaderboard")?.getBoundingClientRect();
      const panel = document.querySelector("#leaderboard.panel.active")?.getBoundingClientRect();
      const tabEl = document.getElementById("tab-leaderboard");
      const cx = tab ? Math.round(tab.left + tab.width / 2) : 0;
      const cy = tab ? Math.round(tab.top + tab.height / 2) : 0;
      const top = document.elementFromPoint(cx, cy);
      return tabs && tab && panel
        ? {
          tabsHeight: Math.round(tabs.height),
          tabsBottom: Math.round(tabs.bottom),
          tabHeight: Math.round(tab.height),
          tabBottom: Math.round(tab.bottom),
          panelTop: Math.round(panel.top),
          topIsTab: Boolean(top && tabEl && (top === tabEl || tabEl.contains(top))),
          overflow: document.body.scrollWidth > window.innerWidth,
        }
        : null;
    });

    expect(layout).not.toBeNull();
    expect(layout.tabsHeight).toBeGreaterThanOrEqual(58);
    expect(layout.tabHeight).toBeGreaterThanOrEqual(40);
    expect(layout.tabBottom).toBeLessThanOrEqual(layout.panelTop - 1);
    expect(layout.tabsBottom).toBeLessThanOrEqual(layout.panelTop - 1);
    expect(layout.topIsTab).toBe(true);
    expect(layout.overflow).toBe(false);
  });

  test("call sheet game plan drawer launcher is inset and readable", async ({ page }) => {
    await login(page, { role: "coach", username: "coach" });
    await dismissFirstUse(page);
    await seedTinyPlaybook(page);
    await seedBusyGamePlan(page);
    await goToTab(page, "callsheet");

    const launcher = page.locator("#gpDrawerToggleBtn");
    await expect(launcher).toBeVisible();

    const layout = await page.evaluate(() => {
      const btn = document.getElementById("gpDrawerToggleBtn");
      const rect = btn?.getBoundingClientRect();
      if (!btn || !rect) return null;
      const cx = Math.round(rect.left + rect.width / 2);
      const cy = Math.round(rect.top + rect.height / 2);
      const top = document.elementFromPoint(cx, cy);
      return {
        left: Math.round(rect.left),
        rightGap: Math.round(window.innerWidth - rect.right),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        topIsLauncher: Boolean(top && (top === btn || btn.contains(top))),
        overflow: document.body.scrollWidth > window.innerWidth,
      };
    });

    expect(layout).not.toBeNull();
    expect(layout.left).toBeGreaterThanOrEqual(0);
    expect(layout.rightGap).toBeGreaterThanOrEqual(8);
    expect(layout.width).toBeGreaterThanOrEqual(32);
    expect(layout.height).toBeGreaterThanOrEqual(120);
    expect(layout.topIsLauncher).toBe(true);
    expect(layout.overflow).toBe(false);
  });
});

test.describe("Player mobile playbook command surface", () => {
  test.use({
    viewport: { width: 393, height: 852 },
    isMobile: true,
    hasTouch: true,
  });

  test("keeps player actions compact and hides duplicate staff controls", async ({ page }) => {
    await login(page, { role: "player", username: "player" });
    await dismissFirstUse(page);
    await seedTinyPlaybook(page);
    await goToTab(page, "playbook");

    const summary = page.locator("#playerPlaybookSummary");
    await expect(summary).toBeVisible();
    await expect(page.locator("#playbook .pb-controls")).toBeHidden();
    await expect(summary.getByRole("button", { name: /^Filters$/i })).toBeVisible();
    await expect(summary.getByRole("button", { name: /Present Showing/i })).toBeVisible();

    const layout = await page.evaluate(() => {
      const summaryEl = document.getElementById("playerPlaybookSummary");
      const actions = Array.from(document.querySelectorAll(".pb-player-summary__actions .btn"));
      const filters = document.querySelector(".pb-player-summary__filters");
      const stats = document.querySelector(".pb-player-summary__stats");
      return {
        summaryHeight: Math.round(summaryEl?.getBoundingClientRect().height || 0),
        actionRows: new Set(actions.map((btn) => Math.round(btn.getBoundingClientRect().top))).size,
        actionWidths: actions.map((btn) => Math.round(btn.getBoundingClientRect().width)),
        filtersHorizontal: Boolean(filters && filters.scrollWidth > filters.clientWidth),
        statsHorizontal: Boolean(stats && stats.scrollWidth >= stats.clientWidth),
        overflow: document.body.scrollWidth > window.innerWidth,
      };
    });

    expect(layout.summaryHeight).toBeLessThanOrEqual(220);
    expect(layout.actionRows).toBe(1);
    expect(Math.min(...layout.actionWidths)).toBeGreaterThanOrEqual(96);
    expect(layout.filtersHorizontal).toBe(true);
    expect(layout.statsHorizontal).toBe(true);
    expect(layout.overflow).toBe(false);
  });
});
