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
  // summary again. Preserve the successful measurement: fetching a second
  // set after the poll can land in the deliberately transient replacement
  // frame and report a 0×0 box for an otherwise visible, live control.
  let readyRects = [];
  await expect.poll(async () => {
    const rects = await targetRects(page, selector);
    const ready = rects.length >= minimumCount && rects.every((rect) => rect.width >= 44 && rect.height >= 44);
    if (ready) readyRects = rects;
    return ready;
  }).toBe(true);
  return readyRects;
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
    const filterOptionRects = await waitForTouchTargets(
      page,
      "#playerPlaybookFilterOverlay .pb-player-filter-option",
      6,
    );
    filterOptionRects.forEach((rect) => expectTouchTarget(rect, `Filter choice ${rect.label}`));
    await filterOverlay.getByRole("button", { name: /Close filters/i }).click();
    await expect(filterOverlay).toHaveCount(0);

    await summary.getByRole("button", { name: "Personnel", exact: true }).click();
    await expect(filterOverlay).toBeVisible();
    await expect(filterOverlay.locator("[data-filter-group='personnel']").first()).toBeVisible();
    await filterOverlay.getByRole("button", { name: /Close filters/i }).click();
    await expect(filterOverlay).toHaveCount(0);

    await assertNoHorizontalOverflow(page);
  });

  test("compact iPad portrait keeps Today's work content-height after stacking the home hero", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "ipad-portrait",
      "This regression applies only to the compact portrait tablet shell.",
    );

    await login(page, { role: "player", username: "player", password: "password" });
    await dismissFirstUse(page);
    await goToTab(page, "dashboard");

    const layout = await page.evaluate(() => {
      const read = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return { top: rect.top, height: rect.height };
      };
      return {
        shell: document.body.className,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        hero: read("#playerDashboardHome .player-home-hero"),
        today: read("#playerDashboardHome .player-home-today-card"),
        command: read("#playerDashboardHome .player-home-command"),
      };
    });

    expect(layout.shell).toContain("shell-tablet");
    expect(layout.shell).toContain("is-player-mobile-shell");
    expect(layout.today).not.toBeNull();
    expect(layout.hero).not.toBeNull();
    expect(layout.command).not.toBeNull();
    expect(layout.today?.height || 0).toBeLessThan(240);
    expect(layout.hero?.height || 0).toBeLessThan(360);
    expect(layout.command?.top || 0).toBeLessThan(layout.viewport.height);
  });
});
