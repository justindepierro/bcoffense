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
  "768x1024": { width: 768, height: 1024 },
  "820x1180": { width: 820, height: 1180 },
  "1024x768": { width: 1024, height: 768 },
  "834x1112": { width: 834, height: 1112 },
  "1024x1366": { width: 1024, height: 1366 },
};

const IPAD_VIEWPORTS = ["768x1024", "820x1180", "834x1112", "1024x768", "1024x1366"];
const DEFAULT_CASE_TIMEOUT_MS = 25000;
const DEFAULT_MAX_RUN_MS = 180000;

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
    const tabBarVisible = isVisible(document.querySelector("#mainApp .tabs"));
    const activePanel = document.querySelector(".panel.active");
    const activePanelVisible = isVisible(activePanel);
    const mainAppVisible = isVisible(mainAppEl) || activePanelVisible;

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
      if (el.closest(".callsheet-table, .playbook-table-wrap, .wristband-grid")) return;
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
      scrollOwner: document.body?.dataset.scrollOwner || "",
      workspaceSurface: document.body?.dataset.workspaceSurface || "",
      mainAppVisible,
      uploadVisible,
      tabBarVisible,
      activePanel: activePanel?.id || "",
      activePanelVisible,
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
    if (!visible) {
      taps.push({ target: `tab:${tab}`, ok: false, reason: "not visible" });
      continue;
    }
    await locator.click({ timeout: 4000 });
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
  const cleanup = async () => {
    if (maxRunTimer) clearTimeout(maxRunTimer);
    if (forceExitTimer) clearTimeout(forceExitTimer);
    if (browser) await browser.close().catch(() => { });
    closeServer(server);
  };
  const exitAfterCleanup = (exitCode, message) => {
    if (message) console.error(message);
    forceExitTimer = setTimeout(() => process.exit(exitCode), 2000);
    forceExitTimer.unref?.();
    cleanup().finally(() => process.exit(exitCode));
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
      for (const role of args.roles) {
        const context = await browser.newContext({
          viewport,
          isMobile: viewport.width <= 560,
          hasTouch: true,
          deviceScaleFactor: 2,
        });
        context.setDefaultTimeout(args.caseTimeoutMs);
        context.setDefaultNavigationTimeout(args.caseTimeoutMs);
        const page = await context.newPage();
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
          roleRestriction,
          tapDispatch,
          orientationProbe: orientation,
        };
        const blankMobileStart =
          result.screenSize === "phone" &&
          Boolean(result.role) &&
          (!result.mainAppVisible || !result.tabBarVisible || !result.activePanelVisible);
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
        const badSmallTargets =
          result.screenSize === "phone" &&
          result.smallTargetCount > 0;
        const failed =
          blankMobileStart ||
          badPhoneScrollOwner ||
          scrollConflict ||
          layerLockBroken ||
          roleRestrictionBroken ||
          tapDispatchBroken ||
          orientationBroken ||
          badTabletShell ||
          badDisplayState ||
          result.overflow ||
          result.fixedOverlaps.length > 0 ||
          badSmallTargets ||
          result.consoleErrors.length > 0 ||
          result.httpErrors.length > 0;
        if (failed) failureCount += 1;
        results.push({
          ...result,
          blankMobileStart,
          badPhoneScrollOwner,
          badTabletShell,
          badDisplayState,
          badSmallTargets,
          scrollConflict,
          scrollConflictTabs,
          layerLockBroken,
          roleRestrictionBroken,
          tapDispatchBroken,
          orientationBroken,
          failed,
        });
      }
    }
  } finally {
    await cleanup();
  }

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
      result.roleRestrictionBroken
        ? `role leak ${(result.roleRestriction.leaked || []).join("|") || "tabs:" + (result.roleRestriction.missingTabs || []).join("|")}`
        : "",
      result.tapDispatchBroken
        ? `tap dispatch ${(result.tapDispatch.taps || []).filter((tap) => !tap.ok).map((tap) => `${tap.target}:${tap.reason || tap.activeTab || "no-state"}`).join("|")}`
        : "",
      result.orientationBroken
        ? `orientation ${result.orientationProbe.pagePreserved ? "page-ok" : "page-lost"}/${result.orientationProbe.selectionPreserved ? "sel-ok" : "sel-lost"}`
        : "",
      result.badTabletShell ? `tablet shell ${result.shellSize || "unset"}` : "",
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
