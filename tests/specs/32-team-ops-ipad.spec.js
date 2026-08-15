// @ts-check
/**
 * Team Ops iPad settings hierarchy.
 *
 * A real coach workspace must lead with the everyday team work rather than
 * CSV/recovery utilities. A blank device remains import-first. The roster
 * health, filter, and account-management controls are direct touch targets.
 */
const { test, expect } = require("@playwright/test");
const {
  login,
  dismissFirstUse,
  assertNoHorizontalOverflow,
} = require("./helpers");

const TABLET_PROFILES = {
  "ipad-portrait": { width: 834, height: 1194 },
  "ipad-landscape": { width: 1024, height: 768 },
  "chromium-desktop": { width: 1024, height: 768 },
};

function buildRoster() {
  return Array.from({ length: 28 }, (_, index) => ({
    id: `team-ops-${index + 1}`,
    number: String(index + 1),
    name: `Roster Player ${index + 1}`,
    primaryPosition: index % 7 === 0 ? "" : index % 3 === 0 ? "QB" : "RB",
    positionGroup: index % 4 === 0 ? "linemen" : "skill",
    accountUsername: index % 4 === 0 ? "" : `player${index + 1}`,
    tags: index % 2 === 0 ? ["varsity"] : [],
  }));
}

async function seedPopulatedTeamOps(page) {
  await page.evaluate((roster) => {
    saveTeamRoster(roster);
    saveTeamPersonnelPackages([
      { personnel: "11", assignments: {} },
      { personnel: "10", assignments: {} },
    ]);
    saveTeamSwapGroups([{ id: "team-ops-heavy", name: "Heavy", personnel: "11", assignments: {} }]);
    storageManager.set(STORAGE_KEYS.TEAM_SETTINGS_COLLAPSED, {
      surface: "home",
      roster: false,
      packages: false,
      swaps: false,
      portal: false,
    });
    renderTeamSettings();
    showUpload();
  }, buildRoster());
}

async function seedEmptyTeamOps(page) {
  await page.evaluate(async () => {
    plays = [];
    filteredPlays = [];
    await storageManager.setPlaybook([]);
    saveTeamRoster([]);
    saveTeamPersonnelPackages([]);
    saveTeamSwapGroups([]);
    storageManager.set(STORAGE_KEYS.SAVED_SCRIPTS, []);
    storageManager.set(STORAGE_KEYS.TEAM_NAME, "");
    storageManager.set(STORAGE_KEYS.MOTD, "");
    storageManager.set(STORAGE_KEYS.PLAYER_PORTAL_BRANDING, {});
    storageManager.set(STORAGE_KEYS.TEAM_SETTINGS_COLLAPSED, {
      surface: "home",
      roster: false,
      packages: false,
      swaps: false,
      portal: false,
    });
    renderTeamSettings();
    showUpload();
  });
}

async function readRect(page, selector) {
  return page.locator(selector).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      top: Math.round(rect.top),
      bottom: Math.round(rect.bottom),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  });
}

test.describe("Team Ops iPad settings hierarchy", () => {
  test("puts populated team work first, retains import-first setup, and keeps roster controls touch-safe", async ({ page }, testInfo) => {
    const viewport = TABLET_PROFILES[testInfo.project.name];
    test.skip(!viewport, "This contract runs in the Chromium tablet harness and WebKit iPad projects.");

    // Chromium desktop is the local tablet-geometry engine. Give the app the
    // same iPadOS signal that the WebKit projects receive before it loads.
    if (testInfo.project.name === "chromium-desktop") {
      await page.addInitScript(() => {
        Object.defineProperty(Navigator.prototype, "platform", { configurable: true, get: () => "MacIntel" });
        Object.defineProperty(Navigator.prototype, "maxTouchPoints", { configurable: true, get: () => 5 });
      });
    }
    await page.setViewportSize(viewport);
    await login(page, { role: "admin", username: "admin", password: "password" });
    await dismissFirstUse(page);
    await seedPopulatedTeamOps(page);

    const root = page.locator(".coach-grid-admin-settings");
    await expect(root).toHaveAttribute("data-team-workspace-state", "populated");
    await expect(page.locator("#uploadSection")).toBeVisible();
    await expect(page.locator(".team-settings-shell")).toHaveAttribute("data-team-settings-surface", "roster");

    const populatedOrder = await page.evaluate(() => {
      const team = document.querySelector(".team-settings-section")?.getBoundingClientRect();
      const recovery = document.querySelector(".admin-settings-data-recovery")?.getBoundingClientRect();
      const roster = document.querySelector(".team-settings-panel--roster")?.getBoundingClientRect();
      return {
        teamTop: Math.round(team?.top || 0),
        recoveryTop: Math.round(recovery?.top || 0),
        rosterTop: Math.round(roster?.top || 0),
        viewportHeight: window.innerHeight,
      };
    });
    expect(populatedOrder.teamTop).toBeLessThan(populatedOrder.recoveryTop);
    expect(populatedOrder.rosterTop).toBeLessThan(populatedOrder.viewportHeight);

    const primaryTargets = await page
      .locator(".team-settings-surface-nav--primary .team-settings-surface-nav__item")
      .evaluateAll((items) => items.map((item) => {
        const rect = item.getBoundingClientRect();
        return { label: item.textContent?.trim() || "", width: rect.width, height: rect.height };
      }));
    expect(primaryTargets).toHaveLength(4);
    primaryTargets.forEach((target) => {
      expect(target.width, target.label).toBeGreaterThanOrEqual(44);
      expect(target.height, target.label).toBeGreaterThanOrEqual(44);
    });

    await expect(page.locator("#teamSettingsReadinessSummary")).toContainText(/28 players/i);
    await expect(page.locator("#teamSettingsReadinessSummary")).toContainText(/personnel package/i);

    const rosterTargets = await page
      .locator([
        "#teamRosterSearchInput",
        "#teamRosterFilterInput",
        ".team-roster-command-bar button",
        ".team-roster-health-chip--action",
        ".team-roster-health-link",
        ".team-roster-add-tools > summary",
      ].join(", "))
      .evaluateAll((items) => items.map((item) => {
        const rect = item.getBoundingClientRect();
        return { label: item.textContent?.trim() || item.getAttribute("aria-label") || item.id, width: rect.width, height: rect.height };
      }));
    expect(rosterTargets.length).toBeGreaterThanOrEqual(6);
    rosterTargets.forEach((target) => {
      expect(target.width, target.label).toBeGreaterThanOrEqual(44);
      expect(target.height, target.label).toBeGreaterThanOrEqual(44);
    });

    await page.locator("#teamRosterFilterInput").selectOption("unlinked");
    await expect(page.locator("#teamRosterVisibleCount")).toContainText(/7 of 28/);
    await page.locator(".team-roster-health-chip--action").first().click();
    await expect(page.locator("#teamRosterFilterInput")).toHaveValue("unlinked");
    await assertNoHorizontalOverflow(page);

    await seedEmptyTeamOps(page);
    await expect(root).toHaveAttribute("data-team-workspace-state", "empty");
    await expect(page.locator("#adminSettingsDataRecoveryNote")).toHaveText("Start here");
    const emptyImport = await readRect(page, ".admin-settings-import");
    const emptyTeam = await readRect(page, ".team-settings-section");
    expect(emptyImport.top).toBeLessThan(emptyTeam.top);
    await expect(page.locator("#adminSettingsImportTitle")).toContainText(/Import playbook data/i);
    await assertNoHorizontalOverflow(page);
  });
});
