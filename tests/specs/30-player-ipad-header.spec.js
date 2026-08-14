// @ts-check
/**
 * Player iPad Safari header regression.
 *
 * The player study shell must keep a clear hierarchy on a roomy iPad: direct
 * access is reserved for Questions, notifications, and More. Account context
 * and lower-frequency utilities live in More so they are still available.
 * Those three actions must be visibly contained as one small utility toolbar,
 * not a row of floating pills.
 */
const { test, expect } = require("@playwright/test");
const { login, dismissFirstUse, goToTab } = require("./helpers");

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
      const overflow = document.getElementById("headerOverflowToggle");
      const overflowStyle = overflow ? getComputedStyle(overflow) : null;
      const overflowBox = overflow?.getBoundingClientRect();
      return (
        body?.dataset.authRole === "player" &&
        body.classList.contains("shell-tablet") &&
        body.classList.contains("is-player-mobile-shell") &&
        Boolean(document.getElementById("playerPortalBtn")) &&
        !document.getElementById("playerPortalBtn")?.hidden &&
        Boolean(document.getElementById("notifBellBtn")) &&
        !document.getElementById("notifBellBtn")?.hidden &&
        Boolean(overflow) &&
        !overflow?.hidden &&
        overflowStyle?.display !== "none" &&
        (overflowBox?.width || 0) >= 44 &&
        (overflowBox?.height || 0) >= 44
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
      const utilityGroup = document.querySelector(".app-header-actions");
      const headerBox = header?.getBoundingClientRect();
      const tabBox = tabs?.getBoundingClientRect();
      const utilityGroupBox = utilityGroup?.getBoundingClientRect();

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
        utilityGroup: utilityGroupBox && {
          left: utilityGroupBox.left,
          right: utilityGroupBox.right,
          top: utilityGroupBox.top,
          bottom: utilityGroupBox.bottom,
          width: utilityGroupBox.width,
          height: utilityGroupBox.height,
          gap: getComputedStyle(utilityGroup).gap,
          borderTopWidth: getComputedStyle(utilityGroup).borderTopWidth,
          borderRadius: getComputedStyle(utilityGroup).borderTopLeftRadius,
          backgroundColor: getComputedStyle(utilityGroup).backgroundColor,
          separators: {
            questions: getComputedStyle(document.getElementById("playerPortalBtn")).borderInlineEndWidth,
            notifications: getComputedStyle(document.getElementById("notifBellBtn")).borderInlineEndWidth,
          },
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
    expect(chrome.utilityGroup).not.toBeNull();
    expect(chrome.utilityGroup?.height || 0).toBeGreaterThanOrEqual(44);
    expect(chrome.utilityGroup?.gap).toBe("0px");
    expect(chrome.utilityGroup?.borderTopWidth).toBe("1px");
    expect(chrome.utilityGroup?.borderRadius).not.toBe("0px");
    expect(chrome.utilityGroup?.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(chrome.utilityGroup?.separators).toEqual({
      questions: "1px",
      notifications: "1px",
    });
    for (let index = 1; index < chrome.direct.length; index += 1) {
      const previous = chrome.direct[index - 1].rect;
      const current = chrome.direct[index].rect;
      expect(previous && current && !overlaps(previous, current), "header controls do not overlap").toBe(true);
      expect((current?.left || 0) - (previous?.right || 0), "connected toolbar segments stay adjacent").toBeGreaterThanOrEqual(0);
      expect((current?.left || 0) - (previous?.right || 0), "connected toolbar segments have no floating gap").toBeLessThanOrEqual(1);
      expect(previous && current && previous.left >= (chrome.utilityGroup?.left || 0), "segment starts inside its shared toolbar").toBe(true);
      expect(previous && current && previous.right <= (chrome.utilityGroup?.right || 0), "segment ends inside its shared toolbar").toBe(true);
    }
    const lastDirect = chrome.direct.at(-1)?.rect;
    expect(lastDirect && lastDirect.right <= (chrome.utilityGroup?.right || 0), "final segment ends inside its shared toolbar").toBe(true);

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

  test("keeps one usable study shelf through Home, Playbook, Signals, Practice, and Quiz", async ({ page }, testInfo) => {
    test.skip(
      !["ipad-portrait", "ipad-landscape"].includes(testInfo.project.name),
      "This regression requires the touch-enabled WebKit iPad projects.",
    );

    const m1Viewport = testInfo.project.name === "ipad-landscape"
      ? M1_IPAD_LANDSCAPE
      : M1_IPAD_PORTRAIT;
    await page.setViewportSize(m1Viewport);
    await login(page, { role: "player", username: "player", password: "password" });
    await dismissFirstUse(page);

    const destinations = [
      { tab: "dashboard", id: "tab-dashboard" },
      { tab: "playbook", id: "tab-playbook" },
      { tab: "signals", id: "tab-signals" },
      { tab: "script", id: "tab-script" },
      { tab: "quiz", id: "tab-quiz" },
    ];

    for (const destination of destinations) {
      await goToTab(page, destination.tab);
      await page.waitForFunction((expected) => {
        const strip = document.querySelector("#mainApp > .tabs");
        const active = document.getElementById(expected.id);
        const panel = document.getElementById(expected.tab);
        if (!strip || !active || !panel) return false;
        const style = getComputedStyle(strip);
        const box = strip.getBoundingClientRect();
        return (
          document.body.dataset.studyNavigation === "top" &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          box.width > 0 &&
          box.height > 0 &&
          active.getAttribute("aria-selected") === "true" &&
          !active.hidden &&
          panel.classList.contains("active")
        );
      }, destination);

      const shelf = await page.evaluate(() => {
        const strip = document.querySelector("#mainApp > .tabs");
        const header = document.querySelector(".app-header");
        const visible = (element) => {
          if (!element || element.hidden) return false;
          const style = getComputedStyle(element);
          const box = element.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0;
        };
        const rect = (element) => {
          const box = element.getBoundingClientRect();
          return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
        };
        const visibleTabs = Array.from(strip?.querySelectorAll(":scope > .tab") || [])
          .filter(visible)
          .map((tab) => {
            const style = getComputedStyle(tab);
            return {
              id: tab.id,
              selected: tab.getAttribute("aria-selected"),
              rect: rect(tab),
              borderRadius: style.borderTopLeftRadius,
              borderTopWidth: style.borderTopWidth,
              boxShadow: style.boxShadow,
            };
          });
        return {
          navigation: document.body.dataset.studyNavigation,
          active: document.body.dataset.activeTab,
          position: strip ? getComputedStyle(strip).position : "",
          strip: strip && {
            ...rect(strip),
            backgroundColor: getComputedStyle(strip).backgroundColor,
            borderTopWidth: getComputedStyle(strip).borderTopWidth,
          },
          header: header ? rect(header) : null,
          scrollWidth: strip?.scrollWidth || 0,
          clientWidth: strip?.clientWidth || 0,
          visibleTabs,
        };
      });

      expect(shelf.navigation).toBe("top");
      expect(shelf.active).toBe(destination.tab);
      expect(shelf.position).toBe("sticky");
      expect(shelf.strip).not.toBeNull();
      expect((shelf.strip?.height || 0), "the shelf remains compact").toBeGreaterThanOrEqual(52);
      expect((shelf.strip?.height || 0), "the shelf does not grow into page chrome").toBeLessThanOrEqual(58);
      expect((shelf.strip?.top || 0) - (shelf.header?.bottom || 0), "the shelf stays attached below the header").toBeLessThanOrEqual(1);
      expect(shelf.strip?.borderTopWidth).toBe("1px");
      expect(shelf.strip?.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
      expect(shelf.scrollWidth, "all five destinations fit without a hidden horizontal route").toBeLessThanOrEqual(
        shelf.clientWidth + 1,
      );
      expect(shelf.visibleTabs.map((tab) => tab.id)).toEqual(destinations.map((item) => item.id));
      shelf.visibleTabs.forEach((tab) => {
        expect(tab.rect.height, `${tab.id} remains touch-safe`).toBeGreaterThanOrEqual(44);
        expect(tab.rect.top, `${tab.id} stays within the shelf`).toBeGreaterThanOrEqual((shelf.strip?.top || 0) - 1);
        expect(tab.rect.bottom, `${tab.id} stays within the shelf`).toBeLessThanOrEqual((shelf.strip?.bottom || 0) + 1);
        expect(tab.borderRadius, `${tab.id} is a shelf segment, not a floating pill`).toBe("0px");
        expect(tab.borderTopWidth, `${tab.id} does not restore its old pill border`).toBe("0px");
      });
      const activeTab = shelf.visibleTabs.find((tab) => tab.id === destination.id);
      expect(activeTab?.selected).toBe("true");
      expect(activeTab?.boxShadow, "the active route has a contained underline").not.toBe("none");
    }
  });

  test("opens Home immediately below the iPad shelf after a study-tab switch", async ({ page }, testInfo) => {
    test.skip(
      !["ipad-portrait", "ipad-landscape"].includes(testInfo.project.name),
      "This regression requires the touch-enabled WebKit iPad projects.",
    );

    const m1Viewport = testInfo.project.name === "ipad-landscape"
      ? M1_IPAD_LANDSCAPE
      : M1_IPAD_PORTRAIT;
    await page.setViewportSize(m1Viewport);
    await login(page, { role: "player", username: "player", password: "password" });
    await dismissFirstUse(page);

    const assertHomeIsAtTheTopOfTheRoute = async (label) => {
      await goToTab(page, "dashboard");
      await page.waitForFunction(() => {
        const shelf = document.querySelector("#mainApp > .tabs");
        const home = document.getElementById("playerDashboardHome");
        const dashboard = document.getElementById("dashboard");
        if (!shelf || !home || !dashboard || home.hidden) return false;
        const shelfBox = shelf.getBoundingClientRect();
        const homeBox = home.getBoundingClientRect();
        return (
          dashboard.classList.contains("active") &&
          home.textContent.trim().length > 0 &&
          homeBox.width > 0 &&
          homeBox.height > 0 &&
          homeBox.top >= shelfBox.bottom - 1 &&
          homeBox.top < window.innerHeight
        );
      });

      const geometry = await page.evaluate(() => {
        const shelf = document.querySelector("#mainApp > .tabs");
        const home = document.getElementById("playerDashboardHome");
        const dashboard = document.getElementById("dashboard");
        const shelfBox = shelf?.getBoundingClientRect();
        const homeBox = home?.getBoundingClientRect();
        const dashboardBox = dashboard?.getBoundingClientRect();
        return {
          scrollY: window.scrollY,
          viewportHeight: window.innerHeight,
          shelfBottom: shelfBox?.bottom || 0,
          homeTop: homeBox?.top || 0,
          dashboardTop: dashboardBox?.top || 0,
          homeText: home?.textContent.trim() || "",
        };
      });

      expect(geometry.scrollY, `${label}: Home does not need a manual scroll to begin`).toBeLessThanOrEqual(1);
      expect(geometry.homeText, `${label}: player Home has hydrated`).not.toBe("");
      expect(geometry.dashboardTop, `${label}: panel begins beneath the shelf`).toBeGreaterThanOrEqual(
        geometry.shelfBottom - 1,
      );
      expect(geometry.homeTop - geometry.shelfBottom, `${label}: no viewport-height spacer precedes Home`).toBeLessThanOrEqual(64);
      expect(geometry.homeTop, `${label}: Home is visible in the initial viewport`).toBeLessThan(
        geometry.viewportHeight,
      );
    };

    await assertHomeIsAtTheTopOfTheRoute("initial Home");
    await goToTab(page, "playbook");
    await assertHomeIsAtTheTopOfTheRoute("returning from Playbook");
  });
});
