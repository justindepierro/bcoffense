// @ts-nocheck
/**
 * Local-only first-load hydration checks.
 *
 * Seeds storage, reloads directly into each target tab via LAST_ACTIVE_TAB, and
 * verifies seeded data renders without requiring a manual tab switch.
 */
const { test, expect } = require("@playwright/test");
const {
  login,
  dismissFirstUse,
  installRuntimeErrorGuards,
  resetRuntimeErrorGuards,
  reloadWithExpectedAbort,
  assertRuntimeClean,
} = require("./helpers");

const E2E_LOCAL = process.env.BCOFFENSE_E2E_LOCAL === "1";

const HYDRATION_TABS = [
  {
    tab: "dashboard",
    assert: async (page) => {
      await expect(page.locator("#dashboard.panel.active")).toContainText("Hydration Opponent");
      await expect(page.locator("#dashCommandCenter")).not.toContainText("Restoring dashboard");
    },
  },
  {
    tab: "playbook",
    assert: async (page) => {
      await expect(page.locator("#playbook.panel.active")).toContainText("Hydration Buck");
      await expect(page.locator("#playbookTable tbody tr")).toHaveCount(3);
    },
  },
  {
    tab: "script",
    assert: async (page) => {
      await expect(page.locator("#script.panel.active")).toContainText("Hydration Practice");
      await expect(page.locator("#savedScriptsList")).toContainText("Hydration Practice");
      await expect(page.locator("#scriptPlays")).toContainText("Add plays from the left panel");
      await expect(page.locator("#scriptPlays")).not.toContainText("Legacy Hydration Draft");
    },
  },
  {
    tab: "gameplan",
    assert: async (page) => {
      await expect(page.locator("#gameplan.panel.active")).toContainText("Hydration Buck");
      await expect(page.locator("#gameplan.panel.active")).toContainText("Hydration Opponent");
    },
  },
  {
    tab: "callsheet",
    assert: async (page) => {
      await expect(page.locator("#callsheet.panel.active")).toContainText("Hydration Buck");
      await expect(page.locator("#callsheet.panel.active")).toContainText("Hydration Stick");
    },
  },
];

test.describe("Local first-load hydration", () => {
  test.skip(!E2E_LOCAL, "First-load hydration tests require the local E2E server.");

  test.beforeEach(async ({ page }) => {
    await installRuntimeErrorGuards(page);
    await login(page, { role: "admin" });
    await dismissFirstUse(page);
  });

  for (const target of HYDRATION_TABS) {
    test(`${target.tab} renders seeded data on first load`, async ({ page }) => {
      await seedHydrationFixture(page, target.tab);
      await resetRuntimeErrorGuards(page);
      // The previous Dashboard render schedules a non-critical summary fetch.
      // If it starts in the same turn as this intentional reload, Chromium
      // correctly cancels it before the local server receives it. Scope that
      // one known prior-document cancellation to this reload only.
      await reloadWithExpectedAbort(page, ["/api/questions?summary=1"], {
        waitUntil: "domcontentloaded",
      });
      await waitForHydratedTab(page, target.tab);
      await target.assert(page);
      await assertRuntimeClean(page, { maxMainFrameNavigations: 1 });
    });
  }
});

async function waitForHydratedTab(page, tabName) {
  await expect(page.locator("#mainApp")).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(
      () =>
        page.evaluate((targetTab) => ({
          role: document.body?.dataset.authRole || "",
          activeTab: document.body?.dataset.activeTab || "",
          mainHidden: document.getElementById("mainApp")?.classList.contains("hidden") ?? true,
          panelActive: document.getElementById(targetTab)?.classList.contains("active") ?? false,
        }), tabName),
      { timeout: 15_000 },
    )
    .toMatchObject({
      role: "admin",
      activeTab: tabName,
      mainHidden: false,
      panelActive: true,
    });
}

async function seedHydrationFixture(page, lastTab) {
  await page.evaluate(async (targetTab) => {
    const authSession = storageManager.get(STORAGE_KEYS.AUTH_SESSION, null);
    await storageManager.clearAll(false);
    if (authSession) storageManager.set(STORAGE_KEYS.AUTH_SESSION, authSession);

    const playsFixture = [
      makeHydrationPlay("hydration-play-1", "Run", "11", "Trips Rt", "Hydration Buck", "Buck", "1", "Medium"),
      makeHydrationPlay("hydration-play-2", "Pass", "10", "Doubles Lt", "Hydration Stick", "Stick", "3", "Long"),
      makeHydrationPlay("hydration-play-3", "Screen", "11", "Bunch Rt", "Hydration Bubble", "Bubble", "2", "Short"),
    ];
    if (typeof ensurePlaybookPlayIds === "function") ensurePlaybookPlayIds(playsFixture);
    await storageManager.setPlaybook(playsFixture);

    const copied = playsFixture.map((play, index) =>
      typeof copyPlayWithSourceIdentity === "function"
        ? copyPlayWithSourceIdentity(play, { id: `hydration-copy-${index + 1}`, hash: index % 2 ? "R" : "L" })
        : { ...play, id: `hydration-copy-${index + 1}`, playbookId: play.id, sourcePlayId: play.id },
    );

    storageManager.set(STORAGE_KEYS.SCRIPT_DRAFT, {
      name: "Legacy Hydration Draft",
      date: "2026-07-08",
      plays: [
        { isSeparator: true, id: "hydration-period-1", label: "Team", minutes: 10 },
        { ...copied[0], id: "legacy-hydration-draft-play", play: "Legacy Hydration Draft" },
      ],
      savedAt: new Date().toISOString(),
    });
    storageManager.set(STORAGE_KEYS.SAVED_SCRIPTS, [{
      id: "hydration-saved-script",
      name: "Hydration Practice",
      date: "2026-07-08",
      plays: copied,
      playerVisible: true,
    }]);
    storageManager.set(STORAGE_KEYS.CALL_SHEET_SETTINGS, {
      orientation: "landscape",
      currentPage: "front",
    });
    storageManager.set(STORAGE_KEYS.CALL_SHEET, {
      "must-haves": {
        left: [copied[0]],
        right: [copied[1]],
      },
    });

    const board = typeof _gpCreateEmptyBoard === "function"
      ? _gpCreateEmptyBoard()
      : { assignments: { __holding: [] } };
    board.sheetTitle = "Hydration Opponent";
    board.assignments = {
      ...(board.assignments || {}),
      __holding: [],
      Run: [copied[0]],
      Pass: [copied[1]],
      Screen: [copied[2]],
    };
    storageManager.set(STORAGE_KEYS.GAME_WEEK, {
      opponentName: "Hydration Opponent",
      opponentIndex: null,
      opponentId: null,
      weekLabel: "Hydration Week",
      notes: "Hydration notes",
      lastModified: {},
      artifactVersions: {},
      lastTabs: {},
    });
    storageManager.set(STORAGE_KEYS.GAME_PLAN_BOARDS, {
      "Hydration Opponent": board,
    });
    storageManager.set(STORAGE_KEYS.GAME_PLAN_TAGS, {
      "Hydration Opponent": copied.map((play) =>
        typeof getPlayIdentityKey === "function"
          ? getPlayIdentityKey(play, "gameplan", { trim: false })
          : [play.type, play.personnel, play.formation, play.play, play.preferredDown, play.preferredDistance].join("|"),
      ),
    });
    storageManager.set(STORAGE_KEYS.FIRST_USE_DISMISSED, true);
    storageManager.set(STORAGE_KEYS.LAST_ACTIVE_TAB, targetTab);

    function makeHydrationPlay(id, type, personnel, formation, play, basePlay, down, distance) {
      return {
        id,
        type,
        personnel,
        formation,
        play,
        basePlay,
        tempo: "Fast",
        preferredDown: down,
        preferredDistance: distance,
        preferredFieldPosition: "Green",
        preferredSituation: "",
        keyPlayerName1: "Lucas",
        respQ: "Know the first rule.",
        playerNotes: "Study the landmark.",
      };
    }
  }, lastTab);
}
