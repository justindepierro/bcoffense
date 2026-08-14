// @ts-check
/**
 * T-009 P0 touchscreen controls.
 *
 * These use the real Player Wristband renderer and Script Tools action rather
 * than injecting substitute buttons, so the tests cover the controls coaches
 * actually reach on an iPad.
 */
const { test, expect } = require("@playwright/test");
const { login, dismissFirstUse, goToTab, assertNoHorizontalOverflow } = require("./helpers");

function overlaps(first, second) {
  return !(
    first.right <= second.left ||
    first.left >= second.right ||
    first.bottom <= second.top ||
    first.top >= second.bottom
  );
}

async function seedPlayerWristbandReset(page) {
  await page.evaluate(() => {
    const basePosition = "respQ";
    const alternatePosition = PLAYER_WRISTBAND_POSITIONS.find(
      (position) => position.key !== basePosition,
    )?.key;
    if (!alternatePosition) throw new Error("Player Wristband fixture needs a second responsibility position.");

    const cardData = Array.from({ length: CELLS_PER_CARD }, () => null);
    cardData[0] = {
      id: "touch-reset-play",
      type: "Run",
      personnel: "11",
      formation: "Trips",
      play: "Touch Reset Buck",
      basePlay: "Buck",
      respQ: "Base Q assignment",
      [alternatePosition]: "Alternate assignment",
    };
    wristbandCards = [{ id: "touch-reset-card", name: "Touch Reset", data: cardData }];
    currentCardIndex = 0;
    wristbandType = "player";
    wbPlayerCardMode = true;
    wbPlayerCardPos = basePosition;
    // The real reset control renders only for a customized player rule.
    cellCustomizations = {
      "0-0": {
        playerAssignmentOverrides: { [basePosition]: "Seeded custom assignment" },
      },
    };
    startPlayerWristband({ suppressHiddenWarning: true });
  });
  await expect(page.locator("#wristbandGrid .pc-resp-reset").first()).toBeVisible();
}

async function playerResetGeometry(page) {
  return page.evaluate(() => {
    const reset = document.querySelector("#wristbandGrid .pc-resp-reset");
    const cell = reset?.closest(".pc-assignment-cell");
    const select = cell?.querySelector(".pc-rule-select");
    const input = cell?.querySelector(".pc-resp-input");
    const box = (element) => {
      const rect = element?.getBoundingClientRect();
      return rect && rect.width > 0 && rect.height > 0
        ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height }
        : null;
    };
    return {
      coarse: window.matchMedia("(pointer: coarse)").matches,
      reset: box(reset),
      select: box(select),
      input: box(input),
      resetPosition: reset ? getComputedStyle(reset).position : "",
      gridRows: document.querySelector("#wristbandGrid") ? getComputedStyle(document.querySelector("#wristbandGrid")).gridTemplateRows : "",
      selectDisabled: select?.disabled || false,
      inputDisabled: input?.disabled || false,
    };
  });
}

async function seedScriptPeriods(page) {
  await page.evaluate(() => {
    script = [
      { id: "period-alpha", isSeparator: true, label: "Inside Run", minutes: 8, color: "#2455a6" },
      { id: "period-alpha-play", type: "Run", formation: "Trips", play: "Buck", basePlay: "Buck" },
      { id: "period-bravo", isSeparator: true, label: "Team Pass", minutes: 10, color: "#6b3c94" },
      { id: "period-bravo-play", type: "Pass", formation: "Doubles", play: "Verts", basePlay: "Verts" },
    ];
    renderScript();
    openScriptToolsDrawer();
    const arrange = document.querySelector("#scriptToolsDrawer [data-script-tools-section='arrange']");
    if (arrange instanceof HTMLDetailsElement) arrange.open = true;
  });
  await expect(page.locator("#scriptToolsDrawer [data-action='openScriptPeriodManager']")).toBeVisible();
}

async function managerTargetRects(page) {
  return page.evaluate(() => {
    const modal = document.getElementById("scriptPeriodManagerModal");
    const box = (element) => {
      const rect = element?.getBoundingClientRect();
      return rect && rect.width > 0 && rect.height > 0
        ? { width: rect.width, height: rect.height }
        : null;
    };
    return {
      close: box(modal?.querySelector(".script-period-manager-close")),
      done: box(modal?.querySelector(".script-period-manager-done")),
      actions: Array.from(modal?.querySelectorAll(".script-period-manager-action") || []).map(box),
      delete: box(modal?.querySelector(".script-period-manager-delete")),
      closeFocused: document.activeElement === modal?.querySelector(".script-period-manager-close"),
      layerEscape: modal?.dataset.layerEscape || "",
    };
  });
}

function expectTouchTarget(rect, label) {
  expect(rect, `${label} exists`).not.toBeNull();
  expect(rect?.width || 0, `${label} width`).toBeGreaterThanOrEqual(44);
  expect(rect?.height || 0, `${label} height`).toBeGreaterThanOrEqual(44);
}

test.describe("Player Wristband and Period Manager touch controls", () => {
  test("keep player reset separate from adjacent inputs and Period Manager actions/close at 44px", async ({ page }, testInfo) => {
    test.skip(
      !["ipad-portrait", "ipad-landscape"].includes(testInfo.project.name),
      "This contract requires the touch-enabled iPad projects.",
    );

    await login(page, { role: "coach", username: "coach", password: "password" });
    await dismissFirstUse(page);

    await goToTab(page, "wristband");
    await seedPlayerWristbandReset(page);
    const resetGeometry = await playerResetGeometry(page);
    expect(resetGeometry.coarse, "iPad uses the coarse-pointer rule").toBe(true);
    expectTouchTarget(resetGeometry.reset, "Player Wristband Reset");
    expect(resetGeometry.resetPosition).toBe("static");
    expect(resetGeometry.selectDisabled).toBe(false);
    expect(resetGeometry.inputDisabled).toBe(false);
    expect(resetGeometry.select?.width || 0, "Rule source remains a usable column").toBeGreaterThanOrEqual(44);
    expect(resetGeometry.input?.width || 0, "Assignment input remains present beside Reset").toBeGreaterThan(44);
    expect(overlaps(resetGeometry.reset, resetGeometry.select), "Reset does not cover the rule source").toBe(false);
    expect(overlaps(resetGeometry.reset, resetGeometry.input), "Reset does not cover the assignment input").toBe(false);
    expect(resetGeometry.gridRows).not.toBe("none");

    const resetCell = page.locator("#wristbandGrid .pc-assignment-cell--has-reset").first();
    const ruleSelect = resetCell.locator(".pc-rule-select");
    await ruleSelect.selectOption("respT");
    await expect.poll(() => page.evaluate(() => cellCustomizations["0-0"]?.playerRuleSources?.respQ || "")).toBe("respT");
    const assignmentInput = page.locator("#wristbandGrid .pc-assignment-cell--has-reset .pc-resp-input").first();
    await assignmentInput.fill("Touch-safe assignment");
    await assignmentInput.press("Tab");
    await expect.poll(() => page.evaluate(() => cellCustomizations["0-0"]?.playerAssignmentOverrides?.respQ || "")).toBe("Touch-safe assignment");
    await page.locator("#wristbandGrid .pc-resp-reset").first().click();
    await expect(page.locator("#wristbandGrid .pc-resp-reset")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => ({
      source: cellCustomizations["0-0"]?.playerRuleSources?.respQ || "",
      assignment: cellCustomizations["0-0"]?.playerAssignmentOverrides?.respQ || "",
    }))).toEqual({ source: "", assignment: "" });

    await goToTab(page, "script");
    await seedScriptPeriods(page);
    const managerTrigger = page.locator("#scriptToolsDrawer [data-action='openScriptPeriodManager']");
    await managerTrigger.click();
    const manager = page.locator("#scriptPeriodManagerModal");
    await expect(manager).toBeVisible();
    const managerTargets = await managerTargetRects(page);
    expect(managerTargets.closeFocused, "Period Manager focuses Close").toBe(true);
    expect(managerTargets.layerEscape, "Period Manager owns Escape").toBe("managed");
    expectTouchTarget(managerTargets.close, "Period Manager Close");
    expectTouchTarget(managerTargets.done, "Period Manager Done");
    expectTouchTarget(managerTargets.delete, "Period Manager Delete");
    expect(managerTargets.actions.length, "Period Manager renders row actions").toBeGreaterThanOrEqual(10);
    managerTargets.actions.forEach((rect, index) => expectTouchTarget(rect, `Period Manager action ${index + 1}`));

    await manager.locator("[data-action='moveScriptPeriodFromManager'][data-arg='period-alpha:down']").click();
    await expect(manager.locator(".script-period-manager-main strong").first()).toHaveText("Team Pass");
    await manager.locator(".script-period-manager-close").click();
    await expect(manager).toHaveCount(0);
    await expect(page.locator("#scriptToolsDrawer")).toHaveClass(/open/);

    await managerTrigger.click();
    await expect(manager).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(manager).toHaveCount(0);
    await expect(page.locator("#scriptToolsDrawer")).toHaveClass(/open/);

    await assertNoHorizontalOverflow(page);
  });
});
