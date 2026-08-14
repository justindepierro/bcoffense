// @ts-check
/**
 * T-009 P1 — real iPad Wristband editor and print setup controls.
 *
 * This uses the production classic-card renderer and print preview instead
 * of substitute controls, and verifies print-mode controls without altering
 * the physical print canvas.
 */
const { test, expect } = require("@playwright/test");
const { login, dismissFirstUse, goToTab, assertNoHorizontalOverflow } = require("./helpers");

function targetRect(element) {
  const rect = element?.getBoundingClientRect();
  return rect && rect.width > 0 && rect.height > 0
    ? { width: rect.width, height: rect.height }
    : null;
}

function expectTapTarget(rect, label) {
  expect(rect, `${label} exists`).not.toBeNull();
  expect(rect?.width || 0, `${label} width`).toBeGreaterThanOrEqual(44);
  expect(rect?.height || 0, `${label} height`).toBeGreaterThanOrEqual(44);
}

async function seedClassicCard(page) {
  await page.evaluate(() => {
    const data = Array.from({ length: CELLS_PER_CARD }, (_, index) => ({
      id: `tablet-classic-${index + 1}`,
      type: index % 2 ? "Pass" : "Run",
      personnel: index % 2 ? "10" : "11",
      formation: index % 2 ? "Doubles" : "Trips",
      play: `Tablet Classic ${index + 1}`,
      basePlay: index % 2 ? "Verts" : "Buck",
    }));
    wristbandCards = [{ id: "tablet-classic-card", name: "Tablet Classic", data }];
    currentCardIndex = 0;
    startClassicWristband();
  });
  await expect(page.locator("#wristbandGrid [data-drag='wbCell']").first()).toBeVisible();
}

async function seedPlayerCard(page) {
  await page.evaluate(() => {
    const data = Array.from({ length: CELLS_PER_CARD }, () => null);
    data[0] = {
      id: "tablet-print-player",
      type: "Run",
      personnel: "11",
      formation: "Trips",
      play: "Tablet Print Buck",
      basePlay: "Buck",
      respQ: "Base Q assignment",
    };
    wristbandCards = [{ id: "tablet-print-player-card", name: "Tablet Player", data }];
    currentCardIndex = 0;
    wbPlayerCardPos = "respQ";
    startPlayerWristband({ suppressHiddenWarning: true });
  });
  await expect(page.locator("#wristbandGrid.pc-grid-active")).toBeVisible();
}

test.describe("Wristband tablet editor targets", () => {
  test("classic cells and live print setup choices are 44px while print output stays separate", async ({ page }, testInfo) => {
    test.skip(
      !["ipad-portrait", "ipad-landscape"].includes(testInfo.project.name),
      "This target contract requires the touch-enabled iPad projects.",
    );

    await login(page, { role: "coach", username: "coach", password: "password" });
    await dismissFirstUse(page);
    await goToTab(page, "wristband");
    await seedClassicCard(page);

    const classic = await page.evaluate(() => {
      const grid = document.getElementById("wristbandGrid");
      const card = document.getElementById("wristbandCard");
      const preview = document.querySelector("#wristband .wristband-preview");
      const rect = (element) => {
        const box = element?.getBoundingClientRect();
        return box && box.width > 0 && box.height > 0
          ? { width: box.width, height: box.height }
          : null;
      };
      return {
        coarse: window.matchMedia("(pointer: coarse)").matches,
        cardHeight: card?.getBoundingClientRect().height || 0,
        gridHeight: grid?.getBoundingClientRect().height || 0,
        gridAutoRows: grid ? getComputedStyle(grid).gridAutoRows : "",
        previewOverflow: preview ? getComputedStyle(preview).overflowY : "",
        cells: Array.from(grid?.querySelectorAll("[data-drag='wbCell']") || [])
          .slice(0, 4)
          .map(rect),
      };
    });
    expect(classic.coarse, "iPad receives the coarse-pointer editor rule").toBe(true);
    expect(classic.cardHeight, "classic editor expands beyond print-card density").toBeGreaterThan(700);
    expect(classic.gridHeight, "classic grid owns the expanded editor rows").toBeGreaterThan(700);
    expect(classic.gridAutoRows, "classic editor defines row sizing").toContain("44px");
    classic.cells.forEach((rect, index) => expectTapTarget(rect, `Classic cell ${index + 1}`));

    await page.locator("#wristbandGrid [data-drag='wbCell']").first().click();
    await expect(page.locator("#cellPopupOverlay")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#cellPopupOverlay")).not.toBeVisible();

    await page.evaluate(() => openWristbandPrintPreview("classic"));
    const preview = page.locator("#wbPrintPreviewOverlay");
    await expect(preview).toBeVisible();
    const classicPrintTargets = await page.evaluate(() => ({
      cardChoice: (() => {
        const box = document.querySelector("#wbPrintCardChoices label")?.getBoundingClientRect();
        return box && box.width > 0 && box.height > 0 ? { width: box.width, height: box.height } : null;
      })(),
      actions: Array.from(document.querySelectorAll("#wbPrintPreviewOverlay .wb-print-check-actions .btn"))
        .filter((element) => {
          const box = element.getBoundingClientRect();
          return box.width > 0 && box.height > 0;
        })
        .map((element) => {
        const box = element.getBoundingClientRect();
        return box && box.width > 0 && box.height > 0 ? { width: box.width, height: box.height } : null;
        }),
      printCanvasInApp: Boolean(document.querySelector("#wristband .wb-print-preview-canvas")),
    }));
    expectTapTarget(classicPrintTargets.cardChoice, "Classic print card choice");
    classicPrintTargets.actions.forEach((rect, index) => expectTapTarget(rect, `Classic print bulk action ${index + 1}`));
    expect(classicPrintTargets.printCanvasInApp, "preview canvas stays separate from physical print output").toBe(false);
    await page.locator("#wbPrintPreviewOverlay [data-action='closeWristbandPrintPreview']").first().click();
    await expect(preview).not.toBeVisible();

    await seedPlayerCard(page);
    await page.evaluate(() => openWristbandPrintPreview("player-all"));
    await expect(preview).toBeVisible();
    const playerPrintTargets = await page.evaluate(() => ({
      positionChoice: (() => {
        const box = document.querySelector("#wbPrintPositionChoices label")?.getBoundingClientRect();
        return box && box.width > 0 && box.height > 0 ? { width: box.width, height: box.height } : null;
      })(),
      blankRules: (() => {
        const box = document.querySelector("#wbPrintBlankRules")?.closest("label")?.getBoundingClientRect();
        return box && box.width > 0 && box.height > 0 ? { width: box.width, height: box.height } : null;
      })(),
      blankRulesChecked: document.getElementById("wbPrintBlankRules")?.checked || false,
    }));
    expectTapTarget(playerPrintTargets.positionChoice, "Player print position choice");
    expectTapTarget(playerPrintTargets.blankRules, "Blank rule lines toggle");
    await page.locator("#wbPrintBlankRules").click();
    await expect.poll(() => page.locator("#wbPrintBlankRules").isChecked()).toBe(!playerPrintTargets.blankRulesChecked);
    await page.locator("#wbPrintPreviewOverlay [data-action='closeWristbandPrintPreview']").first().click();
    await expect(preview).not.toBeVisible();

    await assertNoHorizontalOverflow(page);
  });
});
