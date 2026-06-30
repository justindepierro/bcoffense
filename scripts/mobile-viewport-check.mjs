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
    url: "",
    roles: ["admin", "coach", "player"],
    viewports: ["320x568", "390x844", "568x320", ...IPAD_VIEWPORTS],
    screenshots: true,
    headed: false,
    warnOnly: false,
    port: 4187,
    outputDir: path.join(root, ".mobile-debug"),
  };

  argv.forEach((arg) => {
    if (arg.startsWith("--url=")) args.url = arg.slice("--url=".length);
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
  });

  return args;
}

async function findPlaywright() {
  const candidates = [
    path.join(root, "node_modules/playwright"),
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
    `Playwright not found. Install it with: npm install --prefix ${DEFAULT_TOOL_ROOT} playwright && ` +
    `${DEFAULT_TOOL_ROOT}/node_modules/.bin/playwright install chromium`,
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
    if (parsed.pathname.startsWith("/clips/")) {
      // Clip routes are Cloudflare Pages Functions in production. Stub them as
      // an empty index so the static harness mirrors a signed-in user with no
      // clips instead of reporting a 404 on every page load.
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, sigs: [], clips: [] }));
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
    const mainAppVisible = isVisible(document.getElementById("mainApp"));
    const uploadVisible = isVisible(document.getElementById("uploadSection"));
    const tabBarVisible = isVisible(document.querySelector("#mainApp .tabs"));
    const activePanel = document.querySelector("#mainApp .panel.active");
    const activePanelVisible = isVisible(activePanel);

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
      " .cs-table-scroll, .help-panel-body, [data-approved-scroller]," +
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
    const panel = document.querySelector("#mainApp .panel.active");
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
  const TABS = ["playbook", "script", "wristband", "callsheet", "tendencies", "gameplan", "dashboard"];
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

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const { chromium } = await findPlaywright();
  const served = args.url ? { url: args.url, server: null } : await serveStatic(args.port);
  const { url, server } = served;

  mkdirSync(args.outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: !args.headed });
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
        });
        await loginAs(page, role);
        await page.waitForTimeout(350);
        const inspection = await inspectPage(page);
        const scrollTabs =
          inspection.screenSize === "phone"
            ? await probeTabsScrollOwnership(page)
            : [];

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
          failed,
        });
      }
    }
  } finally {
    await browser.close();
    server?.close();
  }

  const reportPath = path.join(args.outputDir, "mobile-viewport-report.json");
  await writeFile(reportPath, JSON.stringify({ url, results }, null, 2));

  results.forEach((result) => {
    const flags = [
      result.blankMobileStart ? "blank mobile start" : "",
      result.badPhoneScrollOwner ? `phone scroll owner ${result.scrollOwner || "unset"}` : "",
      result.scrollConflict ? `scroll conflict ${result.scrollConflictTabs.join(", ")}` : "",
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
