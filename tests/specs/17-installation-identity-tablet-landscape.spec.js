// @ts-check
/**
 * Installation and Identity staff-tablet landscape contract.
 *
 * Installation keeps its panel as the scroll owner, promotes the frequent
 * category/search path, and places secondary actions in 44px anchored menus.
 * Identity remains a readable two-column coaching reference when the post-rail
 * workspace is wide enough. Portrait intentionally keeps the existing
 * document presentation.
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

const INSTALLATION_FIXTURE_PLAYS = Array.from({ length: 72 }, (_, index) => ({
  id: `installation-tablet-${index + 1}`,
  type: index % 2 ? "Pass" : "Run",
  personnel: `Personnel ${index % 36 + 1}`,
  formation: `Formation ${index % 18 + 1}`,
  motion: `Motion ${index % 12 + 1}`,
  shift: `Shift ${index % 9 + 1}`,
  protection: `Protection ${index % 16 + 1}`,
  basePlay: `Concept ${index % 24 + 1}`,
  tempo: index % 2 ? "Tempo Fast" : "Tempo Normal",
  back: `Backfield ${index % 10 + 1}`,
  play: `Tablet Installation Call ${index + 1}`,
  formTag1: `Tag ${index % 14 + 1}`,
  formTag2: index % 3 === 0 ? `Tag ${index % 11 + 21}` : "",
}));

async function seedInstallationWorkspace(page) {
  await page.evaluate((samplePlays) => {
    plays = samplePlays.map((play) => ({ ...play }));
    filteredPlays = plays.slice();
    storageManager.set(STORAGE_KEYS.INSTALLATION, { installed: {}, order: {} });
    if (typeof invalidateFilterCache === "function") invalidateFilterCache();
    if (typeof renderInstallation === "function") renderInstallation();
  }, INSTALLATION_FIXTURE_PLAYS);
}

async function getInstallationTabletState(page) {
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
    const panel = document.getElementById("installation");
    const headerDesktop = panel?.querySelector(".install-header-actions--desktop");
    const headerTablet = panel?.querySelector(".install-tablet-header-actions");
    const detailDesktop = panel?.querySelector(".install-detail-actions--desktop");
    const detailTablet = panel?.querySelector(".install-tablet-detail-actions");
    const headerMore = headerTablet?.querySelector(".install-tablet-more-trigger");
    const detailMore = detailTablet?.querySelector(".install-tablet-more-trigger");
    const search = detailTablet?.querySelector(".install-search");
    const categoryCards = Array.from(panel?.querySelectorAll(".install-cat-card") || []);
    const checklist = panel?.querySelector(".install-checklist");

    return {
      bodyClass: document.body.className,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      display: {
        headerDesktop: style(headerDesktop)?.display || "",
        headerTablet: style(headerTablet)?.display || "",
        detailDesktop: style(detailDesktop)?.display || "",
        detailTablet: style(detailTablet)?.display || "",
      },
      panel: rect(panel),
      overflow: {
        panel: style(panel)?.overflowY || "",
        checklist: style(checklist)?.overflowY || "",
      },
      scroll: {
        panelClient: panel?.clientHeight || 0,
        panelHeight: panel?.scrollHeight || 0,
      },
      headerMore: rect(headerMore),
      detailMore: rect(detailMore),
      search: rect(search),
      categories: categoryCards.map(rect),
    };
  });
}

async function getIdentityTabletState(page) {
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
    const shell = document.querySelector("#identity .id-shell");
    const grid = shell?.querySelector(".id-grid");
    const cards = Array.from(
      shell?.querySelectorAll(".id-card:not(.id-card-wide)") || [],
    );
    const actions = Array.from(shell?.querySelectorAll(".id-hero-actions .btn") || []);
    return {
      bodyClass: document.body.className,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      grid: rect(grid),
      gridColumns: grid ? getComputedStyle(grid).gridTemplateColumns : "",
      cards: cards.slice(0, 2).map(rect),
      actions: actions.map(rect),
    };
  });
}

function expectLandscapeShell(state, width) {
  expect(state.bodyClass).toContain("shell-tablet");
  expect(state.bodyClass).toContain("is-staff-mobile-shell");
  expect(state.bodyClass).toContain("is-landscape-screen");
  expect(state.viewport.width).toBe(width);
}

async function assertAnchoredMenuTargets(page, trigger, expectedLabels) {
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const menu = page.locator("body > .tool-menu.install-tablet-landscape-menu");
  await expect(menu).toBeVisible();
  await expect(menu).toHaveAttribute("role", "menu");
  for (const label of expectedLabels) {
    await expect(menu).toContainText(label);
  }
  const targets = await menu.locator("button").evaluateAll((elements) =>
    elements.map((element) => {
      const value = element.getBoundingClientRect();
      return { width: value.width, height: value.height };
    }),
  );
  expect(targets.length).toBeGreaterThanOrEqual(expectedLabels.length);
  targets.forEach((target) => {
    expect(target.width).toBeGreaterThanOrEqual(44);
    expect(target.height).toBeGreaterThanOrEqual(44);
  });
  await trigger.click();
  await expect(menu).toBeHidden();
}

test.describe("Installation and Identity staff tablet landscape", () => {
  test("coach keeps a panel-scrolling Installation workspace and readable Identity reference at 1024 and 1366", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "ipad-landscape",
      "This contract requires the touch-enabled iPad landscape project.",
    );

    await login(page, { role: "coach", username: "coach" });
    await dismissFirstUse(page);

    for (const viewport of TABLET_LANDSCAPE_VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(180);
      await seedInstallationWorkspace(page);
      await goToTab(page, "installation");
      await expect(page.locator("#installation .install-cat-card").first()).toBeVisible();

      const installation = await getInstallationTabletState(page);
      expectLandscapeShell(installation, viewport.width);
      expect(installation.display.headerDesktop).toBe("none");
      expect(installation.display.detailDesktop).toBe("none");
      expect(installation.display.headerTablet).not.toBe("none");
      expect(installation.display.detailTablet).toBe("grid");
      expect(installation.overflow.panel).toBe("auto");
      expect(installation.overflow.checklist).toBe("auto");
      expect(installation.scroll.panelHeight).toBeGreaterThan(installation.scroll.panelClient);
      expect(installation.categories.length).toBeGreaterThanOrEqual(8);
      installation.categories.forEach((category) => {
        expect(category?.height || 0).toBeGreaterThanOrEqual(44);
      });
      for (const [label, target] of [
        ["Installation tools", installation.headerMore],
        ["Checklist tools", installation.detailMore],
        ["Checklist search", installation.search],
      ]) {
        expect(target, `${label} is rendered`).not.toBeNull();
        expect(target?.height || 0, `${label} height`).toBeGreaterThanOrEqual(44);
      }

      const panelScrollTop = await page.evaluate(() => {
        const panel = document.getElementById("installation");
        if (panel) panel.scrollTop = 240;
        return panel?.scrollTop || 0;
      });
      expect(panelScrollTop).toBeGreaterThan(0);

      await assertAnchoredMenuTargets(
        page,
        page.locator("#installation .install-tablet-header-actions .install-tablet-more-trigger"),
        ["Smart report", "Save template", "Manage templates"],
      );
      await assertAnchoredMenuTargets(
        page,
        page.locator("#installation .install-tablet-detail-actions .install-tablet-more-trigger"),
        ["Mark all installed", "Clear installed"],
      );

      await page.locator("#installation .install-cat-card[data-arg='play']").click();
      const smartToggle = page.locator("#installation .install-tablet-detail-actions .install-smart-toggle");
      const smartCheckbox = smartToggle.locator("input[type='checkbox']");
      await expect(smartToggle).toBeVisible();
      const smartTargets = await Promise.all([smartToggle, smartCheckbox].map((locator) =>
        locator.evaluate((element) => {
          const value = element.getBoundingClientRect();
          return { width: value.width, height: value.height };
        }),
      ));
      smartTargets.forEach((target) => {
        expect(target.width).toBeGreaterThanOrEqual(44);
        expect(target.height).toBeGreaterThanOrEqual(44);
      });
      await assertNoHorizontalOverflow(page);

      await goToTab(page, "identity");
      await expect(page.locator("#identity .id-card").first()).toBeVisible();
      const identity = await getIdentityTabletState(page);
      expectLandscapeShell(identity, viewport.width);
      expect(identity.cards.length).toBe(2);
      const [firstCard, secondCard] = identity.cards;
      expect(Math.abs((firstCard?.top || 0) - (secondCard?.top || 0))).toBeLessThanOrEqual(2);
      expect(firstCard?.right || 0).toBeLessThanOrEqual((secondCard?.left || 0) + 2);
      identity.actions.forEach((action) => {
        expect(action?.height || 0).toBeGreaterThanOrEqual(40);
      });
      await assertNoHorizontalOverflow(page);
    }
  });

  test("coach portrait keeps the pre-existing Installation and Identity document layouts", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "ipad-portrait",
      "Portrait is verified independently from the landscape-only treatment.",
    );

    await login(page, { role: "coach", username: "coach" });
    await dismissFirstUse(page);
    await seedInstallationWorkspace(page);
    await goToTab(page, "installation");
    await expect(page.locator("#installation .install-cat-card").first()).toBeVisible();

    const installation = await getInstallationTabletState(page);
    expect(installation.bodyClass).toContain("shell-tablet");
    expect(installation.bodyClass).toContain("is-portrait-screen");
    expect(installation.bodyClass).not.toContain("is-landscape-screen");
    expect(installation.display.headerTablet).toBe("none");
    expect(installation.display.detailTablet).toBe("none");
    expect(installation.display.headerDesktop).not.toBe("none");
    expect(installation.display.detailDesktop).not.toBe("none");
    await assertNoHorizontalOverflow(page);

    await goToTab(page, "identity");
    await expect(page.locator("#identity .id-card").first()).toBeVisible();
    const identity = await getIdentityTabletState(page);
    expect(identity.bodyClass).toContain("is-portrait-screen");
    expect(identity.bodyClass).not.toContain("is-landscape-screen");
    const [firstCard, secondCard] = identity.cards;
    expect((firstCard?.top || 0) + (firstCard?.height || 0)).toBeLessThanOrEqual((secondCard?.top || 0) + 2);
    await assertNoHorizontalOverflow(page);
  });
});
