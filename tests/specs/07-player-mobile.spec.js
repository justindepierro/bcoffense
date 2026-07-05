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
    playerNotes: "Coach says: watch the force defender first, then ask about your landmark if it changes.",
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
          respQ: index === 0 ? "Secure the edge and finish through contact." : "Win vertical leverage.",
          respNotes: index === 0 ? "If force folds inside, climb now. If they widen, pin and call it out." : "",
          playerNotes: index === 0 ? "Coach says: watch the force defender first, then ask about your landmark if it changes." : "",
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

async function seedFirstPracticeDiagram(page) {
  await page.evaluate(async () => {
    if (!window.playImages || typeof playSignature !== "function") return;
    const savedScripts = storageManager.get(STORAGE_KEYS.SAVED_SCRIPTS, []);
    const practicePlay = savedScripts?.[0]?.plays?.find((item) => item && !item.isSeparator);
    const playbookPlay = typeof plays !== "undefined" && Array.isArray(plays) ? plays[0] : null;
    if (!practicePlay && !playbookPlay) return;

    await playImages.ready();
    const canvas = document.createElement("canvas");
    canvas.width = 960;
    canvas.height = 600;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#d8dee8";
    ctx.lineWidth = 2;
    for (let x = 48; x < canvas.width; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 48; y < canvas.height; y += 64) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
    ctx.fillStyle = "#0f1f45";
    ctx.font = "bold 42px Arial";
    ctx.fillText("TRIPS RT BUCK SWEEP", 48, 76);
    ctx.strokeStyle = "#1d4ed8";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(190, 326);
    ctx.bezierCurveTo(320, 190, 455, 190, 590, 300);
    ctx.stroke();
    ctx.strokeStyle = "#16a34a";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(180, 420);
    ctx.lineTo(730, 420);
    ctx.stroke();
    const dataUrl = canvas.toDataURL("image/png");
    const signatures = [practicePlay, playbookPlay]
      .filter(Boolean)
      .map((play) => playSignature(play))
      .filter(Boolean);
    const uniqueSignatures = [...new Set(signatures)];
    try {
      await playImages.ready();
      for (const sig of uniqueSignatures) {
        const blob = await fetch(dataUrl).then((res) => res.blob());
        await playImages.set(sig, blob);
      }
    } catch (_err) {
      const mockUrls = new Map(uniqueSignatures.map((sig) => [sig, dataUrl]));
      const api = window.playImages;
      if (!api.__playerMobileMockPatched) {
        const original = {
          hasForPlay: api.hasForPlay?.bind(api),
          storedSignatureForPlay: api.storedSignatureForPlay?.bind(api),
          urlFor: api.urlFor?.bind(api),
          urlForPlay: api.urlForPlay?.bind(api),
          ensureUrlForPlay: api.ensureUrlForPlay?.bind(api),
          hasPlayImage: window.hasPlayImage?.bind(window),
          getPlayImageUrl: window.getPlayImageUrl?.bind(window),
          ensurePlayImageUrl: window.ensurePlayImageUrl?.bind(window),
        };
        api.__playerMobileMockUrls = new Map();
        api.hasForPlay = (play) =>
          Boolean(original.hasForPlay?.(play)) ||
          api.signaturesForPlay(play).some((sig) => api.__playerMobileMockUrls.has(sig));
        api.storedSignatureForPlay = (play) =>
          original.storedSignatureForPlay?.(play) ||
          api.signaturesForPlay(play).find((sig) => api.__playerMobileMockUrls.has(sig)) ||
          "";
        api.urlFor = (sig) => api.__playerMobileMockUrls.get(sig) || original.urlFor?.(sig) || null;
        api.urlForPlay = (play) => {
          const sig = api.storedSignatureForPlay(play);
          return sig ? api.urlFor(sig) : original.urlForPlay?.(play) || null;
        };
        api.ensureUrlForPlay = async (play) => api.urlForPlay(play) || original.ensureUrlForPlay?.(play) || null;
        window.hasPlayImage = (play) => api.hasForPlay(play) || Boolean(original.hasPlayImage?.(play));
        window.getPlayImageUrl = (play) => api.urlForPlay(play) || original.getPlayImageUrl?.(play) || null;
        window.ensurePlayImageUrl = async (play) =>
          api.urlForPlay(play) || original.ensurePlayImageUrl?.(play) || null;
        api.__playerMobileMockPatched = true;
      }
      mockUrls.forEach((url, sig) => api.__playerMobileMockUrls.set(sig, url));
    }
    if (typeof playImages.loadKeys === "function") await playImages.loadKeys();
  });
  await expect
    .poll(async () => {
      return page.evaluate(() => {
        const savedScripts = storageManager.get(STORAGE_KEYS.SAVED_SCRIPTS, []);
        const play =
          savedScripts?.[0]?.plays?.find((item) => item && !item.isSeparator) ||
          (typeof plays !== "undefined" && Array.isArray(plays) ? plays[0] : null);
        return Boolean(
          play &&
            window.playImages &&
            typeof playImages.hasForPlay === "function" &&
            playImages.hasForPlay(play)
        );
      });
    })
    .toBe(true);
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
    await seedFirstPracticeDiagram(page);

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
    await expect(scriptPanel.locator("#playerScriptLauncherSection")).toBeHidden();
    await expect(scriptPanel.locator("#playerScriptNowTitle")).toHaveText("Friday Walkthrough");
    await expect(scriptPanel.locator("#playerScriptNowMeta")).toContainText("2 plays");
    await expect(scriptPanel.locator("#playerScriptNowHint")).toContainText("Start in Swipe View");
    await expect(scriptPanel.locator(".player-script-now__mission")).toContainText("1/2 diagrams");
    await expect(scriptPanel.locator(".player-script-now__mission")).toContainText("2/2 rules");
    await expect(scriptPanel.locator(".player-script-now__mission")).toContainText("1 coach note");
    for (const label of ["Questions", "Quiz", "Playbook", "Open Swipe View"]) {
      await expect(scriptPanel.locator("#playerScriptNowBar").getByRole("button", { name: new RegExp(label, "i") })).toBeVisible();
    }

    await scriptPanel.locator("#playerScriptNowBar").getByRole("button", { name: /^Quiz$/i }).click();
    const quiz = page.locator("#scriptQuizOverlay");
    await expect(quiz).toBeVisible();
    await expect(page.locator("body")).toHaveClass(/app-layer-locked/);
    await expect.poll(() => page.evaluate(() => document.body.dataset.scrollOwner)).toBe("layer");
    await expect(quiz.getByText("What's the call?")).toBeVisible();
    await expect(quiz.locator(".script-quiz-choice")).toHaveCount(2);
    await quiz.getByRole("button", { name: /Buck Sweep/i }).click();
    await expect(quiz.locator("#scriptQuizScore")).toContainText("Score");
    await expect(quiz.locator("#scriptQuizAnswer")).toContainText("Correct");
    await expect(quiz.locator("#scriptQuizAnswer")).toContainText("Buck Sweep");
    await expect(quiz.locator("#scriptQuizAnswer")).toContainText("Coach note");
    await quiz.getByRole("button", { name: /Close quiz/i }).click();
    await expect(quiz.locator(".sq-exit-card")).toContainText("You scored");
    await expect(quiz.locator(".sq-exit-card")).toContainText("1 question left");
    await quiz.getByRole("button", { name: /Save & Close/i }).click();
    await expect(quiz).toBeHidden();
    await expect(page.locator("body")).not.toHaveClass(/app-layer-locked/);
    await goToTab(page, "dashboard");
    await page.locator("#playerDashboardHome").getByRole("button", { name: /^Quiz$/i }).click();
    const draftHub = page.locator("#playerQuizHubOverlay");
    await expect(draftHub.locator("#playerQuizResumeSlot")).toContainText("Pick up where you left off");
    await expect(draftHub.getByRole("button", { name: /^Resume$/i })).toBeVisible();
    await draftHub.getByRole("button", { name: /Close Quiz Center/i }).click();
    await expect(draftHub).toBeHidden();

    await page.evaluate(() => {
      script = [
        {
          personnel: "11",
          formation: "Trips Rt",
          play: "Buck Sweep",
          preferredDown: "1",
          preferredDistance: "Medium",
          respQ: "Secure the edge and finish through contact.",
        },
        {
          personnel: "10",
          formation: "Doubles",
          play: "Verts",
          preferredDown: "3",
          preferredDistance: "Long",
          respQ: "Win vertical leverage.",
        },
        {
          personnel: "12",
          formation: "Wing Lt",
          play: "Power",
          preferredDown: "2",
          preferredDistance: "Short",
          respQ: "Open play side and carry out keep fake.",
        },
        {
          personnel: "11",
          formation: "Trips Lt",
          play: "Bubble",
          preferredDown: "1",
          preferredDistance: "Short",
          respQ: "Catch, replace, and get north.",
        },
      ];
      startScriptQuiz({ positionKey: "respQ", title: "Responsibility Quiz" });
    });
    await expect(quiz).toBeVisible();
    await expect(quiz.getByText("What's your Q responsibility?")).toBeVisible();
    await expect(quiz.locator(".script-quiz-choice")).toHaveCount(4);
    await quiz.getByRole("button", { name: /Secure the edge/i }).click();
    await expect(quiz.locator("#scriptQuizAnswer")).toContainText("Correct");
    await expect(quiz.locator("#scriptQuizAnswer")).toContainText("Q Rule");
    await quiz.getByRole("button", { name: /Close quiz/i }).click();
    await expect(quiz.locator(".sq-exit-card")).toContainText("You scored 100 points");
    await expect(quiz.locator(".sq-exit-card")).toContainText("3 questions left");
    await quiz.getByRole("button", { name: /Pick up where left off/i }).click();
    await expect(quiz.getByText("What's your Q responsibility?")).toBeVisible();
    await quiz.getByRole("button", { name: /Next/i }).click();
    await expect(quiz.getByText("Which play has this Q rule?")).toBeVisible();
    await quiz.getByRole("button", { name: /Verts/i }).click();
    await quiz.getByRole("button", { name: /Next/i }).click();
    await quiz.getByRole("button", { name: /Open play side/i }).click();
    await quiz.getByRole("button", { name: /Next/i }).click();
    await quiz.getByRole("button", { name: /Catch, replace/i }).click();
    await quiz.locator("#scriptQuizNextBtn").click();
    await expect(quiz.locator(".sq-result-card")).toContainText("100%");
    await expect(quiz.locator(".sq-result-card")).toContainText("Coaches List");
    await expect(quiz.locator(".sq-result-card")).toContainText("700");
    await expect.poll(async () => page.evaluate(() => {
      const attempts = storageManager.get(STORAGE_KEYS.PLAYER_QUIZ_RESULTS, []);
      return {
        count: attempts.length,
        badge: attempts.at(-1)?.badge,
        totalPoints: attempts.at(-1)?.totalPoints,
      };
    })).toEqual({ count: 1, badge: "Coaches List", totalPoints: 700 });
    await quiz.getByRole("button", { name: /^Done$/i }).click();
    await expect(quiz).toBeHidden();

    await goToTab(page, "dashboard");
    await page.locator("#playerDashboardHome").getByRole("button", { name: /^Quiz$/i }).click();
    const resultHub = page.locator("#playerQuizHubOverlay");
    await expect(resultHub.locator("#playerQuizWeeklyPoints")).toContainText("700 / 1000");
    await expect(resultHub.locator("#playerQuizCurrentTier")).toContainText("Starter");
    await expect(resultHub.locator("#playerQuizBestBadge")).toContainText("Coaches List");
    await expect(resultHub.locator("#playerQuizLeaderboardPreview")).toContainText("700 pts");
    await resultHub.getByRole("button", { name: /Close Quiz Center/i }).click();
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
    await page.locator("#playerDashboardHome").getByRole("button", { name: /^Quiz$/i }).click();
    const quizHub = page.locator("#playerQuizHubOverlay");
    await expect(quizHub).toBeVisible();
    await expect(quizHub.getByRole("heading", { name: /Choose your challenge/i })).toBeVisible();
    await expect(quizHub.getByRole("button", { name: /^Q$/i })).toHaveClass(/is-active/);
    await expect(quizHub.getByRole("button", { name: /Start Script Quiz/i })).toBeVisible();
    await expect(quizHub.getByRole("button", { name: /Start Game Plan Quiz/i })).toBeVisible();
    await expect(quizHub.locator("#playerQuizScriptPicker")).toContainText("Friday Walkthrough");
    await expect(quizHub.locator("#playerQuizScriptPicker")).toContainText("2 plays");
    await expect(quizHub.locator("#playerQuizScriptPicker")).toContainText(/Player ready|Close|Needs work|Thin/);
    await quizHub.getByRole("button", { name: /Close Quiz Center/i }).click();
    await expect(quizHub).toBeHidden();
    await page.evaluate(() => {
      const now = new Date();
      const previousWeek = new Date(now);
      previousWeek.setDate(now.getDate() - 7);
      const weekKey = typeof _quizWeekKey === "function" ? _quizWeekKey(now) : "2026-W27";
      const previousWeekKey = typeof _quizWeekKey === "function" ? _quizWeekKey(previousWeek) : "2026-W26";
      const dateKey = typeof _quizDateKey === "function" ? _quizDateKey(now) : now.toISOString().slice(0, 10);
      const previousDateKey = typeof _quizDateKey === "function" ? _quizDateKey(previousWeek) : previousWeek.toISOString().slice(0, 10);
      storageManager.set(STORAGE_KEYS.PLAYER_QUIZ_RESULTS, [{
        id: "mobile-ended-quiz",
        player: "player",
        sourceType: "script",
        title: "Friday Walkthrough",
        totalPoints: 475,
        correct: 5,
        wrong: 1,
        answered: 6,
        totalQuestions: 10,
        remaining: 4,
        percent: 83,
        completed: false,
        dateKey,
        weekKey,
      }, {
        id: "mobile-prior-quiz",
        player: "player",
        sourceType: "gameplan",
        title: "September Install",
        totalPoints: 200,
        correct: 4,
        wrong: 0,
        answered: 4,
        totalQuestions: 4,
        remaining: 0,
        percent: 100,
        completed: true,
        dateKey: previousDateKey,
        weekKey: previousWeekKey,
      }]);
      storageManager.set(STORAGE_KEYS.PLAYER_REWARD_EVENTS, [
        { id: "reward-q", player: "player", type: "question", points: 25, dateKey, weekKey },
        { id: "reward-a", player: "player", type: "answer", points: 40, dateKey, weekKey },
        { id: "reward-g", player: "player", type: "gift", points: 100, dateKey, weekKey },
        { id: "reward-old-q", player: "player", type: "question", points: 25, dateKey: previousDateKey, weekKey: previousWeekKey },
      ]);
      storageManager.set(STORAGE_KEYS.PLAYER_HELMET_STICKERS, [{
        id: "sticker-job",
        player: "player",
        label: "Do Your Job",
        icon: "🧠",
        color: "blue",
        weekKey,
      }]);
    });
    await expect(page.locator("#tab-leaderboard")).toBeVisible();
    await goToTab(page, "leaderboard");
    await expect(page.locator("#leaderboard.panel.active")).toBeVisible();
    await expect(page.locator("#playerLeaderboardPage")).toContainText("Quiz points and weekly standard");
    await expect(page.locator("#playerLeaderboardPage").getByRole("button", { name: /Start Quiz/i })).toBeVisible();
    await expect(page.locator("#playerLeaderboardPage")).toContainText("Weekly board");
    await expect(page.locator("#playerLeaderboardPage")).toContainText("640 / 1000");
    await expect(page.locator("#playerLeaderboardPage")).toContainText("Streaks");
    await expect(page.locator("#playerLeaderboardPage")).toContainText("2 weeks active");
    await expect(page.locator("#playerLeaderboardPage")).toContainText("Point sources");
    await expect(page.locator("#playerLeaderboardPage")).toContainText("Questions");
    await expect(page.locator("#playerLeaderboardPage")).toContainText("Answers");
    await expect(page.locator("#playerLeaderboardPage")).toContainText("Gifted");
    await expect(page.locator("#playerLeaderboardPage")).toContainText("Do Your Job");
    await page.locator("#playerLeaderboardPage").getByRole("button", { name: /^Season$/i }).click();
    await expect(page.locator("#playerLeaderboardPage")).toContainText("Season points and weekly pace");
    await expect(page.locator("#playerLeaderboardPage")).toContainText("Season board");
    await expect(page.locator("#playerLeaderboardPage")).toContainText("Season attempts");
    await expect(page.locator("#playerLeaderboardPage")).toContainText("865");
    await expect(page.locator("#playerLeaderboardPage")).toContainText("September Install");
    await page.locator("#playerLeaderboardPage").getByRole("button", { name: /^Week$/i }).click();
    await expect(page.locator("#playerLeaderboardPage")).toContainText("Weekly board");
    await assertNoHorizontalOverflow(page);
    await goToTab(page, "dashboard");
    await expect.poll(async () => page.evaluate(() => {
      const hero = document.querySelector(".player-home-hero")?.getBoundingClientRect();
      const actions = document.querySelector(".player-home-quick-actions")?.getBoundingClientRect();
      return Boolean(hero && actions && hero.height < 180 && actions.height < 220);
    })).toBe(true);
    await expect(page.getByRole("button", { name: /Add Play/i })).toHaveCount(0);
    await assertNoHorizontalOverflow(page);

    await goToTab(page, "playbook");
    await seedFirstPracticeDiagram(page);
    await page.evaluate(() => {
      if (typeof requestRenderPlaybook === "function") requestRenderPlaybook();
    });
    await expect(page.locator("#playbook.panel.active")).toBeVisible();
    await expect.poll(async () => page.evaluate(() => {
      const summary = document.querySelector("#playerPlaybookSummary")?.getBoundingClientRect();
      return Boolean(summary && summary.height < 150);
    })).toBe(true);
    await expect(page.getByRole("button", { name: /^Filters$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Present Showing/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Diagrams$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Coach Notes$/i })).toBeVisible();
    await expect(page.locator(".pb-card-media--diagram").first()).toBeVisible();
    await expect(page.locator(".pb-card-media--diagram img:not([hidden])").first()).toBeVisible();
    await expect(page.locator(".pb-card-study-badge--diagram").first()).toBeVisible();
    await expect(page.locator(".pb-card-study-badge--notes").first()).toBeVisible();
    await expect(page.locator(".pb-card-note").first()).toContainText("Coach says");
    await expect(page.locator(".pb-card-action--study").first()).toBeVisible();
    await expect(page.locator(".pb-card-action--ask").first()).toBeVisible();
    await page.getByRole("button", { name: /^Diagrams$/i }).click();
    await expect(page.locator("#pbActivePills")).toContainText("Diagram ready");
    await expect(page.getByRole("button", { name: /^Diagrams$/i })).toHaveClass(/is-active/);
    await page.getByRole("button", { name: /^Filters$/i }).click();
    await expect(page.locator("#playerPlaybookFilterOverlay")).toBeVisible();
    await expect(page.locator("[data-filter-group='study']")).toContainText("Study Status");
    await page.locator("#playerPlaybookFilterOverlay").getByRole("button", { name: /Close filters/i }).click();
    await expect(page.getByRole("button", { name: /Add Play/i })).toHaveCount(0);
    await assertNoHorizontalOverflow(page);

    await goToTab(page, "script");
    await expect(page.locator("#playerScriptLauncherSection")).toBeVisible();
    await expect(page.locator(".player-script-card").first()).toBeVisible();
    await expect(page.locator(".player-script-card").first()).toContainText("60% done");
    await expect(page.locator(".player-script-card").first()).toContainText("475 pts");
    await expect(page.locator(".player-script-card").first().getByRole("button", { name: /^Quiz$/i })).toBeVisible();
    await expect(page.locator(".script-header-panel")).toBeHidden();
    await assertNoHorizontalOverflow(page);
  });

  test("starts a Game Plan quiz from populated board assignments", async ({ page }) => {
    await login(page, { role: "player", username: "player" });
    await dismissFirstUse(page);
    await seedPlayerPractice(page);
    await page.evaluate(() => {
      const gamePlanPlays = [
        {
          type: "Run",
          personnel: "11",
          formation: "Trips Rt",
          play: "Buck Sweep",
          respQ: "Read the force defender and get vertical.",
        },
        {
          type: "Pass",
          personnel: "10",
          formation: "Doubles",
          play: "Verts",
          respQ: "Hold the safety and win the hash.",
        },
      ];
      storageManager.set(STORAGE_KEYS.GAME_WEEK, {
        opponentName: "Monticello",
        opponentIndex: 0,
        weekLabel: "Camp",
      });
      storageManager.set(STORAGE_KEYS.GAME_PLAN_BOARDS, {
        Monticello: {
          assignments: {
            Run: [gamePlanPlays[0]],
            Pass: [gamePlanPlays[1]],
          },
          customBoxes: [],
          targets: {},
          collapsed: [],
          notes: {},
          sort: {},
          hiddenBoxes: [],
          boxOrder: [],
          boxLabels: {},
          boxMeta: {},
          allowedPlayTypes: [],
          sheetTitle: "Monticello Camp",
          printPreset: "",
          wristbandAutoBoxId: "",
        },
      });
    });

    await page.locator("#playerDashboardHome").getByRole("button", { name: /^Quiz$/i }).click();
    const hub = page.locator("#playerQuizHubOverlay");
    await expect(hub).toBeVisible();
    await hub.getByRole("button", { name: /Start Game Plan Quiz/i }).click();

    const quiz = page.locator("#scriptQuizOverlay");
    await expect(quiz).toBeVisible();
    await expect(quiz).toContainText("Game Plan Quiz");
    await expect(quiz.locator(".script-quiz-choice")).toHaveCount(2);
    await quiz.getByRole("button", { name: /Buck Sweep/i }).click();
    await expect(quiz.locator("#scriptQuizAnswer")).toContainText("Correct");
    await quiz.getByRole("button", { name: /Next/i }).click();
    await quiz.getByRole("button", { name: /Verts/i }).click();
    await quiz.locator("#scriptQuizNextBtn").click();
    await expect(quiz.locator(".sq-result-card")).toContainText("Game Plan");
    await expect(quiz.locator(".sq-result-card")).toContainText("431");
    await quiz.getByRole("button", { name: /^Done$/i }).click();
    await expect(quiz).toBeHidden();
    await expect.poll(async () => page.evaluate(() => {
      const attempts = storageManager.get(STORAGE_KEYS.PLAYER_QUIZ_RESULTS, []);
      const latest = attempts.at(-1);
      return {
        sourceType: latest?.sourceType,
        title: latest?.title,
        totalPoints: latest?.totalPoints,
        completed: latest?.completed,
      };
    })).toEqual({
      sourceType: "gameplan",
      title: "Game Plan Quiz",
      totalPoints: 431,
      completed: true,
    });
    await assertNoHorizontalOverflow(page);
  });

  test("keeps long quiz answer labels readable on mobile", async ({ page }) => {
    await login(page, { role: "player", username: "player" });
    await dismissFirstUse(page);

    await page.evaluate(() => {
      script = [
        {
          personnel: "11",
          formation: "Trips Rt Stack Nasty",
          play: "Buck Sweep Keep Alert",
          preferredDown: "2",
          preferredDistance: "Long",
          preferredFieldPosition: "Green",
          respQ: "Secure the force defender, keep outside leverage, and climb only after the safety folds inside.",
        },
        {
          personnel: "10",
          formation: "Doubles Nub Rt",
          play: "Verts Switch Read",
          preferredDown: "3",
          preferredDistance: "Medium",
          respQ: "Stem vertical, hold the near safety with your eyes, and win the hash before snapping flat.",
        },
        {
          personnel: "12",
          formation: "Wing Lt Tight",
          play: "Power Read Bluff",
          preferredDown: "1",
          preferredDistance: "Short",
          respQ: "Open play side, sell the mesh with tempo, then carry the keep fake through the alley.",
        },
        {
          personnel: "11",
          formation: "Trips Lt Bunch",
          play: "Bubble Gift Lock",
          preferredDown: "1",
          preferredDistance: "Medium",
          respQ: "Catch, replace the blitzing overhang, and get north after the first color declares.",
        },
      ];
      startScriptQuiz({ positionKey: "respQ", title: "Long Rule Quiz" });
    });

    const quiz = page.locator("#scriptQuizOverlay");
    await expect(quiz).toBeVisible();
    await expect(quiz.locator("#scriptQuizScenario")).toHaveClass(/script-quiz-scenario--(?:very-)?long-choices/);
    await expect(quiz.locator(".script-quiz-choice")).toHaveCount(4);

    const metrics = await page.evaluate(() => {
      const panel = document.querySelector("#scriptQuizOverlay .script-quiz-panel");
      const nav = document.querySelector("#scriptQuizOverlay .script-quiz-nav");
      const choices = Array.from(document.querySelectorAll("#scriptQuizOverlay .script-quiz-choice"));
      const labels = Array.from(document.querySelectorAll("#scriptQuizOverlay .sq-choice-label"));
      const choiceRects = choices.map((choice) => choice.getBoundingClientRect());
      const labelStyles = labels.map((label) => {
        const style = getComputedStyle(label);
        return {
          fontSize: parseFloat(style.fontSize),
          lineClamp: style.webkitLineClamp,
          overflow: style.overflow,
        };
      });
      const panelRect = panel?.getBoundingClientRect();
      const navRect = nav?.getBoundingClientRect();
      return {
        panelBottom: panelRect?.bottom || 0,
        viewportHeight: window.innerHeight,
        choices: choiceRects.map((rect) => ({
          height: rect.height,
          top: rect.top,
          bottom: rect.bottom,
        })),
        navTop: navRect?.top || 0,
        minFontSize: Math.min(...labelStyles.map((style) => style.fontSize)),
        allClamped: labelStyles.every((style) => style.lineClamp === "2" && style.overflow === "hidden"),
      };
    });

    expect(metrics.panelBottom).toBeLessThanOrEqual(metrics.viewportHeight + 1);
    expect(metrics.choices).toHaveLength(4);
    expect(Math.min(...metrics.choices.map((choice) => choice.height))).toBeGreaterThanOrEqual(44);
    expect(Math.max(...metrics.choices.map((choice) => choice.bottom))).toBeLessThanOrEqual(metrics.navTop + 1);
    expect(metrics.minFontSize).toBeGreaterThanOrEqual(12);
    expect(metrics.allClamped).toBe(true);
    await assertNoHorizontalOverflow(page);
  });

  test("makes player notifications and offline states clear", async ({ page, context }) => {
    await page.route("**/api/notifications/count", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, unread: 1 }),
      });
    });
    await page.route("**/api/notifications?**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          unread: 1,
          hasMore: false,
          notifications: [{
            id: "notif-practice-1",
            type: "script_published",
            title: "Coach posted Friday Walkthrough",
            body: "Open it before practice and review your rules.",
            read: false,
            createdAt: Math.floor(Date.now() / 1000) - 90,
            deepLink: "",
          }],
        }),
      });
    });

    await login(page, { role: "player", username: "player" });
    await dismissFirstUse(page);
    await seedPlayerPractice(page);

    const alertsBtn = page.locator("#playerDashboardHome .player-notify-btn");
    await expect(alertsBtn).toBeVisible();
    await expect(alertsBtn).not.toContainText(/coming soon/i);
    await alertsBtn.click();

    const drawer = page.locator("#notifDrawer");
    await expect(drawer).toHaveClass(/is-open/);
    await expect(page.locator("#notifBackdrop")).not.toHaveAttribute("hidden", "");
    await expect(drawer.getByText("Coach posted Friday Walkthrough")).toBeVisible();
    await expect(drawer.locator("#pushNotifFooter")).toBeVisible();
    await expect(drawer.locator("#pushNotifStatus")).toContainText(
      /Practice alerts|Alerts are not supported|Checking alert settings|Alerts are blocked/i,
    );
    await expect(drawer).not.toContainText(/coming soon/i);

    await drawer.getByRole("button", { name: /Close notifications/i }).click();
    await expect(drawer).not.toHaveClass(/is-open/);
    await expect(page.locator("#notifBackdrop")).toHaveAttribute("hidden", "");

    await context.setOffline(true);
    await page.evaluate(() => {
      window.dispatchEvent(new Event("offline"));
      if (typeof renderPlayerDashboardHome === "function") renderPlayerDashboardHome();
    });
    await expect(page.locator("#playerDashboardHome .player-notify-btn")).toContainText("Offline Mode");
    await page.locator("#playerDashboardHome .player-notify-btn").click();
    await expect(drawer).toHaveClass(/is-open/);
    await expect(drawer.getByText("You’re offline")).toBeVisible();
    await expect(drawer).toContainText(/loaded practice still works/i);
    await expect(drawer.locator("#pushNotifStatus")).toContainText(/Alert settings need internet|Alerts are not supported/i);
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
    await seedFirstPracticeDiagram(page);

    await page.getByRole("button", { name: /Open Practice/i }).first().click();
    await page.locator("#playerScriptNowBar").getByRole("button", { name: /Open Swipe View/i }).click();

    const presentation = page.locator("#playPresentationOverlay");
    await expect(presentation).toBeVisible();
    await expect(presentation).toHaveAttribute("data-presentation-open", "true");
    await expect(page.locator("body")).toHaveClass(/play-presentation-open/);
    await expect(presentation.locator(".pp-player-study-strip")).toBeVisible();
    await expect(presentation.locator(".pp-player-status-row")).toBeVisible();
    await expect(presentation.locator(".pp-player-status-pill").filter({ hasText: /Rule: Q/i })).toBeVisible();
    await expect(presentation.getByText("Your Job")).toBeVisible();
    await expect(presentation.getByText("Showing Q rule")).toBeVisible();
    await expect(presentation.getByText("Secure the edge and finish through contact.")).toBeVisible();
    await expect(presentation.getByText("Coach says: watch the force defender first")).toBeVisible();
    await expect(presentation.locator(".pp-diagram-canvas")).toBeVisible();
    await expect(presentation.locator("#playPresentationDiagramStatus")).toContainText("Diagram ready");
    await expect(presentation.locator(".pp-zoom-controls")).toBeHidden();
    await expect.poll(async () => {
      return page.evaluate(() => {
        const diagram = document.querySelector("#playPresentationDiagram")?.getBoundingClientRect();
        const rule = document.querySelector(".pp-player-rule")?.getBoundingClientRect();
        if (!diagram || !rule) return false;
        return diagram.top < rule.top && diagram.top < window.innerHeight * 0.35;
      });
    }).toBe(true);

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

  test("shows coach quiz leaderboard week and season review", async ({ page }) => {
    await login(page, { role: "admin", username: "admin" });
    await dismissFirstUse(page);
    await page.evaluate(() => {
      const now = new Date();
      const previousWeek = new Date(now);
      previousWeek.setDate(now.getDate() - 7);
      const weekKey = typeof _quizWeekKey === "function" ? _quizWeekKey(now) : "2026-W27";
      const previousWeekKey = typeof _quizWeekKey === "function" ? _quizWeekKey(previousWeek) : "2026-W26";
      const dateKey = typeof _quizDateKey === "function" ? _quizDateKey(now) : now.toISOString().slice(0, 10);
      const previousDateKey = typeof _quizDateKey === "function" ? _quizDateKey(previousWeek) : previousWeek.toISOString().slice(0, 10);
      storageManager.set(STORAGE_KEYS.PLAYER_QUIZ_RESULTS, [{
        id: "coach-week-q",
        player: "Lucas",
        sourceType: "script",
        title: "Friday Walkthrough",
        positionKey: "respQ",
        positionLabel: "Q",
        totalPoints: 500,
        answered: 5,
        correct: 3,
        wrong: 2,
        percent: 60,
        completed: true,
        questionBreakdown: {
          responsibility: { total: 3, correct: 1, wrong: 2 },
          call: { total: 2, correct: 2, wrong: 0 },
        },
        dateKey,
        weekKey,
      }, {
        id: "coach-week-h",
        player: "Marco",
        sourceType: "gameplan",
        title: "Game Plan",
        positionKey: "respH",
        positionLabel: "H",
        totalPoints: 250,
        answered: 4,
        correct: 4,
        wrong: 0,
        percent: 100,
        completed: true,
        questionBreakdown: {
          play_from_rule: { total: 2, correct: 2, wrong: 0 },
          call: { total: 2, correct: 2, wrong: 0 },
        },
        dateKey,
        weekKey,
      }, {
        id: "coach-season-q",
        player: "Lucas",
        sourceType: "script",
        title: "Prior Install",
        positionKey: "respQ",
        positionLabel: "Q",
        totalPoints: 175,
        answered: 4,
        correct: 4,
        wrong: 0,
        percent: 100,
        completed: true,
        questionBreakdown: {
          responsibility: { total: 2, correct: 2, wrong: 0 },
          call: { total: 2, correct: 2, wrong: 0 },
        },
        dateKey: previousDateKey,
        weekKey: previousWeekKey,
      }]);
      storageManager.set(STORAGE_KEYS.PLAYER_REWARD_EVENTS, [
        { id: "coach-reward-q", player: "Lucas", type: "question", points: 25, dateKey, weekKey },
        { id: "coach-reward-a", player: "Marco", type: "answer", points: 40, dateKey, weekKey },
        { id: "coach-reward-old", player: "Lucas", type: "gift", points: 100, dateKey: previousDateKey, weekKey: previousWeekKey },
      ]);
      storageManager.set(STORAGE_KEYS.PLAYER_HELMET_STICKERS, [
        { id: "coach-sticker", player: "Lucas", label: "Do Your Job", icon: "🧠", color: "blue", dateKey, weekKey },
      ]);
    });

    await goToTab(page, "quizsetup");
    const setup = page.locator("#coachQuizSetupPage");
    await expect(setup).toContainText("Leaderboard review");
    await expect(setup).toContainText("Week ");
    await expect(setup).toContainText("Lucas");
    await expect(setup).toContainText("525 pts");
    await expect(setup).toContainText("Weak positions");
    await expect(setup).toContainText("Q");
    await expect(setup).toContainText("Weak question types");
    await expect(setup).toContainText("Responsibility");
    await setup.getByRole("button", { name: /^Season$/i }).click();
    await expect(setup).toContainText("Season");
    await expect(setup).toContainText("800 pts");
    await setup.getByRole("button", { name: /^Week$/i }).click();
    await expect(setup).toContainText("525 pts");
    await assertNoHorizontalOverflow(page);
  });
});
