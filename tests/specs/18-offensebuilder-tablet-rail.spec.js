// @ts-check
/**
 * Offense Builder staff-tablet contract.
 *
 * A coach iPad in landscape keeps a compact semantic source rail alongside a
 * detail pane. Source and detail own vertical scroll; portrait intentionally
 * retains the document stack. Rating, card selection, and detail navigation
 * must remain native keyboard/touch controls.
 */
const { test, expect } = require("@playwright/test");
const {
  login,
  dismissFirstUse,
  goToTab,
  assertNoHorizontalOverflow,
} = require("./helpers");

const TABLET_LANDSCAPE_VIEWPORTS = [
  { width: 1024, height: 768 },
  { width: 1366, height: 768 },
];

const OFFENSE_BUILDER_FIXTURE = [
  ...Array.from({ length: 18 }, (_, index) => ({
    id: `ob-buck-${index + 1}`,
    type: index % 2 ? "Run" : "RPO",
    personnel: ["10", "11", "12"][index % 3],
    formation: `Buck Formation ${index + 1}`,
    play: "Buck Sweep",
    basePlay: "Buck",
    motion: index % 2 ? "Jet" : "Orbit",
    protection: "Slide",
    tempo: "Fast",
    constraint1: "Counter",
    constraint2: "Play Action",
    deadVs: "Over Front",
    keyPlayer1: "RB",
    keyPlayerName1: "Taylor",
    hitChart1: ["C Gap", "D Gap", "Alley"][index % 3],
    playTag1: `Tag ${index + 1}`,
    notes: `Buck detail note ${index + 1}`,
  })),
  {
    id: "ob-buck-boot",
    type: "Play Action",
    personnel: "11",
    formation: "Trips",
    play: "Buck Boot",
    basePlay: "Buck",
    motion: "Jet",
    constraint1: "Counter",
  },
  {
    id: "ob-counter",
    type: "Run",
    personnel: "12",
    formation: "Bunch",
    play: "Counter GT",
    basePlay: "Counter",
    constraint1: "Buck",
  },
  ...Array.from({ length: 54 }, (_, index) => ({
    id: `ob-tablet-${index + 1}`,
    type: index % 2 ? "Pass" : "Run",
    personnel: ["10", "11", "12", "20"][index % 4],
    formation: `Formation ${index % 12 + 1}`,
    play: `Tablet Builder Call ${index + 1}`,
    basePlay: `Concept ${index % 18 + 1}`,
    motion: index % 3 === 0 ? "Jet" : "",
    constraint1: index % 4 === 0 ? "Counter" : "",
  })),
];

async function seedOffenseBuilder(page) {
  await page.evaluate((samplePlays) => {
    plays = samplePlays.map((play) => ({ ...play }));
    filteredPlays = plays.slice();
    obActivePlayName = null;
    obSearchTerm = "";
    obFilterType = "";
    obShowRatedOnly = false;
    storageManager.set(STORAGE_KEYS.OB_PLAY_RATINGS, { "Buck Sweep": 3 });
    if (typeof invalidateFilterCache === "function") invalidateFilterCache();
    if (typeof initOffenseBuilder === "function") initOffenseBuilder();
  }, OFFENSE_BUILDER_FIXTURE);
}

async function getOffenseBuilderState(page) {
  return page.evaluate(() => {
    const rect = (element) => {
      if (!element) return null;
      const value = element.getBoundingClientRect();
      return {
        top: value.top,
        right: value.right,
        bottom: value.bottom,
        left: value.left,
        width: value.width,
        height: value.height,
      };
    };
    const style = (element) => (element ? getComputedStyle(element) : null);
    const panel = document.getElementById("offensebuilder");
    const body = panel?.querySelector(".ob-body");
    const rail = panel?.querySelector(".ob-source-rail");
    const list = document.getElementById("obPlayList");
    const sidebar = document.getElementById("obSidebar");
    const firstCard = list?.querySelector(".ob-card");
    const cardSelect = firstCard?.querySelector(".ob-card-select");
    const listStars = Array.from(firstCard?.querySelectorAll(".ob-star") || []);
    const clear = firstCard?.querySelector(".ob-star-clear");
    const detail = document.getElementById("obDetailPanel");
    const detailStars = Array.from(detail?.querySelectorAll(".ob-star") || []);
    const concept = detail?.querySelector("button[data-concept]");
    const related = detail?.querySelector("button[data-related-play]");
    const toggle = panel?.querySelector(".ob-toggle-label");
    const toggleInput = document.getElementById("obShowRated");

    return {
      bodyClass: document.body.className,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      panel: rect(panel),
      body: rect(body),
      rail: rect(rail),
      list: rect(list),
      sidebar: rect(sidebar),
      detail: rect(detail),
      display: {
        railHeading: style(rail?.querySelector(".ob-source-rail-heading"))?.display || "",
        body: style(body)?.display || "",
      },
      gridColumns: style(body)?.gridTemplateColumns || "",
      overflow: {
        panel: style(panel)?.overflowY || "",
        list: style(list)?.overflowY || "",
        sidebar: style(sidebar)?.overflowY || "",
      },
      scroll: {
        listClient: list?.clientHeight || 0,
        listHeight: list?.scrollHeight || 0,
        sidebarClient: sidebar?.clientHeight || 0,
        sidebarHeight: sidebar?.scrollHeight || 0,
      },
      controls: {
        card: rect(cardSelect),
        cardTag: cardSelect?.tagName || "",
        listStars: listStars.map((element) => ({ rect: rect(element), tag: element.tagName })),
        clear: { rect: rect(clear), tag: clear?.tagName || "" },
        detailStars: detailStars.map((element) => ({ rect: rect(element), tag: element.tagName })),
        concept: { rect: rect(concept), tag: concept?.tagName || "" },
        related: { rect: rect(related), tag: related?.tagName || "" },
        toggle: rect(toggle),
        toggleInput: rect(toggleInput),
      },
    };
  });
}

function expectLandscapeShell(state, width) {
  expect(state.bodyClass).toContain("shell-tablet");
  expect(state.bodyClass).toContain("is-staff-mobile-shell");
  expect(state.bodyClass).toContain("is-landscape-screen");
  expect(state.viewport.width).toBe(width);
}

function expectTarget(rect, label, min = 44) {
  expect(rect, `${label} is rendered`).not.toBeNull();
  expect(rect?.width || 0, `${label} width`).toBeGreaterThanOrEqual(min);
  expect(rect?.height || 0, `${label} height`).toBeGreaterThanOrEqual(min);
}

test.describe("Offense Builder staff tablet rail", () => {
  test("coach has a compact semantic source rail and independently scrollable detail at 1024 and 1366", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "ipad-landscape",
      "This contract requires the touch-enabled iPad landscape project.",
    );

    await login(page, { role: "coach", username: "coach" });
    await dismissFirstUse(page);

    for (const viewport of TABLET_LANDSCAPE_VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(180);
      await seedOffenseBuilder(page);
      await goToTab(page, "offensebuilder");
      await expect(page.locator("#obPlayList .ob-card-select").first()).toBeVisible();

      const beforeSelection = await getOffenseBuilderState(page);
      expectLandscapeShell(beforeSelection, viewport.width);
      expect(beforeSelection.display.body).toBe("grid");
      expect(beforeSelection.display.railHeading).toBe("flex");
      expect(beforeSelection.rail?.width || 0).toBeGreaterThanOrEqual(240);
      expect(beforeSelection.rail?.width || 0).toBeLessThanOrEqual(280);
      expect(beforeSelection.sidebar?.left || 0).toBeGreaterThanOrEqual((beforeSelection.rail?.right || 0) - 1);
      expect(beforeSelection.overflow.panel).toBe("hidden");
      expect(beforeSelection.overflow.list).toBe("auto");
      expect(beforeSelection.overflow.sidebar).toBe("auto");
      expect(beforeSelection.scroll.listHeight).toBeGreaterThan(beforeSelection.scroll.listClient);
      expect(beforeSelection.controls.cardTag).toBe("BUTTON");
      expectTarget(beforeSelection.controls.card, "Play detail button");
      expect(beforeSelection.controls.listStars.length).toBe(5);
      beforeSelection.controls.listStars.forEach((star, index) => {
        expect(star.tag, `List star ${index + 1} is a button`).toBe("BUTTON");
        expectTarget(star.rect, `List star ${index + 1}`);
      });
      expect(beforeSelection.controls.clear.tag).toBe("BUTTON");
      expectTarget(beforeSelection.controls.clear.rect, "Clear rating");
      expectTarget(beforeSelection.controls.toggle, "Rated-only label");
      expectTarget(beforeSelection.controls.toggleInput, "Rated-only checkbox");

      const firstSelect = page.locator("#obPlayList .ob-card-select").first();
      await firstSelect.focus();
      await page.keyboard.press("Enter");
      await expect(page.locator("#obDetailPanel h3")).toHaveText("Buck Sweep");

      const listFourStars = page.locator("#obPlayList .ob-card[data-play='Buck Sweep'] .ob-star[data-value='4']");
      await listFourStars.focus();
      await page.keyboard.press("Space");
      await expect.poll(() => page.evaluate(() => obLoadRatings()["Buck Sweep"])).toBe(4);

      const detailFiveStars = page.locator("#obDetailPanel .ob-star[data-value='5']");
      await detailFiveStars.focus();
      await page.keyboard.press("Enter");
      await expect.poll(() => page.evaluate(() => obLoadRatings()["Buck Sweep"])).toBe(5);

      const selected = await getOffenseBuilderState(page);
      expect(selected.controls.detailStars.length).toBe(5);
      selected.controls.detailStars.forEach((star, index) => {
        expect(star.tag, `Detail star ${index + 1} is a button`).toBe("BUTTON");
        expectTarget(star.rect, `Detail star ${index + 1}`);
      });
      expect(selected.controls.concept.tag).toBe("BUTTON");
      expect(selected.controls.related.tag).toBe("BUTTON");
      expectTarget(selected.controls.concept.rect, "Concept navigation");
      expectTarget(selected.controls.related.rect, "Related-play navigation");
      expect(selected.scroll.sidebarHeight).toBeGreaterThan(selected.scroll.sidebarClient);

      const concept = page.locator("#obDetailPanel button[data-concept='Counter']");
      await concept.focus();
      await page.keyboard.press("Enter");
      await expect(page.locator("#obDetailPanel h3")).toHaveText("Counter GT");

      const buckSelect = page.locator("#obPlayList .ob-card-select[data-ob-select-play='Buck Sweep']");
      await buckSelect.click();
      const related = page.locator("#obDetailPanel button[data-related-play='Buck Boot']");
      await related.focus();
      await page.keyboard.press("Space");
      await expect(page.locator("#obDetailPanel h3")).toHaveText("Buck Boot");

      const scroll = await page.evaluate(() => {
        const list = document.getElementById("obPlayList");
        const sidebar = document.getElementById("obSidebar");
        const panel = document.getElementById("offensebuilder");
        if (list) list.scrollTop = 180;
        if (sidebar) sidebar.scrollTop = 180;
        return {
          list: list?.scrollTop || 0,
          sidebar: sidebar?.scrollTop || 0,
          panel: panel?.scrollTop || 0,
        };
      });
      expect(scroll.list).toBeGreaterThan(0);
      expect(scroll.sidebar).toBeGreaterThan(0);
      expect(scroll.panel).toBe(0);
      await assertNoHorizontalOverflow(page);
    }
  });

  test("coach portrait preserves the stacked Offense Builder document layout", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "ipad-portrait",
      "Portrait is independently protected from the landscape rail treatment.",
    );

    await login(page, { role: "coach", username: "coach" });
    await dismissFirstUse(page);
    await seedOffenseBuilder(page);
    await goToTab(page, "offensebuilder");
    await expect(page.locator("#obPlayList .ob-card-select").first()).toBeVisible();

    const state = await getOffenseBuilderState(page);
    expect(state.bodyClass).toContain("shell-tablet");
    expect(state.bodyClass).toContain("is-portrait-screen");
    expect(state.bodyClass).not.toContain("is-landscape-screen");
    expect(state.display.railHeading).toBe("none");
    expect((state.rail?.bottom || 0)).toBeLessThanOrEqual((state.sidebar?.top || 0) + 2);
    expect(state.overflow.panel).not.toBe("hidden");
    expectTarget(state.controls.card, "Portrait play detail button");
    state.controls.listStars.forEach((star, index) => {
      expect(star.tag, `Portrait star ${index + 1} is a button`).toBe("BUTTON");
      expectTarget(star.rect, `Portrait star ${index + 1}`);
    });
    await assertNoHorizontalOverflow(page);
  });
});
