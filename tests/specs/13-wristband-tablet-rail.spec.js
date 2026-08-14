// @ts-check
/**
 * Wristband constrained-landscape tablet editor contract.
 *
 * A staff tablet landscape keeps source plays and the card builder visible at
 * the same time. Portrait intentionally keeps the existing document stack.
 */
const { test, expect } = require("@playwright/test");
const {
  login,
  dismissFirstUse,
  goToTab,
  assertNoHorizontalOverflow,
} = require("./helpers");

const BUSY_LIBRARY_PLAYS = Array.from({ length: 56 }, (_, index) => ({
  type: index % 3 === 0 ? "Run" : index % 3 === 1 ? "Pass" : "Screen",
  personnel: String([10, 11, 12, 20][index % 4]),
  formation: ["Trips", "Doubles", "Bunch", "Empty"][index % 4],
  play: `Tablet Rail Play ${index + 1}`,
  basePlay: `Base ${index + 1}`,
  motion: index % 2 ? "Jet" : "",
  protection: "Slide",
  tempo: index % 2 ? "Fast" : "Normal",
}));

async function seedBusyWristbandLibrary(page) {
  await page.evaluate((samplePlays) => {
    plays = samplePlays.map((play) => ({ ...play }));
    filteredPlays = plays.slice();
    if (typeof invalidateFilterCache === "function") invalidateFilterCache();
    if (typeof populateFilters === "function") populateFilters();
    if (typeof filterPlays === "function") filterPlays();
    if (typeof populateWristbandCheckboxFilters === "function") {
      populateWristbandCheckboxFilters();
    }
    if (typeof renderWristbandPlays === "function") renderWristbandPlays();
  }, BUSY_LIBRARY_PLAYS);
}

async function startClassicWristband(page) {
  const classic = page.locator("#wbTypeChoice [data-action='startClassicWristband']");
  if (await classic.isVisible()) await classic.click();
  await expect(page.locator("#wristbandCard")).toBeVisible();
}

async function getWristbandRailState(page) {
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
    const panel = document.getElementById("wristband");
    const container = panel?.querySelector(".wristband-container");
    const library = document.getElementById("wbLibraryPane");
    const builder = panel?.querySelector(".wristband-preview");
    const results = document.getElementById("wbAvailablePlays");
    const close = document.getElementById("wbLibraryRailClose");
    const toggle = document.getElementById("wbLibraryRailToggle");
    const card = document.getElementById("wristbandCard");
    const libraryStyle = style(library);
    const builderStyle = style(builder);
    const resultsStyle = style(results);
    const containerStyle = style(container);
    return {
      bodyClass: document.body.className,
      panelClass: panel?.className || "",
      panelScrollTop: panel?.scrollTop || 0,
      paneAriaHidden: library?.getAttribute("aria-hidden") || "",
      toggleExpanded: toggle?.getAttribute("aria-expanded") || "",
      container: rect(container),
      library: rect(library),
      builder: rect(builder),
      card: rect(card),
      close: rect(close),
      display: {
        container: containerStyle?.display || "",
        library: libraryStyle?.display || "",
        builder: builderStyle?.display || "",
      },
      overflow: {
        library: libraryStyle?.overflowY || "",
        builder: builderStyle?.overflowY || "",
        results: resultsStyle?.overflowY || "",
      },
      scroll: {
        builderClient: builder?.clientHeight || 0,
        builderHeight: builder?.scrollHeight || 0,
        resultsClient: results?.clientHeight || 0,
        resultsHeight: results?.scrollHeight || 0,
      },
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  });
}

async function assertLandscapeRail(page, viewportWidth) {
  const state = await getWristbandRailState(page);
  expect(state.bodyClass).toContain("shell-tablet");
  expect(state.bodyClass).toContain("is-landscape-screen");
  expect(state.bodyClass).toContain("is-staff-mobile-shell");
  expect(state.viewport.width).toBe(viewportWidth);
  expect(state.display.container).toBe("flex");
  expect(state.display.library).toBe("flex");
  expect(state.display.builder).not.toBe("none");
  expect(state.library?.width).toBeGreaterThanOrEqual(240);
  expect(state.library?.width).toBeLessThanOrEqual(281);
  expect(state.library?.top).toBeCloseTo(state.builder?.top || 0, 0);
  expect(state.library?.bottom).toBeCloseTo(state.builder?.bottom || 0, 0);
  expect(state.builder?.left).toBeGreaterThanOrEqual((state.library?.right || 0) - 1);
  expect(state.builder?.height).toBeGreaterThan(360);
  expect(state.card?.right).toBeLessThanOrEqual((state.builder?.right || 0) + 1);
  expect(state.overflow.library).toBe("hidden");
  expect(state.overflow.results).toBe("auto");
  expect(state.overflow.builder).toBe("auto");
  expect(state.close?.width).toBeGreaterThanOrEqual(44);
  expect(state.close?.height).toBeGreaterThanOrEqual(44);
  expect(state.paneAriaHidden).toBe("false");
  expect(state.toggleExpanded).toBe("true");
  return state;
}

test.describe("Wristband tablet landscape rail", () => {
  test("coach keeps a collapsible source rail beside the full-height builder at 1024 and 1366", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "ipad-landscape",
      "This contract requires the touch-enabled iPad landscape project.",
    );

    await login(page, { role: "coach", username: "coach" });
    await dismissFirstUse(page);
    await page.setViewportSize({ width: 1024, height: 768 });
    await seedBusyWristbandLibrary(page);
    await goToTab(page, "wristband");
    await startClassicWristband(page);
    await expect(page.locator("#wbAvailablePlays .wb-play-item").first()).toBeVisible();

    const openState = await assertLandscapeRail(page, 1024);
    expect(openState.scroll.resultsHeight).toBeGreaterThan(openState.scroll.resultsClient);
    expect(openState.scroll.builderHeight).toBeGreaterThan(openState.scroll.builderClient);

    const deliberateScroll = await page.evaluate(() => {
      const results = document.getElementById("wbAvailablePlays");
      const builder = document.querySelector("#wristband .wristband-preview");
      if (results) results.scrollTop = 140;
      if (builder) builder.scrollTop = 140;
      return {
        results: results?.scrollTop || 0,
        builder: builder?.scrollTop || 0,
        panel: document.getElementById("wristband")?.scrollTop || 0,
      };
    });
    expect(deliberateScroll.results).toBeGreaterThan(0);
    expect(deliberateScroll.builder).toBeGreaterThan(0);
    expect(deliberateScroll.panel).toBe(0);

    const close = page.locator("#wbLibraryRailClose");
    const toggle = page.locator("#wbLibraryRailToggle");
    await close.click();
    await expect(page.locator("#wristband")).toHaveClass(/wb-tablet-library-collapsed/);
    await expect(page.locator("#wbLibraryPane")).toBeHidden();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe("wbLibraryRailToggle");

    const collapsedBuilderWidth = await page.locator("#wristband .wristband-preview").evaluate(
      (element) => element.getBoundingClientRect().width,
    );
    expect(collapsedBuilderWidth).toBeGreaterThan((openState.builder?.width || 0) + 180);

    await toggle.click();
    await expect(page.locator("#wbLibraryPane")).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

    await page.setViewportSize({ width: 1366, height: 768 });
    await expect.poll(() => getWristbandRailState(page).then((state) => state.viewport.width)).toBe(1366);
    await assertLandscapeRail(page, 1366);
    await assertNoHorizontalOverflow(page);
  });

  test("coach portrait retains the existing document stack instead of the landscape rail", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "ipad-portrait",
      "This contract requires the touch-enabled iPad portrait project.",
    );

    await login(page, { role: "coach", username: "coach" });
    await dismissFirstUse(page);
    await seedBusyWristbandLibrary(page);
    await goToTab(page, "wristband");
    await startClassicWristband(page);

    const state = await getWristbandRailState(page);
    expect(state.bodyClass).toContain("shell-tablet");
    expect(state.bodyClass).toContain("is-portrait-screen");
    expect(state.panelClass).not.toContain("wb-tablet-library-collapsed");
    expect(state.display.container).toBe("grid");
    expect(state.library?.top).toBeLessThan(state.builder?.top || 0);
    expect(state.close?.width || 0).toBe(0);
    await assertNoHorizontalOverflow(page);
  });
});
