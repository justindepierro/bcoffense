// @ts-check
/**
 * T-009 P1 Script secondary editor controls.
 *
 * Exercise the actual row-level personnel entry plus New Period and live
 * period color controls. These are deliberately separate from the Period
 * Manager test: they change an active row/period rather than list management.
 */
const { test, expect } = require("@playwright/test");
const { login, dismissFirstUse, goToTab, assertNoHorizontalOverflow } = require("./helpers");

function expectTouchTarget(rect, label) {
  expect(rect, `${label} exists`).not.toBeNull();
  expect(rect?.width || 0, `${label} width`).toBeGreaterThanOrEqual(44);
  expect(rect?.height || 0, `${label} height`).toBeGreaterThanOrEqual(44);
}

async function elementRect(page, selector) {
  return page.locator(selector).first().evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { width: box.width, height: box.height };
  });
}

async function elementRects(page, selector) {
  return page.locator(selector).evaluateAll((elements) => elements.map((element) => {
    const box = element.getBoundingClientRect();
    return { width: box.width, height: box.height };
  }));
}

async function seedScriptSecondaryControls(page) {
  await page.evaluate(() => {
    script = [
      {
        id: "touch-period",
        isSeparator: true,
        label: "Touch Period",
        minutes: 10,
        color: "#0b2f63",
      },
      {
        id: "touch-personnel-play",
        type: "Run",
        personnel: "11",
        formation: "Trips",
        play: "Touch Personnel Buck",
        basePlay: "Buck",
        personnelVariants: [
          { id: "touch-personnel-10", personnel: "10", overrides: {} },
        ],
      },
    ];
    setScriptControlsMode("basic");
    renderScript();
  });
  await expect(page.locator("#script .script-personnel-override-btn--quick")).toBeVisible();
  await expect(page.locator("#script .ph-color-palette-btn")).toBeVisible();
}

test.describe("Script secondary editor touch targets", () => {
  test("personnel choices plus period presets and colors stay independently tappable on iPad", async ({ page }, testInfo) => {
    test.skip(
      !["ipad-portrait", "ipad-landscape"].includes(testInfo.project.name),
      "This contract requires the touch-enabled iPad projects.",
    );

    await login(page, { role: "coach", username: "coach", password: "password" });
    await dismissFirstUse(page);
    await goToTab(page, "script");
    await seedScriptSecondaryControls(page);

    const shellState = await page.evaluate(() => ({
      coarse: window.matchMedia("(pointer: coarse)").matches,
      tablet: document.body.classList.contains("shell-tablet"),
      staff: document.body.classList.contains("is-staff-mobile-shell"),
    }));
    expect(shellState).toEqual({ coarse: true, tablet: true, staff: true });

    const quickPersonnel = page.locator("#script .script-personnel-override-btn--quick");
    expectTouchTarget(await elementRect(page, "#script .script-personnel-override-btn--quick"), "Quick personnel entry");
    await quickPersonnel.click();

    const personnelModal = page.locator("#scriptPersonnelOverrideModalOverlay");
    await expect(personnelModal).toBeVisible();
    expectTouchTarget(
      await elementRect(page, "#scriptPersonnelOverrideModalOverlay .modal-close-btn"),
      "Personnel modal Close",
    );
    const personnelChoiceRects = await elementRects(
      page,
      "#scriptPersonnelOverrideModalOverlay .script-personnel-override-choice",
    );
    expect(personnelChoiceRects.length, "approved personnel choices render").toBeGreaterThanOrEqual(2);
    personnelChoiceRects.forEach((rect, index) => expectTouchTarget(rect, `Personnel choice ${index + 1}`));

    await personnelModal.locator('[data-personnel-variant-id="touch-personnel-10"]').click();
    await expect(personnelModal).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => script[1]?.scriptPersonnelVariantId || "")).toBe("touch-personnel-10");

    await page.evaluate(() => addSeparator());
    const createModal = page.locator(".period-create-overlay:not(.template-picker-overlay)");
    await expect(createModal).toBeVisible();

    const presetRects = await elementRects(page, ".period-create-overlay:not(.template-picker-overlay) .pcf-preset");
    expect(presetRects.length, "quick period presets render").toBeGreaterThanOrEqual(8);
    presetRects.forEach((rect, index) => expectTouchTarget(rect, `Period preset ${index + 1}`));
    const createSwatchRects = await elementRects(page, ".period-create-overlay:not(.template-picker-overlay) .script-period-color-swatch");
    expect(createSwatchRects.length, "new-period standard colors render").toBeGreaterThanOrEqual(16);
    createSwatchRects.forEach((rect, index) => expectTouchTarget(rect, `New period swatch ${index + 1}`));
    expectTouchTarget(
      await elementRect(page, ".period-create-overlay:not(.template-picker-overlay) .script-period-custom-color input"),
      "New period custom color",
    );

    await createModal.locator('[data-action="setPeriodPreset"][data-preset="Team Pass"]').click();
    await expect(createModal.locator("#newPeriodName")).toHaveValue("Team Pass");
    await createModal.locator('[data-period-create-color][data-period-color="#c62828"]').click();
    await expect.poll(() => page.evaluate(() => document.getElementById("newPeriodColor")?.value || "")).toBe("#c62828");
    await createModal.locator('[data-action="closePeriodOverlay"]').click();
    await expect(createModal).toHaveCount(0);

    const headerColor = page.locator("#script .ph-color-palette-btn").first();
    expectTouchTarget(await elementRect(page, "#script .ph-color-palette-btn"), "Live period color entry");
    await headerColor.click();

    const colorModal = page.locator("#scriptPeriodColorModalOverlay");
    await expect(colorModal).toBeVisible();
    expectTouchTarget(
      await elementRect(page, "#scriptPeriodColorModalOverlay .modal-close-btn"),
      "Period color modal Close",
    );
    const modalSwatchRects = await elementRects(page, "#scriptPeriodColorModalOverlay .script-period-color-swatch");
    expect(modalSwatchRects.length, "live period standard colors render").toBeGreaterThanOrEqual(16);
    modalSwatchRects.forEach((rect, index) => expectTouchTarget(rect, `Live period swatch ${index + 1}`));
    expectTouchTarget(
      await elementRect(page, "#scriptPeriodColorModalOverlay .script-period-custom-color input"),
      "Live period custom color",
    );

    await colorModal.locator('[data-period-palette-color][data-period-color="#c62828"]').click();
    await expect(colorModal).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => script[0]?.color || "")).toBe("#c62828");

    await assertNoHorizontalOverflow(page);
  });
});
