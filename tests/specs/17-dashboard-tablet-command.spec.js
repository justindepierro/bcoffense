// @ts-check
/**
 * Dashboard staff-tablet-landscape command hierarchy contract.
 *
 * The active opponent and game-week field stay on the direct path. Snapshot
 * actions use the shared anchored menu, which must remain reachable above the
 * Dashboard panel's deliberate vertical scroll owner.
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

const DASHBOARD_OPPONENTS = [
  {
    id: "dashboard-tablet-north",
    name: "Tablet North",
    plays: [{ offensePlayType: "Run" }, { offensePlayType: "Pass" }],
  },
  {
    id: "dashboard-tablet-west",
    name: "Tablet West",
    plays: [{ offensePlayType: "Screen" }],
  },
];

async function seedDashboardWeek(page) {
  await page.evaluate((opponents) => {
    storageManager.set(
      STORAGE_KEYS.DEFENSIVE_TENDENCIES,
      opponents.map((opponent) => ({ ...opponent, plays: [...opponent.plays] })),
    );
    setGameWeek(0, "Tablet Week");
    if (typeof requestRenderDashboard === "function") requestRenderDashboard();
  }, DASHBOARD_OPPONENTS);
}

async function dashboardTabletState(page) {
  return page.evaluate(() => {
    const read = (element) => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        left: Math.round(rect.left),
        display: style.display,
        overflowY: style.overflowY,
      };
    };
    const panel = document.getElementById("dashboard");
    const bar = panel?.querySelector(".dash-opponent-bar");
    const search = document.getElementById("dashSearchInput");
    const opponent = document.getElementById("dashOpponentSelect");
    const week = document.getElementById("dashWeekLabel");
    const more = document.getElementById("dashWeekTabletMoreTrigger");
    const directActions = Array.from(panel?.querySelectorAll(".dash-week-desktop-action") || []).map(read);
    return {
      bodyClass: document.body.className,
      bodyOwner: document.body.dataset.scrollOwner || "",
      panel: read(panel),
      bar: read(bar),
      search: read(search),
      opponent: read(opponent),
      week: read(week),
      more: read(more),
      directActions,
    };
  });
}

test.describe("Dashboard staff tablet landscape", () => {
  test("coach keeps active week controls direct and moves snapshot tools into anchored More at 1024 and 1366", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "ipad-landscape",
      "This contract requires the touch-enabled iPad landscape project.",
    );

    await login(page, { role: "coach", username: "coach" });
    await dismissFirstUse(page);

    for (const viewport of TABLET_LANDSCAPE_VIEWPORTS) {
      await page.setViewportSize(viewport);
      await seedDashboardWeek(page);
      await goToTab(page, "dashboard");
      await expect(page.locator("#dashOpponentSelect")).toHaveValue("0");
      await expect(page.locator("#dashWeekLabel")).toHaveValue("Tablet Week");

      const state = await dashboardTabletState(page);
      expect(state.bodyClass).toContain("shell-tablet");
      expect(state.bodyClass).toContain("is-mobile-screen");
      expect(state.bodyClass).toContain("is-staff-mobile-shell");
      expect(state.bodyClass).toContain("is-landscape-screen");
      expect(state.bodyOwner).toBe("panel");
      expect(state.panel?.overflowY).toBe("auto");
      expect(state.bar?.width || 0).toBeGreaterThan(500);
      Object.entries({
        search: state.search,
        opponent: state.opponent,
        week: state.week,
        more: state.more,
      }).forEach(([name, target]) => {
        expect(target).not.toBeNull();
        expect(target?.width || 0, `${name}: ${JSON.stringify(target)}`).toBeGreaterThanOrEqual(44);
        expect(target?.height || 0, `${name}: ${JSON.stringify(target)}`).toBeGreaterThanOrEqual(44);
      });
      state.directActions.forEach((action) => expect(action?.display).toBe("none"));

      // Prove the Dashboard panel owns the vertical axis rather than a nested
      // command strip. The temporary height is removed before the next size.
      const ownership = await page.evaluate(() => {
        const panel = document.getElementById("dashboard");
        const container = panel?.querySelector(".dash-container");
        if (!panel || !container) return null;
        const spacer = document.createElement("div");
        spacer.setAttribute("data-dashboard-tablet-spacer", "true");
        spacer.style.height = "1200px";
        container.append(spacer);
        panel.scrollTop = 180;
        const result = {
          panelTop: panel.scrollTop,
          panelClient: panel.clientHeight,
          panelHeight: panel.scrollHeight,
          nestedScrollers: [...container.querySelectorAll("*")]
            .filter((element) => {
              const style = getComputedStyle(element);
              return (style.overflowY === "auto" || style.overflowY === "scroll") &&
                element.scrollHeight > element.clientHeight + 2;
            })
            .map((element) => element.id || element.className || element.tagName)
            .slice(0, 4),
        };
        spacer.remove();
        panel.scrollTop = 0;
        return result;
      });
      expect(ownership).not.toBeNull();
      expect(ownership?.panelHeight || 0).toBeGreaterThan(ownership?.panelClient || 0);
      expect(ownership?.panelTop || 0).toBeGreaterThan(0);
      expect(ownership?.nestedScrollers || []).toEqual([]);

      const more = page.locator("#dashWeekTabletMoreTrigger");
      await more.click();
      const menu = page.locator("#dashWeekTabletMoreMenu");
      await expect(menu).toBeVisible();
      const menuState = await menu.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const actions = [...element.querySelectorAll("button")].map((button) => {
          const box = button.getBoundingClientRect();
          return {
            action: button.dataset.action || "",
            width: Math.round(box.width),
            height: Math.round(box.height),
          };
        });
        return {
          role: element.getAttribute("role") || "",
          position: getComputedStyle(element).position,
          rect: {
            left: Math.round(rect.left),
            top: Math.round(rect.top),
            right: Math.round(rect.right),
            bottom: Math.round(rect.bottom),
          },
          viewport: { width: window.innerWidth, height: window.innerHeight },
          actions,
        };
      });
      expect(menuState.role).toBe("menu");
      expect(menuState.position).toBe("fixed");
      expect(menuState.rect.left).toBeGreaterThanOrEqual(-1);
      expect(menuState.rect.top).toBeGreaterThanOrEqual(-1);
      expect(menuState.rect.right).toBeLessThanOrEqual(menuState.viewport.width + 1);
      expect(menuState.rect.bottom).toBeLessThanOrEqual(menuState.viewport.height + 1);
      expect(menuState.actions.map((item) => item.action)).toEqual([
        "duplicateGameWeek",
        "archiveGameWeek",
        "showGameWeekArchive",
      ]);
      menuState.actions.forEach((target) => {
        expect(target.width).toBeGreaterThanOrEqual(44);
        expect(target.height).toBeGreaterThanOrEqual(44);
      });

      await page.keyboard.press("Escape");
      await expect(menu).toBeHidden();
      await expect(more).toBeFocused();
      await assertNoHorizontalOverflow(page);
    }
  });
});
