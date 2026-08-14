#!/usr/bin/env node

import { createServer } from "node:http";
import { createRequire } from "node:module";
import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { access, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);

const DEFAULT_TOOL_ROOT =
  process.env.MOBILE_DEBUG_PLAYWRIGHT_ROOT ||
  path.join(process.env.HOME || "", ".codex/tools/mobile-debug");

const VIEWPORTS = {
  "320x568": { width: 320, height: 568 },
  "360x640": { width: 360, height: 640 },
  "375x667": { width: 375, height: 667 },
  "390x844": { width: 390, height: 844 },
  "393x852": { width: 393, height: 852 },
  "412x915": { width: 412, height: 915 },
  "568x320": { width: 568, height: 320 },
  "667x375": { width: 667, height: 375 },
  "844x390": { width: 844, height: 390 },
  "744x768": { width: 744, height: 768 },
  "744x1024": { width: 744, height: 1024 },
  "768x1024": { width: 768, height: 1024 },
  "820x1180": { width: 820, height: 1180 },
  "1024x768": { width: 1024, height: 768 },
  "1366x768": { width: 1366, height: 768 },
  "834x1112": { width: 834, height: 1112 },
  "1024x1366": { width: 1024, height: 1366 },
};

// Includes narrow portrait and Split View candidates. The latter has a
// landscape physical screen but a 744px-wide app window, which must select the
// document-based tablet-compact profile instead of the landscape coach rail.
const IPAD_VIEWPORTS = ["744x768", "744x1024", "768x1024", "820x1180", "834x1112", "1024x768", "1366x768", "1024x1366"];
// T-006b keeps a small focused portrait/landscape set for the editable 4 × 6
// Call Sheet Index Card. The wider iPad matrix still gets the general shell
// checks; these two cases exercise its touch-only editor controls directly.
const INDEX_CARD_TABLET_VIEWPORTS = ["744x1024", "1024x768"];
// T-008c exercises the Tendencies command-density path at both supported
// roomy staff tablet widths. Keep this separate from the broader iPad matrix:
// the probe seeds film data and verifies the real anchored overflow route.
const TENDENCIES_TABLET_LANDSCAPE_VIEWPORTS = ["1024x768", "1366x768"];
const SCREEN_VIEWPORT_OVERRIDES = {
  "744x768": { width: 1024, height: 768 },
};
const DEFAULT_CASE_TIMEOUT_MS = 25000;
const DEFAULT_MAX_RUN_MS = 180000;
const GOOGLE_FONTS_STYLESHEET = /^https:\/\/fonts\.googleapis\.com\//;

function getViewportOrientation(viewport) {
  return viewport.width > viewport.height ? "landscape" : "portrait";
}

function getScreenViewport(viewportName, viewport) {
  return SCREEN_VIEWPORT_OVERRIDES[viewportName] || viewport;
}

function getViewportOrientationAngle(viewport) {
  return getViewportOrientation(viewport) === "landscape" ? 90 : 0;
}

const MIME_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".ico", "image/x-icon"],
]);

function parseArgs(argv) {
  const args = {
    help: false,
    url: "",
    roles: ["admin", "coach", "player"],
    viewports: ["320x568", "390x844", "568x320", ...IPAD_VIEWPORTS],
    screenshots: true,
    headed: false,
    warnOnly: false,
    port: 4187,
    outputDir: path.join(root, ".mobile-debug"),
    caseTimeoutMs: DEFAULT_CASE_TIMEOUT_MS,
    maxRunMs: DEFAULT_MAX_RUN_MS,
  };

  argv.forEach((arg) => {
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg.startsWith("--url=")) args.url = arg.slice("--url=".length);
    else if (arg.startsWith("--roles=")) {
      args.roles = arg.slice("--roles=".length).split(",").map((v) => v.trim()).filter(Boolean);
    } else if (arg.startsWith("--viewports=")) {
      args.viewports = arg.slice("--viewports=".length).split(",").map((v) => v.trim()).filter(Boolean);
    } else if (arg === "--all-viewports") args.viewports = Object.keys(VIEWPORTS);
    else if (arg === "--ipad-viewports") args.viewports = IPAD_VIEWPORTS;
    else if (arg === "--no-screenshots") args.screenshots = false;
    else if (arg === "--headed") args.headed = true;
    else if (arg === "--warn-only") args.warnOnly = true;
    else if (arg.startsWith("--port=")) args.port = Number(arg.slice("--port=".length)) || args.port;
    else if (arg.startsWith("--output=")) args.outputDir = path.resolve(arg.slice("--output=".length));
    else if (arg.startsWith("--case-timeout-ms=")) {
      args.caseTimeoutMs = Number(arg.slice("--case-timeout-ms=".length)) || args.caseTimeoutMs;
    } else if (arg.startsWith("--max-run-ms=")) {
      args.maxRunMs = Number(arg.slice("--max-run-ms=".length)) || args.maxRunMs;
    }
  });

  return args;
}

function printUsage() {
  console.log(`Usage: node scripts/mobile-viewport-check.mjs [options]

Options:
  --roles=admin,coach,player       Comma-separated roles to test
  --viewports=390x844,834x1112     Comma-separated viewport names to test
  --all-viewports                  Test every built-in viewport
  --ipad-viewports                 Test only iPad/tablet viewports
  --no-screenshots                 Skip screenshot capture
  --warn-only                      Write/report failures without nonzero exit
  --url=http://127.0.0.1:4187      Use an existing server instead of starting one
  --port=4187                      Local static server port
  --output=.mobile-debug           Report/screenshot output directory
  --case-timeout-ms=${DEFAULT_CASE_TIMEOUT_MS}          Max time per role/viewport case
  --max-run-ms=${DEFAULT_MAX_RUN_MS}             Hard stop for the whole run
  --help                           Show this message and exit`);
}

function closeServer(server) {
  if (!server) return;
  server.close(() => { });
}

async function findPlaywright() {
  const candidates = [
    path.join(root, "node_modules/playwright"),
    path.join(root, "tests", "node_modules", "playwright"),
    path.join(DEFAULT_TOOL_ROOT, "node_modules/playwright"),
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return require(candidate);
    } catch (_err) {
      // Try the next candidate.
    }
  }
  throw new Error(
    "Playwright not found. Install it with: npm install --prefix tests && " +
    "npx --prefix tests playwright install chromium",
  );
}

function safePathFromUrl(requestUrl) {
  const parsed = new URL(requestUrl, "http://localhost");
  let pathname = decodeURIComponent(parsed.pathname);
  if (pathname === "/") pathname = "/index.html";
  const resolved = path.resolve(root, `.${pathname}`);
  if (!resolved.startsWith(root)) return "";
  return resolved;
}

function serveStatic(port) {
  const server = createServer((req, res) => {
    const parsed = new URL(req.url || "/", "http://localhost");
    // This harness intentionally uses a static app server instead of a full
    // remote Cloudflare environment. Keep the player-only Pages contracts
    // available as empty, valid fixtures so a UI check catches real browser
    // failures rather than expected 404s from routes the static server cannot
    // otherwise provide.
    if (parsed.pathname === "/api/telemetry") {
      // Mirror production: telemetry beacon accepts and returns 204 No Content.
      res.writeHead(204);
      res.end();
      return;
    }
    if (parsed.pathname === "/player/release") {
      const release = {
        schema: "bcoffense.player-release/v1",
        release: {
          teamId: "mobile-debug-team",
          revision: "mobile-debug-release",
          updatedAt: "2026-07-21T00:00:00.000Z",
        },
        team: { name: "Mobile Debug" },
        scripts: [],
        playbook: [],
        signals: [],
        settings: {},
        media: { diagramMediaIds: [], diagrams: [], clipSigs: [] },
      };
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        ETag: '"mobile-debug-release"',
      });
      res.end(JSON.stringify({ ok: true, release }));
      return;
    }
    if (parsed.pathname === "/api/quiz-assignments") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, assignments: [], players: [] }));
      return;
    }
    if (parsed.pathname.startsWith("/api/questions")) {
      // The staff Dashboard requests this summary even for an empty local
      // workspace. Mirror the empty Pages response so a geometry audit does
      // not fail on an unrelated missing-function 404.
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({
        ok: true,
        summary: { open: 0, today: 0, resolved: 0, needsAnswer: 0 },
        questions: [],
        hasMore: false,
      }));
      return;
    }
    if (parsed.pathname === "/api/threads/batch-counts") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, counts: {} }));
      return;
    }
    if (parsed.pathname.startsWith("/api/threads/")) {
      // The workflow probe opens a real play panel. Keep its asynchronous
      // discussion section as an empty, valid local fixture rather than
      // recording a static-server 404 that is unrelated to viewport behavior.
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({
        ok: true,
        thread: { total: 0, locked: false },
        posts: [],
        hasMore: false,
      }));
      return;
    }
    if (parsed.pathname === "/api/moderation/queue") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, posts: [], count: 0 }));
      return;
    }
    if (parsed.pathname === "/media/migrate-legacy-play-clip-manifests") {
      // Admin warmup performs this bounded recovery check. A static viewport
      // server has no Cloudflare media bindings, so model the completed empty
      // response instead of turning a layout case into an unrelated 404.
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({
        ok: true,
        migrated: [],
        retired: [],
        inactive: 0,
        skipped: [],
        failed: [],
        remaining: 0,
        complete: true,
      }));
      return;
    }
    if (parsed.pathname === "/workspace/revision") {
      const workspace = {
        app: "BCOffense",
        version: 3,
        exportDate: "2026-07-21T00:00:00.000Z",
        teamName: "Mobile Debug",
        playbook: [],
      };
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        ETag: '"mobile-debug-workspace"',
      });
      res.end(JSON.stringify({
        ok: true,
        workspace,
        revision: "mobile-debug-workspace",
        playerReleaseRevision: "mobile-debug-release",
        updatedAt: workspace.exportDate,
        size: JSON.stringify(workspace).length,
      }));
      return;
    }
    if (parsed.pathname === "/media/migrate-legacy-signal-manifests") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, migrated: [], complete: true }));
      return;
    }
    if (parsed.pathname === "/auth/me") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ user: null }));
      return;
    }
    if (parsed.pathname === "/auth/logout") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (parsed.pathname === "/api/leaderboard/summary") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({
        ok: true,
        summary: {
          weekKey: parsed.searchParams.get("weekKey") || "",
          week: { rows: [], totals: {} },
          season: { rows: [], totals: {} },
        },
      }));
      return;
    }
    if (parsed.pathname === "/auth/login") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        const parsedBody = safeJson(body);
        const role = String(parsedBody.username || "").toLowerCase();
        if (!["admin", "coach", "player"].includes(role) || !parsedBody.password) {
          res.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ error: "Invalid username or password." }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({
          user: {
          username: role,
          role,
          label: role.charAt(0).toUpperCase() + role.slice(1),
          teamId: "mobile-debug-team",
        },
      }));
      });
      return;
    }
    if (parsed.pathname.startsWith("/api/notifications")) {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      if (parsed.pathname === "/api/notifications/count") {
        res.end(JSON.stringify({ ok: true, unread: 0 }));
      } else {
        res.end(JSON.stringify({ ok: true, notifications: [], hasMore: false, unread: 0 }));
      }
      return;
    }
    if (parsed.pathname === "/favicon.ico") {
      res.writeHead(204);
      res.end();
      return;
    }
    if (parsed.pathname.startsWith("/sync/")) {
      res.writeHead(204, { "Content-Type": "application/json; charset=utf-8" });
      res.end();
      return;
    }
    if (parsed.pathname === "/clips/batch-manifest") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, count: 0, manifests: {} }));
      return;
    }
    if (parsed.pathname.startsWith("/clips/")) {
      // Clip routes are Cloudflare Pages Functions in production. Stub them as
      // an empty index so the static harness mirrors a signed-in user with no
      // clips instead of reporting a 404 on every page load.
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, sigs: [], clips: [] }));
      return;
    }
    if (parsed.pathname === "/images/batch-manifest") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, count: 0, manifests: {} }));
      return;
    }
    if (parsed.pathname.startsWith("/images/manifest")) {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({
        ok: true,
        sig: parsed.searchParams.get("sig") || "",
        published: false,
      }));
      return;
    }

    const filePath = safePathFromUrl(req.url || "/");
    if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME_TYPES.get(path.extname(filePath)) || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    createReadStream(filePath).pipe(res);
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve({
        server,
        url: `http://127.0.0.1:${port}/index.html`,
      });
    });
  });
}

function safeJson(text) {
  try {
    return JSON.parse(text || "{}");
  } catch (_err) {
    return {};
  }
}

function slug(value) {
  return String(value).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}

async function loginAs(page, role) {
  await page.waitForFunction(() => document.body && document.body.dataset.authRole, null, {
    timeout: 10000,
  }).catch(() => { });
  const currentRole = await page.evaluate(() => document.body?.dataset.authRole || "");
  if (currentRole === role) return;

  const overlay = page.locator("#authLoginOverlay");
  if (!(await overlay.isVisible().catch(() => false))) {
    await page.evaluate(() => {
      if (typeof window.logoutAuth === "function") {
        window.logoutAuth();
      }
    });
  }
  await overlay.waitFor({ state: "visible", timeout: 8000 });
  await page.locator("#authUsername").fill(role);
  await page.locator("#authPassword").fill("mobile-debug");
  await page.locator("#authLoginSubmit").click();
  await page.waitForFunction(
    (expectedRole) => document.body?.dataset.authRole === expectedRole,
    role,
    { timeout: 10000 },
  );
}

async function inspectPage(page) {
  return page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    const scrollWidth = document.documentElement.scrollWidth;
    const overflow = scrollWidth > viewportWidth + 1;
    const fixedOverlaps = [];
    const smallTargets = [];
    const isVisible = (el) => {
      if (!el) return false;
      const style = getComputedStyle(el);
      if (
        style.visibility === "hidden" ||
        style.display === "none" ||
        Number(style.opacity) === 0 ||
        el.hidden
      ) {
        return false;
      }
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const mainAppEl = document.getElementById("mainApp");
    const uploadVisible = isVisible(document.getElementById("uploadSection"));
    const tabStrip = document.querySelector("#mainApp .tabs");
    const mobilePrimaryNav = document.getElementById("mobilePrimaryNav");
    const tabBarVisible = isVisible(tabStrip);
    const mobilePrimaryNavVisible = isVisible(mobilePrimaryNav);
    const activePanel = document.querySelector(".panel.active");
    const activePanelVisible = isVisible(activePanel);
    const mainAppVisible = isVisible(mainAppEl) || activePanelVisible;

    const describeNavigation = (el) => {
      if (!el) return { visible: false, position: "", height: 0, bottom: 0 };
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        visible: isVisible(el),
        position: style.position,
        height: Math.round(rect.height),
        bottom: Math.round(rect.bottom),
      };
    };
    const readPx = (value) => {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? Math.round(parsed) : 0;
    };
    const studyPortal = document.body?.dataset.authStudyPortal === "true";
    const studyBottomNavMedia = window.matchMedia(
      "(max-width: 640px), (pointer: coarse) and (max-width: 820px), (pointer: coarse) and (max-height: 640px)",
    ).matches;
    const phonePrimaryNavMedia = window.matchMedia("(max-width: 560px)").matches;
    const tabStripNavigation = describeNavigation(tabStrip);
    const phonePrimaryNavigation = describeNavigation(mobilePrimaryNav);
    const alignsToBottom = (navigation) =>
      navigation.visible &&
      navigation.position === "fixed" &&
      Math.abs(navigation.bottom - viewportHeight) <= 2;
    const expectedStudyNavigation = !studyPortal
      ? "not-study"
      : phonePrimaryNavMedia
        ? "phone-primary-bottom"
        : studyBottomNavMedia
          ? "tab-strip-bottom"
          : "top-tabs";
    const actualStudyNavigation = alignsToBottom(phonePrimaryNavigation)
      ? "phone-primary-bottom"
      : alignsToBottom(tabStripNavigation)
        ? "tab-strip-bottom"
        : tabStripNavigation.visible
          ? "top-tabs"
          : "unavailable";
    const rootStyle = getComputedStyle(document.documentElement);
    const appTabsHeight = readPx(rootStyle.getPropertyValue("--app-tabs-height"));
    const playerBottomNavHeight = readPx(
      rootStyle.getPropertyValue("--player-bottom-nav-height"),
    );
    const hasTopTabReservation =
      tabStripNavigation.visible &&
      Math.abs(appTabsHeight - tabStripNavigation.height) <= 2 &&
      playerBottomNavHeight <= 2;
    const hasTabStripBottomReservation =
      tabStripNavigation.visible &&
      appTabsHeight <= 2 &&
      Math.abs(playerBottomNavHeight - tabStripNavigation.height) <= 2;
    const studyNavigation = {
      supported: studyPortal,
      expected: expectedStudyNavigation,
      actual: actualStudyNavigation,
      tabStrip: tabStripNavigation,
      phonePrimary: phonePrimaryNavigation,
      appTabsHeight,
      playerBottomNavHeight,
      ok:
        !studyPortal ||
        (expectedStudyNavigation === actualStudyNavigation &&
          (expectedStudyNavigation === "top-tabs"
            ? hasTopTabReservation
            : expectedStudyNavigation === "tab-strip-bottom"
              ? hasTabStripBottomReservation
              : appTabsHeight <= 2)),
    };

    const bottomNav = document.querySelector(".tabs, #mobileCoachDock");
    const bottomNavRect = bottomNav?.getBoundingClientRect();

    document.querySelectorAll("body *").forEach((el) => {
      if (
        el.closest(
          ".custom-modal-overlay:not(.visible), .modal-overlay:not(.show), .cell-popup-overlay.hidden, [inert]",
        )
      ) {
        return;
      }
      const style = getComputedStyle(el);
      if (
        style.visibility === "hidden" ||
        style.display === "none" ||
        Number(style.opacity) === 0 ||
        el.closest("#startupLoader")
      ) {
        return;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const onscreen =
        rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < viewportHeight &&
        rect.left < viewportWidth;
      if (!onscreen) return;

      if (style.position === "fixed" && bottomNavRect && el !== bottomNav) {
        const overlaps =
          rect.left < bottomNavRect.right &&
          rect.right > bottomNavRect.left &&
          rect.top < bottomNavRect.bottom &&
          rect.bottom > bottomNavRect.top;
        if (overlaps) {
          fixedOverlaps.push({
            selector: describeElement(el),
            rect: roundRect(rect),
          });
        }
      }

      const interactive = el.matches(
        "button, [role='button'], a[href], input:not([type='hidden']), select, textarea, [data-action]",
      );
      if (!interactive) return;
      if (el.matches(".skip-link:not(:focus)")) return;
      if (el.matches("input[type='checkbox'], input[type='radio'], input[type='color']")) return;
      if (el.closest(".callsheet-table, .playbook-table-wrap, #playbookTable, .wristband-grid")) return;
      if (rect.width < 44 || rect.height < 44) {
        smallTargets.push({
          selector: describeElement(el),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          text: (el.textContent || el.getAttribute("aria-label") || el.getAttribute("title") || "")
            .trim()
            .slice(0, 40),
        });
      }
    });

    function describeElement(el) {
      if (el.id) return `#${el.id}`;
      const classes = [...el.classList].slice(0, 3).join(".");
      const name = el.getAttribute("data-action") || el.getAttribute("name") || "";
      return `${el.tagName.toLowerCase()}${classes ? `.${classes}` : ""}${name ? `[${name}]` : ""}`;
    }

    function roundRect(rect) {
      return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    }

    return {
      title: document.title,
      role: document.body?.dataset.authRole || "",
      screenSize: document.body?.dataset.screenSize || "",
      shellSize: document.body?.dataset.shellSize || "",
      device: document.body?.dataset.device || "",
      displayMode: document.body?.dataset.displayMode || "",
      standaloneDisplay: document.body?.dataset.standaloneDisplay || "",
      fullscreenApi: document.body?.dataset.fullscreenApi || "",
      ipados: document.body?.dataset.ipados || "",
      presentation: document.body?.dataset.presentation || "",
      orientation: document.body?.dataset.screenOrientation || "",
      shellOrientation: document.body?.dataset.shellOrientation || "",
      hardwareOrientation: document.body?.dataset.hardwareOrientation || "",
      layoutProfile: document.body?.dataset.layoutProfile || "",
      scrollOwner: document.body?.dataset.scrollOwner || "",
      workspaceSurface: document.body?.dataset.workspaceSurface || "",
      mainAppVisible,
      uploadVisible,
      tabBarVisible,
      mobilePrimaryNavVisible,
      activePanel: activePanel?.id || "",
      activePanelVisible,
      studyNavigation,
      viewportWidth,
      viewportHeight: Math.round(viewportHeight),
      scrollWidth,
      overflow,
      fixedOverlaps: fixedOverlaps.slice(0, 10),
      smallTargets: smallTargets.slice(0, 20),
      smallTargetCount: smallTargets.length,
    };
  });
}

// Scroll-ancestry probe: report visible vertical scroll owners inside the active
// page so we can prove a single owner per mode (M-011). Owners inside approved
// wrappers (tables, modal/drawer bodies, presentation surfaces) are exempt.
async function probeScrollOwners(page) {
  return page.evaluate(() => {
    const APPROVED =
      ".callsheet-table, .playbook-table-wrap, .playbook-table-wrapper, .wristband-grid," +
      " .custom-modal, .app-layer-active, .pp-detail-body, .pp-coach-detail," +
      " .cs-table-scroll, .help-panel-body, .pb-filter-drawer-body, [data-approved-scroller]," +
      " .pb-action-sheet, .pb-action-sheet-body, .action-sheet, .action-sheet-body," +
      " .bottom-sheet, .bottom-sheet-body, [role='dialog'], [data-layer-open='true']";
    const isVisible = (el) => {
      if (!el) return false;
      const s = getComputedStyle(el);
      if (s.visibility === "hidden" || s.display === "none" || Number(s.opacity) === 0 || el.hidden) {
        return false;
      }
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const describe = (el) => {
      if (el.id) return `#${el.id}`;
      const classes = [...el.classList].slice(0, 3).join(".");
      return `${el.tagName.toLowerCase()}${classes ? `.${classes}` : ""}`;
    };
    const panel = document.querySelector(".panel.active");
    const owners = [];
    if (panel) {
      const candidates = [panel, ...panel.querySelectorAll("*")];
      candidates.forEach((el) => {
        if (!isVisible(el)) return;
        const s = getComputedStyle(el);
        const oy = s.overflowY;
        const scrolls =
          (oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 2;
        if (!scrolls) return;
        const approved = el.matches(APPROVED) || Boolean(el.closest(APPROVED));
        owners.push({ selector: describe(el), approved });
      });
    }
    const docScrolls =
      document.documentElement.scrollHeight > document.documentElement.clientHeight + 2;
    const unapproved = owners.filter((o) => !o.approved).map((o) => o.selector);
    return { docScrolls, ownerCount: owners.length, unapproved: unapproved.slice(0, 10) };
  });
}

// Walk the major tabs available to the role and probe scroll ownership on each.
async function probeTabsScrollOwnership(page) {
  const TABS = ["playbook", "signals", "script", "wristband", "callsheet", "tendencies", "gameplan", "dashboard"];
  const out = [];
  for (const tab of TABS) {
    const switched = await page.evaluate((t) => {
      const btn = document.querySelector(`[data-action="showTab"][data-arg="${t}"]`);
      if (!btn || btn.hidden || btn.offsetParent === null) return false;
      if (typeof window.showTab !== "function") return false;
      try {
        window.showTab(t);
        return true;
      } catch (_e) {
        return false;
      }
    }, tab);
    if (!switched) continue;
    await page.waitForTimeout(220);
    const probe = await probeScrollOwners(page);
    out.push({ tab, ...probe });
  }
  return out;
}

// Layer scroll-lock probe (M-051): drive the real openLayer/closeLayer machinery
// with a synthetic blocking overlay and verify the document cannot scroll while
// the layer owns scroll, then that scroll position and focus are restored on
// close. Uses the shipped dom-helpers primitives so it exercises production code.
async function probeLayerScrollLock(page) {
  return page.evaluate(async () => {
    if (typeof window.openLayer !== "function" || typeof window.closeLayer !== "function") {
      return { supported: false, reason: "layer api missing" };
    }

    const spacer = document.createElement("div");
    spacer.style.height = "4000px";
    spacer.setAttribute("data-probe-spacer", "true");
    document.body.appendChild(spacer);

    const anchor = document.createElement("button");
    anchor.type = "button";
    anchor.textContent = "probe-anchor";
    anchor.setAttribute("data-probe-anchor", "true");
    document.body.appendChild(anchor);

    const overlay = document.createElement("div");
    overlay.id = "__probeLayer";
    overlay.innerHTML = '<div class="app-layer-panel"><button type="button" id="__probeLayerBtn">ok</button></div>';
    document.body.appendChild(overlay);

    try {
      // Focus the anchor first — focusing an off-screen control scrolls the
      // document, so establish the scroll baseline only after focus settles.
      anchor.focus();
      const anchorFocusedBefore = document.activeElement === anchor;
      window.scrollTo(0, 600);
      const beforeScrollY = Math.round(window.scrollY);

      const opened = window.openLayer(overlay, { blocking: true });
      const lockedOwner = document.body.dataset.scrollOwner || "";
      const lockedClass = document.body.classList.contains("app-layer-locked");
      const bodyPosition = getComputedStyle(document.body).position;
      // Attempt to scroll the background while the layer is locked.
      window.scrollTo(0, 1800);
      const scrolledWhileLocked = Math.abs(window.scrollY) > 2;

      const closed = window.closeLayer(overlay);
      const restoredOwner = document.body.dataset.scrollOwner || "";
      const restoredClass = document.body.classList.contains("app-layer-locked");
      const restoredScrollY = Math.round(window.scrollY);
      const focusRestored = document.activeElement === anchor;

      const lockOk = opened && lockedClass && lockedOwner === "layer" &&
        bodyPosition === "fixed" && !scrolledWhileLocked;
      const restoreOk = closed && !restoredClass && restoredOwner !== "layer" &&
        Math.abs(restoredScrollY - beforeScrollY) <= 2 && focusRestored;

      return {
        supported: true,
        anchorFocusedBefore,
        opened,
        lockedOwner,
        lockedClass,
        bodyPosition,
        scrolledWhileLocked,
        closed,
        restoredOwner,
        restoredClass,
        beforeScrollY,
        restoredScrollY,
        focusRestored,
        lockOk,
        restoreOk,
      };
    } finally {
      overlay.remove();
      anchor.remove();
      spacer.remove();
      window.scrollTo(0, 0);
    }
  });
}

async function probeRealAppLayers(page) {
  return page.evaluate(async () => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const isLocked = () =>
      document.body.classList.contains("app-layer-locked") &&
      document.body.dataset.scrollOwner === "layer";
    const checks = [];

    if (typeof window.openLayer !== "function" || typeof window.closeLayer !== "function") {
      return { supported: false, reason: "layer api missing", checks };
    }

    if (typeof window.showModal === "function") {
      const promise = window.showModal("Layer probe", { title: "Layer probe", icon: "i" });
      await sleep(80);
      const overlay = document.querySelector(".custom-modal-overlay.visible");
      const actions = overlay?.querySelector(".custom-modal-actions");
      const actionStyle = actions ? getComputedStyle(actions) : null;
      const footerSafe = actionStyle
        ? Number.parseFloat(actionStyle.paddingBottom || "0") >= 12
        : false;
      const check = {
        name: "custom-modal",
        opened: Boolean(overlay),
        locked: isLocked(),
        safeArea: Boolean(overlay?.classList.contains("app-layer-safe-area")),
        footerSafe,
        restored: false,
      };
      overlay?.querySelector(".custom-modal-btn")?.click();
      await Promise.race([promise, sleep(700)]);
      await sleep(80);
      check.restored = !document.body.classList.contains("app-layer-locked");
      check.ok = check.opened && check.locked && check.safeArea && check.footerSafe && check.restored;
      checks.push(check);
    }

    if (typeof window.showTab === "function") {
      window.showTab("playbook");
      await sleep(120);
    }
    const sheet = document.getElementById("pbActionSheet");
    if (sheet && typeof window.openPbActionSheet === "function" && typeof window.closePbActionSheet === "function") {
      window.openPbActionSheet();
      await sleep(80);
      const check = {
        name: "playbook-action-sheet",
        opened: sheet.classList.contains("open"),
        locked: isLocked(),
        safeArea: sheet.classList.contains("app-layer-safe-area"),
        restored: false,
      };
      window.closePbActionSheet();
      await sleep(80);
      check.restored = !document.body.classList.contains("app-layer-locked");
      check.ok = check.opened && check.locked && check.safeArea && check.restored;
      checks.push(check);
    }

    return {
      supported: checks.length > 0,
      checks,
      ok: checks.length > 0 && checks.every((check) => check.ok),
    };
  });
}

// Role restriction probe (M-051): players must not see staff-only controls and
// each role must be able to reach its promised tabs. Auth hides forbidden
// controls document-wide via hidden/authHidden, so a forbidden control that is
// not hidden is a real leak regardless of which panel is active.
async function probeRoleRestrictions(page) {
  return page.evaluate(() => {
    const role = document.body && document.body.dataset.authRole ? document.body.dataset.authRole : "";
    const ROLE_TABS = {
      admin: ["playbook", "signals", "script", "wristband", "tendencies", "gameplan", "callsheet", "installation", "identity", "offensebuilder", "dashboard"],
      coach: ["playbook", "signals", "script", "wristband", "tendencies", "gameplan", "callsheet", "installation", "identity", "offensebuilder", "dashboard"],
      player: ["dashboard", "playbook", "signals", "script"],
    };
    // Controls each role must never see.
    const FORBIDDEN = {
      player: "[data-auth-player-hide], [data-auth-admin-only='true'], [data-auth-edit-only]",
      coach: "[data-auth-admin-only='true']",
      admin: "",
    };
    if (!ROLE_TABS[role]) return { supported: false, role };

    const describe = (el) =>
      el.id
        ? `#${el.id}`
        : `${el.tagName.toLowerCase()}${el.dataset && el.dataset.action ? `[${el.dataset.action}]` : ""}`;
    const notRoleHidden = (el) => {
      if (el.hidden || (el.dataset && el.dataset.authHidden === "true")) return false;
      if (el.getAttribute("aria-hidden") === "true") return false;
      const cs = getComputedStyle(el);
      return cs.display !== "none" && cs.visibility !== "hidden";
    };

    const sel = FORBIDDEN[role] || "";
    const leaked = sel
      ? [...document.querySelectorAll(sel)].filter(notRoleHidden).map(describe).slice(0, 10)
      : [];

    const missingTabs = (ROLE_TABS[role] || []).filter((t) => {
      const btn = document.querySelector(`[data-action="showTab"][data-arg="${t}"]`);
      return !btn || !notRoleHidden(btn);
    });

    return { supported: true, role, leaked, missingTabs, ok: leaked.length === 0 && missingTabs.length === 0 };
  });
}

async function probeTapDispatch(page) {
  const role = await page.evaluate(() => document.body?.dataset.authRole || "");
  const tabsByRole = {
    admin: ["playbook", "signals", "script", "wristband", "callsheet"],
    coach: ["playbook", "signals", "script", "wristband", "callsheet"],
    player: ["dashboard", "playbook", "signals", "script"],
  };
  const taps = [];

  for (const tab of tabsByRole[role] || []) {
    const selector = `[data-action="showTab"][data-arg="${tab}"]`;
    const locator = page.locator(selector).filter({ visible: true }).first();
    const visible = await locator.isVisible().catch(() => false);
    let route = "direct-tab";

    if (visible) {
      await locator.click({ timeout: 4000 });
    } else {
      // Staff tablet landscape replaces the regular tab bar with the iPad
      // rail. Destinations such as Signals live behind the rail's More menu,
      // so exercise that user-visible route instead of treating the hidden
      // desktop tab as a navigation failure.
      const rail = page.locator("#ipadRail").filter({ visible: true }).first();
      const railVisible = await rail.isVisible().catch(() => false);
      const moreDestination = page
        .locator(`#ipadRailMore [data-action="ipadRailGo"][data-arg="${tab}"]`)
        .first();
      const hasMoreDestination = (await moreDestination.count()) > 0;

      if (!railVisible || !hasMoreDestination) {
        taps.push({ target: `tab:${tab}`, ok: false, reason: "not visible" });
        continue;
      }

      const moreButton = rail.locator('[data-action="toggleIpadRailMore"]').first();
      const moreVisible = await moreButton.isVisible().catch(() => false);
      if (!moreVisible) {
        taps.push({ target: `tab:${tab}`, ok: false, reason: "rail more unavailable" });
        continue;
      }

      await moreButton.click({ timeout: 4000 });
      const destinationVisible = await moreDestination
        .waitFor({ state: "visible", timeout: 2500 })
        .then(() => true)
        .catch(() => false);
      if (!destinationVisible) {
        taps.push({ target: `tab:${tab}`, ok: false, reason: "rail more destination hidden" });
        await page.keyboard.press("Escape").catch(() => { });
        continue;
      }

      await moreDestination.click({ timeout: 4000 });
      route = "ipad-rail-more";
    }

    const switched = await page.waitForFunction(
      (expectedTab) => document.body?.dataset.activeTab === expectedTab,
      tab,
      { timeout: 2500 },
    ).then(() => true).catch(() => false);
    const state = await page.evaluate(() => ({
      activeTab: document.body?.dataset.activeTab || "",
      activePanel: document.querySelector(".panel.active")?.id || "",
    }));
    taps.push({
      target: `tab:${tab}`,
      route,
      ok: switched && state.activeTab === tab && state.activePanel === tab,
      ...state,
    });
  }

  const overflow = page.locator(".header-overflow-btn").filter({ visible: true }).first();
  if (await overflow.isVisible().catch(() => false)) {
    await overflow.click({ timeout: 4000 });
    const menuState = await page.evaluate(() => {
      const button = document.querySelector(".header-overflow-btn");
      const wrap = button?.closest(".tool-menu-wrap");
      return {
        open: Boolean(wrap?.classList.contains("open")),
        expanded: button?.getAttribute("aria-expanded") || "",
      };
    });
    taps.push({
      target: "header-overflow",
      ok: menuState.open && menuState.expanded === "true",
      ...menuState,
    });
    await page.keyboard.press("Escape").catch(() => { });
  }

  return { supported: true, role, taps, ok: taps.every((tap) => tap.ok) };
}

// Tablet fixed-stack probe: roomy staff tablets can expose the workspace sync
// status, page-level Library/Actions pills, and Quick Tools at once. A narrow
// landscape Split View instead uses the compact utility fallback: page Actions
// plus header-overflow Help. Drive the real Script page and compare rendered
// footprints rather than relying on CSS variables, so a later layout change
// cannot silently recreate a collision or remove the fallback path.
async function probeTabletFixedStack(page) {
  const role = await page.evaluate(() => document.body?.dataset.authRole || "");
  const result = {
    supported: false,
    role,
    activeTab: "",
    initialActiveTab: "",
    scriptRoute: "",
    layout: {},
    surfaces: {},
    pairChecks: [],
    overlaps: [],
    missing: [],
    interactions: {},
    restored: false,
    ok: false,
  };
  if (!["admin", "coach"].includes(role)) {
    return { ...result, skipped: true, reason: "staff tablet probe" };
  }

  const snapshot = await page.evaluate(() => {
    const dock = document.getElementById("workspaceSyncDock");
    const quickTools = document.getElementById("quickTools");
    const menu = document.getElementById("quickToolsMenu");
    const trigger = document.getElementById("quickToolsFab");
    const retry = dock?.querySelector(".workspace-sync-dock__retry");
    return {
      activeTab: document.body?.dataset.activeTab || "",
      quickToolsOpen: Boolean(quickTools?.classList.contains("open")),
      quickToolsMenuAriaHidden: menu?.getAttribute("aria-hidden") || "",
      quickToolsMenuInert: Boolean(menu?.hasAttribute("inert")),
      quickToolsTriggerExpanded: trigger?.getAttribute("aria-expanded") || "",
      dock: dock
        ? {
          className: dock.className,
          syncState: dock.dataset.syncState || "",
          syncChannel: dock.dataset.syncChannel || "",
          text: dock.querySelector(".workspace-sync-dock__text")?.textContent || "",
          retryHidden: Boolean(retry?.hidden),
        }
        : null,
    };
  });
  result.initialActiveTab = snapshot.activeTab;

  try {
    // Script is a real staff workbench that exposes the page FAB cluster in
    // tablet portrait. In staff tablet landscape the regular tab bar is
    // intentionally hidden, so route through the visible iPad rail instead.
    const directScriptTab = page
      .locator('#mainApp .tabs [data-action="showTab"][data-arg="script"]')
      .filter({ visible: true })
      .first();
    const railScriptTab = page
      .locator('#ipadRail [data-action="showTab"][data-arg="script"]')
      .filter({ visible: true })
      .first();
    let scriptTab = directScriptTab;
    if (await directScriptTab.isVisible().catch(() => false)) {
      result.scriptRoute = "direct-tab";
    } else if (await railScriptTab.isVisible().catch(() => false)) {
      scriptTab = railScriptTab;
      result.scriptRoute = "ipad-rail";
    } else {
      result.reason = "script navigation unavailable";
      return result;
    }
    await scriptTab.click({ timeout: 4000 });
    const tabActive = await page
      .waitForFunction(
        () => document.body?.dataset.activeTab === "script" && document.querySelector(".panel.active")?.id === "script",
        { timeout: 2500 },
      )
      .then(() => true)
      .catch(() => false);
    result.activeTab = await page.evaluate(() => document.body?.dataset.activeTab || "");
    if (!tabActive) {
      result.reason = "script page did not activate";
      return result;
    }

    const dockPrepared = await page.evaluate(() => {
      const dock = document.getElementById("workspaceSyncDock");
      if (!dock) return { ok: false, reason: "workspace sync dock missing" };
      if (typeof window.setWorkspaceSyncStatus !== "function") {
        return { ok: false, reason: "workspace sync status API missing" };
      }
      // Use the real shared status API, rather than faking a dock rectangle.
      window.setWorkspaceSyncStatus("local", "saving", {
        label: "Checking tablet control layout",
      });
      return { ok: true };
    });
    if (!dockPrepared.ok) {
      result.reason = dockPrepared.reason;
      return result;
    }

    const dockVisible = await page
      .waitForFunction(() => {
        const dock = document.getElementById("workspaceSyncDock");
        if (!dock) return false;
        const style = getComputedStyle(dock);
        const rect = dock.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity) >= 0.99 &&
          rect.width > 0 &&
          rect.height > 0
        );
      }, { timeout: 2500 })
      .then(() => true)
      .catch(() => false);
    if (!dockVisible) {
      result.reason = "workspace sync dock did not become visible";
      return result;
    }

    // A landscape iPad can be running a narrow Split View/Stage Manager
    // window. Its compact staff profile deliberately gives the lower-right
    // slot to the page Actions FAB instead of stacking a second Quick Tools
    // launcher above it. Prove that choice through the actual fallback path:
    // Actions still opens, the header overflow exposes Help, and the Script
    // template command remains an unobstructed live control. Roomy tablet
    // profiles continue through the original three-surface stack below.
    const compactTablet = await page.evaluate(() =>
      document.body?.dataset.layoutProfile === "tablet-compact" &&
      document.body?.classList.contains("is-staff-mobile-shell"),
    );
    if (compactTablet) {
      const pageActionsFab = page.locator("#pageActionsFab").filter({ visible: true }).first();
      const headerOverflow = page.locator(".header-overflow-btn").filter({ visible: true }).first();
      const quickToolsFab = page.locator("#quickToolsFab").filter({ visible: true }).first();
      const quickToolsVisible = await quickToolsFab.isVisible().catch(() => false);
      const pageActionsVisible = await pageActionsFab.isVisible().catch(() => false);
      const headerOverflowVisible = await headerOverflow.isVisible().catch(() => false);

      if (quickToolsVisible || !pageActionsVisible || !headerOverflowVisible) {
        result.supported = true;
        result.layout = {
          profile: "tablet-compact",
          compactUtilityFallback: true,
        };
        result.surfaces = {
          quickToolsVisible,
          pageActionsVisible,
          headerOverflowVisible,
        };
        result.reason = quickToolsVisible
          ? "Quick Tools remained visible in the compact tablet profile"
          : !pageActionsVisible
            ? "Page Actions trigger not visible in the compact tablet profile"
            : "Header overflow trigger not visible in the compact tablet profile";
        return result;
      }

      await pageActionsFab.click({ timeout: 4000 });
      const pageActionsOpened = await page
        .waitForFunction(() => document.getElementById("pageActionsSheet")?.classList.contains("visible"), {
          timeout: 2500,
        })
        .then(() => true)
        .catch(() => false);
      if (pageActionsOpened) {
        await page.keyboard.press("Escape");
        await page
          .waitForFunction(() => !document.getElementById("pageActionsSheet")?.classList.contains("visible"), {
            timeout: 2500,
          })
          .catch(() => {});
      }

      await headerOverflow.click({ timeout: 4000 });
      const helpMenuItem = page.locator(".header-overflow-help-item").filter({ visible: true }).first();
      const helpMenuVisible = await helpMenuItem.isVisible().catch(() => false);
      let helpOpened = false;
      let helpClosed = false;
      if (helpMenuVisible) {
        await helpMenuItem.click({ timeout: 4000 });
        helpOpened = await page
          .waitForFunction(() => document.getElementById("helpOverlay")?.classList.contains("visible"), {
            timeout: 2500,
          })
          .then(() => true)
          .catch(() => false);
        if (helpOpened) {
          await page.keyboard.press("Escape");
          helpClosed = await page
            .waitForFunction(() => !document.getElementById("helpOverlay")?.classList.contains("visible"), {
              timeout: 2500,
            })
            .then(() => true)
            .catch(() => false);
        }
      }

      const geometry = await page.evaluate(() => {
        const visibleRect = (el) => {
          if (!el) return null;
          const style = getComputedStyle(el);
          if (
            style.display === "none" ||
            style.visibility === "hidden" ||
            Number(style.opacity) === 0 ||
            el.hidden
          ) {
            return null;
          }
          const rect = el.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return null;
          return {
            left: Math.round(rect.left),
            top: Math.round(rect.top),
            right: Math.round(rect.right),
            bottom: Math.round(rect.bottom),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          };
        };
        const overlaps = (a, b) =>
          Boolean(a && b && a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1);
        const receivesCenterHit = (element) => {
          const rect = visibleRect(element);
          if (!rect) return false;
          const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
          return Boolean(hit && (hit === element || element.contains(hit)));
        };
        const dock = visibleRect(document.getElementById("workspaceSyncDock"));
        const pageActionsFab = visibleRect(document.getElementById("pageActionsFab"));
        const pageFabCluster = visibleRect(document.getElementById("pageFabCluster"));
        const headerOverflow = visibleRect(document.querySelector(".header-overflow-btn"));
        const quickTools = visibleRect(document.getElementById("quickTools"));
        const quickToolsFab = visibleRect(document.getElementById("quickToolsFab"));
        const quickToolsMenu = visibleRect(document.getElementById("quickToolsMenu"));
        const scriptTemplate = document.querySelector(
          '#script .period-buttons [data-action="insertPeriodFromTemplate"]',
        );
        const scriptTemplateRect = visibleRect(scriptTemplate);
        const requiredSurfaces = {
          dock,
          pageFabCluster,
          pageActionsFab,
          headerOverflow,
          scriptTemplate: scriptTemplateRect,
        };
        const pairs = [
          ["dock/page-fab", dock, pageActionsFab],
          ["page-fab/script-template", pageActionsFab, scriptTemplateRect],
        ];
        const pairChecks = pairs.map(([name, first, second]) => ({
          name,
          firstVisible: Boolean(first),
          secondVisible: Boolean(second),
          overlap: overlaps(first, second),
        }));
        return {
          surfaces: {
            dock,
            pageFabCluster,
            pageActionsFab,
            headerOverflow,
            quickTools,
            quickToolsFab,
            quickToolsMenu,
            scriptTemplate: scriptTemplateRect,
          },
          quickToolsAbsent: !quickTools && !quickToolsFab && !quickToolsMenu,
          missing: Object.entries(requiredSurfaces).flatMap(([name, rect]) => rect ? [] : [name]),
          pairChecks,
          overlaps: pairChecks.filter((check) => check.overlap).map((check) => check.name),
          scriptTemplateReceivesHit: receivesCenterHit(scriptTemplate),
        };
      });
      result.supported = true;
      result.layout = {
        profile: "tablet-compact",
        compactUtilityFallback: true,
      };
      result.surfaces = geometry.surfaces;
      result.missing = geometry.missing;
      result.pairChecks = geometry.pairChecks;
      result.overlaps = geometry.overlaps;
      result.interactions = {
        pageActionsOpened,
        helpMenuVisible,
        helpOpened,
        helpClosed,
        quickToolsAbsent: geometry.quickToolsAbsent,
        scriptTemplateReceivesHit: geometry.scriptTemplateReceivesHit,
      };
      result.ok =
        geometry.quickToolsAbsent &&
        pageActionsOpened &&
        helpMenuVisible &&
        helpOpened &&
        helpClosed &&
        geometry.scriptTemplateReceivesHit &&
        geometry.missing.length === 0 &&
        geometry.overlaps.length === 0;
      if (!result.ok) {
        result.reason = "compact tablet utility fallback did not complete";
      }
      return result;
    }

    const quickToolsFab = page.locator("#quickToolsFab").filter({ visible: true }).first();
    if (!(await quickToolsFab.isVisible().catch(() => false))) {
      result.reason = "Quick Tools trigger not visible";
      return result;
    }
    if (!snapshot.quickToolsOpen) {
      await quickToolsFab.click({ timeout: 4000 });
    }
    const quickToolsMenuVisible = await page
      .waitForFunction(() => {
        const menu = document.getElementById("quickToolsMenu");
        if (!menu) return false;
        const style = getComputedStyle(menu);
        const rect = menu.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity) >= 0.99 &&
          style.pointerEvents !== "none" &&
          rect.width > 0 &&
          rect.height > 0
        );
      }, { timeout: 2500 })
      .then(() => true)
      .catch(() => false);
    if (!quickToolsMenuVisible) {
      result.reason = "Quick Tools menu did not open";
      return result;
    }

    const geometry = await page.evaluate(() => {
      const visibleRect = (el) => {
        if (!el) return null;
        const style = getComputedStyle(el);
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          Number(style.opacity) === 0 ||
          el.hidden
        ) {
          return null;
        }
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return null;
        return {
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          right: Math.round(rect.right),
          bottom: Math.round(rect.bottom),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      };
      const unionRect = (rects) => {
        const visible = rects.filter(Boolean);
        if (!visible.length) return null;
        const left = Math.min(...visible.map((rect) => rect.left));
        const top = Math.min(...visible.map((rect) => rect.top));
        const right = Math.max(...visible.map((rect) => rect.right));
        const bottom = Math.max(...visible.map((rect) => rect.bottom));
        return { left, top, right, bottom, width: right - left, height: bottom - top };
      };
      const overlaps = (a, b) =>
        Boolean(a && b && a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1);
      const shellOrientation = document.body?.dataset.shellOrientation || "";
      const landscapeShell = document.body?.classList.contains("is-landscape-screen") ||
        shellOrientation === "landscape";
      const dock = visibleRect(document.getElementById("workspaceSyncDock"));
      const pageFabCluster = visibleRect(document.getElementById("pageFabCluster"));
      const quickToolsLauncher = visibleRect(document.getElementById("quickToolsFab"));
      const quickToolsMenu = visibleRect(document.getElementById("quickToolsMenu"));
      // The menu is absolutely positioned, so the tray's own rect only covers
      // its launcher. Union both actual visible controls for the real Quick
      // Tools footprint.
      const quickTools = unionRect([quickToolsLauncher, quickToolsMenu]);
      // Landscape intentionally uses the desktop-style header actions rather
      // than the page FAB cluster. If a page FAB is unexpectedly visible there
      // it is still part of the rendered fixed stack and is checked; portrait
      // requires all three staff controls.
      const requirePageFabCluster = !landscapeShell;
      const includePageFabCluster = requirePageFabCluster || Boolean(pageFabCluster);
      const requiredSurfaces = {
        dock,
        quickTools,
        ...(requirePageFabCluster ? { pageFabCluster } : {}),
      };
      const surfaces = { dock, pageFabCluster, quickTools, quickToolsLauncher, quickToolsMenu };
      const pairs = [
        ["dock/quick-tools", dock, quickTools],
        ...(includePageFabCluster
          ? [
            ["dock/page-fab-cluster", dock, pageFabCluster],
            ["page-fab-cluster/quick-tools", pageFabCluster, quickTools],
          ]
          : []),
      ];
      const missing = Object.entries(requiredSurfaces).flatMap(([name, rect]) =>
        rect ? [] : [name],
      );
      const pairChecks = pairs.map(([name, first, second]) => ({
        name,
        firstVisible: Boolean(first),
        secondVisible: Boolean(second),
        overlap: overlaps(first, second),
      }));
      return {
        layout: {
          shellOrientation,
          landscapeShell,
          requirePageFabCluster,
          pageFabClusterVisible: Boolean(pageFabCluster),
        },
        surfaces,
        missing,
        pairChecks,
        overlaps: pairChecks.filter((check) => check.overlap).map((check) => check.name),
      };
    });
    result.supported = true;
    result.layout = geometry.layout;
    result.surfaces = geometry.surfaces;
    result.missing = geometry.missing;
    result.pairChecks = geometry.pairChecks;
    result.overlaps = geometry.overlaps;
    result.ok = result.missing.length === 0 && result.overlaps.length === 0;
  } catch (error) {
    result.reason = String(error?.message || error);
  } finally {
    const restore = await page
      .evaluate((state) => {
        const dock = document.getElementById("workspaceSyncDock");
        const quickTools = document.getElementById("quickTools");
        const menu = document.getElementById("quickToolsMenu");
        const trigger = document.getElementById("quickToolsFab");
        const retry = dock?.querySelector(".workspace-sync-dock__retry");

        // The probe only creates a local saving status. Clear that runtime
        // state through the app API, then reinstate the prior visible channel
        // through the same API before restoring its exact DOM presentation.
        // This keeps the shared queue state and the measured UI in agreement.
        if (typeof window.setWorkspaceSyncStatus === "function") {
          window.setWorkspaceSyncStatus("local", "idle", {});
          if (state.dock?.syncChannel && state.dock?.syncState && state.dock.syncState !== "idle") {
            window.setWorkspaceSyncStatus(state.dock.syncChannel, state.dock.syncState, {
              label: state.dock.text,
            });
          }
        }
        if (dock && state.dock) {
          dock.className = state.dock.className;
          dock.dataset.syncState = state.dock.syncState;
          dock.dataset.syncChannel = state.dock.syncChannel;
          const text = dock.querySelector(".workspace-sync-dock__text");
          if (text) text.textContent = state.dock.text;
          if (retry) retry.hidden = state.dock.retryHidden;
        }

        if (typeof window.setQuickToolsOpen === "function") {
          window.setQuickToolsOpen(state.quickToolsOpen);
        } else if (quickTools && menu && trigger) {
          quickTools.classList.toggle("open", state.quickToolsOpen);
          menu.setAttribute("aria-hidden", state.quickToolsMenuAriaHidden || "true");
          menu.toggleAttribute("inert", state.quickToolsMenuInert);
          trigger.setAttribute("aria-expanded", state.quickToolsTriggerExpanded || "false");
        }
        if (state.activeTab && typeof window.showTab === "function") {
          window.showTab(state.activeTab);
        }
        return true;
      }, snapshot)
      .then(() => true)
      .catch((error) => {
        result.restoreError = String(error?.message || error);
        return false;
      });
    await page.waitForTimeout(100);
    const restoration = restore
      ? await page.evaluate((state) => {
        const dock = document.getElementById("workspaceSyncDock");
        const quickTools = document.getElementById("quickTools");
        const tabRestored = !state.activeTab || document.body?.dataset.activeTab === state.activeTab;
        const quickToolsRestored = Boolean(quickTools?.classList.contains("open")) === state.quickToolsOpen;
        const dockRestored = !state.dock || (
          dock?.className === state.dock.className &&
          (dock?.dataset.syncState || "") === state.dock.syncState &&
          (dock?.dataset.syncChannel || "") === state.dock.syncChannel
        );
        return { tabRestored, quickToolsRestored, dockRestored };
      }, snapshot)
      : { tabRestored: false, quickToolsRestored: false, dockRestored: false };
    result.restore = restoration;
    result.restored = restoration.tabRestored && restoration.quickToolsRestored && restoration.dockRestored;
    if (!result.restored) {
      result.ok = false;
      result.reason = result.reason || "probe state did not restore";
    }
  }

  return result;
}

// T-007a: the three staff tablet surfaces below used to each own a bespoke
// overlay lifecycle. Exercise their public open paths in the Chromium tablet
// matrix so the viewport harness catches a regression in the shared layer
// contract before a full Playwright suite runs. This intentionally uses a
// small in-memory signal/play fixture and restores it before the case
// screenshot is captured.
async function probeTabletBlockingLayers(page) {
  const role = await page.evaluate(() => document.body?.dataset.authRole || "");
  const surfaces = [
    {
      key: "signals",
      name: "Signals selector",
      overlayId: "signalSelectorOverlay",
      closeSelector: ".signals-play-close",
    },
    {
      key: "constraints",
      name: "Constraint panel",
      overlayId: "constraintPanel",
      closeSelector: ".cr-close-btn",
    },
    {
      key: "workflow",
      name: "Playbook workflow",
      overlayId: "pbWorkflowPanel",
      closeSelector: "#pbWfPanelClose",
    },
  ];
  const result = {
    supported: false,
    role,
    initialActiveTab: "",
    checks: [],
    restored: false,
    ok: false,
  };
  if (!["admin", "coach"].includes(role)) {
    return { ...result, skipped: true, reason: "staff tablet probe" };
  }

  const snapshot = await page.evaluate(() => {
    const root = document.documentElement;
    const readSignalRecords = () => {
      try {
        return typeof storageManager?.get === "function"
          ? storageManager.get(STORAGE_KEYS.SIGNALS, [])
          : [];
      } catch (_error) {
        return [];
      }
    };
    return {
      activeTab: document.body?.dataset.activeTab || "",
      filteredPlays: Array.isArray(filteredPlays) ? [...filteredPlays] : [],
      signalRecords: readSignalRecords(),
      appVh: root.style.getPropertyValue("--app-vh"),
      appVhPriority: root.style.getPropertyPriority("--app-vh"),
    };
  });
  result.initialActiveTab = snapshot.activeTab;

  const restoreUsableHeight = async () => {
    await page.evaluate((state) => {
      const root = document.documentElement;
      if (state.appVh) root.style.setProperty("--app-vh", state.appVh, state.appVhPriority || "");
      else root.style.removeProperty("--app-vh");
    }, snapshot);
  };
  const readLayerState = (surface, keyboardSized = false) =>
    page.evaluate(({ overlayId, closeSelector, keyboardSized: usesKeyboardHeight }) => {
      const overlay = document.getElementById(overlayId);
      const close = overlay?.querySelector(closeSelector);
      const style = overlay ? getComputedStyle(overlay) : null;
      const rect = close?.getBoundingClientRect();
      const usableVh = Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--app-vh") || "0",
      );
      const usableHeight = usesKeyboardHeight && Number.isFinite(usableVh) && usableVh > 0
        ? Math.round(usableVh * 100)
        : Math.round(window.visualViewport?.height || window.innerHeight || 0);
      return {
        present: Boolean(overlay),
        visible: Boolean(
          overlay &&
          style?.display !== "none" &&
          style?.visibility !== "hidden" &&
          !overlay.hidden,
        ),
        role: overlay?.getAttribute("role") || "",
        modal: overlay?.getAttribute("aria-modal") || "",
        layerOpen: overlay?.dataset.layerOpen === "true",
        layerActive: overlay?.classList.contains("app-layer-active") || false,
        locked: document.body.classList.contains("app-layer-locked"),
        scrollOwner: document.body.dataset.scrollOwner || "",
        closeFocused: document.activeElement === close,
        close: rect
          ? {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          }
          : null,
        viewport: {
          width: Math.round(window.innerWidth || document.documentElement.clientWidth || 0),
          usableHeight,
        },
      };
    }, { ...surface, keyboardSized });

  try {
    const prepared = await page.evaluate(() => {
      const required = [
        "openSignalSelectorForPlay",
        "runConstraintCheck",
        "openPlayWorkflowPanel",
        "showTab",
        "_sigSaveRecords",
      ];
      const missing = required.filter((name) => typeof globalThis[name] !== "function");
      if (missing.length) return { ok: false, reason: `missing APIs: ${missing.join(", ")}` };

      const play = {
        id: "__tablet-layer-probe-play__",
        type: "Run",
        personnel: "11",
        formation: "Tablet Trips",
        play: "Tablet Buck",
        basePlay: "Buck",
      };
      const compareKey = typeof normalizePlayCompareValue === "function"
        ? normalizePlayCompareValue(play.formation)
        : play.formation.toLowerCase().replace(/[^a-z0-9]+/g, "");
      const existing = typeof _sigLoadRecords === "function" ? _sigLoadRecords() : [];
      const record = {
        id: `formation:${compareKey}`,
        category: "CORE",
        componentType: "formation",
        componentValue: play.formation,
        compareKey,
        clipKey: `signals/formation/${compareKey}`,
        clipCount: 1,
        visibility: "published",
      };
      _sigSaveRecords([
        ...existing.filter((item) => item?.id !== record.id),
        record,
      ]);
      filteredPlays = [play];
      return { ok: true };
    });
    if (!prepared.ok) {
      result.reason = prepared.reason;
      return result;
    }

    for (const surface of surfaces) {
      const launched = await page.evaluate((key) => {
        // Route first, then focus the actual external launch anchor. This
        // proves close returns focus to the launcher rather than to an
        // arbitrary tab control that the route happened to touch.
        if (key === "constraints") showTab("callsheet");
        if (key === "workflow") showTab("playbook");

        document.getElementById("__tabletLayerFocusAnchor")?.remove();
        const anchor = document.createElement("button");
        anchor.type = "button";
        anchor.id = "__tabletLayerFocusAnchor";
        anchor.textContent = "Tablet layer focus anchor";
        anchor.style.cssText = "position:fixed;left:8px;top:8px;width:44px;height:44px;z-index:1;";
        document.body.appendChild(anchor);
        try {
          anchor.focus({ preventScroll: true });
        } catch (_error) {
          anchor.focus();
        }

        if (key === "signals") {
          openSignalSelectorForPlay(filteredPlays[0], { sourceLabel: "Tablet layer check" });
          return Boolean(document.getElementById("signalSelectorOverlay"));
        }
        if (key === "constraints") {
          runConstraintCheck();
          return Boolean(document.getElementById("constraintPanel"));
        }
        if (key === "workflow") {
          openPlayWorkflowPanel(0);
          return Boolean(document.getElementById("pbWorkflowPanel"));
        }
        return false;
      }, surface.key);

      const openedReady = launched && await page
        .waitForFunction(({ overlayId, closeSelector }) => {
          const overlay = document.getElementById(overlayId);
          const close = overlay?.querySelector(closeSelector);
          const style = overlay ? getComputedStyle(overlay) : null;
          return Boolean(
            overlay &&
            close &&
            style?.display !== "none" &&
            style?.visibility !== "hidden" &&
            overlay.dataset.layerOpen === "true" &&
            overlay.classList.contains("app-layer-active") &&
            document.body.classList.contains("app-layer-locked") &&
            document.body.dataset.scrollOwner === "layer" &&
            document.activeElement === close,
          );
        }, surface, { timeout: 3000 })
        .then(() => true)
        .catch(() => false);
      const opened = await readLayerState(surface);

      await page.evaluate(() => {
        document.documentElement.style.setProperty("--app-vh", "3.6px");
      });
      await page.waitForTimeout(80);
      const keyboardSized = await readLayerState(surface, true);
      const close = keyboardSized.close;
      const geometryOk = Boolean(
        close &&
        close.width >= 44 &&
        close.height >= 44 &&
        close.left >= -1 &&
        close.top >= -1 &&
        close.right <= keyboardSized.viewport.width + 1 &&
        close.bottom <= keyboardSized.viewport.usableHeight + 1,
      );
      await restoreUsableHeight();

      await page.keyboard.press("Escape").catch(() => { });
      await page.waitForTimeout(100);
      const escaped = await page.evaluate(({ overlayId }) => {
        const overlay = document.getElementById(overlayId);
        return {
          present: Boolean(overlay),
          layerOpen: overlay?.dataset.layerOpen === "true",
          layerActive: overlay?.classList.contains("app-layer-active") || false,
          locked: document.body.classList.contains("app-layer-locked"),
          scrollOwner: document.body.dataset.scrollOwner || "",
          focusRestored: document.activeElement?.id === "__tabletLayerFocusAnchor",
        };
      }, surface);
      const closeOk =
        !escaped.layerOpen &&
        !escaped.layerActive &&
        !escaped.locked &&
        escaped.scrollOwner !== "layer" &&
        escaped.focusRestored;
      const openOk =
        openedReady &&
        opened.present &&
        opened.visible &&
        opened.role === "dialog" &&
        opened.modal === "true" &&
        opened.layerOpen &&
        opened.layerActive &&
        opened.locked &&
        opened.scrollOwner === "layer" &&
        opened.closeFocused;
      result.checks.push({
        name: surface.name,
        opened,
        keyboardSized,
        escaped,
        openOk,
        geometryOk,
        closeOk,
        ok: openOk && geometryOk && closeOk,
      });
    }

    result.supported = true;
    result.ok = result.checks.length === surfaces.length && result.checks.every((check) => check.ok);
  } catch (error) {
    result.reason = String(error?.message || error);
  } finally {
    await restoreUsableHeight().catch(() => { });
    const restored = await page.evaluate((state) => {
      // Leave no probe overlay or focused test control behind if an individual
      // assertion failed midway through the sequence.
      try { _closeSignalSelector({ returnFocus: false }); } catch (_error) { }
      try { closeConstraintPanel({ returnFocus: false }); } catch (_error) { }
      try { closePlayWorkflowPanel({ returnFocus: false }); } catch (_error) { }
      document.getElementById("__tabletLayerFocusAnchor")?.remove();
      if (typeof _sigSaveRecords === "function") _sigSaveRecords(state.signalRecords || []);
      filteredPlays = Array.isArray(state.filteredPlays) ? state.filteredPlays : [];
      if (state.activeTab && typeof showTab === "function") showTab(state.activeTab);
      return {
        tabRestored: !state.activeTab || document.body?.dataset.activeTab === state.activeTab,
        anchorRemoved: !document.getElementById("__tabletLayerFocusAnchor"),
        noBlockingLayer: !document.body.classList.contains("app-layer-locked") &&
          document.body.dataset.scrollOwner !== "layer",
      };
    }, snapshot).catch((error) => {
      result.restoreError = String(error?.message || error);
      return { tabRestored: false, anchorRemoved: false, noBlockingLayer: false };
    });
    result.restore = restored;
    result.restored = restored.tabRestored && restored.anchorRemoved && restored.noBlockingLayer;
    if (!result.restored) {
      result.ok = false;
      result.reason = result.reason || "probe state did not restore";
    }
  }

  return result;
}

// T-006b: Index Card editing was compact enough to preserve a physical 4 × 6
// print preview, but that left it dependent on hover-only 18px controls and
// HTML drag-and-drop. Seed the smallest useful card (two situations / three
// calls) and exercise the tablet action sheets without either interaction.
// The print assertion is intentionally based on the generated print markup,
// so these editor-only controls can never silently change a coach's card.
async function probeTabletIndexCardEditor(page) {
  const role = await page.evaluate(() => document.body?.dataset.authRole || "");
  const result = {
    supported: false,
    role,
    initialActiveTab: "",
    checks: [],
    restored: false,
    ok: false,
  };
  if (!["admin", "coach"].includes(role)) {
    return { ...result, skipped: true, reason: "staff tablet probe" };
  }

  // The native sheet action is what this probe is asserting. Its modal uses a
  // short entrance/layout transition, which can leave a visible choice's box
  // moving by a fractional pixel in Chromium. A Playwright pointer click then
  // waits for geometry stability until the *case* watchdog wins and tears down
  // the browser. Wait for the real visible, enabled control and invoke its
  // normal DOM click instead; the same delegated production handler runs, but
  // the harness does not mistake a paint-only transition for a UI failure.
  const chooseModalAction = async (modal, value) => {
    const choice = modal.locator(`[data-choice-value="${value}"]`).first();
    await choice.waitFor({ state: "visible", timeout: 3000 });
    const enabled = await choice.evaluate((button) => !button.disabled && button.getAttribute("aria-disabled") !== "true");
    if (!enabled) throw new Error(`Modal choice ${value} was disabled`);
    await choice.evaluate((button) => button.click());
  };

  const snapshot = await page.evaluate(() => {
    const clone = (value, fallback) => {
      try { return JSON.parse(JSON.stringify(value)); } catch (_error) { return fallback; }
    };
    return {
      activeTab: document.body?.dataset.activeTab || "",
      callSheet: clone(typeof callSheet !== "undefined" ? callSheet : {}, {}),
      callSheetSettings: clone(typeof callSheetSettings !== "undefined" ? callSheetSettings : {}, {}),
      indexCardId: typeof _csIndexCardId === "string" ? _csIndexCardId : "",
      indexSide: typeof _csIndexSide === "string" ? _csIndexSide : "front",
    };
  });
  result.initialActiveTab = snapshot.activeTab;

  try {
    const seeded = await page.evaluate(() => {
      const required = [
        "showTab",
        "renderCallSheet",
        "renderCallSheetIndexCardPrintPages",
        "openCallSheetIndexCardLibrary",
        "_csIndexIdentity",
        "_csActiveCard",
      ];
      const missing = required.filter((name) => typeof globalThis[name] !== "function");
      if (missing.length) return { ok: false, reason: `missing APIs: ${missing.join(", ")}` };
      const category = Array.isArray(CALLSHEET_CATEGORIES)
        ? CALLSHEET_CATEGORIES.find((item) => item?.id)
        : null;
      if (!category) return { ok: false, reason: "Call Sheet category unavailable" };

      const plays = [
        { id: "__tablet-index-call-a__", type: "Run", personnel: "11", formation: "Trips Right", protection: "Slide", play: "Zone Read" },
        { id: "__tablet-index-call-b__", type: "Pass", personnel: "11", formation: "Trips Right", protection: "Slide", play: "Stick" },
        { id: "__tablet-index-call-c__", type: "Pass", personnel: "10", formation: "Doubles", protection: "Half Slide", play: "Flood" },
      ];
      const identities = plays.map((play) => _csIndexIdentity(play));
      const firstBucketId = "__tablet-index-bucket-first__";
      const secondBucketId = "__tablet-index-bucket-second__";
      const card = {
        id: "__tablet-index-card__",
        name: "Tablet Index Card fixture",
        front: [
          {
            id: firstBucketId,
            label: "Opening calls",
            categoryId: category.id,
            hash: "left",
            targetHash: "left",
            playKeys: [identities[0], identities[1]],
            family: {},
          },
          {
            id: secondBucketId,
            label: "Change-up calls",
            categoryId: category.id,
            hash: "left",
            targetHash: "left",
            playKeys: [identities[2]],
            family: {},
          },
        ],
        back: [],
      };
      callSheet = {
        ...(callSheet && typeof callSheet === "object" ? callSheet : {}),
        [category.id]: {
          ...(callSheet?.[category.id] && typeof callSheet[category.id] === "object" ? callSheet[category.id] : {}),
          left: plays,
          right: [],
        },
      };
      callSheetSettings = {
        ...(callSheetSettings && typeof callSheetSettings === "object" ? callSheetSettings : {}),
        currentPage: "index",
        orientation: "portrait",
        indexCards: [card],
      };
      _csIndexCardId = card.id;
      _csIndexSide = "front";
      showTab("callsheet");
      renderCallSheet();
      return {
        ok: true,
        firstBucketId,
        secondBucketId,
        firstIdentity: identities[0],
        secondIdentity: identities[1],
      };
    });
    if (!seeded.ok) {
      result.reason = seeded.reason;
      return result;
    }
    result.supported = true;

    const editorReady = await page.waitForFunction(() => {
      const editor = document.querySelector("#callSheetGrid .cs-index-card--editor");
      const actions = editor?.querySelectorAll(".cs-index-play-touch-action") || [];
      return Boolean(editor && actions.length === 3 && document.querySelector(".cs-index-close-editor:not([hidden])"));
    }, { timeout: 3000 }).then(() => true).catch(() => false);
    if (!editorReady) {
      result.reason = "seeded Index Card editor did not render";
      return result;
    }

    const geometry = await page.evaluate(() => {
      const rect = (element) => {
        if (!element) return null;
        const style = getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden" || element.hidden) return null;
        const box = element.getBoundingClientRect();
        return { width: Math.round(box.width), height: Math.round(box.height) };
      };
      const editor = document.querySelector("#callSheetGrid .cs-index-card--editor");
      const touchActions = [...(editor?.querySelectorAll(".cs-index-play-touch-action") || [])];
      const legacyActions = [...(editor?.querySelectorAll(".cs-index-play-actions") || [])];
      const bucketActions = [...(editor?.querySelectorAll(".cs-index-bucket-manage") || [])];
      return {
        touchActions: touchActions.map(rect),
        legacyHidden: legacyActions.every((element) => getComputedStyle(element).display === "none"),
        bucketActions: bucketActions.map(rect),
        toolbarClose: rect(document.querySelector(".cs-index-close-editor:not([hidden])")),
      };
    });
    const controlsOk =
      geometry.touchActions.length === 3 &&
      geometry.touchActions.every((item) => item && item.width >= 40 && item.height >= 40) &&
      geometry.legacyHidden &&
      geometry.bucketActions.length === 2 &&
      geometry.bucketActions.every((item) => item && item.width >= 40 && item.height >= 40) &&
      Boolean(geometry.toolbarClose && geometry.toolbarClose.width >= 40 && geometry.toolbarClose.height >= 40);
    result.checks.push({ name: "persistent editor controls", geometry, ok: controlsOk });

    const print = await page.evaluate(() => {
      const markup = renderCallSheetIndexCardPrintPages({ cards: "current", sides: "both", copies: 1 });
      const root = document.createElement("div");
      root.innerHTML = markup;
      return {
        pages: root.querySelectorAll(".cs-index-print-page").length,
        editorCards: root.querySelectorAll(".cs-index-card--editor").length,
        touchActions: root.querySelectorAll(".cs-index-play-touch-action").length,
        legacyActions: root.querySelectorAll(".cs-index-play-actions").length,
      };
    });
    const printOk =
      print.pages === 2 &&
      print.editorCards === 0 &&
      print.touchActions === 0 &&
      print.legacyActions === 0;
    result.checks.push({ name: "print markup remains editor-free", print, ok: printOk });

    const callActionModal = page.locator(".custom-modal-overlay").filter({ hasText: "Index Card call" }).last();
    await page.locator(".cs-index-play-touch-action").nth(1).click();
    const callActionsVisible = await callActionModal.waitFor({ state: "visible", timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    const callActionValues = callActionsVisible
      ? await callActionModal.locator("[data-choice-value]").evaluateAll((buttons) => buttons.map((button) => button.getAttribute("data-choice-value") || ""))
      : [];
    const callActionSheetOk = ["up", "indent", "compact", "edit", "remove"].every((value) => callActionValues.includes(value));
    if (callActionsVisible) {
      await chooseModalAction(callActionModal, "up");
      await page.waitForTimeout(240);
    }
    const callMovedUp = callActionsVisible && await page.waitForFunction(({ first, second }) => {
      const bucket = _csActiveCard()?.front?.[0];
      return bucket?.playKeys?.[0] === second && bucket?.playKeys?.[1] === first;
    }, { first: seeded.firstIdentity, second: seeded.secondIdentity }, { timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    await page.locator(".cs-index-play-touch-action").first().click();
    const callMoveDownVisible = await callActionModal.waitFor({ state: "visible", timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    const callMoveDownValues = callMoveDownVisible
      ? await callActionModal.locator("[data-choice-value]").evaluateAll((buttons) => buttons.map((button) => button.getAttribute("data-choice-value") || ""))
      : [];
    if (callMoveDownVisible) {
      await chooseModalAction(callActionModal, "down");
      await page.waitForTimeout(240);
    }
    const callMovedDown = callMoveDownVisible && await page.waitForFunction(({ first, second }) => {
      const bucket = _csActiveCard()?.front?.[0];
      return bucket?.playKeys?.[0] === first && bucket?.playKeys?.[1] === second;
    }, { first: seeded.firstIdentity, second: seeded.secondIdentity }, { timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    await page.locator(".cs-index-play-touch-action").nth(1).click();
    const compactActionVisible = await callActionModal.waitFor({ state: "visible", timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    if (compactActionVisible) {
      await chooseModalAction(callActionModal, "compact");
      await page.waitForTimeout(240);
    }
    const compactApplied = compactActionVisible && await page.waitForFunction(() => {
      const bucket = _csActiveCard()?.front?.[0];
      const row = _csBucketRows(bucket)[1];
      return Boolean(row && _csIndexFamily(bucket, row) && _csIndexCompact(bucket, row));
    }, { timeout: 3000 }).then(() => true).catch(() => false);
    result.checks.push({
      name: "call action sheet and move up/down",
      values: callActionValues,
      moveDownValues: callMoveDownValues,
      compactApplied,
      ok: callActionSheetOk && callMoveDownValues.includes("down") && callMovedUp && callMovedDown && compactApplied,
    });

    const situationModal = page.locator(".custom-modal-overlay").filter({ hasText: "Manage situation" }).last();
    await page.locator(".cs-index-bucket-manage").first().click();
    const situationVisible = await situationModal.waitFor({ state: "visible", timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    const firstSituationValues = situationVisible
      ? await situationModal.locator("[data-choice-value]").evaluateAll((buttons) => buttons.map((button) => button.getAttribute("data-choice-value") || ""))
      : [];
    if (situationVisible) {
      await chooseModalAction(situationModal, "move-down");
      await page.waitForTimeout(240);
    }
    const situationMovedDown = situationVisible && await page.waitForFunction(({ first, second }) => {
      const buckets = _csActiveCard()?.front || [];
      return buckets[0]?.id === second && buckets[1]?.id === first;
    }, { first: seeded.firstBucketId, second: seeded.secondBucketId }, { timeout: 3000 })
      .then(() => true)
      .catch(() => false);

    await page.locator(".cs-index-bucket-manage").nth(1).click();
    const situationMoveUpVisible = await situationModal.waitFor({ state: "visible", timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    const secondSituationValues = situationMoveUpVisible
      ? await situationModal.locator("[data-choice-value]").evaluateAll((buttons) => buttons.map((button) => button.getAttribute("data-choice-value") || ""))
      : [];
    if (situationMoveUpVisible) {
      await chooseModalAction(situationModal, "move-up");
      await page.waitForTimeout(240);
    }
    const situationMovedUp = situationMoveUpVisible && await page.waitForFunction(({ first, second }) => {
      const buckets = _csActiveCard()?.front || [];
      return buckets[0]?.id === first && buckets[1]?.id === second;
    }, { first: seeded.firstBucketId, second: seeded.secondBucketId }, { timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    result.checks.push({
      name: "situation move down and up",
      firstValues: firstSituationValues,
      secondValues: secondSituationValues,
      ok:
        firstSituationValues.includes("move-down") &&
        secondSituationValues.includes("move-up") &&
        situationMovedDown &&
        situationMovedUp,
    });

    await page.locator("#csIndexToolbarContext .cs-index-main-more-trigger").click();
    await page.locator('#csIndexToolbarContext [data-action="openCallSheetIndexCardLibrary"]').click();
    const libraryVisible = await page.locator("#csIndexCardLibraryOverlay").waitFor({ state: "visible", timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    const libraryClose = libraryVisible
      ? await page.locator("#csIndexCardLibraryOverlay .cs-sort-close").evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { width: Math.round(rect.width), height: Math.round(rect.height) };
      })
      : null;
    if (libraryVisible) {
      await page.locator("#csIndexCardLibraryOverlay .cs-sort-close").click();
    }
    const libraryClosed = libraryVisible && await page.waitForFunction(
      () => !document.getElementById("csIndexCardLibraryOverlay"),
      { timeout: 3000 },
    ).then(() => true).catch(() => false);
    const libraryOk = Boolean(libraryClose && libraryClose.width >= 40 && libraryClose.height >= 40 && libraryClosed);
    result.checks.push({ name: "library close target", close: libraryClose, ok: libraryOk });

    await page.locator(".cs-index-close-editor:not([hidden])").click();
    const editorClosed = await page.waitForFunction(
      () => callSheetSettings.currentPage === "front" && !document.getElementById("callsheet")?.classList.contains("callsheet-index-mode"),
      { timeout: 3000 },
    ).then(() => true).catch(() => false);
    result.checks.push({ name: "toolbar exit", ok: editorClosed });

    result.ok = result.checks.every((check) => check.ok);
  } catch (error) {
    result.reason = String(error?.message || error);
  } finally {
    const restored = await page.evaluate((state) => {
      try { closeCallSheetIndexCardLibrary(); } catch (_error) { }
      document.querySelectorAll(".custom-modal-overlay").forEach((overlay) => {
        if (!/Index Card call|Manage situation/.test(overlay.textContent || "")) return;
        try { closeLayer(overlay, { returnFocus: false }); } catch (_error) { }
        overlay.remove();
      });
      callSheet = state.callSheet || {};
      callSheetSettings = state.callSheetSettings || {};
      _csIndexCardId = state.indexCardId || "";
      _csIndexSide = state.indexSide === "back" ? "back" : "front";
      if (state.activeTab && typeof showTab === "function") showTab(state.activeTab);
      if (typeof renderCallSheet === "function") renderCallSheet();
      return {
        tabRestored: !state.activeTab || document.body?.dataset.activeTab === state.activeTab,
        settingsRestored: callSheetSettings?.currentPage === state.callSheetSettings?.currentPage,
        fixtureRemoved: !Array.isArray(callSheetSettings?.indexCards) ||
          !callSheetSettings.indexCards.some((card) => card?.id === "__tablet-index-card__"),
        libraryClosed: !document.getElementById("csIndexCardLibraryOverlay"),
        layerUnlocked: !document.body.classList.contains("app-layer-locked"),
      };
    }, snapshot).catch((error) => {
      result.restoreError = String(error?.message || error);
      return { tabRestored: false, settingsRestored: false, fixtureRemoved: false, libraryClosed: false, layerUnlocked: false };
    });
    result.restore = restored;
    result.restored =
      restored.tabRestored &&
      restored.settingsRestored &&
      restored.fixtureRemoved &&
      restored.libraryClosed &&
      restored.layerUnlocked;
    if (!result.restored) {
      result.ok = false;
      result.reason = result.reason || "probe state did not restore";
    }
  }

  return result;
}

// T-008c: a roomy staff tablet should keep the scout's navigation and chart
// path immediately reachable without leaving a row of low-frequency controls
// to wrap off-screen. Seed a deliberately wide film log, then exercise the
// same anchored menus a coach uses. The table remains an x-only scroller while
// the active panel owns vertical movement.
async function probeTabletTendenciesLandscape(page) {
  const role = await page.evaluate(() => document.body?.dataset.authRole || "");
  const result = {
    supported: false,
    role,
    initialActiveTab: "",
    checks: [],
    restored: false,
    ok: false,
  };
  if (!["admin", "coach"].includes(role)) {
    return { ...result, skipped: true, reason: "staff tablet probe" };
  }

  const snapshot = await page.evaluate(() => {
    const clone = (value, fallback) => {
      try { return JSON.parse(JSON.stringify(value)); } catch (_error) { return fallback; }
    };
    return {
      activeTab: document.body?.dataset.activeTab || "",
      opponents: clone(typeof tendenciesOpponents !== "undefined" ? tendenciesOpponents : [], []),
      currentOpponent: typeof tendenciesCurrentOpponent === "number" ? tendenciesCurrentOpponent : null,
      currentPlay: clone(typeof tendenciesCurrentPlay !== "undefined" ? tendenciesCurrentPlay : null, null),
      wizardStep: typeof tendenciesWizardStep === "number" ? tendenciesWizardStep : 0,
      editIndex: typeof tendenciesEditIndex === "number" ? tendenciesEditIndex : -1,
      rapidMode: Boolean(tendenciesRapidMode),
      filters: clone(typeof tdFilters !== "undefined" ? tdFilters : {}, {}),
      searchText: typeof tdSearchText === "string" ? tdSearchText : "",
      sortColumn: typeof tdSortColumn === "string" ? tdSortColumn : null,
      sortDirection: typeof tdSortDirection === "string" ? tdSortDirection : "asc",
      showFilters: Boolean(tdShowFilters),
      selectedPlays: Array.from(tdSelectedPlays || []),
      bulkMode: Boolean(tdBulkMode),
      visibleColumns: clone(tdVisibleColumns, null),
      selectedRow: typeof tdSelectedRow === "number" ? tdSelectedRow : -1,
      showStats: Boolean(tdShowStats),
      groupByGame: Boolean(tdGroupByGame),
      showOverview: Boolean(tdShowScoutOverview),
      history: clone(historyManager?.tendencies || { past: [], future: [] }, { past: [], future: [] }),
    };
  });
  result.initialActiveTab = snapshot.activeTab;

  const readVisibleMenu = () => page.evaluate(() => {
    const menu = [...document.querySelectorAll(".tool-menu.td-tablet-landscape-menu")]
      .find((item) => {
        const style = getComputedStyle(item);
        return style.display !== "none" && style.visibility !== "hidden";
      });
    if (!menu) return null;
    const rect = menu.getBoundingClientRect();
    const buttonRects = [...menu.querySelectorAll("button")].map((button) => {
      const box = button.getBoundingClientRect();
      return {
        action: button.dataset.action || "",
        disabled: button.disabled,
        width: Math.round(box.width),
        height: Math.round(box.height),
      };
    });
    return {
      role: menu.getAttribute("role") || "",
      position: getComputedStyle(menu).position,
      rect: {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      actions: buttonRects,
    };
  });

  try {
    const routed = await page.evaluate(() => {
      if (typeof showTab !== "function") return false;
      showTab("tendencies");
      return document.body?.dataset.activeTab === "tendencies";
    });
    if (!routed) {
      result.reason = "could not route to Tendencies";
      return result;
    }
    // Let the route's ordinary home render settle before replacing only the
    // in-memory film fixture. showTab may schedule its own initial renderer.
    await page.waitForTimeout(180);

    const seeded = await page.evaluate(() => {
      const required = ["renderOpponentDetail", "renderScoutOverview"];
      const missing = required.filter((name) => typeof globalThis[name] !== "function");
      if (missing.length) return { ok: false, reason: `missing APIs: ${missing.join(", ")}` };
      if (!Array.isArray(TD_COLUMNS) || TD_COLUMNS.length < 12) {
        return { ok: false, reason: "Tendencies columns unavailable" };
      }

      const makePlay = (idx) => ({
        week: String(idx + 1),
        game: `Week ${idx + 1} vs Very Long Tablet Opponent Name`,
        quarter: String((idx % 4) + 1),
        time: "12:34",
        down: String((idx % 3) + 1),
        distance: String(6 + idx),
        hash: idx % 2 ? "L" : "R",
        fieldPosition: "Opponent",
        yardLine: String(36 + idx),
        situation: "3rd & Long",
        offensePlayType: idx % 2 ? "Pass" : "Run",
        offenseFormation: "Trips Open Boundary Motion",
        offensePersonnel: "11 Personnel",
        scoreState: "Winning 1-7",
        driveResult: "Punt",
        defFront: idx % 2 ? "4-2-5 Nickel" : "3-3-5 Stack",
        defCoverage: idx % 2 ? "Cover 3 Match" : "Quarters Palms",
        defStunt: "Twist",
        defBlitz: idx % 2 ? "Fire Zone" : "None",
        notes: `Tablet landscape horizontal-scroll fixture ${idx + 1} with a deliberately long coaching note`,
      });

      tendenciesOpponents = [{
        name: "__Tablet T-008c Scout__",
        plays: Array.from({ length: 8 }, (_, idx) => makePlay(idx)),
      }];
      tendenciesCurrentOpponent = 0;
      tendenciesCurrentPlay = null;
      tendenciesWizardStep = 0;
      tendenciesEditIndex = -1;
      tendenciesRapidMode = false;
      tdFilters = {};
      tdSearchText = "";
      tdSortColumn = null;
      tdSortDirection = "asc";
      tdShowFilters = false;
      tdSelectedPlays = new Set();
      tdBulkMode = false;
      tdVisibleColumns = TD_COLUMNS.map((column) => column.key);
      tdSelectedRow = -1;
      tdShowStats = false;
      tdGroupByGame = false;
      tdShowScoutOverview = false;
      historyManager.clear("tendencies");
      renderOpponentDetail();
      return { ok: true };
    });
    if (!seeded.ok) {
      result.reason = seeded.reason;
      return result;
    }
    result.supported = true;

    const filmReady = await page.waitForFunction(() => {
      const root = document.getElementById("tendenciesContent");
      return Boolean(
        root?.querySelector(".td-detail-header") &&
        root.querySelector(".td-tablet-header-actions [data-action='startNewPlay']") &&
        root.querySelector(".td-toolbar-more-wrap [data-action='toggleParentOpen']"),
      );
    }, { timeout: 3000 }).then(() => true).catch(() => false);
    if (!filmReady) {
      result.reason = "seeded Tendencies film log did not render";
      result.diagnostic = await page.evaluate(() => {
        const root = document.getElementById("tendenciesContent");
        return {
          bodyClasses: document.body.className,
          shell: document.body.dataset.layoutProfile || "",
          hasHeader: Boolean(root?.querySelector(".td-detail-header")),
          hasHeaderAction: Boolean(root?.querySelector(".td-tablet-header-actions [data-action='startNewPlay']")),
          hasToolbarMore: Boolean(root?.querySelector(".td-toolbar-more-wrap [data-action='toggleParentOpen']")),
          markup: (root?.innerHTML || "").slice(0, 500),
        };
      });
      return result;
    }

    const filmGeometry = await page.evaluate(() => {
      const visibleRect = (element) => {
        if (!element) return null;
        const style = getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden" || element.hidden) return null;
        const rect = element.getBoundingClientRect();
        return { width: Math.round(rect.width), height: Math.round(rect.height) };
      };
      const root = document.getElementById("tendenciesContent");
      const header = root?.querySelector(".td-detail-header");
      const desktopActions = root?.querySelector(".td-detail-actions--desktop");
      const headerTargets = [
        ...(root?.querySelectorAll(".td-detail-nav .btn") || []),
        ...(root?.querySelectorAll(".td-tablet-header-actions > .btn, .td-tablet-header-actions .td-tablet-more-trigger") || []),
      ].map(visibleRect);
      const toolbarTargets = [
        root?.querySelector("#tdSearchInput"),
        root?.querySelector(".td-toolbar-left > [data-action='toggleTdFilters']"),
        root?.querySelector(".td-toolbar-more-wrap .td-tablet-more-trigger"),
      ].map(visibleRect);
      return {
        targetShell: document.body.classList.contains("shell-tablet") &&
          document.body.classList.contains("is-mobile-screen") &&
          document.body.classList.contains("is-staff-mobile-shell") &&
          document.body.classList.contains("is-landscape-screen"),
        headerDisplay: header ? getComputedStyle(header).display : "",
        headerTargets,
        toolbarTargets,
        desktopActionsHidden: Boolean(desktopActions && getComputedStyle(desktopActions).display === "none"),
        desktopUtilitiesHidden: [...(root?.querySelectorAll(".td-toolbar-desktop-utilities") || [])]
          .every((element) => getComputedStyle(element).display === "none"),
      };
    });
    const directFilmOk =
      filmGeometry.targetShell &&
      filmGeometry.headerDisplay === "grid" &&
      filmGeometry.headerTargets.length === 4 &&
      filmGeometry.headerTargets.every((target) => target && target.width >= 44 && target.height >= 44) &&
      filmGeometry.toolbarTargets.length === 3 &&
      filmGeometry.toolbarTargets.every((target) => target && target.width >= 44 && target.height >= 44) &&
      filmGeometry.desktopActionsHidden &&
      filmGeometry.desktopUtilitiesHidden;
    result.checks.push({ name: "film log keeps core controls direct", geometry: filmGeometry, ok: directFilmOk });

    const headerMore = page.locator("#tendenciesContent .td-tablet-header-actions .td-tablet-more-trigger");
    await headerMore.click({ timeout: 3000 });
    const headerMenu = await page.waitForFunction(() => {
      return [...document.querySelectorAll(".tool-menu.td-tablet-landscape-menu")].some((menu) => {
        const style = getComputedStyle(menu);
        return style.display !== "none" && style.visibility !== "hidden";
      });
    }, { timeout: 3000 }).then(() => readVisibleMenu()).catch(() => null);
    const headerMenuActions = [
      "undoTendencies",
      "redoTendencies",
      "exportSingleOpponentCSV",
      "printTendencies",
      "printScoutSummary",
      "archiveTendenciesReport",
      "showTendenciesReportArchive",
      "toggleScoutPresentation",
      "sendScoutRecsToGamePlan",
      "setAsActiveOpponent",
    ];
    const headerMenuOk = Boolean(
      headerMenu &&
      headerMenu.role === "menu" &&
      headerMenu.position === "fixed" &&
      headerMenu.rect.left >= -1 &&
      headerMenu.rect.top >= -1 &&
      headerMenu.rect.right <= headerMenu.viewport.width + 1 &&
      headerMenu.rect.bottom <= headerMenu.viewport.height + 1 &&
      headerMenu.actions.every((item) => item.width >= 44 && item.height >= 44) &&
      headerMenuActions.every((action) => headerMenu.actions.some((item) => item.action === action)),
    );
    const historyMenuSync = await page.evaluate(() => {
      if (typeof saveTendenciesState !== "function") return false;
      saveTendenciesState();
      const undo = document.querySelector("[data-tendencies-history='undo']");
      return Boolean(undo && !undo.disabled && historyManager.canUndo("tendencies"));
    });
    await page.keyboard.press("Escape");
    const headerEscape = await page.waitForFunction(() => {
      const trigger = document.querySelector("#tendenciesContent .td-tablet-header-actions .td-tablet-more-trigger");
      const menuOpen = [...document.querySelectorAll(".tool-menu.td-tablet-landscape-menu")].some((menu) => {
        const style = getComputedStyle(menu);
        return style.display !== "none" && style.visibility !== "hidden";
      });
      return !menuOpen && document.activeElement === trigger;
    }, { timeout: 3000 }).then(() => true).catch(() => false);
    result.checks.push({ name: "film log header More is anchored and touch-sized", menu: headerMenu, historyMenuSync, escaped: headerEscape, ok: headerMenuOk && historyMenuSync && headerEscape });

    await page.locator("#tendenciesContent .td-detail-nav [data-action='showTdOverview']").click({ timeout: 3000 });
    const overviewReady = await page.waitForFunction(() => {
      const root = document.getElementById("tendenciesContent");
      return Boolean(root?.querySelector(".td-overview-grid") && root.querySelector(".td-detail-nav [data-action='showTdFilmLog']"));
    }, { timeout: 3000 }).then(() => true).catch(() => false);
    const overviewGeometry = overviewReady ? await page.evaluate(() => {
      const root = document.getElementById("tendenciesContent");
      const read = (element) => {
        if (!element) return null;
        const style = getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden") return null;
        const rect = element.getBoundingClientRect();
        return { width: Math.round(rect.width), height: Math.round(rect.height) };
      };
      return {
        navigation: [...root.querySelectorAll(".td-detail-nav .btn")].map(read),
        chart: read(root.querySelector(".td-tablet-header-actions > [data-action='startNewPlay']")),
        more: read(root.querySelector(".td-tablet-header-actions .td-tablet-more-trigger")),
        desktopActionsHidden: getComputedStyle(root.querySelector(".td-detail-actions--desktop")).display === "none",
      };
    }) : null;
    const overviewOk = Boolean(
      overviewGeometry &&
      overviewGeometry.navigation.length === 2 &&
      overviewGeometry.navigation.every((target) => target && target.width >= 44 && target.height >= 44) &&
      overviewGeometry.chart?.width >= 44 && overviewGeometry.chart?.height >= 44 &&
      overviewGeometry.more?.width >= 44 && overviewGeometry.more?.height >= 44 &&
      overviewGeometry.desktopActionsHidden,
    );
    result.checks.push({ name: "overview keeps Back, Film Log, and Chart direct", geometry: overviewGeometry, ok: overviewReady && overviewOk });

    await page.locator("#tendenciesContent .td-detail-nav [data-action='showTdFilmLog']").click({ timeout: 3000 });
    const returnedToFilm = await page.waitForFunction(() => Boolean(document.getElementById("tendenciesContent")?.querySelector("#tdSearchInput")), { timeout: 3000 })
      .then(() => true)
      .catch(() => false);

    const toolbarMore = page.locator("#tendenciesContent .td-toolbar-more-wrap .td-tablet-more-trigger");
    if (returnedToFilm) await toolbarMore.click({ timeout: 3000 });
    const toolbarMenu = returnedToFilm
      ? await page.waitForFunction(() => {
        return [...document.querySelectorAll(".tool-menu.td-tablet-landscape-menu")].some((menu) => {
          const style = getComputedStyle(menu);
          return style.display !== "none" && style.visibility !== "hidden";
        });
      }, { timeout: 3000 }).then(() => readVisibleMenu()).catch(() => null)
      : null;
    const toolbarMenuActions = ["toggleTdStats", "toggleGroupByGame", "enterBulkMode", "toggleColumnPanel", "toggleRapidMode"];
    const toolbarMenuOk = Boolean(
      toolbarMenu &&
      toolbarMenu.role === "menu" &&
      toolbarMenu.position === "fixed" &&
      toolbarMenu.actions.every((item) => item.width >= 44 && item.height >= 44) &&
      toolbarMenuActions.every((action) => toolbarMenu.actions.some((item) => item.action === action)),
    );
    if (toolbarMenu) {
      await page.locator(".tool-menu.td-tablet-landscape-menu:visible [data-action='toggleTdStats']").click({ timeout: 3000 });
    }
    const statsAction = toolbarMenu && await page.waitForFunction(() => {
      return tdShowStats === true && Boolean(document.querySelector("#tendenciesContent .td-stats-dashboard"));
    }, { timeout: 3000 }).then(() => true).catch(() => false);
    result.checks.push({ name: "toolbar utilities use anchored More", menu: toolbarMenu, statsAction, ok: Boolean(returnedToFilm && toolbarMenuOk && statsAction) });

    const scrollOwnership = await page.evaluate(() => {
      const panel = document.getElementById("tendencies");
      const tableContainer = panel?.querySelector(".td-table-container");
      const table = tableContainer?.querySelector(".td-table");
      if (!panel || !tableContainer || !table) return null;
      const tableStyle = getComputedStyle(tableContainer);
      const nestedVerticalOwners = [...panel.querySelectorAll("*")]
        .filter((element) => {
          if (element === tableContainer) return false;
          const style = getComputedStyle(element);
          return (style.overflowY === "auto" || style.overflowY === "scroll") &&
            element.scrollHeight > element.clientHeight + 2;
        })
        .map((element) => element.id || element.className || element.tagName)
        .slice(0, 8);
      const before = tableContainer.scrollLeft;
      tableContainer.scrollLeft = Math.min(96, Math.max(0, tableContainer.scrollWidth - tableContainer.clientWidth));
      const horizontalMoves = tableContainer.scrollLeft > before;
      tableContainer.scrollLeft = before;
      return {
        bodyOwner: document.body.dataset.scrollOwner || "",
        panelOverflowY: getComputedStyle(panel).overflowY,
        tableOverflowX: tableStyle.overflowX,
        tableOverflowY: tableStyle.overflowY,
        tableClientWidth: Math.round(tableContainer.clientWidth),
        tableScrollWidth: Math.round(tableContainer.scrollWidth),
        horizontalMoves,
        nestedVerticalOwners,
      };
    });
    const scrollOwnershipOk = Boolean(
      scrollOwnership &&
      scrollOwnership.bodyOwner === "panel" &&
      ["auto", "scroll"].includes(scrollOwnership.panelOverflowY) &&
      ["auto", "scroll"].includes(scrollOwnership.tableOverflowX) &&
      ["hidden", "clip"].includes(scrollOwnership.tableOverflowY) &&
      scrollOwnership.tableScrollWidth > scrollOwnership.tableClientWidth &&
      scrollOwnership.horizontalMoves &&
      scrollOwnership.nestedVerticalOwners.length === 0,
    );
    result.checks.push({ name: "film table stays horizontal while panel owns vertical scroll", ownership: scrollOwnership, ok: scrollOwnershipOk });

    result.ok = result.checks.every((check) => check.ok);
  } catch (error) {
    result.reason = String(error?.message || error);
  } finally {
    const restored = await page.evaluate((state) => {
      const clone = (value, fallback) => {
        try { return JSON.parse(JSON.stringify(value)); } catch (_error) { return fallback; }
      };
      document.querySelectorAll(".tool-menu-wrap[data-anchored].open").forEach((wrap) => {
        try { closeAnchoredMenu(wrap); } catch (_error) { wrap.classList.remove("open"); }
      });
      tendenciesOpponents = clone(state.opponents, []);
      tendenciesCurrentOpponent = state.currentOpponent;
      tendenciesCurrentPlay = clone(state.currentPlay, null);
      tendenciesWizardStep = state.wizardStep;
      tendenciesEditIndex = state.editIndex;
      tendenciesRapidMode = state.rapidMode;
      tdFilters = clone(state.filters, {});
      tdSearchText = state.searchText;
      tdSortColumn = state.sortColumn;
      tdSortDirection = state.sortDirection;
      tdShowFilters = state.showFilters;
      tdSelectedPlays = new Set(state.selectedPlays || []);
      tdBulkMode = state.bulkMode;
      tdVisibleColumns = clone(state.visibleColumns, null);
      tdSelectedRow = state.selectedRow;
      tdShowStats = state.showStats;
      tdGroupByGame = state.groupByGame;
      tdShowScoutOverview = state.showOverview;
      historyManager.tendencies = clone(state.history, { past: [], future: [] });

      if (state.activeTab && typeof showTab === "function") showTab(state.activeTab);
      if (state.activeTab === "tendencies") {
        if (tendenciesCurrentPlay) {
          if (tendenciesRapidMode && typeof renderRapidChart === "function") renderRapidChart();
          else if (typeof renderWizard === "function") renderWizard();
        } else if (tendenciesCurrentOpponent !== null && tendenciesOpponents[tendenciesCurrentOpponent]) {
          if (tdShowScoutOverview && typeof renderScoutOverview === "function") renderScoutOverview();
          else if (typeof renderOpponentDetail === "function") renderOpponentDetail();
        } else if (typeof renderTendenciesHome === "function") {
          renderTendenciesHome();
        }
      }
      return {
        tabRestored: !state.activeTab || document.body?.dataset.activeTab === state.activeTab,
        fixtureRemoved: !tendenciesOpponents.some((opponent) => opponent?.name === "__Tablet T-008c Scout__"),
        noOpenMenu: !document.querySelector(".tool-menu-wrap.open"),
        scrollOwnerRestored: document.body.dataset.scrollOwner !== "layer",
      };
    }, snapshot).catch((error) => {
      result.restoreError = String(error?.message || error);
      return { tabRestored: false, fixtureRemoved: false, noOpenMenu: false, scrollOwnerRestored: false };
    });
    result.restore = restored;
    result.restored = restored.tabRestored && restored.fixtureRemoved && restored.noOpenMenu && restored.scrollOwnerRestored;
    if (!result.restored) {
      result.ok = false;
      result.reason = result.reason || "probe state did not restore";
    }
  }

  return result;
}

// Keyboard regression probe: on iPadOS `visualViewport` contracts while the
// keyboard is open. The shell must update usable-height/keyboard variables but
// never reinterpret the physical device as a phone, flip its layout mode, or
// move scroll ownership. Run this against the shipped resize listener rather
// than merely inspecting the source implementation.
async function probeTabletKeyboardStability(page) {
  return page.evaluate(async () => {
    const viewport = window.visualViewport;
    if (!viewport || typeof viewport.dispatchEvent !== "function") {
      return { supported: false, reason: "visualViewport unavailable", ok: false };
    }

    const snapshot = () => {
      const root = document.documentElement;
      const body = document.body;
      const styles = getComputedStyle(root);
      return {
        shellSize: body?.dataset.shellSize || "",
        shellOrientation: body?.dataset.shellOrientation || "",
        hardwareOrientation: body?.dataset.hardwareOrientation || "",
        layoutProfile: body?.dataset.layoutProfile || "",
        scrollOwner: body?.dataset.scrollOwner || "",
        keyboardOpen: body?.dataset.keyboardOpen || "",
        keyboardInset: Number(body?.dataset.keyboardInset || 0),
        appVh: styles.getPropertyValue("--app-vh").trim(),
      };
    };
    const waitForShell = () => new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
    const sameIdentity = (first, second) =>
      ["shellSize", "shellOrientation", "hardwareOrientation", "layoutProfile", "scrollOwner"]
        .every((key) => first[key] === second[key]);
    const restoreOwnProperty = (target, name, record) => {
      if (record.hadOwn) Object.defineProperty(target, name, record.descriptor);
      else delete target[name];
    };

    const before = snapshot();
    const records = {};
    try {
      const innerHeight = Math.round(window.innerHeight || document.documentElement.clientHeight || 0);
      const originalHeight = Math.round(viewport.height || innerHeight || 0);
      const keyboardHeight = Math.max(160, Math.min(originalHeight - 1, innerHeight - 260));
      if (keyboardHeight <= 0 || keyboardHeight >= innerHeight - 80) {
        return { supported: false, reason: "insufficient viewport height", before, ok: false };
      }

      ["height", "offsetTop"].forEach((name) => {
        records[name] = {
          hadOwn: Object.prototype.hasOwnProperty.call(viewport, name),
          descriptor: Object.getOwnPropertyDescriptor(viewport, name),
        };
      });
      Object.defineProperty(viewport, "height", {
        configurable: true,
        value: keyboardHeight,
      });
      Object.defineProperty(viewport, "offsetTop", {
        configurable: true,
        value: 0,
      });
      viewport.dispatchEvent(new Event("resize"));
      await waitForShell();
      const keyboard = snapshot();

      restoreOwnProperty(viewport, "height", records.height);
      restoreOwnProperty(viewport, "offsetTop", records.offsetTop);
      viewport.dispatchEvent(new Event("resize"));
      await waitForShell();
      const restored = snapshot();

      const keyboardRegistered =
        keyboard.keyboardOpen === "true" &&
        keyboard.keyboardInset >= 80 &&
        keyboard.appVh !== before.appVh;
      const restoredUsableHeight =
        restored.keyboardOpen === before.keyboardOpen &&
        restored.keyboardInset === before.keyboardInset &&
        restored.appVh === before.appVh;
      return {
        supported: true,
        before,
        keyboard,
        restored,
        identityStable: sameIdentity(before, keyboard),
        restoredIdentity: sameIdentity(before, restored),
        keyboardRegistered,
        restoredUsableHeight,
        ok:
          sameIdentity(before, keyboard) &&
          sameIdentity(before, restored) &&
          keyboardRegistered &&
          restoredUsableHeight,
      };
    } catch (error) {
      Object.entries(records).forEach(([name, record]) => {
        try {
          restoreOwnProperty(viewport, name, record);
        } catch (_restoreError) {
          // The failure result below remains more useful than hiding it with a
          // second cleanup exception.
        }
      });
      viewport.dispatchEvent(new Event("resize"));
      return {
        supported: false,
        reason: String(error?.message || error),
        before,
        ok: false,
      };
    }
  });
}

// Orientation persistence probe (M-051): rotating the device must keep the
// active page and any selected record/play. Switch to a content tab, set a
// selection where possible, swap width/height, then confirm both survive.
async function probeOrientationPersistence(page) {
  const setup = await page.evaluate(() => {
    const TABS = ["script", "playbook", "wristband", "callsheet"];
    let chosen = "";
    for (const t of TABS) {
      const btn = document.querySelector(`[data-action="showTab"][data-arg="${t}"]`);
      if (btn && !btn.hidden && btn.offsetParent !== null) {
        chosen = t;
        break;
      }
    }
    if (!chosen || typeof window.showTab !== "function") return { supported: false };
    try {
      window.showTab(chosen);
    } catch (_e) {
      return { supported: false };
    }
    const panel = document.querySelector("#mainApp .panel.active");
    const panelId = panel ? panel.id : "";

    // Selection: only use known, side-effect-free selection checkboxes on the
    // script tab (available/script play selectors).
    let selectionApplied = false;
    let selScope = "";
    if (chosen === "script") {
      const scope = document.querySelector("#availablePlays") || document.querySelector("#scriptPlays");
      if (scope) {
        const boxes = [...scope.querySelectorAll("input[type=checkbox]")].filter((b) => b.offsetParent !== null);
        if (boxes.length) {
          const b = boxes[0];
          if (!b.checked) b.click();
          selectionApplied = b.checked;
          selScope = scope.id;
        }
      }
    }
    return { supported: true, chosen, panelId, selectionApplied, selScope };
  });

  if (!setup.supported) return { supported: false };

  const vp = page.viewportSize();
  await page.setViewportSize({ width: vp.height, height: vp.width });
  await page.waitForTimeout(320);

  const after = await page.evaluate((s) => {
    const panel = document.querySelector("#mainApp .panel.active");
    const panelId = panel ? panel.id : "";
    let selectionPreserved = true;
    if (s.selectionApplied) {
      const scope = s.selScope ? document.getElementById(s.selScope) : null;
      const b = scope ? scope.querySelector("input[type=checkbox]") : null;
      selectionPreserved = Boolean(b && b.checked);
    }
    return { panelId, selectionPreserved };
  }, setup);

  await page.setViewportSize(vp);
  await page.waitForTimeout(120);

  const pagePreserved = Boolean(setup.panelId) && after.panelId === setup.panelId;
  return {
    supported: true,
    tab: setup.chosen,
    panelBefore: setup.panelId,
    panelAfter: after.panelId,
    selectionApplied: setup.selectionApplied,
    selectionPreserved: after.selectionPreserved,
    pagePreserved,
    ok: pagePreserved && after.selectionPreserved,
  };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  let server = null;
  let browser = null;
  let maxRunTimer = null;
  let forceExitTimer = null;
  let aborting = false;
  const cleanup = async () => {
    if (maxRunTimer) {
      clearTimeout(maxRunTimer);
      maxRunTimer = null;
    }
    // Keep the hard shutdown watchdog alive while an expired run is closing
    // Playwright. Previously cleanup cancelled this timer immediately, so a
    // browser close interrupted mid-probe could itself hang for minutes.
    if (forceExitTimer && !aborting) {
      clearTimeout(forceExitTimer);
      forceExitTimer = null;
    }
    const activeBrowser = browser;
    browser = null;
    if (activeBrowser) await activeBrowser.close().catch(() => { });
    const activeServer = server;
    server = null;
    closeServer(activeServer);
  };
  const exitAfterCleanup = (exitCode, message) => {
    if (aborting) return;
    aborting = true;
    if (message) console.error(message);
    forceExitTimer = setTimeout(() => process.exit(exitCode), 2000);
    cleanup().finally(() => {
      if (forceExitTimer) clearTimeout(forceExitTimer);
      forceExitTimer = null;
      process.exit(exitCode);
    });
  };

  const { chromium } = await findPlaywright();
  const served = args.url ? { url: args.url, server: null } : await serveStatic(args.port);
  const { url } = served;
  server = served.server;

  mkdirSync(args.outputDir, { recursive: true });
  browser = await chromium.launch({ headless: !args.headed });
  if (args.maxRunMs > 0) {
    maxRunTimer = setTimeout(() => {
      exitAfterCleanup(1, `mobile viewport check timed out after ${args.maxRunMs}ms`);
    }, args.maxRunMs);
    maxRunTimer.unref?.();
  }
  process.once("SIGINT", () => exitAfterCleanup(130));
  process.once("SIGTERM", () => exitAfterCleanup(143));

  const results = [];
  let failureCount = 0;

  try {
    for (const viewportName of args.viewports) {
      const viewport = VIEWPORTS[viewportName];
      if (!viewport) throw new Error(`Unknown viewport: ${viewportName}`);
      const screen = getScreenViewport(viewportName, viewport);
      for (const role of args.roles) {
        const context = await browser.newContext({
          viewport,
          // app-shell intentionally classifies tablet orientation from the
          // device screen instead of a potentially keyboard-shrunken visual
          // viewport. Supply the tested device geometry so Chromium runs are
          // deterministic rather than inheriting the host desktop screen.
          screen,
          isMobile: viewport.width <= 560,
          hasTouch: true,
          deviceScaleFactor: 2,
        });
        context.setDefaultTimeout(args.caseTimeoutMs);
        context.setDefaultNavigationTimeout(args.caseTimeoutMs);
        const page = await context.newPage();
        // This is a local geometry harness, not an external-CDN availability
        // check. The app's font link uses font-display: swap, so test its
        // shipped fallback path deterministically instead of letting a flaky
        // Google Fonts response turn an otherwise valid tablet layout into an
        // unrelated HTTP/console failure.
        await page.route(GOOGLE_FONTS_STYLESHEET, (route) =>
          route.fulfill({
            status: 200,
            contentType: "text/css; charset=utf-8",
            body: "/* Remote font stylesheet intentionally stubbed by local viewport harness. */",
          }),
        );
        // Playwright's Chromium context screen dimensions do not update the
        // Screen Orientation API. app-shell intentionally reads that API on
        // touch tablets to avoid reclassifying an iPad when its keyboard opens,
        // so align it with the case before the app parses.
        const testOrientation = getViewportOrientation(screen);
        const orientationAngle = getViewportOrientationAngle(screen);
        await page.addInitScript(({ type, angle }) => {
          try {
            Object.defineProperty(window.screen, "orientation", {
              configurable: true,
              value: { type, angle },
            });
          } catch (_error) {
            // A native device value is already sufficient when it cannot be
            // overridden by the browser runtime.
          }
          try {
            Object.defineProperty(window, "orientation", {
              configurable: true,
              value: angle,
            });
          } catch (_error) {
            // See Screen Orientation fallback above.
          }
        }, {
          type: `${testOrientation}-primary`,
          angle: orientationAngle,
        });
        const consoleErrors = [];
        const httpErrors = [];
        page.on("console", (msg) => {
          if (msg.type() === "error") consoleErrors.push(msg.text());
        });
        page.on("pageerror", (err) => consoleErrors.push(err.message));
        page.on("response", (response) => {
          if (response.status() >= 400) {
            httpErrors.push(`${response.status()} ${response.url()}`);
          }
        });

        await page.goto(`${url}?mobileDebugRole=${encodeURIComponent(role)}`, {
          waitUntil: "domcontentloaded",
          timeout: args.caseTimeoutMs,
        });
        await loginAs(page, role);
        await page.waitForTimeout(350);
        const inspection = await inspectPage(page);
        const scrollTabs =
          inspection.screenSize === "phone"
            ? await probeTabsScrollOwnership(page)
            : [];
        const layerLock =
          inspection.screenSize === "phone"
            ? await probeLayerScrollLock(page)
            : null;
        const realLayers =
          inspection.screenSize === "phone"
            ? await probeRealAppLayers(page)
            : null;
        const roleRestriction =
          inspection.screenSize === "phone" && role
            ? await probeRoleRestrictions(page)
            : null;
        const tapDispatch =
          ["phone", "mobile"].includes(inspection.screenSize) && role
            ? await probeTapDispatch(page)
            : null;
        const orientation =
          inspection.screenSize === "phone" && role
            ? await probeOrientationPersistence(page)
            : null;
        const tabletKeyboardStability =
          IPAD_VIEWPORTS.includes(viewportName) && role
            ? await probeTabletKeyboardStability(page)
            : null;
        const tabletFixedStack =
          IPAD_VIEWPORTS.includes(viewportName) && ["admin", "coach"].includes(role)
            ? await probeTabletFixedStack(page)
            : null;
        const tabletBlockingLayers =
          IPAD_VIEWPORTS.includes(viewportName) && ["admin", "coach"].includes(role)
            ? await probeTabletBlockingLayers(page)
            : null;
        const tabletIndexCardEditor =
          INDEX_CARD_TABLET_VIEWPORTS.includes(viewportName) && ["admin", "coach"].includes(role)
            ? await probeTabletIndexCardEditor(page)
            : null;
        const tabletTendenciesLandscape =
          TENDENCIES_TABLET_LANDSCAPE_VIEWPORTS.includes(viewportName) && ["admin", "coach"].includes(role)
            ? await probeTabletTendenciesLandscape(page)
            : null;

        const screenshotName = `${slug(role)}-${viewportName}.png`;
        const screenshotPath = path.join(args.outputDir, screenshotName);
        if (args.screenshots) {
          await page.screenshot({ path: screenshotPath, fullPage: true });
        }
        await context.close();

        const result = {
          role,
          viewport: viewportName,
          screenshot: args.screenshots ? path.relative(root, screenshotPath) : "",
          consoleErrors,
          httpErrors,
          ...inspection,
          scrollTabs,
          layerLock,
          realLayers,
          roleRestriction,
          tapDispatch,
          orientationProbe: orientation,
          tabletKeyboardStability,
          tabletFixedStack,
          tabletBlockingLayers,
          tabletIndexCardEditor,
          tabletTendenciesLandscape,
        };
        const blankMobileStart =
          result.screenSize === "phone" &&
          Boolean(result.role) &&
          (!result.mainAppVisible ||
            (!result.tabBarVisible && !result.mobilePrimaryNavVisible) ||
            !result.activePanelVisible);
        const badPhoneScrollOwner =
          result.screenSize === "phone" &&
          Boolean(result.role) &&
          result.scrollOwner !== "document";
        // A phone page must not have a second vertical scroll owner competing
        // with the document. Owners inside approved wrappers are exempt.
        const scrollConflictTabs = (result.scrollTabs || [])
          .filter((t) => t.docScrolls && t.unapproved.length > 0)
          .map((t) => `${t.tab}:${t.unapproved.join("|")}`);
        const scrollConflict =
          result.screenSize === "phone" &&
          Boolean(result.role) &&
          scrollConflictTabs.length > 0;
        // M-051: a blocking layer must lock background scroll and restore scroll
        // + focus on close. Only assert when the layer API is present.
        const layerLockBroken =
          result.screenSize === "phone" &&
          Boolean(result.role) &&
          result.layerLock &&
          result.layerLock.supported === true &&
          (!result.layerLock.lockOk || !result.layerLock.restoreOk);
        const realLayerBroken =
          result.screenSize === "phone" &&
          Boolean(result.role) &&
          result.realLayers &&
          result.realLayers.supported === true &&
          result.realLayers.ok === false;
        // M-051: players must not see staff controls; every role must reach its
        // promised tabs.
        const roleRestrictionBroken =
          result.screenSize === "phone" &&
          Boolean(result.role) &&
          result.roleRestriction &&
          result.roleRestriction.supported === true &&
          result.roleRestriction.ok === false;
        const tapDispatchBroken =
          ["phone", "mobile"].includes(result.screenSize) &&
          Boolean(result.role) &&
          result.tapDispatch &&
          result.tapDispatch.supported === true &&
          result.tapDispatch.ok === false;
        // M-051: orientation change must preserve the active page and selection.
        const orientationBroken =
          result.screenSize === "phone" &&
          Boolean(result.role) &&
          result.orientationProbe &&
          result.orientationProbe.supported === true &&
          result.orientationProbe.ok === false;
        const badTabletShell =
          IPAD_VIEWPORTS.includes(result.viewport) &&
          Boolean(result.role) &&
          result.shellSize !== "tablet";
        // A landscape iPad in Split View/Stage Manager can have a narrow app
        // window. It must retain tablet hardware identity while using the
        // portrait/document compact profile; the landscape coach rail would
        // consume too much of the available width.
        const compactTabletProfileBroken =
          result.viewport === "744x768" &&
          Boolean(result.role) &&
          (
            result.layoutProfile !== "tablet-compact" ||
            result.hardwareOrientation !== "landscape" ||
            result.shellOrientation !== "portrait" ||
            result.scrollOwner !== "document"
          );
        const tabletKeyboardStabilityBroken =
          IPAD_VIEWPORTS.includes(result.viewport) &&
          Boolean(result.role) &&
          result.tabletKeyboardStability?.ok !== true;
        const badDisplayState =
          Boolean(result.role) &&
          (
            !["phone", "tablet", "desktop"].includes(result.device) ||
            !["browser", "standalone", "fullscreen", "minimal-ui", "window-controls-overlay"].includes(result.displayMode) ||
            !["true", "false"].includes(result.standaloneDisplay) ||
            !["true", "false"].includes(result.fullscreenApi) ||
            !["true", "false"].includes(result.ipados) ||
            !["true", "false"].includes(result.presentation)
          );
        // The scanner preserves its dense-table, wristband-grid, and compact
        // native-control exclusions above. Every remaining visible target is
        // critical enough to enforce the 44px policy on both phone and iPad
        // viewport runs.
        const badSmallTargets =
          (result.screenSize === "phone" || IPAD_VIEWPORTS.includes(result.viewport)) &&
          result.smallTargetCount > 0;
        const tabletFixedStackBroken =
          IPAD_VIEWPORTS.includes(result.viewport) &&
          ["admin", "coach"].includes(role) &&
          result.tabletFixedStack?.ok !== true;
        // T-007a: all staff iPad cases must prove the shared modal lifecycle
        // for Signals, Constraints, and Playbook Workflow. A skipped or
        // partially supported probe is intentionally fatal for that matrix.
        const tabletBlockingLayersBroken =
          IPAD_VIEWPORTS.includes(result.viewport) &&
          ["admin", "coach"].includes(role) &&
          result.tabletBlockingLayers?.ok !== true;
        // T-006b: the focused portrait/landscape staff cases must verify the
        // Index Card's no-hover, no-drag editor path and preserve print markup.
        const tabletIndexCardEditorBroken =
          INDEX_CARD_TABLET_VIEWPORTS.includes(result.viewport) &&
          ["admin", "coach"].includes(role) &&
          result.tabletIndexCardEditor?.ok !== true;
        // T-008c: the roomy staff tablet scout path must keep its direct core
        // actions, real anchored overflow, and a single vertical owner.
        const tabletTendenciesLandscapeBroken =
          TENDENCIES_TABLET_LANDSCAPE_VIEWPORTS.includes(result.viewport) &&
          ["admin", "coach"].includes(role) &&
          result.tabletTendenciesLandscape?.ok !== true;
        // T-004: a study portal must reserve the navigation surface that is
        // actually rendered. Wide tablets use sticky top tabs; narrow/coarse
        // modes keep their established bottom navigation.
        const studyNavigationBroken =
          result.role === "player" &&
          result.studyNavigation?.supported === true &&
          result.studyNavigation.ok !== true;
        const failed =
          blankMobileStart ||
          badPhoneScrollOwner ||
          scrollConflict ||
          layerLockBroken ||
          realLayerBroken ||
          roleRestrictionBroken ||
          tapDispatchBroken ||
          orientationBroken ||
          badTabletShell ||
          compactTabletProfileBroken ||
          tabletKeyboardStabilityBroken ||
          badDisplayState ||
          result.overflow ||
          result.fixedOverlaps.length > 0 ||
          badSmallTargets ||
          tabletFixedStackBroken ||
          tabletBlockingLayersBroken ||
          tabletIndexCardEditorBroken ||
          tabletTendenciesLandscapeBroken ||
          studyNavigationBroken ||
          result.consoleErrors.length > 0 ||
          result.httpErrors.length > 0;
        if (failed) failureCount += 1;
        results.push({
          ...result,
          blankMobileStart,
          badPhoneScrollOwner,
          badTabletShell,
          compactTabletProfileBroken,
          tabletKeyboardStabilityBroken,
          badDisplayState,
          badSmallTargets,
          scrollConflict,
          scrollConflictTabs,
          layerLockBroken,
          realLayerBroken,
          roleRestrictionBroken,
          tapDispatchBroken,
          orientationBroken,
          tabletFixedStackBroken,
          tabletBlockingLayersBroken,
          tabletIndexCardEditorBroken,
          tabletTendenciesLandscapeBroken,
          studyNavigationBroken,
          failed,
        });
      }
    }
  } catch (error) {
    // The watchdog intentionally closes the active browser/context. Do not
    // replace its clear timeout message with Playwright's expected
    // "Target page ... closed" follow-on while shutdown is already underway.
    if (!aborting) throw error;
    return;
  } finally {
    await cleanup();
  }

  if (aborting) return;

  const reportPath = path.join(args.outputDir, "mobile-viewport-report.json");
  await writeFile(reportPath, JSON.stringify({ url, results }, null, 2));

  results.forEach((result) => {
    const flags = [
      result.blankMobileStart ? "blank mobile start" : "",
      result.badPhoneScrollOwner ? `phone scroll owner ${result.scrollOwner || "unset"}` : "",
      result.scrollConflict ? `scroll conflict ${result.scrollConflictTabs.join(", ")}` : "",
      result.layerLockBroken
        ? `layer lock ${result.layerLock && result.layerLock.lockOk ? "ok" : "fail"}/restore ${result.layerLock && result.layerLock.restoreOk ? "ok" : "fail"}`
        : "",
      result.realLayerBroken
        ? `real layers ${(result.realLayers?.checks || []).filter((check) => !check.ok).map((check) => check.name).join("|")}`
        : "",
      result.roleRestrictionBroken
        ? `role leak ${(result.roleRestriction.leaked || []).join("|") || "tabs:" + (result.roleRestriction.missingTabs || []).join("|")}`
        : "",
      result.tapDispatchBroken
        ? `tap dispatch ${(result.tapDispatch.taps || []).filter((tap) => !tap.ok).map((tap) => `${tap.target}:${tap.reason || tap.activeTab || "no-state"}`).join("|")}`
        : "",
      result.orientationBroken
        ? `orientation ${result.orientationProbe.pagePreserved ? "page-ok" : "page-lost"}/${result.orientationProbe.selectionPreserved ? "sel-ok" : "sel-lost"}`
        : "",
      result.tabletFixedStackBroken
        ? `tablet fixed stack ${[
          ...(result.tabletFixedStack?.missing || []).map((name) => `missing:${name}`),
          ...(result.tabletFixedStack?.overlaps || []),
          result.tabletFixedStack?.reason || "",
          result.tabletFixedStack?.restored === false ? "state-not-restored" : "",
        ].filter(Boolean).join("|")}`
        : "",
      result.tabletBlockingLayersBroken
        ? `tablet blocking layers ${[
          ...(result.tabletBlockingLayers?.checks || [])
            .filter((check) => !check.ok)
            .map((check) => `${check.name}:${[
              check.openOk ? "" : "open",
              check.geometryOk ? "" : "geometry",
              check.closeOk ? "" : "escape",
            ].filter(Boolean).join("/")}`),
          result.tabletBlockingLayers?.reason || "",
          result.tabletBlockingLayers?.restored === false ? "state-not-restored" : "",
        ].filter(Boolean).join("|")}`
        : "",
      result.tabletIndexCardEditorBroken
        ? `tablet index card ${[
          ...(result.tabletIndexCardEditor?.checks || [])
            .filter((check) => !check.ok)
            .map((check) => check.name),
          result.tabletIndexCardEditor?.reason || "",
          result.tabletIndexCardEditor?.restored === false ? "state-not-restored" : "",
        ].filter(Boolean).join("|")}`
        : "",
      result.tabletTendenciesLandscapeBroken
        ? `tablet tendencies ${[
          ...(result.tabletTendenciesLandscape?.checks || [])
            .filter((check) => !check.ok)
            .map((check) => check.name),
          result.tabletTendenciesLandscape?.reason || "",
          result.tabletTendenciesLandscape?.restored === false ? "state-not-restored" : "",
        ].filter(Boolean).join("|")}`
        : "",
      result.studyNavigation?.supported === true
        ? `study nav ${result.studyNavigation.expected}/${result.studyNavigation.actual} vars=${result.studyNavigation.appTabsHeight}/${result.studyNavigation.playerBottomNavHeight}${result.studyNavigationBroken ? " invalid" : ""}`
        : "",
      result.badTabletShell ? `tablet shell ${result.shellSize || "unset"}` : "",
      result.compactTabletProfileBroken
        ? `tablet compact profile=${result.layoutProfile || "unset"}/${result.hardwareOrientation || "unset"}/${result.shellOrientation || "unset"}/${result.scrollOwner || "unset"}`
        : "",
      result.tabletKeyboardStabilityBroken
        ? `tablet keyboard ${[
          result.tabletKeyboardStability?.identityStable === false ? "identity-changed" : "",
          result.tabletKeyboardStability?.restoredIdentity === false ? "restore-identity-changed" : "",
          result.tabletKeyboardStability?.keyboardRegistered === false ? "keyboard-unregistered" : "",
          result.tabletKeyboardStability?.restoredUsableHeight === false ? "usable-height-unrestored" : "",
          result.tabletKeyboardStability?.reason || "",
        ].filter(Boolean).join("|")}`
        : "",
      result.badDisplayState ? "bad display/device state" : "",
      result.overflow ? `overflow ${result.scrollWidth}>${result.viewportWidth}` : "",
      result.smallTargetCount ? `${result.smallTargetCount} small targets` : "",
      result.fixedOverlaps.length ? `${result.fixedOverlaps.length} fixed overlaps` : "",
      result.consoleErrors.length ? `${result.consoleErrors.length} console errors` : "",
      result.httpErrors.length ? `${result.httpErrors.length} HTTP errors` : "",
    ].filter(Boolean);
    console.log(
      `${result.failed ? "FAIL" : "OK"} ${result.role} ${result.viewport} ` +
      `${result.screenSize}/${result.orientation} shell=${result.shellSize}/${result.shellOrientation}` +
      ` profile=${result.layoutProfile || "unset"}` +
      ` device=${result.device || "unset"} display=${result.displayMode || "unset"}` +
      `${flags.length ? ` - ${flags.join(", ")}` : ""}`,
    );
    if (result.screenshot) console.log(`  screenshot: ${result.screenshot}`);
  });
  console.log(`report: ${path.relative(root, reportPath)}`);

  if (failureCount > 0 && !args.warnOnly) {
    process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error(err.message || err);
  process.exitCode = 1;
});
