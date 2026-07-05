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

async function seedTinyPlaybook(page) {
  await page.evaluate((samplePlays) => {
    if (typeof plays === "undefined") return;
    plays = samplePlays.map((play) => ({ ...play }));
    filteredPlays = plays.slice();
    if (typeof invalidateFilterCache === "function") invalidateFilterCache();
    if (typeof populateFilters === "function") populateFilters();
    if (typeof filterPlays === "function") filterPlays();
    if (typeof backToApp === "function") backToApp();
    if (typeof requestRenderGamePlan === "function") requestRenderGamePlan();
    if (typeof requestRenderPlaybook === "function") requestRenderPlaybook();
  }, SAMPLE_PLAYS);
  await expect(page.locator("#mainApp")).toBeVisible({ timeout: 5_000 });
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
      const bar = document.querySelector(".gp-cmd-bar")?.getBoundingClientRect();
      return tabs && bar ? { tabsBottom: tabs.bottom, barTop: bar.top } : null;
    });
    expect(spacing).not.toBeNull();
    expect(spacing.barTop).toBeGreaterThanOrEqual(spacing.tabsBottom - 1);
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

    for (const label of ["Colors", "Display", "Sort", "Print", "Actions", "Save"]) {
      await expect(commandBar.getByRole("button", { name: new RegExp(label, "i") })).toBeVisible();
    }

    await assertAppChromeTopLayer(page);
    await assertNoHorizontalOverflow(page);

    await commandBar.getByRole("button", { name: /Display/i }).click();
    await expect(page.locator("#wbSettingsModal")).toBeVisible();
    await expect(page.locator("#wbSettingsModalTitle")).toHaveText(/Display Options/i);
  });

  test("player playbook shows study actions and hides staff tools", async ({ page }) => {
    await login(page, { role: "player", username: "player" });
    await dismissFirstUse(page);
    await seedTinyPlaybook(page);
    await goToTab(page, "playbook");

    await expect(page.getByRole("button", { name: /Filter Plays/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Present Showing/i })).toBeVisible();
    await expect(page.locator(".pb-player-summary__filter-pill", { hasText: "Game Plan" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Add Play/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Data/i })).toHaveCount(0);
    await assertAppChromeTopLayer(page);

    await page.getByRole("button", { name: /Filter Plays/i }).click();
    const filterModal = page.locator("#playerPlaybookFilterOverlay");
    await expect(filterModal).toBeVisible();
    await expect(filterModal.locator('[data-filter-group="gamePlan"]')).toBeVisible();
    await expect(filterModal.getByRole("button", { name: /Current Game Plan/i })).toBeVisible();
  });
});
