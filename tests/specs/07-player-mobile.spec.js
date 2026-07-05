// @ts-check
/**
 * Player mobile experience checks.
 *
 * These seed player-visible practice data and API responses so the test covers
 * the real player journey, not just an empty shell.
 */
const { test, expect } = require("@playwright/test");
const { login, dismissFirstUse } = require("./helpers");

const PLAYER_PLAYS = [
  {
    type: "Run",
    personnel: "11",
    formation: "Trips Rt",
    play: "Buck Sweep",
    basePlay: "Buck",
    preferredDown: "1",
    preferredDistance: "Medium",
    keyPlayerName1: "Lucas",
  },
  {
    type: "Pass",
    personnel: "10",
    formation: "Doubles",
    play: "Verts",
    basePlay: "Verts",
    preferredDown: "3",
    preferredDistance: "Long",
    keyPlayerName1: "Marco",
  },
];

async function seedPlayerPractice(page) {
  await page.evaluate((samplePlays) => {
    const today = new Date().toISOString().slice(0, 10);
    const savedScript = {
      id: "player-script-today",
      name: "Friday Walkthrough",
      date: today,
      playerVisible: true,
      savedAt: new Date().toISOString(),
      plays: [
        {
          isSeparator: true,
          id: "period-1",
          label: "Team",
          minutes: 10,
          color: "#f59e0b",
        },
        ...samplePlays.map((play, index) => ({
          ...play,
          id: `play-${index + 1}`,
          reps: index + 1,
          playerRule: index === 0 ? "Secure the edge and finish through contact." : "Win vertical leverage.",
        })),
      ],
    };

    if (typeof storageManager !== "undefined") {
      storageManager.set(STORAGE_KEYS.SAVED_SCRIPTS, [savedScript]);
      storageManager.set(STORAGE_KEYS.TEAM_NAME, "Burke Catholic Eagles");
      storageManager.set(STORAGE_KEYS.MOTD, "Bring your wristband and know the first two calls.");
    }
    if (typeof plays !== "undefined") plays = samplePlays.map((play) => ({ ...play }));
    if (typeof filteredPlays !== "undefined") filteredPlays = plays.slice();
    if (typeof invalidateFilterCache === "function") invalidateFilterCache();
    if (typeof renderPlayerDashboardHome === "function") renderPlayerDashboardHome();
    if (typeof renderPlayerScriptLauncher === "function") renderPlayerScriptLauncher();
    if (typeof showTab === "function") showTab("dashboard");
  }, PLAYER_PLAYS);
}

test.describe("Player mobile experience", () => {
  test.use({
    viewport: { width: 393, height: 852 },
    isMobile: true,
    hasTouch: true,
  });

  test("locks My Questions overlay, appends more questions, and returns to practice", async ({ page }) => {
    await page.route("**/api/questions/mine?**", async (route) => {
      const url = new URL(route.request().url());
      const offset = Number(url.searchParams.get("offset") || "0");
      const questions = offset === 0
        ? [{
          id: "q-1",
          playId: "11::Trips Rt::Buck Sweep",
          state: "open",
          body: "What is my rule if the edge widens?",
          coachReply: "",
          createdAt: Math.floor(Date.now() / 1000) - 120,
        }]
        : [{
          id: "q-2",
          playId: "10::Doubles::Verts",
          state: "answered",
          body: "Do I convert versus cloud?",
          coachReply: "Yes, flatten into the window and expect the ball now.",
          coachName: "Coach",
          createdAt: Math.floor(Date.now() / 1000) - 240,
        }];

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          summary: { open: 1, answered: 1, resolved: 0 },
          questions,
          hasMore: offset === 0,
          has_more: offset === 0,
        }),
      });
    });

    await login(page, { role: "player", username: "player" });
    await dismissFirstUse(page);
    await seedPlayerPractice(page);

    await expect(page.locator("#playerDashboardHome")).toBeVisible();
    await expect(page.getByRole("button", { name: /Open Practice/i }).first()).toBeVisible();

    const portalButton = page.locator("#playerPortalBtn");
    await expect(portalButton).toBeVisible();
    await portalButton.click();

    const overlay = page.locator("#playerPortalOverlay");
    await expect(overlay).toBeVisible();
    await expect(page.locator("body")).toHaveClass(/app-layer-locked/);
    await expect.poll(() => page.evaluate(() => document.body.dataset.scrollOwner)).toBe("layer");
    await expect(page.getByText("What is my rule if the edge widens?")).toBeVisible();

    await page.getByRole("button", { name: /Load more/i }).click();
    await expect(page.getByText("Do I convert versus cloud?")).toBeVisible();

    await overlay.getByRole("button", { name: /^Close$/i }).click();
    await expect(overlay).toBeHidden();
    await expect(page.locator("body")).not.toHaveClass(/app-layer-locked/);
    await expect.poll(() => page.evaluate(() => document.activeElement?.id || "")).toBe("playerPortalBtn");

    await page.getByRole("button", { name: /Open Practice/i }).first().click();
    const scriptPanel = page.locator("#script.panel.active");
    await expect(scriptPanel).toBeVisible();
    await expect(scriptPanel.locator("#playerScriptNowTitle")).toHaveText("Friday Walkthrough");
    await expect(scriptPanel.locator("#playerScriptNowMeta")).toContainText("2 plays");
  });
});
