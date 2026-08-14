// @ts-check
/**
 * Signals staff-tablet landscape contract.
 *
 * Signals uses a compact Coach Grid treatment only in the constrained staff
 * landscape shell. The 1024px case keeps source categories legible above the
 * selected detail; at 1366px it may use the available workspace differently,
 * but must keep the compact stats row, usable categories, and tablet targets.
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

const SIGNAL_FIXTURE_PLAYS = Array.from({ length: 18 }, (_, index) => ({
  id: `signals-tablet-${index + 1}`,
  type: index % 2 ? "Pass" : "Run",
  personnel: ["10", "11", "12"][index % 3],
  formation: ["Trips Rt", "Doubles", "Bunch"][index % 3],
  play: ["Jet Sweep", "Four Verts", "Counter GT"][index % 3],
  basePlay: ["Jet", "Verts", "Counter"][index % 3],
  formTag1: ["Nub", "Tight", "Wide"][index % 3],
  playTag1: ["Alert", "Now", "Choice"][index % 3],
  oneWord: ["Turbo", "Rocket", "Flash"][index % 3],
  protection: ["Slide", "Half Slide", "Big on Big"][index % 3],
  lineCall: ["Mike 52", "Mike 44", "Mike 30"][index % 3],
  back: ["Scan", "Check", "Free Release"][index % 3],
  under: ["Under", "Over", "Push"][index % 3],
  shift: ["Shift Right", "Shift Left", "Trade"][index % 3],
  motion: index % 3 === 0 ? "Jet" : index % 3 === 1 ? "Orbit" : "Return",
}));

async function seedSignalsTabletWorkspace(page) {
  await page.evaluate((samplePlays) => {
    const sig = "signals/motion/jet";
    const clip = {
      id: "signals-tablet-jet-clip",
      label: "Jet motion signal",
      url: "data:video/mp4;base64,AAAA",
      duration: 4,
      size: 4096,
    };
    const records = [{
      id: "motion:jet",
      category: "MOTIONS",
      componentType: "motion",
      componentValue: "Jet",
      compareKey: "jet",
      clipKey: sig,
      clipCount: 1,
      visibility: "published",
      updatedAt: new Date().toISOString(),
    }];

    plays = samplePlays.map((play) => ({ ...play }));
    filteredPlays = plays.slice();
    if (typeof storageManager !== "undefined" && typeof STORAGE_KEYS !== "undefined") {
      storageManager.set(STORAGE_KEYS.SIGNALS, records);
    }
    if (typeof _sigSaveRecords === "function") _sigSaveRecords(records);
    window.playClips = {
      ...(window.playClips || {}),
      loadIndex: async () => new Set(),
      listForSig: async (requestedSig) => (requestedSig === sig ? [clip] : []),
      listForSigs: async (sigs) => Object.fromEntries((sigs || []).map((item) => [
        item,
        item === sig ? [clip] : [],
      ])),
    };
    if (typeof invalidateFilterCache === "function") invalidateFilterCache();
    if (typeof openSignalComponentDetails === "function") {
      openSignalComponentDetails("motion|jet");
    } else if (typeof renderSignals === "function") {
      renderSignals();
    }
  }, SIGNAL_FIXTURE_PLAYS);
}

async function getSignalsWorkspaceState(page) {
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
    const shell = document.querySelector("#signals .signals-shell");
    const header = shell?.querySelector(".signals-header");
    const stats = header?.querySelector(".signals-stats");
    const categoryGrid = shell?.querySelector(".signals-category-grid");
    const layout = shell?.querySelector(".signals-layout");
    const detail = shell?.querySelector(".signals-detail");
    const watch = shell?.querySelector("#signalClipList .signals-clip-open");
    const style = (element) => (element ? getComputedStyle(element) : null);
    const statRects = Array.from(stats?.querySelectorAll(".signals-stat") || []).map(rect);
    const categoryRects = Array.from(categoryGrid?.querySelectorAll(":scope > .signals-category") || []).map(rect);
    const statTopValues = statRects.map((value) => value?.top || 0);

    return {
      bodyClass: document.body.className,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      shell: rect(shell),
      header: rect(header),
      stats: rect(stats),
      statRects,
      statTopSpread: statTopValues.length
        ? Math.max(...statTopValues) - Math.min(...statTopValues)
        : null,
      categoryGrid: rect(categoryGrid),
      categoryRects,
      detail: rect(detail),
      watch: rect(watch),
      display: {
        header: style(header)?.display || "",
        stats: style(stats)?.display || "",
        categoryGrid: style(categoryGrid)?.display || "",
        layout: style(layout)?.display || "",
      },
      layoutColumns: style(layout)?.gridTemplateColumns || "",
      categoryColumns: style(categoryGrid)?.gridTemplateColumns || "",
    };
  });
}

function assertCompactSignalsStats(state) {
  expect(state.display.stats).toBe("grid");
  expect(state.statRects.length).toBeGreaterThanOrEqual(3);
  expect(state.statTopSpread).not.toBeNull();
  expect(state.statTopSpread || 0).toBeLessThanOrEqual(2);
  for (const stat of state.statRects) {
    expect(stat?.height || 0).toBeGreaterThanOrEqual(36);
    expect(stat?.height || 0).toBeLessThanOrEqual(52);
  }
}

function assertLandscapeSignalsWorkspace(state, viewportWidth) {
  expect(state.bodyClass).toContain("shell-tablet");
  expect(state.bodyClass).toContain("is-landscape-screen");
  expect(state.bodyClass).toContain("is-staff-mobile-shell");
  expect(state.viewport.width).toBe(viewportWidth);
  expect(state.shell?.width || 0).toBeGreaterThan(600);
  expect(state.categoryRects.length).toBe(4);
  expect(state.watch?.width || 0).toBeGreaterThanOrEqual(44);
  expect(state.watch?.height || 0).toBeGreaterThanOrEqual(44);
  assertCompactSignalsStats(state);
}

test.describe("Signals staff tablet landscape", () => {
  test("coach has compact stats, usable source categories, and a 44px Watch target at 1024 and 1366", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "ipad-landscape",
      "This contract requires the touch-enabled iPad landscape project.",
    );

    await login(page, { role: "coach", username: "coach" });
    await dismissFirstUse(page);

    for (const viewport of TABLET_LANDSCAPE_VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(180);
      await seedSignalsTabletWorkspace(page);
      await goToTab(page, "signals");
      await expect(page.locator("#signalClipList .signals-clip-open")).toBeVisible();

      const state = await getSignalsWorkspaceState(page);
      assertLandscapeSignalsWorkspace(state, viewport.width);

      const [firstCategory, secondCategory] = state.categoryRects;
      expect(Math.min(...state.categoryRects.map((item) => item?.width || 0))).toBeGreaterThanOrEqual(250);
      if (viewport.width === 1024) {
        // The narrower post-rail workspace deliberately keeps source cards
        // in a readable two-column grid, then puts detail below it.
        expect(Math.abs((firstCategory?.top || 0) - (secondCategory?.top || 0))).toBeLessThanOrEqual(2);
        expect(firstCategory?.right || 0).toBeLessThanOrEqual((secondCategory?.left || 0) + 2);
        expect(state.detail?.top || 0).toBeGreaterThanOrEqual((state.categoryGrid?.bottom || 0) - 2);
      }

      await assertNoHorizontalOverflow(page);
    }
  });

  test("coach portrait preserves the stacked Signals document layout", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "ipad-portrait",
      "This contract requires the touch-enabled iPad portrait project.",
    );

    await login(page, { role: "coach", username: "coach" });
    await dismissFirstUse(page);
    await seedSignalsTabletWorkspace(page);
    await goToTab(page, "signals");
    await expect(page.locator("#signalClipList .signals-clip-open")).toBeVisible();

    const state = await getSignalsWorkspaceState(page);
    expect(state.bodyClass).toContain("shell-tablet");
    expect(state.bodyClass).toContain("is-portrait-screen");
    expect(state.bodyClass).not.toContain("is-landscape-screen");
    expect(state.categoryRects.length).toBe(4);
    expect(state.categoryRects[0]?.top || 0).toBeLessThan(state.categoryRects[1]?.top || 0);
    expect(state.detail?.top || 0).toBeGreaterThanOrEqual((state.categoryGrid?.bottom || 0) - 2);
    await assertNoHorizontalOverflow(page);
  });
});
