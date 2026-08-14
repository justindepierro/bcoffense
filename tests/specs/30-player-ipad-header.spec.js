// @ts-check
/**
 * Player iPad Safari header regression.
 *
 * The player study shell must keep a clear hierarchy on a roomy iPad: direct
 * access is reserved for Questions, notifications, and More. Account context
 * and lower-frequency utilities live in More so they are still available
 * without turning the app header into a row of floating pills.
 */
const { test, expect } = require("@playwright/test");
const { login, dismissFirstUse } = require("./helpers");

const M1_IPAD_LANDSCAPE = { width: 1194, height: 834 };
const M1_IPAD_PORTRAIT = { width: 834, height: 1194 };
const STANDARD_IPAD_LANDSCAPE = { width: 1024, height: 768 };

function overlaps(a, b) {
  return (
    a.left < b.right &&
    a.right > b.left &&
    a.top < b.bottom &&
    a.bottom > b.top
  );
}

test.describe("Player iPad Safari header hierarchy", () => {
  test("keeps only player-critical controls direct and moves utilities into More", async ({ page }, testInfo) => {
    test.skip(
      !["ipad-portrait", "ipad-landscape"].includes(testInfo.project.name),
      "This regression requires the touch-enabled WebKit iPad projects.",
    );

    // The M1 11-inch iPad is the reported Safari environment. Use the
    // matching project so its Screen Orientation model agrees with its layout
    // viewport in both physical orientations.
    const m1Viewport = testInfo.project.name === "ipad-landscape"
      ? M1_IPAD_LANDSCAPE
      : M1_IPAD_PORTRAIT;
    await page.setViewportSize(m1Viewport);

    await login(page, { role: "player", username: "player", password: "password" });
    await dismissFirstUse(page);
    await page.waitForFunction(() => {
      const body = document.body;
      return (
        body?.dataset.authRole === "player" &&
        body.classList.contains("shell-tablet") &&
        body.classList.contains("is-player-mobile-shell") &&
        Boolean(document.getElementById("playerPortalBtn")) &&
        !document.getElementById("playerPortalBtn")?.hidden &&
        Boolean(document.getElementById("notifBellBtn")) &&
        !document.getElementById("notifBellBtn")?.hidden
      );
    });
    const chrome = await page.evaluate(() => {
      const isElementVisible = (element) => {
        if (!element || element.hidden) return false;
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity || "1") > 0 &&
          box.width > 0 &&
          box.height > 0
        );
      };
      const rect = (selector) => {
        const element = document.querySelector(selector);
        if (!element || !isElementVisible(element)) return null;
        const box = element.getBoundingClientRect();
        return {
          left: box.left,
          right: box.right,
          top: box.top,
          bottom: box.bottom,
          width: box.width,
          height: box.height,
        };
      };
      const header = document.querySelector(".app-header");
      const tabs = document.querySelector("#mainApp .tabs");
      const directCandidates = [
        "#playerPortalBtn",
        ".header-refresh-btn",
        "#notifBellBtn",
        "#headerThemeToggleBtn",
        "#authLogoutBtn",
        "#headerOverflowToggle",
      ];
      const direct = directCandidates
        .map((selector) => ({ selector, rect: rect(selector) }))
        .filter(({ rect: box }) => Boolean(box));
      const tabRects = Array.from(tabs?.querySelectorAll(".tab") || [])
        .filter(isElementVisible)
        .map((tab) => {
          const box = tab.getBoundingClientRect();
          return { label: tab.textContent?.trim() || "", width: box.width, height: box.height };
        });
      const titleGroup = document.querySelector(".app-title-group");
      const headerBox = header?.getBoundingClientRect();
      const tabBox = tabs?.getBoundingClientRect();

      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        layoutProfile: document.body.dataset.layoutProfile,
        classes: document.body.className,
        header: headerBox && {
          top: headerBox.top,
          bottom: headerBox.bottom,
          height: headerBox.height,
        },
        titleGroup: titleGroup && {
          height: titleGroup.getBoundingClientRect().height,
          portalLineDisplay: getComputedStyle(titleGroup, "::after").display,
        },
        direct,
        hiddenUtilities: {
          account: getComputedStyle(document.getElementById("authUserBadge")).display,
          refresh: getComputedStyle(document.querySelector(".header-refresh-btn")).display,
          theme: getComputedStyle(document.getElementById("headerThemeToggleBtn")).display,
          questionLabel: getComputedStyle(document.querySelector(".pport-header-btn .header-action-label")).display,
        },
        tabs: tabBox && {
          top: tabBox.top,
          bottom: tabBox.bottom,
          height: tabBox.height,
          position: getComputedStyle(tabs).position,
        },
        tabRects,
      };
    });
    expect(chrome.classes).toContain("shell-tablet");
    expect(chrome.classes).toContain("is-player-mobile-shell");
    expect(chrome.header).not.toBeNull();
    expect(chrome.header?.height || 0).toBeGreaterThanOrEqual(56);
    expect(chrome.header?.height || 0).toBeLessThanOrEqual(64);
    expect(chrome.titleGroup?.height || 0).toBeLessThan(38);
    expect(chrome.titleGroup?.portalLineDisplay).toBe("none");
    expect(chrome.hiddenUtilities).toEqual({
      account: "none",
      refresh: "none",
      theme: "none",
      questionLabel: "none",
    });

    expect(chrome.direct.map(({ selector }) => selector)).toEqual([
      "#playerPortalBtn",
      "#notifBellBtn",
      "#headerOverflowToggle",
    ]);
    chrome.direct.forEach(({ selector, rect: box }) => {
      expect(box?.width || 0, `${selector} width`).toBeGreaterThanOrEqual(44);
      expect(box?.height || 0, `${selector} height`).toBeGreaterThanOrEqual(44);
    });
    for (let index = 1; index < chrome.direct.length; index += 1) {
      const previous = chrome.direct[index - 1].rect;
      const current = chrome.direct[index].rect;
      expect(previous && current && !overlaps(previous, current), "header controls do not overlap").toBe(true);
      expect((current?.left || 0) - (previous?.right || 0), "header controls retain a visible gap").toBeGreaterThanOrEqual(4);
    }

    expect(chrome.tabs).not.toBeNull();
    expect(chrome.tabRects.length).toBeGreaterThanOrEqual(5);
    chrome.tabRects.forEach((tab) => {
      expect(tab.height, `${tab.label} tab stays touch-safe`).toBeGreaterThanOrEqual(44);
    });
    expect(chrome.viewport).toEqual(m1Viewport);
    expect(chrome.layoutProfile).toBe(
      testInfo.project.name === "ipad-landscape" ? "tablet-landscape" : "tablet-portrait",
    );
    expect(chrome.tabs?.position).toBe("sticky");
    expect((chrome.tabs?.top || 0) - (chrome.header?.bottom || 0)).toBeLessThanOrEqual(1);
    expect(chrome.tabs?.height || 0).toBeLessThanOrEqual(58);

    await page.locator("#headerOverflowToggle").click();
    const menu = page.locator(".header-overflow-menu");
    await expect(menu).toBeVisible();
    await expect(page.locator("#headerOverflowAccount")).toContainText(/player/i);
    await expect(page.locator("#headerOverflowRefresh")).toBeVisible();
    await expect(page.locator("#headerOverflowTheme")).toBeVisible();
    await expect(page.locator("#headerOverflowLogout")).toBeVisible();

    const menuTargets = await page.locator("#headerOverflowRefresh, #headerOverflowTheme").evaluateAll((items) =>
      items.map((item) => {
        const box = item.getBoundingClientRect();
        return { id: item.id, width: box.width, height: box.height };
      }),
    );
    menuTargets.forEach((target) => {
      expect(target.width, `${target.id} menu width`).toBeGreaterThanOrEqual(44);
      expect(target.height, `${target.id} menu height`).toBeGreaterThanOrEqual(44);
    });

    const themeBefore = await page.evaluate(() => document.documentElement.getAttribute("data-theme") || "");
    await page.locator("#headerOverflowTheme").click();
    await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute("data-theme") || "")).toBe(
      themeBefore === "dark" ? "" : "dark",
    );

    if (testInfo.project.name !== "ipad-landscape") return;

    // M1 geometry is the reported bug, but the older 1024×768 iPad profile is
    // still common on sidelines. Resize inside the same Safari session so this
    // regression proves that the header hierarchy does not rely on extra M1
    // width to stay clear.
    await page.setViewportSize(STANDARD_IPAD_LANDSCAPE);
    await page.waitForFunction((viewport) => {
      const body = document.body;
      return (
        window.innerWidth === viewport.width &&
        window.innerHeight === viewport.height &&
        body?.dataset.layoutProfile === "tablet-landscape" &&
        body.classList.contains("shell-tablet")
      );
    }, STANDARD_IPAD_LANDSCAPE);

    const standardLandscape = await page.evaluate(() => {
      const visibleRect = (selector) => {
        const element = document.querySelector(selector);
        if (!element || element.hidden || getComputedStyle(element).display === "none") return null;
        const box = element.getBoundingClientRect();
        return box.width > 0 && box.height > 0
          ? { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height }
          : null;
      };
      const header = document.querySelector(".app-header")?.getBoundingClientRect();
      const tabs = document.querySelector("#mainApp .tabs");
      const tabsRect = tabs?.getBoundingClientRect();
      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        direct: ["#playerPortalBtn", "#notifBellBtn", "#headerOverflowToggle"]
          .map((selector) => ({ selector, rect: visibleRect(selector) })),
        header: header && { bottom: header.bottom, height: header.height },
        tabs: tabsRect && { top: tabsRect.top, height: tabsRect.height, position: getComputedStyle(tabs).position },
        hidden: ["#authUserBadge", ".header-refresh-btn", "#headerThemeToggleBtn"]
          .map((selector) => getComputedStyle(document.querySelector(selector)).display),
      };
    });
    expect(standardLandscape.viewport).toEqual(STANDARD_IPAD_LANDSCAPE);
    expect(standardLandscape.hidden).toEqual(["none", "none", "none"]);
    expect(standardLandscape.header?.height || 0).toBeLessThanOrEqual(64);
    expect(standardLandscape.tabs?.position).toBe("sticky");
    expect((standardLandscape.tabs?.top || 0) - (standardLandscape.header?.bottom || 0)).toBeLessThanOrEqual(1);
    expect(standardLandscape.tabs?.height || 0).toBeLessThanOrEqual(58);
    standardLandscape.direct.forEach(({ selector, rect: box }) => {
      expect(box, `${selector} stays visible at 1024×768`).not.toBeNull();
      expect(box?.width || 0, `${selector} width at 1024×768`).toBeGreaterThanOrEqual(44);
      expect(box?.height || 0, `${selector} height at 1024×768`).toBeGreaterThanOrEqual(44);
    });
    for (let index = 1; index < standardLandscape.direct.length; index += 1) {
      const previous = standardLandscape.direct[index - 1].rect;
      const current = standardLandscape.direct[index].rect;
      expect(previous && current && !overlaps(previous, current), "1024×768 header controls do not overlap").toBe(true);
    }
  });
});
