// @ts-check
/**
 * T-009 P1 — live Playbook authoring/Data Cleanup touch controls on iPad.
 *
 * Covers actual coach editor, Data Cleanup, and Category Cleanup flows. The
 * dense Playbook table, reports, Player view, and Print drawer are purposely
 * not part of this touch-target tranche.
 */
const { test, expect } = require("@playwright/test");
const { login, dismissFirstUse, goToTab, assertNoHorizontalOverflow } = require("./helpers");

// Custom modal panels use a 250ms scale-in transition. Measure the live
// steady-state target, not its intentional entrance animation frame.
const MODAL_SETTLE_MS = 300;
const WIDE_IPAD_LANDSCAPE = { width: 1366, height: 768 };

const AUTHORING_FIXTURE = [
  {
    id: "authoring-touch-trips",
    type: "Run",
    personnel: "11",
    formation: "Trips",
    play: "Authoring Buck Sweep",
    basePlay: "Buck",
    motion: "Jet",
    preferredHash: "Left",
  },
  {
    id: "authoring-touch-trips-variant",
    type: "Pass",
    personnel: "10",
    formation: "trips",
    play: "Authoring Four Verts",
    basePlay: "Verts",
    protection: "Half Slide",
    preferredHash: "Right",
  },
  {
    id: "authoring-touch-missing",
    type: "Screen",
    personnel: "11",
    formation: "",
    play: "Authoring Bubble",
    basePlay: "Bubble",
    motion: "Orbit",
    preferredHash: "",
  },
];

function expectTouchTarget(rect, label) {
  expect(rect, `${label} exists`).not.toBeNull();
  expect(rect?.width || 0, `${label} width`).toBeGreaterThanOrEqual(44);
  expect(rect?.height || 0, `${label} height`).toBeGreaterThanOrEqual(44);
}

async function targetRects(page, selector) {
  return page.locator(selector).evaluateAll((elements) => elements
    .map((element) => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0
        ? { width: box.width, height: box.height, label: element.textContent?.trim() || element.getAttribute("aria-label") || "" }
        : null;
    })
    .filter(Boolean));
}

async function expectTargets(page, selector, label, minimum = 1) {
  // Cleanup overlays share the app's deliberate scale-in transition. Poll
  // until their rendered target is steady instead of sampling a transient
  // compositor frame as a product regression.
  await expect.poll(async () => {
    const targets = await targetRects(page, selector);
    return targets.length >= minimum && targets.every((rect) => rect.width >= 44 && rect.height >= 44);
  }).toBe(true);
  const rects = await targetRects(page, selector);
  expect(rects.length, `${label} render`).toBeGreaterThanOrEqual(minimum);
  rects.forEach((rect, index) => expectTouchTarget(rect, `${label} ${rect.label || index + 1}`));
}

async function seedAuthoringFixture(page) {
  await page.evaluate((fixture) => {
    plays = fixture.map((play) => ({ ...play }));
    filteredPlays = plays.slice();
    currentPage = 0;
    if (typeof _sanitizeInvalidateVocab === "function") _sanitizeInvalidateVocab();
    if (typeof invalidateFilterCache === "function") invalidateFilterCache();
    if (typeof populateFilters === "function") populateFilters();
    if (typeof filterPlays === "function") filterPlays();
    if (typeof renderPlaybook === "function") renderPlaybook();
  }, AUTHORING_FIXTURE);
  await expect(page.getByRole("button", { name: /Authoring Buck Sweep/ }).first()).toBeVisible();
}

test.describe("Playbook authoring and cleanup tablet touch targets", () => {
  test("live editor, Data Cleanup, and Category Cleanup controls stay at 44px on iPad", async ({ page }, testInfo) => {
    test.skip(
      !["ipad-portrait", "ipad-landscape"].includes(testInfo.project.name),
      "This contract requires the touch-enabled iPad projects.",
    );

    await login(page, { role: "coach", username: "coach", password: "password" });
    await dismissFirstUse(page);
    if (testInfo.project.name === "ipad-landscape") {
      await page.setViewportSize(WIDE_IPAD_LANDSCAPE);
      await expect.poll(() => page.evaluate(() => ({
        width: window.innerWidth,
        tablet: document.body.classList.contains("shell-tablet"),
        landscape: document.body.classList.contains("is-landscape-screen"),
      }))).toEqual({ width: 1366, tablet: true, landscape: true });
    }
    await goToTab(page, "playbook");
    await seedAuthoringFixture(page);

    const shell = await page.evaluate(() => ({
      coarse: window.matchMedia("(pointer: coarse)").matches,
      tablet: document.body.classList.contains("shell-tablet"),
      staff: document.body.classList.contains("is-staff-mobile-shell"),
      player: document.body.dataset.authRole === "player",
    }));
    expect(shell).toEqual({ coarse: true, tablet: true, staff: true, player: false });

    await page.evaluate(() => openPlayEditor(0));
    const editor = page.locator("#playEditorOverlay");
    await expect(editor).toBeVisible();
    await page.waitForTimeout(MODAL_SETTLE_MS);
    await expectTargets(page, "#playEditorOverlay .pb-editor-nav", "Editor navigation", 2);
    await expectTargets(page, "#playEditorOverlay .pb-personnel-variant-choice", "Personnel version");
    await page.evaluate(() => closePlayEditor({ returnFocus: false }));
    await expect(editor).not.toBeVisible();

    await page.evaluate(() => openPlaybookSanitize());
    const sanitize = page.locator("#playbookSanitizeOverlay");
    await expect(sanitize).toBeVisible();
    await page.waitForTimeout(MODAL_SETTLE_MS);
    await expectTargets(page, "#playbookSanitizeOverlay .pb-sanitize-close-btn", "Data Cleanup close");
    await expectTargets(page, "#playbookSanitizeOverlay .pb-sanitize-field-picker", "Data Cleanup field picker");
    await expectTargets(page, "#playbookSanitizeOverlay .pb-sanitize-toggle", "Data Cleanup scope toggle", 2);

    await sanitize.locator("#playbookSanitizeField").selectOption("formation");
    await expect(sanitize.locator(".pb-sanitize-standardize-action select").first()).toBeVisible();
    await expectTargets(page, "#playbookSanitizeOverlay .pb-sanitize-standardize-action select", "Standardize target");
    await expectTargets(page, "#playbookSanitizeOverlay .pb-sanitize-standardize-action .btn", "Standardize action");
    await expectTargets(page, "#playbookSanitizeOverlay .pb-sanitize-input", "Cleanup row input");
    await expectTargets(page, "#playbookSanitizeOverlay .pb-sanitize-edit-btn", "Cleanup full-editor action");

    const cleanupInput = sanitize.locator(".pb-sanitize-input").first();
    // Case-only mismatches use the production ciExact suggestion path. Invoke
    // the same registered change listener deterministically after the fixture
    // replaces the live in-memory playbook.
    await cleanupInput.fill("TRIPS");
    await cleanupInput.dispatchEvent("change");
    await expect(sanitize.locator(".pb-sanitize-suggest-chip").first()).toBeVisible();
    await expectTargets(page, "#playbookSanitizeOverlay .pb-sanitize-suggest-chip", "Cleanup suggestion");

    // A nearby typo takes the production fuzzy path, which exposes the
    // separate Keep action alongside its suggested canonical values.
    await cleanupInput.fill("Trps");
    await cleanupInput.dispatchEvent("change");
    await expectTargets(page, "#playbookSanitizeOverlay .pb-sanitize-suggest-keep", "Keep typed value");

    await page.evaluate(() => openPlaybookSanitizeFocused("formation", ["Trips", "trips"]));
    await expect(sanitize.locator("#pbSanitizeMergeTarget")).toBeVisible();
    await expectTargets(page, "#playbookSanitizeOverlay #pbSanitizeMergeTarget", "Focused merge target");
    await expectTargets(page, "#playbookSanitizeOverlay .pb-sanitize-focus-head .btn", "Focused cleanup action");
    await page.evaluate(() => closePlaybookSanitize());
    await expect(sanitize).not.toBeVisible();

    await page.evaluate(() => openPlaybookCategoryCleanup());
    const category = page.locator("#playbookCatCleanupOverlay");
    await expect(category).toBeVisible();
    await page.waitForTimeout(MODAL_SETTLE_MS);
    await expectTargets(page, "#playbookCatCleanupOverlay #catCleanupSelect", "Category selector");
    await expectTargets(page, "#playbookCatCleanupOverlay .cat-cleanup-scope label", "Category scope", 3);
    await expectTargets(page, "#playbookCatCleanupOverlay .cat-cleanup-pill", "Category show filter", 3);
    await expectTargets(page, "#playbookCatCleanupOverlay .cat-cleanup-search-clear", "Category search clear");
    await expectTargets(page, "#playbookCatCleanupOverlay .cat-cleanup-chip", "Category type filter", 2);
    await expectTargets(page, "#playbookCatCleanupOverlay .cat-cleanup-bulk .btn", "Category bulk action", 2);
    await expectTargets(page, "#playbookCatCleanupOverlay .cat-cleanup-row", "Category play row");
    await category.locator(".modal-close").click();
    await expect(category).toHaveCount(0);

    await assertNoHorizontalOverflow(page);
  });
});
