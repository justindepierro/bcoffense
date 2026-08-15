// @ts-check
/**
 * Staff Settings workspace-surface isolation.
 *
 * Admin Settings is a destination of its own on a roomy iPad. It must not
 * inherit a hidden Dashboard/Scout panel's scroll shell or leave the staff
 * rail and fixed workbench controls active behind it.
 */
const { test, expect } = require("@playwright/test");
const { login, dismissFirstUse, goToTab } = require("./helpers");

const IPAD_LANDSCAPE_VIEWPORTS = [
  { name: "1024×768 iPad", width: 1024, height: 768 },
  { name: "M1 11-inch iPad", width: 1194, height: 834 },
];

const RETURN_ROUTES = ["dashboard", "tendencies"];

async function configureLandscapeIpad(page, viewport) {
  await page.addInitScript(() => {
    try {
      Object.defineProperty(window.screen, "orientation", {
        configurable: true,
        value: { type: "landscape-primary", angle: 90 },
      });
    } catch (_error) {}
    try {
      Object.defineProperty(window, "orientation", {
        configurable: true,
        value: 90,
      });
    } catch (_error) {}
  });
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
}

async function readWorkspaceSurface(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      if (!element || element.hidden) return false;
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0;
    };
    const rect = (element) => {
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return {
        top: Math.round(box.top),
        bottom: Math.round(box.bottom),
        width: Math.round(box.width),
        height: Math.round(box.height),
      };
    };
    const upload = document.getElementById("uploadSection");
    const mainApp = document.getElementById("mainApp");
    const panels = Array.from(document.querySelectorAll(".panel"));
    const activePanel = panels.find((panel) => panel.classList.contains("active"));
    return {
      workspaceSurface: document.body.dataset.workspaceSurface || "",
      returnTab: document.body.dataset.workspaceReturnTab || "",
      scrollOwner: document.body.dataset.scrollOwner || "",
      mainAppVisible: visible(mainApp),
      activePanelVisible: visible(activePanel),
      visiblePanelIds: panels.filter(visible).map((panel) => panel.id),
      uploadVisible: visible(upload),
      upload: rect(upload),
      uploadClientHeight: upload?.clientHeight || 0,
      uploadScrollHeight: upload?.scrollHeight || 0,
      uploadOverflowY: upload ? getComputedStyle(upload).overflowY : "",
      appChrome: [
        "ipadRail",
        "ipadRailMore",
        "pageFabCluster",
        "quickTools",
        "gpDrawerToggleBtn",
        "gpDrawer",
        "mobileCoachDock",
        "workspaceSyncDock",
      ].map((id) => {
        const element = document.getElementById(id);
        return { id, present: Boolean(element), visible: visible(element), hidden: Boolean(element?.hidden) };
      }),
    };
  });
}

test.describe("staff Settings workspace surface", () => {
  test("Settings replaces Dashboard and Scout with one scrollable iPad workspace, then returns to its source route", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "ipad-landscape",
      "This regression needs the staff iPad landscape panel shell.",
    );

    await configureLandscapeIpad(page, IPAD_LANDSCAPE_VIEWPORTS[0]);
    await login(page, { role: "admin", username: "admin", password: "password" });
    await dismissFirstUse(page);

    for (const viewport of IPAD_LANDSCAPE_VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.waitForFunction(() => (
        document.body.classList.contains("shell-tablet") &&
        document.body.classList.contains("is-staff-mobile-shell") &&
        document.body.dataset.layoutProfile === "tablet-landscape"
      ));

      for (const route of RETURN_ROUTES) {
        await goToTab(page, route);
        await page.evaluate(() => {
          const uploadBox = document.querySelector("#uploadSection .upload-box");
          document.getElementById("__workspaceSurfaceTestSpacer")?.remove();
          const spacer = document.createElement("div");
          spacer.id = "__workspaceSurfaceTestSpacer";
          spacer.style.height = "1200px";
          spacer.style.pointerEvents = "none";
          uploadBox?.append(spacer);
          showUpload();
        });

        await expect.poll(() => readWorkspaceSurface(page)).toMatchObject({
          workspaceSurface: "upload",
          returnTab: route,
          scrollOwner: "workspace",
          mainAppVisible: false,
          activePanelVisible: false,
          visiblePanelIds: [],
          uploadVisible: true,
        });

        const opened = await readWorkspaceSurface(page);
        expect(opened.upload?.height || 0, `${viewport.name}: Settings gets the usable canvas`).toBeGreaterThan(400);
        expect(opened.upload?.bottom || 0, `${viewport.name}: Settings stays inside the visual viewport`).toBeLessThanOrEqual(
          viewport.height + 1,
        );
        expect(["auto", "scroll"], `${viewport.name}: Settings owns vertical scrolling`).toContain(opened.uploadOverflowY);
        expect(opened.uploadScrollHeight, `${viewport.name}: test content makes Settings scrollable`).toBeGreaterThan(
          opened.uploadClientHeight,
        );
        expect(
          opened.appChrome.filter((surface) => surface.present && surface.visible),
          `${viewport.name}: no staff workspace chrome stays actionable behind Settings`,
        ).toEqual([]);

        const scrolled = await page.evaluate(() => {
          const upload = document.getElementById("uploadSection");
          if (!upload) return 0;
          upload.scrollTop = 180;
          return upload.scrollTop;
        });
        expect(scrolled, `${viewport.name}: only Settings scrolls`).toBeGreaterThan(0);

        await page.locator("#backToAppBtn").click();
        await expect.poll(() => page.evaluate((target) => ({
          surface: document.body.dataset.workspaceSurface || "",
          owner: document.body.dataset.scrollOwner || "",
          active: document.querySelector(".panel.active")?.id || "",
          visiblePanels: Array.from(document.querySelectorAll(".panel"))
            .filter((panel) => {
              const box = panel.getBoundingClientRect();
              return getComputedStyle(panel).display !== "none" && box.width > 0 && box.height > 0;
            })
            .map((panel) => panel.id),
          mainAppHidden: document.getElementById("mainApp")?.classList.contains("hidden") || false,
          railVisible: (() => {
            const rail = document.getElementById("ipadRail");
            if (!rail || rail.hidden) return false;
            const box = rail.getBoundingClientRect();
            return getComputedStyle(rail).display !== "none" && box.height > 0;
          })(),
        }), route)).toEqual({
          surface: "app",
          owner: "panel",
          active: route,
          visiblePanels: [route],
          mainAppHidden: false,
          railVisible: true,
        });
        await page.evaluate(() => document.getElementById("__workspaceSurfaceTestSpacer")?.remove());
      }
    }
  });
});
