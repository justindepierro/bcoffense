// @ts-check
/**
 * Tablet touch-target regression contract.
 *
 * These are direct, independently tappable controls: presentation navigation
 * and close, plus the Wristband batch color swatches. They must remain 44px
 * even when the surrounding landscape workbench is deliberately compact.
 */
const { test, expect } = require("@playwright/test");
const {
  login,
  dismissFirstUse,
  goToTab,
  assertNoHorizontalOverflow,
} = require("./helpers");

const LANDSCAPE_VIEWPORTS = [
  { width: 1024, height: 768 },
  { width: 1366, height: 768 },
];

const PRESENTATION_PLAYS = [
  {
    id: "tablet-target-1",
    type: "Run",
    personnel: "11",
    formation: "Trips",
    play: "Tablet Target Buck",
    basePlay: "Buck",
    motion: "Jet",
  },
  {
    id: "tablet-target-2",
    type: "Pass",
    personnel: "10",
    formation: "Doubles",
    play: "Tablet Target Verts",
    basePlay: "Verts",
    protection: "Half Slide",
  },
];

async function seedTabletTargetPlays(page) {
  await page.evaluate((samplePlays) => {
    plays = samplePlays.map((play) => ({ ...play }));
    filteredPlays = plays.slice();
    if (typeof invalidateFilterCache === "function") invalidateFilterCache();
    if (typeof populateFilters === "function") populateFilters();
    if (typeof filterPlays === "function") filterPlays();
    if (typeof renderWristbandPlays === "function") renderWristbandPlays();
  }, PRESENTATION_PLAYS);
}

async function getTargetRects(page) {
  return page.evaluate(() => {
    const rect = (element) => {
      if (!element) return null;
      const value = element.getBoundingClientRect();
      return { width: value.width, height: value.height };
    };
    return {
      bodyClass: document.body.className,
      previous: rect(document.getElementById("playPresentationPrev")),
      next: rect(document.getElementById("playPresentationNext")),
      close: rect(document.getElementById("playPresentationClose")),
      swatches: Array.from(
        document.querySelectorAll("#wbBatchSwatches .wb-batch-swatch"),
      ).map(rect),
    };
  });
}

function expectAtLeastTabletTarget(rect, label) {
  expect(rect, `${label} is rendered`).not.toBeNull();
  expect(rect?.width || 0, `${label} width`).toBeGreaterThanOrEqual(44);
  expect(rect?.height || 0, `${label} height`).toBeGreaterThanOrEqual(44);
}

async function openBatchBar(page) {
  await goToTab(page, "wristband");
  await page.evaluate(() => {
    if (typeof startClassicWristband === "function") startClassicWristband();
    if (typeof setWbSelectedCells === "function") setWbSelectedCells(["0-0"]);
  });
  await expect(page.locator("#wbBatchBar")).toHaveClass(/visible/);
  await expect(page.locator("#wbBatchSwatches .wb-batch-swatch").first()).toBeVisible();
}

async function dismissPresentationIpadHelp(page) {
  const help = page.locator("#playPresentationIpadHelp");
  if (!(await help.isVisible())) return;
  await help.getByRole("button", { name: /Don't show again/i }).click();
  await expect(help).toBeHidden();
}

test.describe("Tablet touch targets", () => {
  test("coach presentation controls and Wristband batch colors stay 44px at 1024 and 1366 landscape", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "ipad-landscape",
      "This contract requires the touch-enabled iPad landscape project.",
    );

    await login(page, { role: "coach", username: "coach" });
    await dismissFirstUse(page);

    for (const viewport of LANDSCAPE_VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(120);
      await seedTabletTargetPlays(page);
      await goToTab(page, "playbook");
      await page.evaluate(() => openPlaybookPresentation(0));

      const presentation = page.locator("#playPresentationOverlay");
      await expect(presentation).toHaveAttribute("data-presentation-open", "true");
      await dismissPresentationIpadHelp(page);

      const presentationTargets = await getTargetRects(page);
      expect(presentationTargets.bodyClass).toContain("shell-tablet");
      expect(presentationTargets.bodyClass).toContain("is-landscape-screen");
      expectAtLeastTabletTarget(presentationTargets.previous, "Previous play");
      expectAtLeastTabletTarget(presentationTargets.next, "Next play");
      expectAtLeastTabletTarget(presentationTargets.close, "Close presentation");

      await presentation.locator("#playPresentationNext").click();
      await expect(presentation.locator("#playPresentationCounter")).toContainText("2 / 2");
      await presentation.locator("#playPresentationClose").click();
      await expect(presentation).not.toHaveAttribute("data-presentation-open", "true");

      await openBatchBar(page);
      const batchTargets = await getTargetRects(page);
      expect(batchTargets.bodyClass).toContain("is-staff-mobile-shell");
      expect(batchTargets.swatches).toHaveLength(8);
      batchTargets.swatches.forEach((swatch, index) => {
        expectAtLeastTabletTarget(swatch, `Batch color ${index + 1}`);
      });

      await page.locator("#wbBatchSwatches .wb-batch-swatch").nth(1).click();
      await expect(page.locator("#wbBatchSwatches .wb-batch-swatch").nth(1)).toHaveClass(/active/);
      await assertNoHorizontalOverflow(page);
    }
  });

  test("coach portrait keeps the same 44px batch-color target", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "ipad-portrait",
      "This contract requires the touch-enabled iPad portrait project.",
    );

    await login(page, { role: "coach", username: "coach" });
    await dismissFirstUse(page);
    await seedTabletTargetPlays(page);
    await openBatchBar(page);

    const targets = await getTargetRects(page);
    expect(targets.bodyClass).toContain("shell-tablet");
    expect(targets.bodyClass).toContain("is-portrait-screen");
    targets.swatches.forEach((swatch, index) => {
      expectAtLeastTabletTarget(swatch, `Portrait batch color ${index + 1}`);
    });
    await assertNoHorizontalOverflow(page);
  });
});
