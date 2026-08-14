// @ts-check
/**
 * T-009 P1 — the real Game Plan Coverage and Touch Tracker summaries stay
 * native disclosures while gaining a tablet-safe 44px touch target.
 */
const { test, expect } = require("@playwright/test");
const {
  login,
  dismissFirstUse,
  goToTab,
  assertNoHorizontalOverflow,
} = require("./helpers");

const GAMEPLAN_SUMMARY_FIXTURE = [
  {
    id: "gameplan-summary-run",
    type: "Run",
    personnel: "11",
    formation: "Trips",
    play: "Summary Buck Sweep",
    basePlay: "Buck",
    preferredDown: "1",
    preferredDistance: "Short",
    keyPlayer1: "RB",
    keyPlayerName1: "Avery Runner",
  },
  {
    id: "gameplan-summary-pass",
    type: "Pass",
    personnel: "10",
    formation: "Doubles",
    play: "Summary Four Verts",
    basePlay: "Verts",
    preferredDown: "3",
    preferredDistance: "Long",
    keyPlayer1: "WR",
    keyPlayerName1: "Mason Receiver",
  },
  {
    id: "gameplan-summary-screen",
    type: "Screen",
    personnel: "11",
    formation: "Bunch",
    play: "Summary Bubble",
    basePlay: "Bubble",
    preferredSituation: "Red Zone",
    keyPlayer1: "RB",
    keyPlayerName1: "Avery Runner",
  },
];

async function seedGamePlanSummaryFixture(page) {
  await page.evaluate((fixture) => {
    plays = fixture.map((play) => ({ ...play }));
    filteredPlays = plays.slice();

    const board = _gpCreateEmptyBoard();
    board.sheetTitle = "Summary touch fixture";
    board.assignments.Run = plays.map((play) => ({ ...play }));
    board.targets.Run = 3;
    storageManager.set(STORAGE_KEYS.GAME_PLAN_BOARDS, {
      [_gpActiveOpponentKey()]: board,
    });
    if (typeof invalidateFilterCache === "function") invalidateFilterCache();
    if (typeof renderGamePlan === "function") renderGamePlan();
  }, GAMEPLAN_SUMMARY_FIXTURE);
}

async function assertNativeSummaryToggle(page, detailsSelector, label) {
  const details = page.locator(detailsSelector);
  const summary = details.locator(":scope > summary");
  await expect(details, `${label} details is rendered`).toBeVisible();
  await expect(summary, `${label} summary is rendered`).toBeVisible();

  const before = await summary.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      tag: element.tagName,
      parentTag: element.parentElement?.tagName || "",
      width: rect.width,
      height: rect.height,
      open: element.parentElement?.open || false,
    };
  });
  expect(before.tag, `${label} uses a real summary element`).toBe("SUMMARY");
  expect(before.parentTag, `${label} summary remains inside details`).toBe("DETAILS");
  expect(before.width, `${label} summary target width`).toBeGreaterThanOrEqual(44);
  expect(before.height, `${label} summary target height`).toBeGreaterThanOrEqual(44);

  await summary.click();
  await expect.poll(
    () => details.evaluate((element) => element.open),
    `${label} opens through its native summary click`,
  ).toBe(!before.open);

  await summary.click();
  await expect.poll(
    () => details.evaluate((element) => element.open),
    `${label} closes through its same native summary click`,
  ).toBe(before.open);
}

test.describe("Game Plan summary touch targets", () => {
  test("Coverage and Touch Tracker open and collapse as 44px native summaries on iPad", async ({ page }, testInfo) => {
    test.skip(
      !["ipad-portrait", "ipad-landscape"].includes(testInfo.project.name),
      "This contract requires the touch-enabled iPad projects.",
    );

    await login(page, { role: "coach", username: "coach" });
    await dismissFirstUse(page);
    await goToTab(page, "gameplan");
    await seedGamePlanSummaryFixture(page);

    await assertNativeSummaryToggle(page, "#gameplan .gp-scoreboard:not(.gp-media-scoreboard)", "Coverage");
    await assertNativeSummaryToggle(page, "#gameplan .gp-touch-tracker", "Touch Tracker");
    await assertNoHorizontalOverflow(page);
  });
});
