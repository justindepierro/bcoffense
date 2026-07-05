// @ts-check
/**
 * Player mobile experience checks.
 *
 * These seed player-visible practice data and API responses so the test covers
 * the real player journey, not just an empty shell.
 */
const { test, expect } = require("@playwright/test");
const { login, goToTab, dismissFirstUse, assertNoHorizontalOverflow } = require("./helpers");

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

    await scriptPanel.locator("#playerScriptNowBar").getByRole("button", { name: /^Quiz$/i }).click();
    const quiz = page.locator("#scriptQuizOverlay");
    await expect(quiz).toBeVisible();
    await expect(page.locator("body")).toHaveClass(/app-layer-locked/);
    await expect.poll(() => page.evaluate(() => document.body.dataset.scrollOwner)).toBe("layer");
    await expect(quiz.getByText("What's the call?")).toBeVisible();
    await quiz.getByRole("button", { name: /Show Play Call/i }).click();
    await expect(quiz.locator("#scriptQuizAnswer")).toContainText("Buck Sweep");
    await quiz.getByRole("button", { name: /Close quiz/i }).click();
    await expect(quiz).toBeHidden();
    await expect(page.locator("body")).not.toHaveClass(/app-layer-locked/);
  });

  test("opens every core player page without staff controls or overflow", async ({ page }) => {
    await page.route("**/api/questions/mine?**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          summary: { open: 0, answered: 0, resolved: 0 },
          questions: [],
          hasMore: false,
        }),
      });
    });

    await login(page, { role: "player", username: "player" });
    await dismissFirstUse(page);
    await seedPlayerPractice(page);

    await expect(page.locator("#playerDashboardHome")).toBeVisible();
    for (const label of ["Open Practice", "Swipe View", "Quiz", "Questions", "Playbook"]) {
      await expect(page.locator("#playerDashboardHome").getByRole("button", { name: new RegExp(label, "i") }).first()).toBeVisible();
    }
    await expect(page.getByRole("button", { name: /Add Play/i })).toHaveCount(0);
    await assertNoHorizontalOverflow(page);

    await goToTab(page, "playbook");
    await expect(page.locator("#playbook.panel.active")).toBeVisible();
    await expect(page.getByRole("button", { name: /Filter Plays/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Present Showing/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Add Play/i })).toHaveCount(0);
    await assertNoHorizontalOverflow(page);

    await goToTab(page, "script");
    await expect(page.locator("#playerScriptLauncherSection")).toBeVisible();
    await expect(page.locator(".player-script-card").first()).toBeVisible();
    await expect(page.locator(".player-script-card").first().getByRole("button", { name: /^Quiz$/i })).toBeVisible();
    await expect(page.locator(".script-header-panel")).toBeHidden();
    await assertNoHorizontalOverflow(page);
  });

  test("keeps Swipe View discussion and play navigation stable", async ({ page }) => {
    await page.route("**/api/threads/**", async (route) => {
      const method = route.request().method();
      if (method === "POST") {
        const body = route.request().postDataJSON?.() || {};
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            post: {
              id: "post-1",
              body: body.body || "I need help with my rule.",
              postType: body.post_type || "question",
              questionState: "open",
              questionCategory: body.question_category || "assignment",
              moderationStatus: "approved",
              authorName: "player",
              authorRole: "player",
              authorId: "player",
              reactions: [],
              replies: [],
              replyCount: 0,
              createdAt: new Date().toISOString(),
            },
            moderation: { outcome: "approve" },
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          thread: { id: "thread-1", total: 0, locked: false },
          posts: [],
          hasMore: false,
        }),
      });
    });

    await login(page, { role: "player", username: "player" });
    await dismissFirstUse(page);
    await seedPlayerPractice(page);

    await page.getByRole("button", { name: /Open Practice/i }).first().click();
    await page.locator("#playerScriptNowBar").getByRole("button", { name: /Open Swipe View/i }).click();

    const presentation = page.locator("#playPresentationOverlay");
    await expect(presentation).toBeVisible();
    await expect(presentation).toHaveAttribute("data-presentation-open", "true");
    await expect(page.locator("body")).toHaveClass(/play-presentation-open/);
    await expect(presentation.locator(".pp-player-study-strip")).toBeVisible();
    await expect(presentation.getByText("Your Job")).toBeVisible();
    await expect(presentation.locator(".pp-zoom-controls")).toBeHidden();

    await presentation.getByRole("button", { name: /Ask the coach/i }).click();
    const drawer = page.locator("#ppDiscDrawer");
    await expect(drawer).toBeVisible();
    await expect(drawer.locator(".disc-type-select")).toHaveValue("question");
    await drawer.locator(".disc-textarea").fill("What should I do if the edge widens?");
    await drawer.getByRole("button", { name: /^Post$/i }).click();
    await expect(drawer.getByText("What should I do if the edge widens?")).toBeVisible();

    await drawer.getByRole("button", { name: /Close discussion/i }).click();
    await expect(drawer).toBeHidden();

    await presentation.getByRole("button", { name: /Next play/i }).click();
    await expect(presentation.locator("#playPresentationCounter")).toContainText("2 / 2");

    await presentation.getByRole("button", { name: /Close presentation/i }).click();
    await expect(presentation).toBeHidden();
    await expect(page.locator("#script.panel.active")).toBeVisible();
    await expect(page.locator("body")).not.toHaveClass(/play-presentation-open/);
  });
});
