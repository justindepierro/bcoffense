// @ts-check
/**
 * T-009 P1 — Player Playbook's real summary actions and quick-filter pills
 * remain independently tappable on an iPad without changing the phone study
 * layout or staff workbench.
 */
const { test, expect } = require("@playwright/test");
const { login, dismissFirstUse, goToTab, assertNoHorizontalOverflow } = require("./helpers");

const PLAYER_PLAYBOOK_FIXTURE = [
  {
    id: "player-touch-run",
    type: "Run",
    personnel: "11",
    formation: "Trips",
    play: "Touch Buck Sweep",
    basePlay: "Buck",
    motion: "Jet",
    protection: "Slide",
    tempo: "Fast",
    playerNotes: "Secure the edge before the cut.",
  },
  {
    id: "player-touch-pass",
    type: "Pass",
    personnel: "10",
    formation: "Doubles",
    play: "Touch Four Verts",
    basePlay: "Verts",
    motion: "Orbit",
    protection: "Half Slide",
    tempo: "NASCAR",
  },
];

function expectTouchTarget(rect, label) {
  expect(rect, `${label} exists`).not.toBeNull();
  expect(rect?.width || 0, `${label} width`).toBeGreaterThanOrEqual(44);
  expect(rect?.height || 0, `${label} height`).toBeGreaterThanOrEqual(44);
}

async function targetRects(page, selector) {
  return page.locator(selector).evaluateAll((elements) => elements.map((element) => {
    const box = element.getBoundingClientRect();
    return { width: box.width, height: box.height, label: element.textContent?.trim() || "" };
  }));
}

async function waitForTouchTargets(page, selector, minimumCount) {
  // Player diagram availability warms asynchronously and can render this
  // summary again. Poll across that intentional replacement rather than
  // retaining a detached button handle whose temporary rect is 0×0.
  await expect.poll(async () => {
    const rects = await targetRects(page, selector);
    return rects.length >= minimumCount && rects.every((rect) => rect.width >= 44 && rect.height >= 44);
  }).toBe(true);
  return targetRects(page, selector);
}

async function seedPlayerPlaybook(page) {
  await page.evaluate((fixture) => {
    plays = fixture.map((play) => ({ ...play }));
    filteredPlays = plays.slice();
    currentPage = 0;
    if (typeof invalidateFilterCache === "function") invalidateFilterCache();
    if (typeof populateFilters === "function") populateFilters();
    if (typeof renderPlaybook === "function") renderPlaybook();
  }, PLAYER_PLAYBOOK_FIXTURE);
  await expect(page.locator("#playerPlaybookSummary")).toBeVisible();
}

test.describe("Player Playbook tablet touch targets", () => {
  test("summary actions and quick filters stay at 44px and use their live study flows on iPad", async ({ page }, testInfo) => {
    test.skip(
      !["ipad-portrait", "ipad-landscape"].includes(testInfo.project.name),
      "This contract requires the touch-enabled iPad projects.",
    );

    await login(page, { role: "player", username: "player", password: "password" });
    await dismissFirstUse(page);
    await goToTab(page, "playbook");
    await seedPlayerPlaybook(page);

    const shell = await page.evaluate(() => ({
      coarse: window.matchMedia("(pointer: coarse)").matches,
      tablet: document.body.classList.contains("shell-tablet"),
      playerStudy: document.body.classList.contains("is-player-mobile-shell"),
    }));
    expect(shell).toEqual({ coarse: true, tablet: true, playerStudy: true });

    const summary = page.locator("#playerPlaybookSummary");
    const actionRects = await waitForTouchTargets(
      page,
      "#playerPlaybookSummary .pb-player-summary__actions .btn",
      2,
    );
    expect(actionRects.length, "player summary renders study actions").toBeGreaterThanOrEqual(2);
    actionRects.forEach((rect) => expectTouchTarget(rect, `Player action ${rect.label}`));

    const quickFilterRects = await waitForTouchTargets(
      page,
      "#playerPlaybookSummary .pb-player-summary__filter-pill",
      9,
    );
    expect(quickFilterRects.length, "player summary renders quick filters").toBeGreaterThanOrEqual(9);
    quickFilterRects.forEach((rect) => expectTouchTarget(rect, `Quick filter ${rect.label}`));

    const filtersAction = summary.getByRole("button", { name: "Filters", exact: true });
    await filtersAction.click();
    const filterOverlay = page.locator("#playerPlaybookFilterOverlay");
    await expect(filterOverlay).toBeVisible();
    await filterOverlay.getByRole("button", { name: /Close filters/i }).click();
    await expect(filterOverlay).toHaveCount(0);

    await summary.getByRole("button", { name: "Personnel", exact: true }).click();
    await expect(filterOverlay).toBeVisible();
    await expect(filterOverlay.locator("[data-filter-group='personnel']").first()).toBeVisible();
    await filterOverlay.getByRole("button", { name: /Close filters/i }).click();
    await expect(filterOverlay).toHaveCount(0);

    await assertNoHorizontalOverflow(page);
  });
});
