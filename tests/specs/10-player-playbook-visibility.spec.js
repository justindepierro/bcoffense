// @ts-check
const { test, expect } = require("@playwright/test");
const { login, goToTab, dismissFirstUse } = require("./helpers");

const VISIBILITY_PLAYS = [
  {
    id: "visible-current-buck",
    type: "Run",
    personnel: "11",
    formation: "Trips Rt",
    play: "Current Buck",
    basePlay: "Buck",
    protection: "Zone",
    tempo: "Fast",
  },
  {
    id: "hidden-old-vault",
    type: "Pass",
    personnel: "10",
    formation: "Doubles",
    play: "Old Vault",
    basePlay: "Archive",
    protection: "Half Slide",
    tempo: "Check",
    playerHidden: true,
  },
];

async function seedVisibilityPlaybook(page) {
  await page.evaluate(async (samplePlays) => {
    const seeded = samplePlays.map((play) => ({ ...play }));
    if (typeof storageManager !== "undefined" && typeof STORAGE_KEYS !== "undefined") {
      if (typeof storageManager.setPlaybook === "function") {
        await storageManager.setPlaybook(seeded);
      }
      storageManager.set(STORAGE_KEYS.FIRST_USE_DISMISSED, true);
      storageManager.set(STORAGE_KEYS.LAST_ACTIVE_TAB, "playbook");
    }
    if (typeof plays !== "undefined") plays = seeded.map((play) => ({ ...play }));
    if (typeof filteredPlays !== "undefined") filteredPlays = plays.slice();
    if (typeof invalidateFilterCache === "function") invalidateFilterCache();
    if (typeof populateFilters === "function") populateFilters();
    if (typeof filterPlays === "function") filterPlays();
    if (typeof showTab === "function") showTab("playbook");
  }, VISIBILITY_PLAYS);
}

test.describe("player playbook visibility", () => {
  test("coaches can hide plays and players do not see hidden plays", async ({ page }) => {
    await login(page, { role: "coach", username: "coach", password: "password" });
    await dismissFirstUse(page);
    await seedVisibilityPlaybook(page);
    await goToTab(page, "playbook");

    await expect(page.locator("#playbook")).toContainText("Current Buck");
    await expect(page.locator("#playbook")).toContainText("Old Vault");

    const hiddenRowToggle = page
      .locator("#playbookTable tbody tr", { hasText: "Old Vault" })
      .locator(".pb-player-visibility-btn.is-hidden");
    await expect(hiddenRowToggle).toHaveCount(1);
    await expect(hiddenRowToggle).toHaveAttribute("title", /Show this play to players/);

    await page.evaluate(async () => {
      if (typeof logoutAuth === "function") await logoutAuth();
    });
    await login(page, { role: "player", username: "player", password: "password" });
    await seedVisibilityPlaybook(page);
    await goToTab(page, "playbook");

    await expect(page.locator("#playbook")).toContainText("Current Buck");
    await expect(page.locator("#playbook")).not.toContainText("Old Vault");
    await expect(page.locator(".pb-card", { hasText: "Old Vault" })).toHaveCount(0);

    const visibleNames = await page.evaluate(() =>
      Array.isArray(filteredPlays) ? filteredPlays.map((play) => play.play) : [],
    );
    expect(visibleNames).toEqual(["Current Buck"]);
  });
});
