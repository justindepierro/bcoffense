// @ts-check
/**
 * Player mobile experience checks.
 *
 * These seed player-visible practice data and API responses so the test covers
 * the real player journey, not just an empty shell.
 */
const { test, expect } = require("@playwright/test");
const { login, goToTab, dismissFirstUse, assertNoHorizontalOverflow } = require("./helpers");
const path = require("path");
const fs = require("fs");

const SCREENSHOTS_DIR = path.join(__dirname, "..", "screenshots");

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
    await expect(scriptPanel.locator(".player-script-now__mission")).toHaveCount(0);
    await expect(scriptPanel.locator("#playerScriptNowBar")).not.toContainText(/diagrams|rules|coach note|needs/i);
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
    await expect(quiz.locator(".sq-exit-card")).toContainText("You scored 10 points");
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
    await expect(quiz.locator(".sq-result-card")).toContainText("46");
    await expect.poll(async () => page.evaluate(() => {
      const attempts = storageManager.get(STORAGE_KEYS.PLAYER_QUIZ_RESULTS, []);
      return {
        count: attempts.length,
        badge: attempts.at(-1)?.badge,
        totalPoints: attempts.at(-1)?.totalPoints,
      };
    })).toEqual({ count: 1, badge: "Coaches List", totalPoints: 46 });
    await quiz.getByRole("button", { name: /^Done$/i }).click();
    await expect(quiz).toBeHidden();

    await goToTab(page, "dashboard");
    await page.locator("#playerDashboardHome").getByRole("button", { name: /^Quiz$/i }).click();
    const resultHub = page.locator("#playerQuizHubOverlay");
    await expect(resultHub.locator("#playerQuizWeeklyPoints")).toContainText("46 / 1000");
    await expect(resultHub.locator("#playerQuizCurrentTier")).toContainText("Defense");
    await expect(resultHub.locator("#playerQuizBestBadge")).toContainText("Coaches List");
    await expect(resultHub.locator("#playerQuizLeaderboardPreview")).toContainText("46 pts");
    await resultHub.getByRole("button", { name: /Close Quiz Center/i }).click();
    await goToTab(page, "leaderboard");
    await expect(page.locator("#playerLeaderboardPage")).toContainText("46 / 1000");
    await expect(page.locator("#playerLeaderboardPage")).toContainText("46 pts");
  });

  test("shows wrong-answer review and recap guidance", async ({ page }) => {
    await login(page, { role: "player", username: "player" });
    await dismissFirstUse(page);
    await page.evaluate(async () => {
      script = [
        {
          personnel: "11",
          formation: "Trips Rt",
          play: "Buck Sweep",
          preferredDown: "1",
          preferredDistance: "Medium",
          respQ: "Secure the edge and finish through contact.",
          respNotes: "If force folds inside, climb now.",
          playerNotes: "Coach says: your eyes start on the force defender.",
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
      const canvas = document.createElement("canvas");
      canvas.width = 480;
      canvas.height = 300;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "#1d4ed8";
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(72, 210);
      ctx.bezierCurveTo(160, 96, 300, 96, 406, 186);
      ctx.stroke();
      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 26px Arial";
      ctx.fillText("BUCK SWEEP", 32, 48);
      const diagramDataUrl = canvas.toDataURL("image/png");
      const originalGetPlayImageUrl = window.getPlayImageUrl;
      window.getPlayImageUrl = (play) => (
        play && play.play === "Buck Sweep"
          ? diagramDataUrl
          : (typeof originalGetPlayImageUrl === "function" ? originalGetPlayImageUrl(play) : "")
      );
      startScriptQuiz({ positionKey: "respQ", title: "Review Quiz" });
    });

    const quiz = page.locator("#scriptQuizOverlay");
    await expect(quiz).toBeVisible();
    await quiz.locator(".script-quiz-choice:not([data-arg$='::correct'])").first().click();
    await expect(quiz.locator("#scriptQuizAnswer")).toContainText("Not this one");
    await expect(quiz.locator("#scriptQuizAnswer")).toContainText("Review this one");
    await expect(quiz.locator("#scriptQuizAnswer")).toContainText("You picked");
    await expect(quiz.locator("#scriptQuizAnswer")).toContainText("Correct answer");
    await expect(quiz.locator("#scriptQuizAnswer")).toContainText("Secure the edge");
    await expect(quiz.locator("#scriptQuizAnswer")).toContainText("Coach note");
    await expect(quiz.locator(".sq-review-diagram img")).toBeVisible();

    for (let i = 0; i < 3; i += 1) {
      await quiz.locator("#scriptQuizNextBtn").click();
      await quiz.locator(".script-quiz-choice[data-arg$='::correct']").click();
    }
    await quiz.locator("#scriptQuizNextBtn").click();
    await expect(quiz.locator(".sq-result-card")).toContainText("75%");
    await expect(quiz.locator(".sq-result-card")).toContainText("Review next");
    await expect(quiz.locator(".sq-result-card")).toContainText("Responsibility");
    await expect(quiz.locator(".sq-result-card")).toContainText("Secure the edge");
    await expect(quiz.getByRole("button", { name: /^Quiz Center$/i })).toBeVisible();
    await expect.poll(async () => page.evaluate(() => {
      const attempts = storageManager.get(STORAGE_KEYS.PLAYER_QUIZ_RESULTS, []);
      return attempts.at(-1)?.review || null;
    })).toMatchObject({
      missedCount: 1,
      missTypes: ["Responsibility"],
    });
    await quiz.getByRole("button", { name: /^Done$/i }).click();
    await expect(quiz).toBeHidden();
    await assertNoHorizontalOverflow(page);
  });

  test("uses redacted diagram identification when player rules are missing", async ({ page }) => {
    await login(page, { role: "player", username: "player" });
    await dismissFirstUse(page);
    await page.evaluate(() => {
      storageManager.set(STORAGE_KEYS.PLAYER_QUIZ_SETTINGS, {
        enabledQuestionTypes: ["diagram", "call"],
      });
      script = [
        {
          personnel: "11",
          formation: "Trips Rt",
          play: "Buck Sweep",
          preferredDown: "1",
          preferredDistance: "Medium",
        },
        {
          personnel: "10",
          formation: "Doubles",
          play: "Verts",
          preferredDown: "3",
          preferredDistance: "Long",
        },
        {
          personnel: "12",
          formation: "Wing Lt",
          play: "Power",
          preferredDown: "2",
          preferredDistance: "Short",
        },
      ];
      const canvas = document.createElement("canvas");
      canvas.width = 480;
      canvas.height = 300;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#111827";
      ctx.font = "bold 30px Arial";
      ctx.fillText("TRIPS RT BUCK SWEEP", 28, 48);
      ctx.strokeStyle = "#1d4ed8";
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(72, 214);
      ctx.bezierCurveTo(160, 96, 305, 100, 408, 184);
      ctx.stroke();
      const diagramDataUrl = canvas.toDataURL("image/png");
      const originalGetPlayImageUrl = window.getPlayImageUrl;
      window.getPlayImageUrl = (play) => (
        play && play.play === "Buck Sweep"
          ? diagramDataUrl
          : (typeof originalGetPlayImageUrl === "function" ? originalGetPlayImageUrl(play) : "")
      );
      startScriptQuiz({ positionKey: "respQ", title: "Diagram Quiz" });
    });

    const quiz = page.locator("#scriptQuizOverlay");
    await expect(quiz).toBeVisible();
    await expect(quiz.getByText("What play is this diagram?")).toBeVisible();
    await expect(quiz.locator(".sq-game-pill").filter({ hasText: "Diagram ID" })).toBeVisible();
    await expect(quiz.locator(".sq-diagram-prompt img")).toBeVisible();
    await expect(quiz.locator(".sq-diagram-redaction-band")).toBeVisible();
    await expect(quiz.locator(".sq-diagram-prompt")).toContainText("Top title band hidden for quiz");
    await expect(quiz.locator(".script-quiz-choice")).toHaveCount(3);
    await quiz.getByRole("button", { name: /Buck Sweep/i }).click();
    await expect(quiz.locator("#scriptQuizAnswer")).toContainText("Correct");
    await expect.poll(() => page.evaluate(() => {
      const item = Array.from(_quizAnswers.values()).at(-1);
      return item?.questionType || "";
    })).toBe("diagram");
    await quiz.getByRole("button", { name: /Close quiz/i }).click();
    await quiz.getByRole("button", { name: /Save & Close/i }).click();
    await expect(quiz).toBeHidden();
    await assertNoHorizontalOverflow(page);
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
    await expect(quizHub.getByRole("button", { name: /No Game Plan Quiz/i })).toBeDisabled();
    await expect(quizHub.locator("#playerQuizScriptPicker")).toContainText("Friday Walkthrough");
    await expect(quizHub.locator("#playerQuizScriptPicker")).toContainText("2 plays");
    await expect(quizHub.locator("#playerQuizScriptPicker")).not.toContainText(/Player ready|Close|Needs work|Thin|\d+\s*\/\s*100/);
    await expect(quizHub.locator(".player-quiz-readiness-pill")).toHaveCount(0);
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
      storageManager.set(STORAGE_KEYS.TEAM_ROSTER, [{
        id: "roster-lucas",
        name: "Lucas",
        number: "7",
        position: "QB",
        positionGroup: "skill",
        accountUsername: "player",
      }]);
      storageManager.set(STORAGE_KEYS.PLAYER_QUIZ_RESULTS, [{
        id: "mobile-ended-quiz",
        player: "player",
        sourceType: "script",
        title: "Friday Walkthrough",
        totalPoints: 1110,
        correct: 5,
        wrong: 1,
        answered: 6,
        totalQuestions: 10,
        remaining: 4,
        percent: 83,
        completed: false,
        dateKey,
        weekKey,
        questionBreakdown: {
          responsibility: { total: 4, correct: 3, wrong: 1 },
          call: { total: 2, correct: 2, wrong: 0 },
        },
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
        questionBreakdown: {
          diagram: { total: 4, correct: 4, wrong: 0 },
        },
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
        stickerKey: "do-your-job",
        label: "Do Your Job",
        icon: "🧠",
        color: "blue",
        description: "Handled the assignment without needing extra coaching.",
        note: "Clean checks all week.",
        dateKey,
        weekKey,
      }]);
    });
    await expect(page.locator("#tab-leaderboard")).toBeVisible();
    await goToTab(page, "leaderboard");
    await expect(page.locator("#leaderboard.panel.active")).toBeVisible();
    await expect(page.locator("#playerLeaderboardPage")).toContainText("Quiz points and weekly standard");
    await expect(page.locator("#playerLeaderboardPage").getByRole("button", { name: /Start Quiz/i })).toBeVisible();
    await expect(page.locator("#playerLeaderboardPage")).toContainText("Weekly board");
    await expect(page.locator("#playerLeaderboardPage")).toContainText("1275 / 1000");
    await expect(page.locator("#playerLeaderboardPage")).toContainText("Champion Stars");
    await expect(page.locator("#playerLeaderboardPage")).toContainText("Champion +1");
    await expect(page.locator("#playerLeaderboardPage")).toContainText("Streaks");
    await expect(page.locator("#playerLeaderboardPage")).toContainText("2 weeks active");
    await expect(page.locator("#playerLeaderboardPage")).toContainText("Point sources");
    await expect(page.locator("#playerLeaderboardPage")).toContainText("Questions");
    await expect(page.locator("#playerLeaderboardPage")).toContainText("Answers");
    await expect(page.locator("#playerLeaderboardPage")).toContainText("Gifted");
    await expect(page.locator("#playerLeaderboardPage")).toContainText("Lucas");
    await expect(page.locator("#playerLeaderboardPage")).toContainText("#7");
    await expect(page.locator("#playerLeaderboardPage")).toContainText("QB");
    await expect(page.locator("#playerLeaderboardPage")).toContainText("@player");
    await expect(page.locator("#playerLeaderboardPage")).toContainText("Do Your Job");
    await expect(page.locator("#playerLeaderboardPage")).toContainText("Handled the assignment");
    await page.locator("#playerLeaderboardPage").getByRole("button", { name: /Lucas/i }).click();
    const profile = page.locator("#playerLeaderboardProfileOverlay");
    await expect(profile).toBeVisible();
    await expect(profile).toContainText("Player profile");
    await expect(profile).toContainText("Lucas");
    await expect(profile).toContainText("#7");
    await expect(profile).toContainText("QB");
    await expect(profile).toContainText("@player");
    await expect(profile).toContainText("Best quiz");
    await expect(profile).toContainText("Champion stars");
    await expect(profile).toContainText("Champion Star");
    await expect(profile).toContainText("September Install");
    await expect(profile).toContainText("Season trend");
    await expect(profile).toContainText("Weak areas");
    await expect(profile).toContainText("Responsibility");
    await expect(profile).toContainText("Reward history");
    await expect(profile).toContainText("Question");
    await expect(profile).toContainText("Answer");
    await expect(profile).toContainText("Gift");
    await expect(profile).toContainText("Helmet stickers");
    await expect(profile).toContainText("Do Your Job");
    await expect(profile).toContainText("Recent activity");
    await profile.getByRole("button", { name: /Close player profile/i }).click();
    await expect(profile).toBeHidden();
    await page.locator("#playerLeaderboardPage").getByRole("button", { name: /^Season$/i }).click();
    await expect(page.locator("#playerLeaderboardPage")).toContainText("Season points and weekly pace");
    await expect(page.locator("#playerLeaderboardPage")).toContainText("Season board");
    await expect(page.locator("#playerLeaderboardPage")).toContainText("Season attempts");
    await expect(page.locator("#playerLeaderboardPage")).toContainText("1500");
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
    await expect(page.locator(".player-script-card").first()).toContainText("1110 pts");
    await expect(page.locator(".player-script-card").first().getByRole("button", { name: /^Quiz$/i })).toBeVisible();
    await expect(page.locator(".script-header-panel")).toBeHidden();
    await expect(page.locator("#script")).toHaveClass(/script-player-awaiting-load/);
    await expect(page.locator(".script-section-head")).toBeHidden();
    await expect(page.locator(".script-stats-bar")).toBeHidden();
    await expect(page.locator("#scriptPlays")).toBeHidden();
    await expect(page.locator("#scriptPlays")).not.toContainText("Choose a published practice script above");
    await assertNoHorizontalOverflow(page);
  });

  test("defaults quiz center to linked roster positions and supports secondary rules", async ({ page }) => {
    await login(page, { role: "player", username: "player" });
    await dismissFirstUse(page);
    await page.waitForFunction(() => typeof storageManager !== "undefined");
    const cleanupDialog = page.getByRole("dialog", { name: /Playbook Data Cleanup/i });
    if (await cleanupDialog.count()) {
      await page.evaluate(() => {
        if (typeof closePlaybookSanitize === "function") closePlaybookSanitize();
      });
      await expect(cleanupDialog).toBeHidden({ timeout: 5_000 }).catch(() => {});
    }

    await page.evaluate(() => {
      const today = new Date().toISOString().slice(0, 10);
      const quizPlays = [
        {
          personnel: "11",
          formation: "Trips Rt",
          play: "Buck Sweep",
          preferredDown: "1",
          preferredDistance: "Medium",
          respH: "Arc release and block the alley player.",
          respY: "Kick the EMLOS and keep your head inside.",
        },
        {
          personnel: "12",
          formation: "Wing Rt",
          play: "Power",
          preferredDown: "2",
          preferredDistance: "Short",
          respH: "Insert on the play-side linebacker.",
          respY: "Down block the C gap defender.",
        },
        {
          personnel: "11",
          formation: "Doubles",
          play: "Counter",
          preferredDown: "2",
          preferredDistance: "Medium",
          respH: "Wrap for the first color inside.",
          respY: "Secure the backside hinge.",
        },
        {
          personnel: "10",
          formation: "Trips Lt",
          play: "Bubble",
          preferredDown: "1",
          preferredDistance: "Short",
          respH: "Lead the perimeter path.",
          respY: "Stalk the overhang defender.",
        },
      ];
      storageManager.set(STORAGE_KEYS.TEAM_ROSTER, [{
        id: "roster-lucas",
        name: "Lucas",
        number: "7",
        primaryPosition: "H",
        secondaryPosition: "Y",
        position: "H",
        positionGroup: "skill",
        accountUsername: "player",
      }]);
      storageManager.set(STORAGE_KEYS.SAVED_SCRIPTS, [{
        id: "position-script",
        name: "Position Install",
        date: today,
        playerVisible: true,
        savedAt: new Date().toISOString(),
        plays: [
          { isSeparator: true, id: "period-1", label: "Team", minutes: 10 },
          ...quizPlays,
        ],
      }]);
      storageManager.set(STORAGE_KEYS.PLAYER_QUIZ_SOURCE_SETTINGS, {
        "script:position-script": { state: "available", updatedAt: new Date().toISOString() },
      });
      storageManager.remove(STORAGE_KEYS.PLAYER_QUIZ_DRAFT);
      if (typeof renderPlayerDashboardHome === "function") renderPlayerDashboardHome();
      if (typeof renderPlayerScriptLauncher === "function") renderPlayerScriptLauncher();
    });

    await page.evaluate(() => openPlayerQuizHub());
    const hub = page.locator("#playerQuizHubOverlay");
    await expect(hub).toBeVisible();
    await expect(hub.locator("#playerQuizPositionModeSelect")).toHaveValue("primary");
    await expect(hub.locator("#playerQuizPositionHint")).toContainText("primary position");
    await expect(hub.locator("#playerQuizPositionPicker").getByRole("button", { name: /^H$/ })).toHaveClass(/is-active/);

    await hub.locator("#playerQuizPositionModeSelect").selectOption("secondary");
    await expect(hub.locator("#playerQuizPositionHint")).toContainText("secondary position");
    await expect(hub.locator("#playerQuizPositionPicker").getByRole("button", { name: /^Y$/ })).toHaveClass(/is-active/);
    await hub.getByRole("button", { name: /Start Script Quiz/i }).click();

    const quiz = page.locator("#scriptQuizOverlay");
    await expect(quiz).toBeVisible();
    await expect(quiz.getByText("What's your Y responsibility?")).toBeVisible();
    await expect(quiz.locator(".script-quiz-choice")).toHaveCount(4);
    await quiz.getByRole("button", { name: /Close quiz/i }).click();
    await quiz.getByRole("button", { name: /Save & Close/i }).click();
    await expect(quiz).toBeHidden();
    await assertNoHorizontalOverflow(page);
  });

  test("syncs local leaderboard data and merges team-wide ranks", async ({ page }) => {
    let syncBody = null;
    const buildRemoteSummary = (weekKey = "2026-W27") => ({
      weekKey,
      updatedAt: new Date().toISOString(),
      week: {
        rows: [
          {
            name: "Marco",
            player: "Marco",
            rank: 1,
            points: 1400,
            totalPoints: 1400,
            quizPoints: 1250,
            rewardPoints: 150,
            questionPoints: 50,
            answerPoints: 75,
            giftPoints: 25,
            attempts: 5,
            answered: 18,
            correct: 16,
            stickers: 2,
            percent: 89,
          },
          {
            name: "Lucas",
            player: "Lucas",
            rank: 2,
            points: 1275,
            totalPoints: 1275,
            quizPoints: 1110,
            rewardPoints: 165,
            questionPoints: 25,
            answerPoints: 40,
            giftPoints: 100,
            attempts: 1,
            answered: 6,
            correct: 5,
            stickers: 1,
            percent: 83,
          },
        ],
        totals: {},
      },
      season: {
        rows: [
          {
            name: "Marco",
            player: "Marco",
            rank: 1,
            points: 1725,
            totalPoints: 1725,
            quizPoints: 1500,
            rewardPoints: 225,
            attempts: 7,
            answered: 24,
            correct: 22,
            stickers: 3,
            percent: 92,
          },
          {
            name: "Lucas",
            player: "Lucas",
            rank: 2,
            points: 1500,
            totalPoints: 1500,
            quizPoints: 1310,
            rewardPoints: 190,
            questionPoints: 50,
            answerPoints: 40,
            giftPoints: 100,
            attempts: 2,
            answered: 10,
            correct: 9,
            stickers: 1,
            percent: 90,
          },
        ],
        totals: {},
      },
    });

    await page.route("**/api/leaderboard/summary?**", async (route) => {
      const url = new URL(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, summary: buildRemoteSummary(url.searchParams.get("weekKey") || "2026-W27") }),
      });
    });
    await page.route("**/api/leaderboard/sync", async (route) => {
      syncBody = JSON.parse(route.request().postData() || "{}");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          synced: {
            attempts: syncBody.attempts?.length || 0,
            rewards: syncBody.rewards?.length || 0,
            stickers: syncBody.stickers?.length || 0,
          },
          summary: buildRemoteSummary(syncBody.weekKey || "2026-W27"),
        }),
      });
    });

    await login(page, { role: "player", username: "player" });
    await dismissFirstUse(page);
    await seedPlayerPractice(page);

    await page.evaluate(() => {
      const now = new Date();
      const dateKey = typeof _quizDateKey === "function" ? _quizDateKey(now) : now.toISOString().slice(0, 10);
      const weekKey = typeof _quizWeekKey === "function" ? _quizWeekKey(now) : "2026-W27";
      storageManager.set(STORAGE_KEYS.TEAM_ROSTER, [
        { id: "roster-lucas", name: "Lucas", number: "7", position: "QB", positionGroup: "skill", accountUsername: "player" },
        { id: "roster-marco", name: "Marco", number: "12", position: "H", positionGroup: "skill", accountUsername: "marco12" },
      ]);
      storageManager.set(STORAGE_KEYS.PLAYER_QUIZ_RESULTS, [{
        id: "sync-local-quiz",
        player: "player",
        sourceType: "script",
        sourceId: "player-script-today",
        title: "Friday Walkthrough",
        totalPoints: 1110,
        score: 1080,
        bonusPoints: 30,
        correct: 5,
        wrong: 1,
        answered: 6,
        totalQuestions: 10,
        remaining: 4,
        percent: 83,
        completed: false,
        dateKey,
        weekKey,
      }]);
      storageManager.set(STORAGE_KEYS.PLAYER_REWARD_EVENTS, [
        { id: "sync-reward-question", player: "player", type: "question", points: 25, status: "approved", dateKey, weekKey },
        { id: "sync-reward-answer", player: "player", type: "answer", points: 40, status: "approved", dateKey, weekKey },
        { id: "sync-reward-gift", player: "player", type: "gift", points: 100, status: "approved", dateKey, weekKey },
      ]);
      storageManager.set(STORAGE_KEYS.PLAYER_HELMET_STICKERS, [{
        id: "sync-sticker",
        player: "player",
        stickerKey: "do-your-job",
        label: "Do Your Job",
        icon: "🧠",
        color: "blue",
        description: "Handled the assignment.",
        dateKey,
        weekKey,
      }]);
    });

    await expect.poll(async () => page.evaluate(async () => {
      const result = await syncPlayerLeaderboardNow({ quiet: false });
      return result?.ok === true;
    })).toBe(true);
    expect(syncBody).toBeTruthy();
    expect(syncBody.attempts).toHaveLength(1);
    expect(syncBody.rewards).toHaveLength(3);
    expect(syncBody.stickers).toHaveLength(1);

    await goToTab(page, "leaderboard");
    const leaderboard = page.locator("#playerLeaderboardPage");
    await expect(leaderboard).toContainText("Team synced");
    await expect(leaderboard).toContainText("Marco");
    await expect(leaderboard).toContainText("1400 pts");
    await expect(leaderboard).toContainText("Lucas");
    await expect(leaderboard).toContainText("1275 pts");
    await expect(leaderboard).not.toContainText("2550 pts");
    await leaderboard.getByRole("button", { name: /^Season$/i }).click();
    await expect(leaderboard).toContainText("1725 pts");
    await expect(leaderboard).toContainText("1500 pts");
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
    await expect(hub.locator("#playerQuizGamePlanStatus")).toContainText("Thin source");
    await expect(hub.locator("#playerQuizGamePlanStatus")).toContainText("Rules");
    await expect(hub.locator("#playerQuizGamePlanStatus")).toContainText("Diagrams");
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
    await expect(quiz.locator(".sq-result-card")).toContainText("27");
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
      totalPoints: 27,
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
    await expect(quiz.locator("#scriptQuizScenario")).not.toContainText(/Context|Your Spot/i);
    await expect(quiz.locator(".script-quiz-choice")).toHaveCount(4);

    const metrics = await page.evaluate(() => {
      const panel = document.querySelector("#scriptQuizOverlay .script-quiz-panel");
      const nav = document.querySelector("#scriptQuizOverlay .script-quiz-nav");
      const question = document.querySelector("#scriptQuizOverlay .sq-scenario-hint");
      const detail = document.querySelector("#scriptQuizOverlay .sq-scenario-block--quiz-detail .sq-scenario-value");
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
        questionFontSize: question ? parseFloat(getComputedStyle(question).fontSize) : 0,
        detailFontSize: detail ? parseFloat(getComputedStyle(detail).fontSize) : 0,
        minFontSize: Math.min(...labelStyles.map((style) => style.fontSize)),
        allClamped: labelStyles.every((style) => style.lineClamp === "2" && style.overflow === "hidden"),
      };
    });

    expect(metrics.panelBottom).toBeLessThanOrEqual(metrics.viewportHeight + 1);
    expect(metrics.choices).toHaveLength(4);
    expect(Math.min(...metrics.choices.map((choice) => choice.height))).toBeGreaterThanOrEqual(44);
    expect(Math.max(...metrics.choices.map((choice) => choice.bottom))).toBeLessThanOrEqual(metrics.navTop + 1);
    expect(metrics.questionFontSize).toBeGreaterThanOrEqual(20);
    expect(metrics.detailFontSize).toBeGreaterThanOrEqual(16);
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

  test("stages discussion question and answer rewards for coach approval", async ({ page }) => {
    await page.route("**/api/threads/**", async (route) => {
      const now = Math.floor(Date.now() / 1000);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          thread: { id: "thread-rewards", total: 2, locked: false },
          posts: [{
            id: "disc-question-1",
            body: "What should I do if the edge widens?",
            postType: "question",
            questionState: "open",
            questionCategory: "assignment",
            moderationStatus: "approved",
            authorName: "Lucas",
            authorRole: "player",
            authorId: "lucas-user",
            reactions: [],
            replyCount: 1,
            replies: [{
              id: "disc-answer-1",
              body: "Pin it and climb to the linebacker.",
              postType: "comment",
              moderationStatus: "approved",
              authorName: "Marco",
              authorRole: "player",
              authorId: "marco-user",
              reactions: [],
              replies: [],
              replyCount: 0,
              createdAt: now,
            }],
            createdAt: now,
          }],
          hasMore: false,
        }),
      });
    });

    await login(page, { role: "admin", username: "admin" });
    await dismissFirstUse(page);
    await page.evaluate((samplePlays) => {
      storageManager.set(STORAGE_KEYS.TEAM_ROSTER, [
        { id: "roster-lucas", name: "Lucas", number: "7", position: "QB", accountUsername: "lucas7" },
        { id: "roster-marco", name: "Marco", number: "12", position: "H", accountUsername: "marco12" },
      ]);
      if (typeof plays !== "undefined") plays = samplePlays.map((play) => ({ ...play }));
      if (typeof filteredPlays !== "undefined") filteredPlays = plays.slice();
    }, PLAYER_PLAYS);

    await page.evaluate(async () => {
      const host = document.createElement("section");
      host.id = "discussionRewardTestHost";
      document.body.appendChild(host);
      await renderDiscussionSection(plays[0], host);
    });

    const host = page.locator("#discussionRewardTestHost");
    await expect(host.getByText("What should I do if the edge widens?")).toBeVisible();
    await expect(host.getByRole("button", { name: /Question \+/i })).toBeVisible();
    await expect(host.getByRole("button", { name: /Answer \+/i })).toBeVisible();

    await host.getByRole("button", { name: /Question \+/i }).click();
    await expect(page.getByRole("dialog", { name: /Stage Discussion Reward/i })).toBeVisible();
    await page.getByRole("button", { name: /^Stage$/i }).click();
    await host.getByRole("button", { name: /Answer \+/i }).click();
    await expect(page.getByRole("dialog", { name: /Stage Discussion Reward/i })).toBeVisible();
    await page.getByRole("button", { name: /^Stage$/i }).click();

    await expect.poll(() => page.evaluate(() => {
      const events = storageManager.get(STORAGE_KEYS.PLAYER_REWARD_EVENTS, []);
      return events.map((event) => ({
        player: event.player,
        type: event.type,
        status: event.status,
        source: event.source,
        points: event.points,
      }));
    })).toEqual([
      { player: "Lucas", type: "question", status: "pending_approval", source: "discussion", points: 15 },
      { player: "Marco", type: "answer", status: "pending_approval", source: "discussion", points: 25 },
    ]);
    await expect.poll(() => page.evaluate(() => {
      const summary = _buildCoachQuizLeaderboardSummary();
      return summary.rows
        .filter((row) => ["Lucas", "Marco"].includes(row.name))
        .map((row) => ({ name: row.name, totalPoints: row.totalPoints }));
    })).toEqual([
      { name: "Lucas", totalPoints: 0 },
      { name: "Marco", totalPoints: 0 },
    ]);

    await goToTab(page, "quizsetup");
    const awardHistory = page.locator("#coachQuizSetupPage .coach-quiz-award-history-panel");
    await expect(awardHistory).toContainText("Pending approval");
    await expect(awardHistory.getByRole("button", { name: /Approve Question reward for Lucas/i })).toBeVisible();
    await expect(awardHistory.getByRole("button", { name: /Approve Answer reward for Marco/i })).toBeVisible();

    await awardHistory.getByRole("button", { name: /Approve Question reward for Lucas/i }).click();
    await expect(page.getByRole("dialog", { name: /Approve Reward/i })).toBeVisible();
    await page.getByRole("button", { name: /^Approve$/i }).click();
    await awardHistory.getByRole("button", { name: /Approve Answer reward for Marco/i }).click();
    await expect(page.getByRole("dialog", { name: /Approve Reward/i })).toBeVisible();
    await page.getByRole("button", { name: /^Approve$/i }).click();

    await expect.poll(() => page.evaluate(() => {
      const summary = _buildCoachQuizLeaderboardSummary();
      return summary.rows
        .filter((row) => ["Lucas", "Marco"].includes(row.name))
        .map((row) => ({ name: row.name, totalPoints: row.totalPoints }))
        .sort((a, b) => a.name.localeCompare(b.name));
    })).toEqual([
      { name: "Lucas", totalPoints: 15 },
      { name: "Marco", totalPoints: 25 },
    ]);
    await expect.poll(() => page.evaluate(() =>
      storageManager.get(STORAGE_KEYS.PLAYER_REWARD_EVENTS, []).every((event) => event.status === "approved")
    )).toBe(true);
    await assertNoHorizontalOverflow(page);
  });

  test("enforces discussion reward caps and shows approved reward history", async ({ page }) => {
    await page.route("**/api/threads/**", async (route) => {
      const now = Math.floor(Date.now() / 1000);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          thread: { id: "thread-capped-rewards", total: 2, locked: false },
          posts: [{
            id: "disc-cap-question",
            body: "Do I pin the edge or climb if he widens?",
            postType: "question",
            questionState: "open",
            questionCategory: "assignment",
            moderationStatus: "approved",
            authorName: "Lucas",
            authorRole: "player",
            authorId: "lucas-user",
            reactions: [],
            replyCount: 1,
            replies: [{
              id: "disc-cap-answer",
              body: "Pin the edge first, then climb if he folds.",
              postType: "comment",
              moderationStatus: "approved",
              authorName: "Lucas",
              authorRole: "player",
              authorId: "lucas-user",
              reactions: [],
              replies: [],
              replyCount: 0,
              createdAt: now,
            }],
            createdAt: now,
          }],
          hasMore: false,
        }),
      });
    });

    await login(page, { role: "admin", username: "admin" });
    await dismissFirstUse(page);
    await page.evaluate((samplePlays) => {
      const now = new Date();
      const dateKey = _quizDateKey(now);
      const weekKey = _quizWeekKey(now);
      storageManager.set(STORAGE_KEYS.TEAM_ROSTER, [
        { id: "roster-lucas", name: "Lucas", number: "7", position: "QB", accountUsername: "lucas7" },
      ]);
      storageManager.set(STORAGE_KEYS.PLAYER_QUIZ_SETTINGS, {
        ...PLAYER_QUIZ_DEFAULT_SETTINGS,
        questionPoints: 15,
        answerPoints: 25,
        dailyRewardCap: 30,
        weeklyRewardCap: 30,
      });
      storageManager.set(STORAGE_KEYS.PLAYER_REWARD_EVENTS, [{
        id: "existing-approved-gift",
        player: "Lucas",
        type: "gift",
        label: "Coach Gift",
        points: 20,
        note: "Existing cap usage",
        status: "approved",
        dateKey,
        weekKey,
        createdAt: now.toISOString(),
      }]);
      if (typeof plays !== "undefined") plays = samplePlays.map((play) => ({ ...play }));
      if (typeof filteredPlays !== "undefined") filteredPlays = plays.slice();
    }, PLAYER_PLAYS);

    await page.evaluate(async () => {
      const host = document.createElement("section");
      host.id = "discussionCapTestHost";
      document.body.appendChild(host);
      await renderDiscussionSection(plays[0], host);
    });

    const host = page.locator("#discussionCapTestHost");
    await host.getByRole("button", { name: /Question \+/i }).click();
    await expect(page.getByRole("dialog", { name: /Stage Discussion Reward/i })).toBeVisible();
    await page.getByRole("button", { name: /^Stage$/i }).click();
    await host.getByRole("button", { name: /Answer \+/i }).click();
    await expect(page.getByRole("dialog", { name: /Stage Discussion Reward/i })).toBeVisible();
    await page.getByRole("button", { name: /^Stage$/i }).click();

    await goToTab(page, "quizsetup");
    const awardHistory = page.locator("#coachQuizSetupPage .coach-quiz-award-history-panel");
    await awardHistory.getByRole("button", { name: /Approve Question reward for Lucas/i }).click();
    await expect(page.getByRole("dialog", { name: /Approve Reward/i })).toBeVisible();
    await page.getByRole("button", { name: /^Approve$/i }).click();
    await awardHistory.getByRole("button", { name: /Approve Answer reward for Lucas/i }).click();
    await expect(page.locator(".toast, .toast-notification").last()).toContainText(/cap/i);

    await expect.poll(() => page.evaluate(() => {
      const events = storageManager.get(STORAGE_KEYS.PLAYER_REWARD_EVENTS, []);
      return events.map((event) => ({
        sourcePostId: event.sourcePostId || event.id,
        type: event.type,
        status: event.status,
        points: event.points,
      })).sort((a, b) => a.sourcePostId.localeCompare(b.sourcePostId));
    })).toEqual([
      { sourcePostId: "disc-cap-answer", type: "answer", status: "pending_approval", points: 25 },
      { sourcePostId: "disc-cap-question", type: "question", status: "approved", points: 10 },
      { sourcePostId: "existing-approved-gift", type: "gift", status: "approved", points: 20 },
    ]);
    await expect.poll(() => page.evaluate(() => {
      const row = _buildCoachQuizLeaderboardSummary().rows.find((item) => item.name === "Lucas");
      return row && {
        totalPoints: row.totalPoints,
        questionPoints: row.questionPoints,
        answerPoints: row.answerPoints,
        giftPoints: row.giftPoints,
      };
    })).toEqual({ totalPoints: 30, questionPoints: 10, answerPoints: 0, giftPoints: 20 });

    await page.evaluate(() => openPlayerLeaderboardProfile("Lucas"));
    const profile = page.locator("#playerLeaderboardProfileOverlay");
    await expect(profile).toBeVisible();
    const rewardCard = profile.locator(".player-profile-card", { hasText: "Reward history" });
    await expect(rewardCard).toContainText("Question");
    await expect(rewardCard).toContainText("10 pts");
    await expect(rewardCard).toContainText("Gift");
    await expect(rewardCard).toContainText("20 pts");
    await expect(rewardCard).not.toContainText("Answer");
    await assertNoHorizontalOverflow(page);
  });

  test("captures quiz answer, recap, leaderboard, and profile screenshots @screenshots", async ({ page }, testInfo) => {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    const device = testInfo.project.name;
    await login(page, { role: "player", username: "player" });
    await dismissFirstUse(page);
    await page.evaluate(() => {
      const now = new Date();
      const dateKey = _quizDateKey(now);
      const weekKey = _quizWeekKey(now);
      storageManager.set(STORAGE_KEYS.A2HS_DISMISSED, Date.now());
      storageManager.set(STORAGE_KEYS.TEAM_ROSTER, [
        { id: "roster-lucas", name: "Lucas", number: "7", position: "QB", accountUsername: "player" },
        { id: "roster-marco", name: "Marco", number: "12", position: "H", accountUsername: "marco12" },
      ]);
      storageManager.set(STORAGE_KEYS.PLAYER_REWARD_EVENTS, [
        { id: "screen-question", player: "Lucas", type: "question", points: 25, note: "Asked a sharp edge question.", status: "approved", dateKey, weekKey, createdAt: now.toISOString() },
        { id: "screen-answer", player: "Lucas", type: "answer", points: 35, note: "Helped a teammate with the rule.", status: "approved", dateKey, weekKey, createdAt: now.toISOString() },
      ]);
      storageManager.set(STORAGE_KEYS.PLAYER_HELMET_STICKERS, [{
        id: "screen-sticker",
        player: "Lucas",
        stickerKey: "do-your-job",
        label: "Do Your Job",
        icon: "🧠",
        color: "blue",
        description: "Handled the assignment without needing extra coaching.",
        note: "Clean checks all week.",
        dateKey,
        weekKey,
      }]);
      script = [
        {
          personnel: "11",
          formation: "Trips Rt",
          play: "Buck Sweep",
          preferredDown: "1",
          preferredDistance: "Medium",
          respQ: "Secure the edge and finish through contact.",
          respNotes: "If force folds inside, climb now.",
          playerNotes: "Coach says: your eyes start on the force defender.",
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
      startScriptQuiz({ positionKey: "respQ", title: "Friday Walkthrough Quiz" });
    });

    const quiz = page.locator("#scriptQuizOverlay");
    await expect(quiz).toBeVisible();
    await quiz.locator(".script-quiz-choice:not([data-arg$='::correct'])").first().click();
    await expect(quiz.locator("#scriptQuizAnswer")).toContainText("Review this one");
    await quiz.screenshot({ path: path.join(SCREENSHOTS_DIR, `player-quiz-answer-${device}.png`) });

    for (let i = 0; i < 3; i += 1) {
      await quiz.locator("#scriptQuizNextBtn").click();
      await quiz.locator(".script-quiz-choice[data-arg$='::correct']").click();
    }
    await quiz.locator("#scriptQuizNextBtn").click();
    await expect(quiz.locator(".sq-result-card")).toContainText("75%");
    await quiz.screenshot({ path: path.join(SCREENSHOTS_DIR, `player-quiz-recap-${device}.png`) });

    await quiz.getByRole("button", { name: /^Done$/i }).click();
    await expect(quiz).toBeHidden();
    await goToTab(page, "leaderboard");
    const leaderboard = page.locator("#playerLeaderboardPage");
    await expect(leaderboard).toContainText("Weekly board");
    const installBanner = page.locator("#playerA2HSBanner");
    if ((await installBanner.count()) > 0 && await installBanner.isVisible()) {
      await installBanner.getByRole("button", { name: /Not now/i }).click();
      await expect(installBanner).toBeHidden();
    }
    await leaderboard.screenshot({ path: path.join(SCREENSHOTS_DIR, `player-leaderboard-${device}.png`) });
    await leaderboard.getByRole("button", { name: /Lucas/i }).click();
    const profile = page.locator("#playerLeaderboardProfileOverlay");
    await expect(profile).toBeVisible();
    await expect(profile).toContainText("Reward history");
    const rewardHistoryCard = profile.locator(".player-profile-card", { hasText: "Reward history" });
    await rewardHistoryCard.scrollIntoViewIfNeeded();
    await rewardHistoryCard.screenshot({ path: path.join(SCREENSHOTS_DIR, `player-profile-detail-${device}.png`) });
    await assertNoHorizontalOverflow(page);
  });

  test("saves coach quiz settings and applies custom scoring", async ({ page }) => {
    await login(page, { role: "admin", username: "admin" });
    await dismissFirstUse(page);

    await goToTab(page, "quizsetup");
    const setup = page.locator("#coachQuizSetupPage");
    await expect(setup).toContainText("Quiz settings");
    await setup.locator("#coachQuizWeeklyGoal").fill("1200");
    await setup.locator("#coachQuizBaseCorrectPoints").fill("12");
    await setup.locator("#coachQuizScriptWeight").fill("2");
    await setup.locator("#coachQuizGameplanWeight").fill("1.5");
    await setup.locator("#coachQuizHonorRollMin").fill("80");
    await setup.locator("#coachQuizHonorRollBonus").fill("10");
    await setup.locator("#coachQuizHighHonorRollMin").fill("85");
    await setup.locator("#coachQuizHighHonorRollBonus").fill("20");
    await setup.locator("#coachQuizCoachesListMin").fill("90");
    await setup.locator("#coachQuizCoachesListBonus").fill("30");
    await setup.locator("#coachQuizMinBonusAnswers").fill("1");
    await setup.locator("#coachQuizQuestionPoints").fill("20");
    await setup.locator("#coachQuizAnswerPoints").fill("35");
    await setup.locator("#coachQuizGiftPoints").fill("60");
    await setup.locator("#coachQuizDailyRewardCap").fill("75");
    await setup.locator("#coachQuizWeeklyRewardCap").fill("200");
    await setup.locator("#coachQuizTypeResponsibility").uncheck();
    await setup.locator("#coachQuizTypeRuleToPlay").uncheck();
    await setup.locator("#coachQuizTypeDiagram").uncheck();
    await setup.getByRole("button", { name: /Save Settings/i }).click();

    await expect.poll(() => page.evaluate(() => storageManager.get(STORAGE_KEYS.PLAYER_QUIZ_SETTINGS, null))).toMatchObject({
      weeklyGoal: 1200,
      baseCorrectPoints: 12,
      scriptWeight: 2,
      gameplanWeight: 1.5,
      honorRollMin: 80,
      honorRollBonus: 10,
      highHonorRollMin: 85,
      highHonorRollBonus: 20,
      coachesListMin: 90,
      coachesListBonus: 30,
      minBonusAnswers: 1,
      questionPoints: 20,
      answerPoints: 35,
      giftPoints: 60,
      dailyRewardCap: 75,
      weeklyRewardCap: 200,
      enabledQuestionTypes: ["call"],
    });
    await expect(setup).toContainText("1200 point goal");

    await page.evaluate(() => {
      script = [{
        personnel: "11",
        formation: "Trips Rt",
        play: "Buck Sweep",
        respQ: "Secure the edge.",
      }, {
        personnel: "10",
        formation: "Doubles",
        play: "Verts",
        respQ: "Win vertical leverage.",
      }];
      startScriptQuiz({ positionKey: "respQ", title: "Settings Scoring Quiz" });
    });
    const quiz = page.locator("#scriptQuizOverlay");
    await expect(quiz).toBeVisible();
    await expect(quiz.getByText("What's the call?")).toBeVisible();
    await quiz.getByRole("button", { name: /Buck Sweep/i }).click();
    await quiz.getByRole("button", { name: /Next/i }).click();
    await expect(quiz.getByText("What's the call?")).toBeVisible();
    await quiz.getByRole("button", { name: /Verts/i }).click();
    await quiz.locator("#scriptQuizNextBtn").click();
    await expect(quiz.locator(".sq-result-card")).toContainText("Coaches List");
    await expect(quiz.locator(".sq-result-card")).toContainText("80");
    await expect.poll(async () => page.evaluate(() => {
      const attempts = storageManager.get(STORAGE_KEYS.PLAYER_QUIZ_RESULTS, []);
      return {
        totalPoints: attempts.at(-1)?.totalPoints,
        badge: attempts.at(-1)?.badge,
      };
    })).toMatchObject({ totalPoints: 80, badge: "Coaches List" });
    await quiz.getByRole("button", { name: /^Done$/i }).click();

    await page.evaluate(() => openPlayerQuizHub());
    const hub = page.locator("#playerQuizHubOverlay");
    await expect(hub.locator("#playerQuizWeeklyPoints")).toContainText("80 / 1200");
    await hub.getByRole("button", { name: /Close Quiz Center/i }).click();
    await assertNoHorizontalOverflow(page);
  });

  test("honors coach quiz source publishing controls", async ({ page }) => {
    await login(page, { role: "admin", username: "admin" });
    await dismissFirstUse(page);
    await page.evaluate(() => {
      const basePlay = {
        type: "Run",
        personnel: "11",
        formation: "Trips Rt",
        play: "Buck Sweep",
        respQ: "Read force and get vertical.",
        playerNotes: "Win the edge.",
      };
      storageManager.set(STORAGE_KEYS.SAVED_SCRIPTS, [{
        id: "script-friday-quiz",
        name: "Friday Quiz",
        date: "2026-07-06",
        playerVisible: true,
        savedAt: new Date().toISOString(),
        plays: [{ ...basePlay }],
      }, {
        id: "script-hidden-quiz",
        name: "Hidden Quiz",
        date: "2026-07-05",
        playerVisible: true,
        savedAt: new Date().toISOString(),
        plays: [{ ...basePlay, play: "Verts", type: "Pass" }],
      }]);
      storageManager.set(STORAGE_KEYS.GAME_WEEK, {
        opponentName: "Monticello",
        opponentIndex: 0,
        weekLabel: "Camp",
      });
      storageManager.set(STORAGE_KEYS.GAME_PLAN_BOARDS, {
        Monticello: {
          assignments: {
            Run: [{ ...basePlay }],
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

    await goToTab(page, "quizsetup");
    const setup = page.locator("#coachQuizSetupPage");
    const friday = setup.locator(".coach-quiz-source-card").filter({ hasText: "Friday Quiz" });
    const hidden = setup.locator(".coach-quiz-source-card").filter({ hasText: "Hidden Quiz" });
    const gamePlan = setup.locator(".coach-quiz-source-card").filter({ hasText: "Monticello Camp" });
    await expect(friday).toContainText("Rules");
    await expect(friday).toContainText("Diagrams");
    await expect(friday).toContainText("Metadata");

    await friday.getByRole("button", { name: /^Locked$/i }).click();
    await expect(friday).toContainText("Locked");
    await hidden.getByRole("button", { name: /^Coach-only$/i }).click();
    await expect(hidden).toContainText("Coach-only");
    await gamePlan.getByRole("button", { name: /^Locked$/i }).click();
    await expect(gamePlan).toContainText("Locked");

    await expect.poll(() => page.evaluate(() => storageManager.get(STORAGE_KEYS.PLAYER_QUIZ_SOURCE_SETTINGS, {}))).toMatchObject({
      "script:script-friday-quiz": { state: "locked" },
      "script:script-hidden-quiz": { state: "coach" },
      "gameplan:Monticello": { state: "locked" },
    });

    await page.evaluate(() => openPlayerQuizHub());
    const hub = page.locator("#playerQuizHubOverlay");
    await expect(hub).toBeVisible();
    const picker = hub.locator("#playerQuizScriptPicker");
    await expect(picker).toContainText("Friday Quiz");
    await expect(picker).toContainText("Locked");
    await expect(picker).toContainText("Rules");
    await expect(picker).toContainText("Diagrams");
    await expect(picker).toContainText("Metadata");
    await expect(picker).not.toContainText("Hidden Quiz");
    await expect(hub.locator("#playerQuizStartScriptBtn")).toBeDisabled();
    await expect(hub.locator("#playerQuizStartGamePlanBtn")).toBeDisabled();
    await expect(hub.locator("#playerQuizStartGamePlanBtn")).toContainText("Game Plan Locked");
    await expect(hub.locator("#playerQuizGamePlanStatus")).toContainText("Coach locked this Game Plan quiz");
    await expect(hub.locator("#playerQuizGamePlanStatus")).toContainText("Rules");
    await expect(hub.locator("#playerQuizGamePlanStatus")).toContainText("Diagrams");
    await assertNoHorizontalOverflow(page);
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
      storageManager.set(STORAGE_KEYS.TEAM_ROSTER, [
        { id: "roster-lucas", name: "Lucas", number: "7", position: "QB", positionGroup: "skill", accountUsername: "lucas7" },
        { id: "roster-marco", name: "Marco", number: "12", position: "H", positionGroup: "skill", accountUsername: "marco12" },
        { id: "roster-noah", name: "Noah", number: "22", position: "X", positionGroup: "skill", accountUsername: "" },
        { id: "roster-ty", name: "Ty", number: "3", position: "Z", positionGroup: "skill", accountUsername: "dup1" },
        { id: "roster-taj", name: "Taj", number: "4", position: "Y", positionGroup: "skill", accountUsername: "dup1" },
      ]);
      storageManager.set(STORAGE_KEYS.PLAYER_HELMET_STICKER_TYPES, [{
        key: "film-junkie",
        label: "Film Junkie",
        icon: "🎥",
        color: "purple",
        description: "Watched the install and asked sharp questions.",
        custom: true,
      }]);
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
        id: "coach-unknown-attempt",
        player: "Mystery Player",
        sourceType: "script",
        title: "Unlinked Attempt",
        positionKey: "respZ",
        positionLabel: "Z",
        totalPoints: 80,
        answered: 1,
        correct: 1,
        wrong: 0,
        percent: 100,
        completed: true,
        questionBreakdown: {
          call: { total: 1, correct: 1, wrong: 0 },
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
        { id: "coach-reward-unknown", player: "Ghost Login", type: "gift", points: 10, dateKey, weekKey },
        { id: "coach-reward-old", player: "Lucas", type: "gift", points: 100, dateKey: previousDateKey, weekKey: previousWeekKey },
      ]);
      storageManager.set(STORAGE_KEYS.PLAYER_HELMET_STICKERS, [
        { id: "coach-sticker", player: "Lucas", label: "Do Your Job", icon: "🧠", color: "blue", dateKey, weekKey },
        { id: "coach-sticker-unknown", player: "Old Name", label: "Great Teammate", icon: "🤝", color: "green", dateKey, weekKey },
      ]);
    });

    await goToTab(page, "quizsetup");
    const setup = page.locator("#coachQuizSetupPage");
    await expect(setup).toContainText("Leaderboard review");
    await expect(setup).toContainText("Week ");
    await expect(setup).toContainText("Lucas");
    await expect(setup).toContainText("525 pts");
    await expect(setup).toContainText("Roster link health");
    await expect(setup).toContainText("Linked accounts");
    await expect(setup).toContainText("Unlinked roster");
    await expect(setup).toContainText("Noah");
    await expect(setup).toContainText("Duplicate logins");
    await expect(setup).toContainText("@dup1");
    await expect(setup).toContainText("Unknown activity");
    await expect(setup).toContainText("Mystery Player");
    await expect(setup).toContainText("Ghost Login");
    await expect(setup).toContainText("Old Name");
    await expect(setup).toContainText("No quiz activity");
    const awardHistory = setup.locator(".coach-quiz-award-history-panel");
    await expect(awardHistory).toContainText("Award history");
    await expect(awardHistory).toContainText("Point awards");
    await expect(awardHistory).toContainText("Helmet stickers");
    await expect(awardHistory).toContainText("Ghost Login");
    await expect(awardHistory).toContainText("Old Name");
    await expect(awardHistory.getByRole("button", { name: /Revoke Gift reward from Ghost Login/i })).toBeVisible();
    await expect(awardHistory.getByRole("button", { name: /Revoke Great Teammate sticker from Old Name/i })).toBeVisible();
    await expect(setup).toContainText("Film Junkie");
    await expect(setup).toContainText("Watched the install");
    await expect(setup.getByRole("button", { name: /Custom Sticker/i })).toBeVisible();
    await expect(setup.getByRole("button", { name: /Edit Film Junkie/i })).toBeVisible();
    await setup.getByRole("button", { name: /Edit Film Junkie/i }).click();
    await expect(page.getByRole("dialog", { name: /Edit Sticker Label/i })).toBeVisible();
    await page.locator(".custom-modal-input").last().fill("Film Captain");
    await page.getByRole("button", { name: /^Save$/i }).click();
    await expect(page.getByRole("dialog", { name: /Film Captain/i })).toBeVisible();
    await page.locator(".custom-modal-input").last().fill("🎬");
    await page.getByRole("button", { name: /^Save$/i }).click();
    await expect(page.getByRole("dialog", { name: /Edit Sticker Description/i })).toBeVisible();
    await page.locator(".custom-modal-input").last().fill("Runs the meeting room.");
    await page.getByRole("button", { name: /^Save$/i }).click();
    await expect(page.getByRole("dialog", { name: /Edit Sticker Color/i })).toBeVisible();
    await page.getByRole("button", { name: /^Gold$/i }).click();
    await expect(setup).toContainText("Film Captain");
    await expect(setup).toContainText("Runs the meeting room.");
    await setup.getByRole("button", { name: /Delete Film Captain/i }).click();
    await expect(page.getByRole("dialog", { name: /Delete Sticker/i })).toBeVisible();
    await page.getByRole("button", { name: /^Delete$/i }).click();
    await expect(setup).not.toContainText("Film Captain");
    await setup.getByRole("button", { name: /Award Question/i }).click();
    const rosterPicker = page.locator(".coach-roster-picker-modal");
    await expect(rosterPicker).toBeVisible();
    await expect(rosterPicker).toContainText("Search the active roster");
    await expect(rosterPicker.locator('[data-player-name="Noah"]')).toBeVisible();
    await expect(rosterPicker.locator('[data-player-name="Ty"]')).toBeVisible();
    await expect(rosterPicker.locator('[data-player-name="Taj"]')).toBeVisible();
    await expect(rosterPicker.locator('[data-player-name="Mystery Player"]')).toHaveCount(0);
    await expect(rosterPicker.locator('[data-player-name="Ghost Login"]')).toHaveCount(0);
    await expect(rosterPicker.locator('[data-player-name="Old Name"]')).toHaveCount(0);
    await rosterPicker.getByLabel(/Search active roster players/i).fill("marco12");
    await expect(rosterPicker.locator('[data-player-name="Marco"]')).toBeVisible();
    await expect(rosterPicker.locator('[data-player-name="Lucas"]')).toBeHidden();
    await expect(rosterPicker).not.toContainText("Outside");
    await rosterPicker.getByRole("button", { name: /Cancel/i }).click();
    await expect(rosterPicker).toBeHidden();
    await awardHistory.getByRole("button", { name: /Revoke Gift reward from Ghost Login/i }).click();
    await expect(page.getByRole("dialog", { name: /Revoke Reward/i })).toBeVisible();
    await page.getByRole("button", { name: /^Revoke$/i }).click();
    await expect(awardHistory).not.toContainText("Ghost Login");
    await awardHistory.getByRole("button", { name: /Revoke Great Teammate sticker from Old Name/i }).click();
    await expect(page.getByRole("dialog", { name: /Revoke Sticker/i })).toBeVisible();
    await page.getByRole("button", { name: /^Revoke$/i }).click();
    await expect(awardHistory).not.toContainText("Old Name");
    await expect.poll(() => page.evaluate(() => ({
      rewards: storageManager.get(STORAGE_KEYS.PLAYER_REWARD_EVENTS, []).some((event) => event.id === "coach-reward-unknown"),
      stickers: storageManager.get(STORAGE_KEYS.PLAYER_HELMET_STICKERS, []).some((sticker) => sticker.id === "coach-sticker-unknown"),
    }))).toEqual({ rewards: false, stickers: false });
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
