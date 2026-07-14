#!/usr/bin/env node

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const fail = (message) => {
  console.error(`smoke-check: ${message}`);
  process.exitCode = 1;
};

const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const unique = (values) => [...new Set(values)];

function walk(dir, out = []) {
  fs.readdirSync(path.join(root, dir), { withFileTypes: true }).forEach((entry) => {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel, out);
    else if (entry.isFile()) out.push(rel);
  });
  return out;
}

function checkJsSyntax() {
  const files = [
    ...walk("js"),
    ...walk("functions").filter((file) => file.endsWith(".js")),
    "sw.js",
  ];
  files.forEach((file) => {
    const result = spawnSync(process.execPath, ["--check", file], {
      cwd: root,
      encoding: "utf8",
    });
    if (result.status !== 0) {
      fail(`${file} failed node --check\n${result.stderr || result.stdout}`);
    }
  });
  console.log(`syntax ok (${files.length} files)`);
}

function checkServiceWorkerAssets() {
  const sw = read("sw.js");
  const assetsMatch = sw.match(/const LOCAL_ASSETS = \[([\s\S]*?)\];/);
  if (!assetsMatch) {
    fail("LOCAL_ASSETS array not found in sw.js");
    return;
  }
  const assets = [...assetsMatch[1].matchAll(/"(\.\/[^"]+)"/g)]
    .map((match) => match[1].replace(/^\.\//, ""))
    .filter(Boolean);
  const duplicateAssets = assets.filter(
    (asset, index) => assets.indexOf(asset) !== index,
  );
  if (duplicateAssets.length) {
    fail(`duplicate LOCAL_ASSETS entries: ${unique(duplicateAssets).join(", ")}`);
  }
  if (!assets.includes("offline.html")) {
    fail("offline.html is not pre-cached for navigation fallback");
  }
  const missing = assets.filter((asset) => asset !== "" && !fs.existsSync(path.join(root, asset)));
  if (missing.length) fail(`missing LOCAL_ASSETS entries: ${missing.join(", ")}`);

  const deployScript = read("scripts/deploy-cloudflare.sh");
  const deploySourceLine = deployScript.match(
    /rsync -a ([^\n]+) "\$tmpdir\/public\/"/,
  )?.[1] || "";
  const deploySources = deploySourceLine.split(/\s+/).filter(Boolean);
  const missingFromDeploy = assets.filter((asset) => {
    if (!asset) return false;
    return !deploySources.some(
      (source) => asset === source || asset.startsWith(`${source}/`),
    );
  });
  if (missingFromDeploy.length) {
    fail(`LOCAL_ASSETS omitted from Cloudflare deploy: ${missingFromDeploy.join(", ")}`);
  }

  const html = read("index.html");
  const indexAssets = [
    ...html.matchAll(/<(?:script|link)\b[^>]+(?:src|href)="((?:js|css)\/[^"]+)"/g),
  ].map((match) => match[1].split("?")[0]);
  const cachedCodeAssets = assets.filter((asset) => /^(?:js|css)\//.test(asset));
  const missingFromCache = indexAssets.filter((asset) => !cachedCodeAssets.includes(asset));
  const missingFromIndex = cachedCodeAssets.filter((asset) => !indexAssets.includes(asset));
  if (missingFromCache.length || missingFromIndex.length) {
    fail(
      `index/sw code asset mismatch; missing from cache: ${missingFromCache.join(", ") || "none"}; ` +
      `missing from index: ${missingFromIndex.join(", ") || "none"}`,
    );
  }
  console.log(`service worker assets ok (${assets.length} entries)`);
}

function checkIndexReferences() {
  const html = read("index.html");
  const refs = [
    ...html.matchAll(/<(?:script|link)\b[^>]+(?:src|href)="([^"]+)"/g),
  ].map((match) => match[1])
    .filter((ref) => !ref.startsWith("http") && !ref.startsWith("data:"))
    .map((ref) => ref.split("?")[0]);
  const missing = refs.filter((ref) => !fs.existsSync(path.join(root, ref)));
  if (missing.length) fail(`missing index references: ${missing.join(", ")}`);

  const scripts = [...html.matchAll(/<script\b[^>]+src="([^"]+)"/g)]
    .map((match) => match[1].split("?")[0]);
  const duplicates = scripts.filter((script, index) => scripts.indexOf(script) !== index);
  if (duplicates.length) fail(`duplicate script tags: ${[...new Set(duplicates)].join(", ")}`);
  console.log(`index references ok (${refs.length} assets)`);
}

function checkCssGuardrails() {
  const files = walk("css").filter((file) => file.endsWith(".css"));
  const baseCss = read("css/base.css");
  if (
    !/@media \(prefers-reduced-motion:\s*reduce\)/.test(baseCss) ||
    !/animation-duration:\s*0\.01ms\s*!important/.test(baseCss) ||
    !/transition-duration:\s*0\.01ms\s*!important/.test(baseCss) ||
    !/scroll-behavior:\s*auto\s*!important/.test(baseCss)
  ) {
    fail("global reduced-motion guardrail is incomplete");
  }
  files.forEach((file) => {
    const source = read(file);
    const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "");
    let depth = 0;
    let minDepth = 0;
    for (const ch of withoutComments) {
      if (ch === "{") depth += 1;
      else if (ch === "}") depth -= 1;
      minDepth = Math.min(minDepth, depth);
    }
    if (depth !== 0 || minDepth < 0) {
      fail(`${file} has unbalanced CSS braces`);
    }
    if (/letter-spacing:\s*-\d/i.test(source)) {
      fail(`${file} uses negative letter spacing`);
    }
    if (/font-size:\s*(?:clamp\(|[^;]*vw)/i.test(source)) {
      fail(`${file} scales font size with viewport width`);
    }
  });
  console.log(`css guardrails ok (${files.length} files)`);
}

function checkPageStyleContracts() {
  const scriptCss = read("css/script.css");
  const playbookCss = read("css/playbook.css");
  const gameplanCss = read("css/gameplan.css");
  const wristbandCss = read("css/wristband.css");
  const callsheetCss = read("css/callsheet.css");
  const dashboardCss = read("css/dashboard.css");
  const tendenciesCss = read("css/tendencies.css");
  const installationCss = read("css/installation.css");
  const identityCss = read("css/identity.css");
  const offenseBuilderCss = read("css/offense-builder.css");
  const gameplanRender = read("js/gameplan-render.js");

  if (
    !/\.script-workbench-controls\s*\{[\s\S]*grid-template-columns:\s*minmax\(220px,\s*1fr\)\s*minmax\(0,\s*1\.15fr\)\s*minmax\(150px,\s*0\.65fr\)/.test(scriptCss) ||
    !/\.script-workbench-controls\s*\{[\s\S]*overflow:\s*clip/.test(scriptCss) ||
    !/\.script-workbench-primary-actions\s*\{[\s\S]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%,\s*84px\),\s*1fr\)\)/.test(scriptCss) ||
    !/#script \.toolbar-surface \.script-workbench-toggle-group \.script-workbench-pill,[\s\S]*#script \.toolbar-surface \.script-workbench-primary-actions \.btn\s*\{[\s\S]*white-space:\s*normal[\s\S]*overflow-wrap:\s*anywhere/.test(scriptCss) ||
    !/#script \.script-play-rail \.available-plays-actions \.btn\s*\{[\s\S]*white-space:\s*normal[\s\S]*overflow-wrap:\s*anywhere/.test(scriptCss)
  ) {
    fail("Script workbench action buttons are missing overflow-safe sizing rules");
  }

  if (
    !/#script \.script-toolbar\s*\{[\s\S]*grid-template-columns:\s*minmax\(92px,\s*max-content\)\s*minmax\(0,\s*1fr\)\s*minmax\(160px,\s*0\.9fr\)/.test(scriptCss) ||
    !/#script \.script-toolbar \.btn,[\s\S]*#script \.script-toolbar \.bulk-select-label\s*\{[\s\S]*white-space:\s*normal[\s\S]*overflow-wrap:\s*anywhere/.test(scriptCss) ||
    !/#script \.toolbar-sort-select\s*\{[\s\S]*min-width:\s*0[\s\S]*max-width:\s*100%/.test(scriptCss) ||
    !/#script \.script-tools-drawer \.script-action-cluster \.btn,[\s\S]*#script \.script-tools-drawer \.more-tools-btn\s*\{[\s\S]*white-space:\s*normal[\s\S]*overflow-wrap:\s*anywhere/.test(scriptCss) ||
    !/#script \.script-tools-drawer \.more-tools-menu button\s*\{[\s\S]*white-space:\s*normal[\s\S]*overflow-wrap:\s*anywhere/.test(scriptCss) ||
    !/@media \(max-width:\s*1180px\)[\s\S]*#script \.script-workbench-controls\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(0,\s*1fr\)[\s\S]*#script \.script-toolbar\s*\{[\s\S]*grid-template-columns:\s*1fr/.test(scriptCss)
  ) {
    fail("Script toolbar is missing overflow-safe responsive style rules");
  }

  if (
    !/\.pb-top-row\s*\{[\s\S]*display:\s*grid[\s\S]*grid-template-columns:[\s\S]*max-content\s*minmax\(220px,\s*1fr\)\s*minmax\(0,\s*auto\)[\s\S]*overflow:\s*clip/.test(playbookCss) ||
    !/\.pb-top-row \.btn\s*\{[\s\S]*min-width:\s*0[\s\S]*white-space:\s*normal/.test(playbookCss) ||
    !/\.pb-utility-group\s*\{[\s\S]*min-width:\s*0[\s\S]*max-width:\s*100%/.test(playbookCss) ||
    !/@media \(max-width:\s*1180px\)[\s\S]*#playbook \.pb-top-row\s*\{[\s\S]*grid-template-columns:\s*max-content\s*minmax\(0,\s*1fr\)[\s\S]*#playbook \.pb-utility-group\s*\{[\s\S]*grid-column:\s*1\s*\/\s*-1[\s\S]*order:\s*10/.test(playbookCss)
  ) {
    fail("Playbook command surface is missing overflow-safe responsive style rules");
  }

  if (
    !/\.pb-gp-actions\s*\{[\s\S]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(96px,\s*1fr\)\)/.test(playbookCss) ||
    !/\.pb-gp-actions \.btn\s*\{[\s\S]*white-space:\s*normal[\s\S]*overflow-wrap:\s*anywhere/.test(playbookCss) ||
    !/\.pb-actions-row\s*\{[\s\S]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(126px,\s*1fr\)\)/.test(playbookCss) ||
    !/\.pb-action-btn\s*\{[\s\S]*min-width:\s*0[\s\S]*white-space:\s*normal[\s\S]*overflow-wrap:\s*anywhere/.test(playbookCss) ||
    !/\.pb-player-summary__filter-pill\s*\{[\s\S]*min-width:\s*0[\s\S]*text-overflow:\s*ellipsis/.test(playbookCss) ||
    !/\.pb-player-filter-option\s*\{[\s\S]*white-space:\s*normal[\s\S]*overflow-wrap:\s*anywhere/.test(playbookCss)
  ) {
    fail("Playbook drawer actions or player filters are missing overflow-safe rules");
  }

  if (
    !/\.gp-cmd-bar\s*\{[\s\S]*overflow:\s*clip/.test(gameplanCss) ||
    !/\.gp-cmd-main\s*\{[\s\S]*display:\s*grid[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(320px,\s*max-content\)/.test(gameplanCss) ||
    !/\.gp-cmd-actions\s*\{[\s\S]*display:\s*grid[\s\S]*grid-template-columns:\s*repeat\(4,\s*minmax\(86px,\s*max-content\)\)/.test(gameplanCss) ||
    !/\.gp-cmd-actions \.btn\s*\{[\s\S]*min-width:\s*0[\s\S]*white-space:\s*normal[\s\S]*overflow-wrap:\s*anywhere/.test(gameplanCss) ||
    !/@media \(max-width:\s*1180px\)[\s\S]*#gameplan \.gp-cmd-main\s*\{[\s\S]*grid-template-columns:\s*1fr[\s\S]*#gameplan \.gp-cmd-actions\s*\{[\s\S]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(92px,\s*1fr\)\)/.test(gameplanCss)
  ) {
    fail("Game Plan command bar is missing overflow-safe shared-surface rules");
  }

  if (
    !/class="gp-toolbar-toggle"/.test(gameplanRender) ||
    !/\.gp-toolbar\s*\{[\s\S]*overflow:\s*clip/.test(gameplanCss) ||
    !/\.gp-multi-filter-btn span:first-child\s*\{[\s\S]*text-overflow:\s*ellipsis/.test(gameplanCss) ||
    !/\.gp-toolbar-toggle\s*\{[\s\S]*min-width:\s*0[\s\S]*max-width:\s*100%/.test(gameplanCss) ||
    !/\.gp-toolbar \.btn,[\s\S]*\.gp-toolbar-toggle,[\s\S]*\.gp-matchup-chip\s*\{[\s\S]*overflow-wrap:\s*anywhere/.test(gameplanCss)
  ) {
    fail("Game Plan filter toolbar is missing overflow-safe rules");
  }

  if (
    !/\.wb-cmd-bar\s*\{[\s\S]*overflow:\s*clip/.test(wristbandCss) ||
    !/\.wb-cmd-main\s*\{[\s\S]*display:\s*grid[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(520px,\s*max-content\)/.test(wristbandCss) ||
    !/\.wb-cmd-actions\s*\{[\s\S]*display:\s*grid[\s\S]*grid-template-columns:[\s\S]*minmax\(88px,\s*max-content\)[\s\S]*repeat\([\s\S]*7,[\s\S]*minmax\(72px,\s*max-content\)/.test(wristbandCss) ||
    !/\.wb-cmd-actions > \.btn,[\s\S]*\.wb-cmd-actions > \.tool-menu-wrap > \.btn\s*\{[\s\S]*white-space:\s*normal[\s\S]*overflow-wrap:\s*anywhere/.test(wristbandCss) ||
    !/@media \(max-width:\s*1180px\)[\s\S]*#wristband \.wb-cmd-main\s*\{[\s\S]*grid-template-columns:\s*1fr[\s\S]*#wristband \.wb-cmd-actions\s*\{[\s\S]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(92px,\s*1fr\)\)/.test(wristbandCss)
  ) {
    fail("Wristband command bar is missing overflow-safe shared-surface rules");
  }

  if (
    !/\.wb-card-controls\s*\{[\s\S]*display:\s*grid[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(116px,\s*max-content\)/.test(wristbandCss) ||
    !/\.pc-mode-bar\s*\{[\s\S]*grid-template-columns:[\s\S]*auto-fit[\s\S]*minmax\(118px,\s*max-content\)[\s\S]*overflow:\s*clip/.test(wristbandCss) ||
    !/\.pc-mode-bar \.btn\s*\{[\s\S]*white-space:\s*normal[\s\S]*overflow-wrap:\s*anywhere/.test(wristbandCss) ||
    !/\.wb-batch-bar\s*\{[\s\S]*overflow:\s*clip/.test(wristbandCss) ||
    !/\.wb-batch-controls\s*\{[\s\S]*display:\s*grid[\s\S]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(132px,\s*max-content\)\)/.test(wristbandCss)
  ) {
    fail("Wristband card, player, or batch controls are missing overflow-safe rules");
  }

  if (
    !/\.cs-toolbar\s*\{[\s\S]*display:\s*grid[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(420px,\s*max-content\)[\s\S]*overflow:\s*clip/.test(callsheetCss) ||
    !/\.cs-toolbar-left\s*\{[\s\S]*display:\s*grid[\s\S]*grid-template-columns:[\s\S]*minmax\(132px,\s*max-content\)[\s\S]*minmax\(96px,\s*max-content\)/.test(callsheetCss) ||
    !/\.cs-toolbar-right\s*\{[\s\S]*display:\s*grid[\s\S]*grid-template-columns:[\s\S]*minmax\(44px,\s*max-content\)[\s\S]*minmax\(88px,\s*max-content\)/.test(callsheetCss) ||
    !/\.cs-toolbar \.btn\s*\{[\s\S]*white-space:\s*normal[\s\S]*overflow-wrap:\s*anywhere/.test(callsheetCss) ||
    !/@media \(max-width:\s*1180px\)[\s\S]*#callsheet \.cs-toolbar\s*\{[\s\S]*grid-template-columns:\s*1fr[\s\S]*#callsheet \.cs-toolbar-left,[\s\S]*#callsheet \.cs-toolbar-right\s*\{[\s\S]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(96px,\s*1fr\)\)/.test(callsheetCss)
  ) {
    fail("Call Sheet toolbar is missing overflow-safe command hierarchy rules");
  }

  if (
    !/\.cs-toolbar-secondary\s*\{[\s\S]*display:\s*grid[\s\S]*overflow:\s*clip/.test(callsheetCss) ||
    !/\.cs-toolbar-groups\s*\{[\s\S]*display:\s*grid[\s\S]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(168px,\s*1fr\)\)/.test(callsheetCss) ||
    !/\.cs-tool-group-row\s*\{[\s\S]*display:\s*grid[\s\S]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(96px,\s*1fr\)\)/.test(callsheetCss) ||
    !/\.cs-tool-btn\s*\{[\s\S]*min-width:\s*0[\s\S]*white-space:\s*normal[\s\S]*overflow-wrap:\s*anywhere/.test(callsheetCss) ||
    !/#callsheet\.cs-sideline-mode \.cs-toolbar-left,[\s\S]*#callsheet\.cs-sideline-mode \.cs-toolbar-right > \*:not\(#csSidelineModeBtn\)/.test(callsheetCss)
  ) {
    fail("Call Sheet quick actions or sideline toolbar rules are incomplete");
  }

  if (
    !/\.player-home-quick-actions\s*\{[\s\S]*display:\s*grid[\s\S]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(164px,\s*1fr\)\)/.test(dashboardCss) ||
    !/\.player-home-quick-action\s*\{[\s\S]*grid-template-columns:\s*minmax\(42px,\s*auto\)\s*minmax\(0,\s*1fr\)[\s\S]*max-width:\s*100%/.test(dashboardCss) ||
    !/body\.is-phone-screen\[data-auth-role="player"\] \.player-home-quick-actions\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/.test(dashboardCss)
  ) {
    fail("Player portal quick actions are missing overflow-safe action deck rules");
  }

  if (
    !/\.dash-command-center\s*\{[\s\S]*overflow:\s*clip/.test(dashboardCss) ||
    !/\.dash-command-main\s*\{[\s\S]*display:\s*grid[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(112px,\s*max-content\)/.test(dashboardCss) ||
    !/\.dash-command-actions\s*\{[\s\S]*display:\s*grid[\s\S]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(108px,\s*1fr\)\)/.test(dashboardCss) ||
    !/\.dash-links-grid\s*\{[\s\S]*display:\s*grid[\s\S]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(148px,\s*1fr\)\)/.test(dashboardCss) ||
    !/\.dash-gameplan-actions\s*\{[\s\S]*display:\s*grid[\s\S]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(144px,\s*max-content\)\)/.test(dashboardCss) ||
    !/\.dash-link-btn\s*\{[\s\S]*white-space:\s*normal[\s\S]*overflow-wrap:\s*anywhere/.test(dashboardCss)
  ) {
    fail("Dashboard quick actions are missing overflow-safe command hierarchy rules");
  }

  if (
    !/\.td-toolbar\s*\{[\s\S]*display:\s*grid[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(220px,\s*max-content\)[\s\S]*overflow:\s*clip/.test(tendenciesCss) ||
    !/\.td-detail-actions\s*\{[\s\S]*display:\s*grid[\s\S]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(88px,\s*1fr\)\)/.test(tendenciesCss) ||
    !/\.td-detail-actions \.btn\s*\{[\s\S]*white-space:\s*normal[\s\S]*overflow-wrap:\s*anywhere/.test(tendenciesCss) ||
    !/@media \(max-width:\s*560px\)[\s\S]*\.td-section-header,[\s\S]*\.td-toolbar\s*\{[\s\S]*grid-template-columns:\s*1fr/.test(tendenciesCss)
  ) {
    fail("Tendencies command cleanup is missing overflow-safe rules");
  }

  if (
    !/\.install-header\s*\{[\s\S]*display:\s*grid[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(280px,\s*max-content\)[\s\S]*overflow:\s*clip/.test(installationCss) ||
    !/\.install-header-actions\s*\{[\s\S]*display:\s*grid[\s\S]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(104px,\s*max-content\)\)/.test(installationCss) ||
    !/\.install-detail-actions\s*\{[\s\S]*display:\s*grid[\s\S]*grid-template-columns:\s*minmax\(180px,\s*1fr\)\s*minmax\(96px,\s*max-content\)/.test(installationCss) ||
    !/\.install-detail-actions \.btn\s*\{[\s\S]*white-space:\s*normal[\s\S]*overflow-wrap:\s*anywhere/.test(installationCss)
  ) {
    fail("Installation command cleanup is missing overflow-safe rules");
  }

  if (
    !/#identity \.id-hero\s*\{[\s\S]*display:\s*grid[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(180px,\s*max-content\)[\s\S]*overflow:\s*clip/.test(identityCss) ||
    !/#identity \.id-hero-actions\s*\{[\s\S]*display:\s*grid[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(88px,\s*max-content\)\)/.test(identityCss) ||
    !/#identity \.id-hero-actions \.btn\s*\{[\s\S]*white-space:\s*normal[\s\S]*overflow-wrap:\s*anywhere/.test(identityCss)
  ) {
    fail("Identity command cleanup is missing overflow-safe rules");
  }

  if (
    !/\.ob-header\s*\{[\s\S]*display:\s*grid[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(260px,\s*max-content\)[\s\S]*overflow:\s*clip/.test(offenseBuilderCss) ||
    !/\.ob-toolbar\s*\{[\s\S]*display:\s*grid[\s\S]*grid-template-columns:\s*minmax\(220px,\s*1fr\)\s*minmax\(120px,\s*max-content\)\s*minmax\(108px,\s*max-content\)\s*minmax\(88px,\s*max-content\)[\s\S]*overflow:\s*clip/.test(offenseBuilderCss) ||
    !/\.ob-toolbar \.btn\s*\{[\s\S]*white-space:\s*normal[\s\S]*overflow-wrap:\s*anywhere/.test(offenseBuilderCss)
  ) {
    fail("Offense Builder command cleanup is missing overflow-safe rules");
  }

  console.log("page style contracts ok");
}

function checkAppChromeStackingContract() {
  const base = read("css/base.css");
  const valueOf = (name) => {
    const match = base.match(new RegExp(`--${name}:\\s*(\\d+)\\s*;`));
    return match ? Number(match[1]) : NaN;
  };
  const z = {
    panelSticky: valueOf("z-panel-sticky"),
    panelFloat: valueOf("z-panel-float"),
    dropdown: valueOf("z-dropdown"),
    drawerScrim: valueOf("z-drawer-scrim"),
    drawer: valueOf("z-drawer"),
    fab: valueOf("z-fab"),
    tabBar: valueOf("z-tab-bar"),
    header: valueOf("z-header"),
    overlay: valueOf("z-overlay"),
    modal: valueOf("z-modal"),
    toast: valueOf("z-toast"),
    tooltip: valueOf("z-tooltip"),
    modalTop: valueOf("z-modal-top"),
  };
  Object.entries(z).forEach(([name, value]) => {
    if (!Number.isFinite(value)) fail(`missing numeric z-index token: ${name}`);
  });
  if (!(z.header > z.tabBar && z.tabBar > z.fab && z.fab > z.drawer)) {
    fail("app chrome z-index order must be header > tab bar > FAB > drawer");
  }
  if (!(z.drawer > z.drawerScrim && z.drawerScrim > z.dropdown && z.dropdown > z.panelFloat)) {
    fail("panel/drawer z-index order must be drawer > scrim > dropdown > panel float");
  }
  if (!(z.modalTop > z.tooltip && z.tooltip > z.toast && z.toast > z.modal && z.modal > z.overlay && z.overlay > z.header)) {
    fail("global overlay z-index order must stay above app chrome");
  }

  const layout = read("css/layout.css");
  if (!/\.app-header\s*\{[\s\S]*?z-index:\s*var\(--z-header\)/.test(layout)) {
    fail("app header does not use --z-header");
  }
  if (!/\.tabs\s*\{[\s\S]*?z-index:\s*var\(--z-tab-bar\)/.test(layout)) {
    fail("tab bar does not use --z-tab-bar");
  }
  console.log("app chrome stacking contract ok");
}

function attrValue(tag, name) {
  const match = tag.match(new RegExp(`\\s${name}=(["'])(.*?)\\1`, "i"));
  return match ? match[2].trim() : "";
}

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function checkAccessibilityBasics() {
  ["index.html", "offline.html"].forEach((file) => {
    const html = read(file);
    if (/\son[a-z]+=/i.test(html)) {
      fail(`inline event handler attributes found in ${file}`);
    }

    const ids = [...html.matchAll(/\sid=(["'])(.*?)\1/g)].map((match) => match[2]);
    const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
    if (duplicateIds.length) {
      fail(`duplicate ids in ${file}: ${[...new Set(duplicateIds)].join(", ")}`);
    }

    const unnamedButtons = [];
    [...html.matchAll(/<button\b([\s\S]*?)>([\s\S]*?)<\/button>/gi)].forEach((match) => {
      const tag = `<button${match[1]}>`;
      const name =
        stripTags(match[2]) ||
        attrValue(tag, "aria-label") ||
        attrValue(tag, "title");
      if (!name) unnamedButtons.push(tag.replace(/\s+/g, " ").slice(0, 120));
    });
    if (unnamedButtons.length) {
      fail(`${file} buttons without accessible names: ${unnamedButtons.join(" | ")}`);
    }

    const imagesWithoutAlt = [...html.matchAll(/<img\b[^>]*>/gi)]
      .map((match) => match[0])
      .filter((tag) => !/\salt=(["']).*?\1/i.test(tag));
    if (imagesWithoutAlt.length) {
      fail(
        `${file} images without alt text: ` +
        imagesWithoutAlt.map((tag) => tag.slice(0, 120)).join(" | "),
      );
    }
  });

  console.log("accessibility basics ok");
}

function collectGlobalCallables() {
  const callables = new Set();
  walk("js")
    .filter((file) => file.endsWith(".js") && !file.endsWith(".min.js"))
    .forEach((file) => {
      const source = read(file);
      [...source.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm)]
        .forEach((match) => callables.add(match[1]));
      [...source.matchAll(/\bwindow\.([A-Za-z_$][\w$]*)\s*=/g)]
        .forEach((match) => callables.add(match[1]));
    });
  return callables;
}

function checkDeclarativeHandlers() {
  const callables = collectGlobalCallables();
  const sourceFiles = [
    ...walk("js").filter(
      (file) => file.endsWith(".js") && !file.endsWith(".min.js"),
    ),
    "index.html",
  ];
  const handledActions = new Set();
  sourceFiles.forEach((file) => {
    const source = read(file);
    [...source.matchAll(/case\s+["']([^"']+)["']/g)]
      .forEach((match) => handledActions.add(match[1]));
    [...source.matchAll(/action\s*===\s*["']([^"']+)["']/g)]
      .forEach((match) => handledActions.add(match[1]));
    [...source.matchAll(/closest\(\s*["']\[data-action=["']([^"']+)["']\]["']\s*\)/g)]
      .forEach((match) => handledActions.add(match[1]));
  });
  const missing = [];
  const handlerPattern =
    /\bdata-(onchange|oninput)=(["'])((?:[A-Za-z_$][\w$]*)(?:\s*;\s*[A-Za-z_$][\w$]*)*)\2/g;
  const actionPattern = /\bdata-action=(["'])([A-Za-z_$][\w$]*)\1/g;

  sourceFiles.forEach((file) => {
    const source = read(file);
    [...source.matchAll(handlerPattern)].forEach((match) => {
      match[3].split(";").map((name) => name.trim()).forEach((name) => {
        if (!callables.has(name)) missing.push(`${file}: data-${match[1]}="${name}"`);
      });
    });

    [...source.matchAll(actionPattern)].forEach((match) => {
      const action = match[2];
      if (action === "fnName") return;
      const overlayAction = action.endsWith("Overlay")
        ? action.slice(0, -"Overlay".length)
        : "";
      if (
        !callables.has(action) &&
        !handledActions.has(action) &&
        !(overlayAction && callables.has(overlayAction))
      ) {
        missing.push(`${file}: data-action="${action}"`);
      }
    });
  });

  const combinedSource = sourceFiles.map((file) => read(file)).join("\n");
  ["dblaction", "drag", "drop"].forEach((attribute) => {
    const values = new Set();
    const valuePattern = new RegExp(
      `\\bdata-${attribute}=(["'])([A-Za-z_$][\\w$-]*)\\1`,
      "g",
    );
    sourceFiles.forEach((file) => {
      [...read(file).matchAll(valuePattern)]
        .forEach((match) => values.add(match[2]));
    });

    const handled = new Set();
    const datasetPattern = new RegExp(
      `dataset\\.${attribute}\\s*(?:===|!==)\\s*["']([^"']+)["']`,
      "g",
    );
    const selectorPattern = new RegExp(
      `\\[data-${attribute}=["']([^"']+)["']\\]`,
      "g",
    );
    [...combinedSource.matchAll(datasetPattern)]
      .forEach((match) => handled.add(match[1]));
    [...combinedSource.matchAll(selectorPattern)]
      .forEach((match) => handled.add(match[1]));
    if (attribute === "dblaction") {
      handledActions.forEach((action) => handled.add(action));
    }

    [...values].forEach((value) => {
      if (!handled.has(value)) {
        missing.push(`data-${attribute}="${value}" has no delegated handler`);
      }
    });
  });

  if (missing.length) {
    fail(`declarative handlers missing global dispatch targets: ${unique(missing).join(" | ")}`);
  }
  console.log("declarative handlers ok");
}

function checkStorageKeyUsage() {
  const violations = [];
  walk("js")
    .filter((file) => file.endsWith(".js") && !file.endsWith(".min.js"))
    .forEach((file) => {
      const source = read(file);
      [...source.matchAll(/storageManager\.(?:get|set|remove)\(\s*(["'])([^"']+)\1/g)]
        .forEach((match) => {
          const line = source.slice(0, match.index).split("\n").length;
          violations.push(`${file}:${line} (${match[2]})`);
        });
    });
  if (violations.length) {
    fail(`literal storageManager keys bypass STORAGE_KEYS: ${violations.join(", ")}`);
  }

  const cloudSync = read("js/cloud-sync.js");
  if (!cloudSync.includes("STORAGE_KEYS.GAME_PLAN_SNAPSHOTS")) {
    fail("cloud sync omits saved game plan snapshots");
  }
  if (
    !/function formatDiagramSyncSummary\(result\)/.test(cloudSync) ||
    !/function formatDiagramSyncDetails\(result\)/.test(cloudSync) ||
    !/diagramSyncResult = await window\.playImages\.syncToRemote\(_playsRef\)/.test(cloudSync) ||
    !/Publish Status/.test(cloudSync) ||
    !/Publish Team Update/.test(cloudSync) ||
    !/Update This Device/.test(cloudSync)
  ) {
    fail("cloud sync push does not wait for and report diagram sync results");
  }
  if (/Push Everything/.test(cloudSync) || /Pull replaces this device/.test(cloudSync)) {
    fail("cloud sync modal still uses backup-style push/pull copy");
  }
  console.log("storage key usage ok");
}

function extractFunctionSource(source, functionName) {
  const start = source.indexOf(`function ${functionName}(`);
  if (start < 0) return "";
  let bodyStart = -1;
  let parenDepth = 0;
  for (let index = source.indexOf("(", start); index < source.length; index += 1) {
    const ch = source[index];
    if (ch === "(") parenDepth += 1;
    else if (ch === ")") parenDepth -= 1;
    else if (ch === "{" && parenDepth === 0) {
      bodyStart = index;
      break;
    }
  }
  if (bodyStart < 0) return "";
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return "";
}

function checkMigrationRetry() {
  const source = extractFunctionSource(read("js/storage.js"), "runMigrations");
  if (!source) {
    fail("runMigrations function not found");
    return;
  }

  const values = new Map([["_storageVersion", "0"]]);
  const localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
  let shouldFail = true;
  const migrations = {
    2: () => {
      if (shouldFail) throw new Error("expected migration failure");
    },
  };
  const build = new Function(
    "localStorage",
    "MIGRATIONS",
    "STORAGE_VERSION",
    `${source}; return runMigrations;`,
  );
  const run = build(localStorage, migrations, 3);
  const originalConsoleError = console.error;
  console.error = () => { };
  const failed = run();
  console.error = originalConsoleError;
  if (failed !== false || values.get("_storageVersion") !== "1") {
    fail("failed migrations advance the stored schema version");
    return;
  }

  shouldFail = false;
  const retried = run();
  if (retried !== true || values.get("_storageVersion") !== "3") {
    fail("failed migrations are not retried from the last successful version");
    return;
  }
  console.log("migration retry behavior ok");
}

function checkSafeUiRendering() {
  const utils = read("js/utils.js");
  const domHelpers = read("js/dom-helpers.js");
  if (/toast\.innerHTML\s*=\s*message/.test(utils)) {
    fail("showToast renders caller messages as raw HTML");
  }
  const formatter = utils.match(
    /function formatModalMessage\([^)]*\)\s*\{([\s\S]*?)\n\}/,
  )?.[1] || "";
  if (!/sanitizeHTML\(/.test(formatter)) {
    fail("modal message rendering does not sanitize rich text");
  }
  const dangerousTags = domHelpers.match(
    /const DANGEROUS_TAGS\s*=\s*new Set\(\[([\s\S]*?)\]\)/,
  )?.[1] || "";
  if (/"button"/.test(dangerousTags)) {
    fail("sanitized internal templates strip delegated buttons");
  }
  if (!/name\.startsWith\("on"\)/.test(domHelpers)) {
    fail("sanitized internal templates do not strip inline handlers");
  }
  ["autoplay", "controls", "loop", "muted", "playsinline", "preload"].forEach((attr) => {
    if (!new RegExp(`"${attr}"`).test(domHelpers)) {
      fail(`sanitized internal media templates strip ${attr}`);
    }
  });
  console.log("shared UI rendering safety ok");
}

function checkHistoryContracts() {
  const scriptStorage = read("js/script-storage.js");
  const callsheet = read("js/callsheet.js");
  if (/debouncedSaveScriptState/.test(scriptStorage + read("js/script-render.js"))) {
    fail("script edits still save history after mutation through debouncedSaveScriptState");
  }
  if (!/historyManager\.saveState\("callsheet",\s*callSheetHistoryBaseline\)/.test(callsheet)) {
    fail("call sheet history does not preserve the pre-mutation baseline");
  }
  console.log("history contracts ok");
}

function checkConflictContracts() {
  const utils = read("js/utils.js");
  const scriptRender = read("js/script-render.js");
  const scriptVision = read("js/script-vision.js");
  const callSheet = read("js/callsheet.js");
  const callSheetDrawer = read("js/callsheet-gameplan-drawer.js");
  const gameplan = read("js/gameplan.js");
  const dashboard = read("js/dashboard.js");
  const tendencies = read("js/tendencies.js");
  const printStudio = read("js/print-studio.js");
  const storage = read("js/storage.js");
  const appEvents = read("js/app-events.js");
  const gameplanActions = read("js/gameplan-actions.js");
  const playbookActions = read("js/playbook-actions.js");
  const constraints = read("js/constraints.js");

  if (
    /window\.script\b/.test(scriptVision) ||
    /window\.renderScript\s*=/.test(scriptVision)
  ) {
    fail("script vision reads lexical state through window or replaces renderScript");
  }
  if (!/renderScriptVisionPanel\(\)/.test(scriptRender)) {
    fail("script rendering does not explicitly refresh the Vision panel");
  }
  if (
    /window\.renderCallSheet\s*=/.test(callSheetDrawer) ||
    !/refreshCallSheetGamePlanDrawer\(\)/.test(callSheet)
  ) {
    fail("call sheet drawer still replaces the shared render function");
  }
  if (
    !/addEventListener\("dragend"[\s\S]*?_pbSortDragEnd\(e\)/.test(
      appEvents,
    )
  ) {
    fail("playbook print sorting does not clean up canceled drags");
  }
  if (
    /function (?:addGamePlanCustomBox|renameGamePlanBox)\(/.test(
      gameplanActions,
    ) ||
    /function startInlineEdit\(/.test(playbookActions) ||
    /function _renderTouchDistribution\(/.test(constraints) ||
    /function saveTemplate\(/.test(callSheet)
  ) {
    fail("superseded call sheet, game plan, playbook, or constraint handlers remain");
  }

  const splitCoverageSource = extractFunctionSource(
    utils,
    "splitCoverageValues",
  );
  if (!splitCoverageSource) {
    fail("shared coverage splitting helper is missing");
  } else {
    const splitCoverageValues = new Function(
      `${splitCoverageSource}; return splitCoverageValues;`,
    )();
    const values = splitCoverageValues("Cov 0/1, Tampa 2");
    if (
      !values.includes("cover 0") ||
      !values.includes("cover 1") ||
      !values.includes("tampa 2")
    ) {
      fail("combined coverage labels do not expand consistently");
    }
  }
  if (
    !/splitCoverageValues\(play\.practiceCoverage\)/.test(callSheet) ||
    !/splitCoverageValues\(play\.practiceCoverage\)/.test(gameplan)
  ) {
    fail("game plan and call sheet do not share coverage splitting");
  }

  const resolveSource = extractFunctionSource(
    utils,
    "resolveGameWeekOpponent",
  );
  if (!resolveSource) {
    fail("game-week opponent resolver is missing");
  } else {
    const resolveGameWeekOpponent = new Function(
      `${resolveSource}; return resolveGameWeekOpponent;`,
    )();
    const opponents = [{ name: "Alpha" }, { name: "Bravo" }];
    const resolved = resolveGameWeekOpponent(opponents, {
      opponentName: "Bravo",
      opponentIndex: 0,
    });
    if (resolved.index !== 1 || resolved.opponent !== opponents[1]) {
      fail("game-week resolution trusts a stale opponent index over its name");
    }
  }
  if (
    !/ensureTendenciesOpponent\(game\.opponent\)/.test(dashboard) ||
    !/function ensureTendenciesOpponent\(/.test(tendencies) ||
    !/function ensureTendenciesOpponent\([\s\S]*?STORAGE_KEYS\.DEFENSIVE_TENDENCIES/.test(
      tendencies,
    ) ||
    !/resolveGameWeekOpponent\(tendenciesOpponents, gw\)/.test(printStudio)
  ) {
    fail("opponent creation or consumers bypass the shared live-state resolver");
  }
  if (
    !/normalizeCallSheetSettings\(css\)/.test(storage) ||
    !/rebuildCallSheetCategoryRegistry\(\)/.test(storage) ||
    !/normalizeCallSheetCategoryOrder\(/.test(storage)
  ) {
    fail("storage reload does not rebuild normalized call sheet runtime state");
  }

  console.log("cross-module conflict contracts ok");
}

function checkPlayCompareKeyContracts() {
  const utils = read("js/utils.js");
  const callSheet = read("js/callsheet.js");
  const playbookAnalytics = read("js/playbook-analytics.js");
  const playbookSanitize = read("js/playbook-sanitize.js");
  const playbookCss = read("css/playbook.css");
  const playbookFilters = read("js/playbook-filters.js");
  const scriptStorage = read("js/script-storage.js");
  const scriptIntegrations = read("js/script-integrations.js");
  const gameplan = read("js/gameplan.js");

  const fieldsSource = utils.match(/const PLAY_IDENTITY_FIELDS = \{[\s\S]*?\n\};/)?.[0];
  const requiredFns = [
    "normalizePlayCompareValue",
    "normalizePlayCompareKey",
    "normalizePlayIdentityValue",
    "getPlayIdentityKey",
    "getPlayCompareKey",
    "playsHaveSameIdentity",
    "playsHaveSameCompareKey",
    "playsMatch",
  ];
  const sources = requiredFns.map((name) => extractFunctionSource(utils, name));
  if (!fieldsSource || sources.some((source) => !source)) {
    fail("canonical play compare helpers are missing from utils.js");
    return;
  }

  const api = new Function(
    `${fieldsSource}\n${sources.join("\n")}\nreturn { normalizePlayCompareValue, normalizePlayCompareKey, getPlayIdentityKey, getPlayCompareKey, playsHaveSameCompareKey, playsMatch };`,
  )();
  const a = { type: "Run", personnel: "11", formation: "Tríps-Right", play: "Buck Sweep" };
  const b = { type: "run", personnel: "11", formation: "tripsright", play: "buck-sweep" };
  if (api.normalizePlayCompareValue("Tríps-Right") !== "tripsright") {
    fail("canonical compare value does not strip accents/case/punctuation");
  }
  if (api.normalizePlayCompareKey("Run|11|Tríps-Right") !== "run|11|tripsright") {
    fail("canonical compare key does not preserve field boundaries");
  }
  if (api.getPlayIdentityKey(a, "name", { trim: false }) === api.getPlayIdentityKey(b, "name", { trim: false })) {
    fail("stored play identity keys should remain human-readable/exact");
  }
  if (!api.playsHaveSameCompareKey(a, b, "name") || !api.playsMatch(a, b)) {
    fail("playsMatch does not use canonical compare keys");
  }

  if (
    !/function csPlayKey\(play\)[\s\S]*getPlayCompareKey\(play, "core"\)/.test(callSheet) ||
    !/function _pbHealthExactKey\(play\)[\s\S]*getPlayCompareKey\(play, "tag"\)/.test(playbookAnalytics) ||
    !/function _pbHealthNorm\(value\)[\s\S]*normalizePlayCompareValue\(value, \{ spaced: true \}\)/.test(playbookAnalytics) ||
    !/function _sanitizeComparableValue\(value\)[\s\S]*normalizePlayCompareValue\(value, \{ spaced: true \}\)/.test(playbookSanitize) ||
    !/ccore:\$\{getPlayCompareKey\(play, "core"\)\}/.test(playbookFilters) ||
    !/const compareName = getPlayCompareKey\(play, "name"\);[\s\S]*keys\.push\(`cname:\$\{compareName\}`\)/.test(scriptStorage) ||
    !/getPlayCompareKey\(play, SCRIPT_WRISTBAND_IDENTITY_FIELDS\)/.test(scriptIntegrations) ||
    !/getPlayCompareKey\(play, "core"\)/.test(gameplan)
  ) {
    fail("canonical compare keys are not wired through duplicate/matching surfaces");
  }
  if (
    !/function _sanitizeStandardizeGroups\(def, entries\)[\s\S]*_sanitizeStandardizeCompare\(value\)/.test(playbookSanitize) ||
    !/variants\.length > 1 && group\.changeCount > 0/.test(playbookSanitize) ||
    !/function _renderSanitizeStandardizePanel\(def, entries\)[\s\S]*Standardize \$\{escapeHtml\(def\.label\)\}/.test(playbookSanitize) ||
    !/data-action="applySanitizeStandardizeGroup"/.test(playbookSanitize) ||
    !/async function applySanitizeStandardizeGroup\(indexStr\)[\s\S]*showConfirm\([\s\S]*Apply Standard[\s\S]*storageManager\.setPlaybook\(plays\)/.test(playbookSanitize) ||
    !/\.pb-sanitize-standardize-panel/.test(playbookCss) ||
    !/\.pb-sanitize-standardize-row[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(230px,\s*0\.62fr\)/.test(playbookCss)
  ) {
    fail("playbook cleanup field standardization is incomplete");
  }

  console.log("play compare key contracts ok");
}

function checkUppercaseCallRenderingContracts() {
  const utils = read("js/utils.js");
  const index = read("index.html");
  const scriptDisplay = read("js/script-display-options.js");
  const scriptShared = read("js/script-shared.js");
  const playbookPrint = read("js/playbook-print.js");
  const wristbandRender = read("js/wristband-render.js");
  const wristbandStorage = read("js/wristband-storage.js");
  const wristband = read("js/wristband.js");
  const callSheet = read("js/callsheet.js");
  const callSheetRender = read("js/callsheet-render.js");
  const callSheetDisplay = read("js/callsheet-display.js");
  const roadmap = read("CONSOLIDATED_ROADMAP.md");

  if (
    !/function shouldForceUppercaseCall\(options = \{\}\)/.test(utils) ||
    !/function formatPlayCallText\(value, options = \{\}\)[\s\S]*text\.toUpperCase\(\)/.test(utils) ||
    !/function transformHtmlTextSegments\(html, transform\)/.test(utils) ||
    !/function transformPlayCallHtml\(html, options = \{\}\)[\s\S]*text\.toUpperCase\(\)/.test(utils) ||
    !/forceUppercase = false/.test(utils)
  ) {
    fail("shared uppercase call rendering helpers are missing");
  }

  [
    "pbForceUppercase",
    "wbForceUppercase",
    "callsheetForceUppercase",
    "scriptForceUppercase",
  ].forEach((id) => {
    if (!new RegExp(`id="${id}"`).test(index)) {
      fail(`missing uppercase display checkbox ${id}`);
    }
  });

  if (
    !/"scriptForceUppercase"/.test(scriptDisplay) ||
    !/forceUppercase:[\s\S]*scriptForceUppercase/.test(scriptDisplay) ||
    !/formatPlayCallText\(oneWordCall, options\)/.test(scriptShared) ||
    !/forceUppercase:[\s\S]*pbForceUppercase/.test(playbookPrint) ||
    !/\["wbForceUppercase", "pbForceUppercase"\]/.test(playbookPrint) ||
    !/forceUppercase:[\s\S]*wbForceUppercase/.test(wristbandRender) ||
    !/setCheckbox\("wbForceUppercase", displaySettings\.forceUppercase\)/.test(wristbandStorage) ||
    !/"wbForceUppercase"/.test(wristband) ||
    !/formatPlayCallText\(value, textOptions\)/.test(wristband) ||
    !/formatPlayCallText\(text, options\)/.test(callSheet) ||
    !/"callsheetForceUppercase"/.test(callSheetRender) ||
    !/forceUppercase:[\s\S]*callsheetForceUppercase/.test(callSheetRender) ||
    !/"callsheetForceUppercase"/.test(callSheetDisplay)
  ) {
    fail("uppercase call rendering is not wired through all display surfaces");
  }

  if (!/- \[x\] Add an optional display setting for uppercase call rendering/.test(roadmap)) {
    fail("roadmap does not mark uppercase call rendering complete");
  }

  console.log("uppercase call rendering contracts ok");
}

function checkWristbandTypography() {
  const css = read("css/wristband.css");
  const printCss = read("css/print.css");
  const responsiveCss = read("css/responsive.css");
  const cellPlay = css.match(
    /\.wristband-cell \.cell-play\s*\{([\s\S]*?)\n\}/,
  )?.[1] || "";
  if (!/font-weight:\s*500/.test(cellPlay)) {
    fail("wristband play calls still use blanket bold typography");
  }
  if (!/font-size:\s*var\(--font-size-xs\)/.test(cellPlay)) {
    fail("wristband play calls do not use the larger readable screen size");
  }
  if (!/\.wristband-play-name\s*\{[\s\S]*?font-weight:\s*600/.test(css)) {
    fail("wristband play names do not have restrained semantic emphasis");
  }
  if (!/\.wristband-print \.wristband-cell[\s\S]*?font-family:\s*var\(--font-sans\)/.test(printCss)) {
    fail("printed wristbands do not use the readable sans-serif font");
  }
  if (
    /\.wristband-cell \.cell-play\s*\{[\s\S]*?font-size:\s*var\(--font-size-3xs\)/.test(
      responsiveCss,
    )
  ) {
    fail("responsive wristband styles shrink play calls below the readable size");
  }
  console.log("wristband typography ok");
}

function checkPersonnelMarkerContracts() {
  const utils = read("js/utils.js");
  const callsheet = read("js/callsheet.js");
  const wristband = read("js/wristband.js");
  const scriptShared = read("js/script-shared.js");
  const gameplanRender = read("js/gameplan-render.js");
  const gameplanPrint = read("js/gameplan-print.js");
  const html = read("index.html");
  const help = read("js/help.js");

  if (
    !/meat:\s*"🥩"/.test(utils) ||
    !/function getPersonnelEmoji\(personnel, useSquares = false\)/.test(utils)
  ) {
    fail("shared personnel emoji markers do not include Meat steak");
  }
  if (
    !/meat:\s*"🥩"/.test(callsheet) ||
    !/meat:\s*"#7f1d1d"/.test(callsheet)
  ) {
    fail("call sheet personnel code/color helpers do not include Meat steak");
  }
  if (
    !/getPersonnelEmoji\(play\.personnel, useSquares\)/.test(wristband) ||
    !/getPersonnelEmoji\(displayPlay\.personnel, options\.useSquares\)/.test(
      scriptShared,
    ) ||
    !/getFullCall\(play, \{ showLineCall: false, showEmoji: true \}\)/.test(
      gameplanRender,
    ) ||
    !/getFullCall\(play, \{ showLineCall: false, showEmoji: o\.showMeta, useSquares: true \}\)/.test(
      gameplanPrint,
    )
  ) {
    fail("Meat personnel marker is not wired through wristband, script, and game plan calls");
  }
  if (!/Meat uses\s*🥩/.test(html) || !/Meat uses steak/.test(help)) {
    fail("personnel marker help copy does not document Meat steak");
  }

  console.log("personnel marker contracts ok");
}

function checkPlayPresentationContracts() {
  const html = read("index.html");
  const utils = read("js/utils.js");
  const presenter = read("js/play-presentation.js");
  const playImages = read("js/play-images.js");
  const playbookRender = read("js/playbook-render.js");
  const playbookEditor = read("js/playbook-editor.js");
  const scriptRender = read("js/script-render.js");
  const scriptAdd = read("js/script-add.js");
  const scriptIntegrations = read("js/script-integrations.js");
  const gameplanIntegrations = read("js/gameplan-integrations.js");
  const wristbandChrome = read("js/wristband-chrome.js");
  const scriptExport = read("js/script-export.js");
  const gameplanPrint = read("js/gameplan-print.js");
  const domHelpers = read("js/dom-helpers.js");
  const appEvents = read("js/app-events.js");
  const auth = read("js/auth.js");
  const css = read("css/play-presentation.css");
  const componentsCss = read("css/components.css");
  const sw = read("sw.js");

  if (
    !/id="playPresentationOverlay"/.test(html) ||
    !/data-presentation-mode="minimum"/.test(html) ||
    !/data-presentation-mode="player"/.test(html) ||
    !/data-presentation-mode="coaches"/.test(html) ||
    !/data-action="openSelectedPlaybookPresentation"/.test(html) ||
    !/data-action="openScriptPresentation"/.test(html)
  ) {
    fail("shared play presentation shell or launch controls are incomplete");
  }
  if (
    !/function getPlayPresentationItemsFromPlaybook\(/.test(presenter) ||
    !/function getPlayPresentationItemsFromScript\(/.test(presenter) ||
    !/function openPlaybookPresentation\(/.test(presenter) ||
    !/function openScriptPresentation\(/.test(presenter) ||
    !/function setPlayPresentationOverlayOpen\(overlay, open\)/.test(presenter) ||
    !/function ensurePlayPresentationOverlayDisplayed\(overlay, phase = "open"\)/.test(
      presenter,
    ) ||
    !/function tracePlayPresentationAction\(/.test(presenter) ||
    !/function renderPlayPresentation\(/.test(presenter)
  ) {
    fail("play presentation source adapters or shared renderer are incomplete");
  }
  if (
    /window\.script\b/.test(presenter) ||
    !/await window\.ensurePlayImageUrl\(play\)/.test(presenter) ||
    !/function getPlayPresentationContentBounds\(image\)/.test(presenter) ||
    !/function getPlayPresentationAspectCrop\(/.test(presenter) ||
    !/PLAY_PRESENTATION_MAX_RENDER_PIXELS/.test(presenter) ||
    !/context\.imageSmoothingQuality = "high"/.test(presenter) ||
    !/new ResizeObserver\(/.test(presenter) ||
    !/canvas\.dataset\.smartFit/.test(presenter) ||
    !/playPresentationDiagramSizeKey/.test(presenter) ||
    !/getFrameSizeKey\(\) === playPresentationDiagramSizeKey/.test(presenter) ||
    !/requestFullscreen/.test(presenter) ||
    /screen\.orientation\.(lock|unlock)/.test(presenter) ||
    !/function syncPlayPresentationMobileLandscape\(/.test(presenter) ||
    !/let playPresentationViewportSyncFrame = 0/.test(presenter) ||
    !/let playPresentationViewportKey = ""/.test(presenter) ||
    !/function isPlayPresentationOverlayVisible\(overlay\)/.test(presenter) ||
    !/function handlePlayPresentationTouchStart\(/.test(presenter) ||
    !/function handlePlayPresentationTouchEnd\(/.test(presenter) ||
    !/PLAY_PRESENTATION_SWIPE_MIN_DISTANCE/.test(presenter) ||
    !/reason: "no-script-items"/.test(presenter) ||
    !/reason: !overlay \? "overlay-missing" : "no-items"/.test(presenter) ||
    !/return true;/.test(presenter) ||
    !/requestAnimationFrame\(\(\) => \{[\s\S]*syncPlayPresentationMobileLandscape\(\);[\s\S]*syncPlayPresentationHeaderOffset\(\);/.test(
      presenter,
    ) ||
    !/cancelAnimationFrame\(playPresentationViewportSyncFrame\)/.test(
      presenter,
    ) ||
    !/window\.visualViewport\?\.addEventListener\([\s\S]*"resize",[\s\S]*queuePlayPresentationViewportSync[\s\S]*\{\s*passive:\s*true\s*\}/.test(
      presenter,
    ) ||
    !/overlay\.style\.setProperty\("display", "flex", "important"\)/.test(
      presenter,
    ) ||
    !/overlay\.classList\.toggle\("is-open", open\)/.test(presenter) ||
    !/overlay\.dataset\.presentationOpen = open \? "true" : "false"/.test(
      presenter,
    ) ||
    !/setInnerHTML\(body, markup\)/.test(presenter)
  ) {
    fail("play presentation image, landscape, safety, or lexical-state contracts are incomplete");
  }
  if (
    !/data-action="openPlaybookPresentation"/.test(playbookRender) ||
    !/data-action="openScriptPresentation"/.test(scriptRender) ||
    !/case "openScriptPresentation"/.test(appEvents) ||
    !/function _getPlaybookActionIndex\(el\)/.test(appEvents) ||
    !/openPlaybookPresentation\(_getPlaybookActionIndex\(presentBtn\)\)/.test(appEvents)
  ) {
    fail("playbook or script presentation row actions are not delegated correctly");
  }
  [
    "openSelectedPlaybookPresentation",
    "openPlaybookPresentation",
    "openScriptPresentation",
    "setPlayPresentationMode",
    "setPlayPresentationPosition",
    "togglePlayPresentationPositionLock",
    "movePlayPresentation",
  ].forEach((action) => {
    if (!new RegExp(`["']${action}["']`).test(auth)) {
      fail(`read-only roles cannot use play presentation action ${action}`);
    }
  });
  if (
    !/function signaturesForPlay\(play\)/.test(playImages) ||
    !/function displaySignaturesForPlay\(play\)/.test(playImages) ||
    !/function _sourceIdentityKeyForPlay\(play\)/.test(playImages) ||
    !/function _legacyRemoteIdentityKey\(play\)/.test(playImages) ||
    !/async function buildPlayDiagramHealthReport\(\)/.test(playImages) ||
    !/window\.openPlayDiagramHealth/.test(playImages) ||
    !/window\.openPlayDiagramHealthEdit/.test(playImages) ||
    !/data-action="openPlayDiagramHealth"/.test(html) ||
    !/PLAY_IMAGE_SOURCE_FIELDS/.test(playImages) ||
    !/play\.playbookId/.test(playImages) ||
    !/getPlayIdentityKey\(sourcePlay, "tag"\)/.test(playImages) ||
    !/async function ensureUrlForPlay\(play\)/.test(playImages) ||
    !/async function ensureDisplayUrlForPlay\(play\)/.test(playImages) ||
    !/function storedSignatureForPlay\(play\)/.test(playImages) ||
    !/function storedDisplaySignatureForPlay\(play\)/.test(playImages) ||
    !/return ensureDisplayUrlForPlay\(play\)/.test(playImages) ||
    !/function getStablePlaySourceId\(play\)/.test(utils) ||
    !/function copyPlayWithSourceIdentity\(play, overrides = \{\}\)/.test(utils) ||
    !/copyPlayWithSourceIdentity\(play, scriptFields\)/.test(scriptAdd) ||
    !/copyPlayWithSourceIdentity\(p, \{ _gpSource: true/.test(
      scriptIntegrations,
    ) ||
    !/copyPlayWithSourceIdentity\(p, \{ _gpSource: true/.test(
      gameplanIntegrations,
    ) ||
    !/copyPlayWithSourceIdentity\(p, \{[\s\S]*?_gpSource:/.test(
      wristbandChrome,
    ) ||
    !/playbookId: play\.playbookId \|\| play\.sourcePlayId \|\| play\.id/.test(
      scriptAdd,
    ) ||
    !/window\.playImages\.storedDisplaySignatureForPlay\(play\)/.test(
      playbookRender,
    ) ||
    !/window\.deletePlayImage\(play\)/.test(playbookEditor) ||
    !/getPlayImageUrl\(item\)/.test(scriptExport) ||
    !/getPlayImageUrl\(play\)/.test(gameplanPrint)
  ) {
    fail("play image compatibility resolution is incomplete across presentation surfaces");
  }
  if (
    !/opts\.maxDim \|\| 2400/.test(playImages) ||
    !/file\.type === "image\/png"/.test(playImages) ||
    !/"image\/webp"/.test(playImages) ||
    !/ctx\.imageSmoothingQuality = "high"/.test(playImages) ||
    !/maxDim: 2400/.test(playbookEditor) ||
    !/quality: 0\.92/.test(playbookEditor) ||
    /900px JPEG/.test(playbookEditor)
  ) {
    fail("presentation-grade play image optimization contracts are incomplete");
  }
  if (
    !/async function _putRemoteImage\(identityKey, blob\)/.test(playImages) ||
    !/function _remoteIdentityKeysForPlay\(play\)[\s\S]*_remoteIdentityKey\(play\),[\s\S]*_legacyRemoteIdentityKey\(play\),/.test(playImages) ||
    !/const identityKeys = _remoteIdentityKeysForPlay\(play\)/.test(playImages) ||
    !/_isSourceIdentityKey\(localSig\)/.test(playImages) ||
    !/"X-BC-Auth-Mode": "json"/.test(playImages) ||
    !/credentials: "same-origin"/.test(playImages) ||
    !/const result = \{[\s\S]*pushed: 0,[\s\S]*failed: 0,[\s\S]*errors: \[\]/.test(playImages) ||
    !/cloud upload failed/.test(playbookEditor)
  ) {
    fail("play diagram cloud sync diagnostics are incomplete");
  }
  if (
    !/positionLocked:\s*false/.test(presenter) ||
    !/function togglePlayPresentationPositionLock\(\)/.test(presenter) ||
    !/function syncPlayPresentationPlayerPosition\(item\)/.test(presenter) ||
    !/function getPreferredPlayPresentationPosition\(play\)/.test(presenter) ||
    !/function hydratePlayPresentationPlayerControls\(\)/.test(presenter) ||
    !/document\.createElement\("button"\)/.test(presenter) ||
    !/button\.dataset\.action = "setPlayPresentationPosition"/.test(
      presenter,
    ) ||
    !/lockButton\.dataset\.action = "togglePlayPresentationPositionLock"/.test(
      presenter,
    ) ||
    !/event\.key\.toLowerCase\(\) === "l"/.test(presenter) ||
    !/\.pp-position-lock-btn/.test(css) ||
    !/["']togglePlayPresentationPositionLock["']/.test(auth)
  ) {
    fail("player presentation position-lock contracts are incomplete");
  }
  if (
    !/function getPlayPresentationCoachSection\(title, subtitle, rows, className\)/.test(
      presenter,
    ) ||
    !/function getPlayPresentationCoachNotesMarkup\(play\)/.test(presenter) ||
    !/pp-coach-section-call/.test(presenter) ||
    !/pp-coach-section-situation/.test(presenter) ||
    !/pp-coach-section-defense/.test(presenter) ||
    !/pp-coach-section-tools/.test(presenter) ||
    !/pp-coach-section-rules/.test(presenter) ||
    !/pp-coach-note-list/.test(presenter) ||
    !/\.pp-coach-section\b/.test(css) ||
    !/\.pp-coach-section-head/.test(css) ||
    !/\.pp-coach-note-card/.test(css)
  ) {
    fail("coach presentation sections are not separated into digestible panels");
  }
  if (
    !/function getAllowedPlayPresentationModes\(\)/.test(presenter) ||
    !/function syncPlayPresentationRoleUi\(\)/.test(presenter) ||
    !/1 Minimum · 2 Plays/.test(presenter) ||
    !/data-presentation-mode="coaches"[^>]*data-auth-player-hide="true"/.test(
      html,
    ) ||
    !/id="playPresentationFooterHint"/.test(html)
  ) {
    fail("player presentation role limits are incomplete");
  }
  if (
    !/function openLayer\(layer, options = \{\}\)/.test(domHelpers) ||
    !/function closeLayer\(layer, options = \{\}\)/.test(domHelpers) ||
    !/classList\.add\("app-layer-locked"\)/.test(domHelpers) ||
    !/document\.addEventListener\("touchmove", appLayerTouchMoveHandler,[\s\S]*passive:\s*false/.test(
      domHelpers,
    ) ||
    !/body\.app-layer-locked/.test(componentsCss) ||
    !/\.app-layer-safe-area/.test(componentsCss) ||
    !/openLayer\(overlay,[\s\S]*id:\s*"play-presentation"/.test(
      presenter,
    ) ||
    !/queueMobileShellMeasuredSync\(\);[\s\S]*syncPlayPresentationMobileLandscape\(\)/.test(
      presenter,
    ) ||
    !/document\.body\.classList\.remove\("play-presentation-open"\);[\s\S]*queueMobileShellMeasuredSync\(\);/.test(
      presenter,
    ) ||
    !/closeLayer\("play-presentation",\s*\{\s*returnFocus:\s*false\s*\}\)/.test(
      presenter,
    )
  ) {
    fail("shared layer body-lock contract is incomplete");
  }
  if (
    !/\.play-presentation-overlay:fullscreen/.test(css) ||
    !/\.play-presentation-overlay\.show,\s*\.play-presentation-overlay\.is-open,\s*\.play-presentation-overlay\[data-presentation-open="true"\]/.test(
      css,
    ) ||
    /body\.play-presentation-force-landscape/.test(css) ||
    /\.play-presentation-overlay\.pp-force-landscape/.test(css) ||
    /rotate\(90deg\)/.test(css) ||
    !/body\.play-presentation-mobile\.is-landscape-screen \.pp-layout-minimum/.test(css) ||
    !/@media \(orientation: portrait\)/.test(css) ||
    !/\.pp-layout-minimum\s*\{[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\) auto/s.test(
      css,
    ) ||
    !/class="pp-minimum-top"/.test(presenter) ||
    !/class="pp-diagram-panel pp-minimum-diagram"/.test(presenter) ||
    !/class="pp-minimum-bottom"/.test(presenter) ||
    !/renderPlayReadinessPresentationMinimumDock\(play\)/.test(presenter) ||
    !/\.pp-layout-player/.test(css) ||
    !/\.pp-layout-coaches/.test(css) ||
    !/body\.play-presentation-mobile\.is-portrait-screen \.pp-body[\s\S]*overflow-y:\s*auto/.test(
      css,
    ) ||
    !/body\.play-presentation-mobile\.is-portrait-screen \.pp-layout-player[\s\S]*padding-bottom:\s*calc\(/.test(
      css,
    )
  ) {
    fail("play presentation landscape and information-mode styling is incomplete");
  }
  if (
    !/"\.\/css\/play-presentation\.css"/.test(sw) ||
    !/"\.\/js\/play-presentation\.js"/.test(sw)
  ) {
    fail("play presentation assets are missing from the service worker");
  }

  console.log("play presentation contracts ok");
}

function checkPlayIdentityHandoffFixtures() {
  const utils = read("js/utils.js");
  const callsheet = read("js/callsheet.js");
  const callsheetPicker = read("js/callsheet-picker-runtime.js");
  const callsheetSmart = read("js/callsheet-smart.js");
  const gameplanDnd = read("js/gameplan-dnd.js");
  const gameplanIntegrations = read("js/gameplan-integrations.js");
  const gameplanSmart = read("js/gameplan-smart.js");
  const gameplanRender = read("js/gameplan-render.js");
  const scriptExport = read("js/script-export.js");
  const scriptPeriodSync = read("js/script-period-sync.js");
  const scriptIntegrations = read("js/script-integrations.js");
  const scriptRender = read("js/script-render.js");
  const callsheetRender = read("js/callsheet-render.js");
  const wristbandRender = read("js/wristband-render.js");

  if (
    !/function getPlaySourceStatus\(play, list\)/.test(utils) ||
    !/function renderPlaySourceStatusBadge\(play, options = \{\}\)/.test(utils) ||
    !/function copyPlayForCallSheet\(play, overrides = \{\}\)/.test(callsheet) ||
    !/copyPlayWithSourceIdentity\(play, callSheetFields\)/.test(callsheet) ||
    !/copyPlayForCallSheet\(playData\)/.test(callsheetPicker) ||
    !/copyPlayForCallSheet\(play, \{ wristbandNumber/.test(callsheetPicker) ||
    !/copyPlayForCallSheet\(s\.play\)/.test(callsheetSmart) ||
    !/copyPlayForCallSheet\(play, \{ wristbandNumber: wb \}\)/.test(gameplanIntegrations) ||
    !/copyPlayForCallSheet\(play\)/.test(scriptPeriodSync) ||
    !/copyPlayWithSourceIdentity\(play\)/.test(gameplanDnd) ||
    !/copyPlayWithSourceIdentity\(play\)/.test(gameplanSmart) ||
    !/copyPlayWithSourceIdentity\(play, \{ id: Date\.now\(\) \+ Math\.random\(\) \}\)/.test(scriptExport) ||
    !/copyPlayWithSourceIdentity\(play\)/.test(scriptIntegrations)
  ) {
    fail("play identity helper is not used across the main handoff paths");
  }
  if (
    !/renderPlaySourceStatusBadge\(play\)/.test(scriptRender) ||
    !/renderPlaySourceStatusBadge\(play, \{ compact: true, className: "cs-source-status-badge" \}\)/.test(callsheetRender) ||
    !/renderPlaySourceStatusBadge\(play, \{ compact: true, className: "gp-source-status-badge" \}\)/.test(gameplanRender) ||
    !/renderPlaySourceStatusBadge\(.*?wb-source-status-badge/.test(wristbandRender)
  ) {
    fail("source play status badges are not rendered on downstream artifacts");
  }

  const getStableSource = extractFunctionSource(utils, "getStablePlaySourceId");
  const copySource = extractFunctionSource(utils, "copyPlayWithSourceIdentity");
  if (!getStableSource || !copySource) {
    fail("play identity helper sources are missing");
    return;
  }

  const getPlayIdentityKey = (play, mode) => {
    if (Array.isArray(mode)) {
      return mode.map((field) => String(play[field] || "").trim()).join("|");
    }
    if (mode === "gameplan") {
      return [
        play.type,
        play.personnel,
        play.formation,
        play.play,
        play.preferredDown,
        play.preferredDistance,
      ].map((value) => String(value || "").trim()).join("|");
    }
    return [play.personnel, play.formation, play.play]
      .map((value) => String(value || "").trim())
      .join("|");
  };
  const { copyPlayWithSourceIdentity } = new Function(
    "getPlayIdentityKey",
    `${getStableSource}\n${copySource}\nreturn { copyPlayWithSourceIdentity };`,
  )(getPlayIdentityKey);

  const playbookPlay = {
    id: "playbook-123",
    type: "Pass",
    personnel: "11",
    formation: "Right N Over",
    play: "Viper Sooners",
    preferredDown: "2",
    preferredDistance: "Medium",
  };
  const scriptPlay = copyPlayWithSourceIdentity(playbookPlay, { id: "script-runtime" });
  const wristbandPlay = copyPlayWithSourceIdentity(scriptPlay, { _scriptSource: true });
  const callSheetPlay = copyPlayWithSourceIdentity(wristbandPlay, {
    playType: wristbandPlay.type,
    wristbandNumber: 7,
  });
  const gamePlanPlay = copyPlayWithSourceIdentity(callSheetPlay, { _gpSource: true });
  const chain = [scriptPlay, wristbandPlay, callSheetPlay, gamePlanPlay];
  const expectedSourceIdentity = getPlayIdentityKey(playbookPlay, "tag");
  const expectedGamePlanIdentity = getPlayIdentityKey(playbookPlay, "gameplan");

  chain.forEach((play, index) => {
    if (
      play.playbookId !== playbookPlay.id ||
      play.sourcePlayId !== playbookPlay.id ||
      play.originalPlayId !== playbookPlay.id ||
      play.sourceIdentityKey !== expectedSourceIdentity ||
      play.sourceGamePlanKey !== expectedGamePlanIdentity
    ) {
      fail(`play identity round-trip drifted at handoff ${index + 1}`);
    }
  });

  const legacyCopy = copyPlayWithSourceIdentity(
    { id: "runtime-only", sourcePlayId: "source-abc", play: "Legacy" },
    { id: "next-runtime" },
  );
  if (
    legacyCopy.playbookId !== "source-abc" ||
    legacyCopy.sourcePlayId !== "source-abc" ||
    legacyCopy.originalPlayId !== "source-abc"
  ) {
    fail("legacy sourcePlayId is not preferred over runtime ids");
  }

  console.log("play identity handoff fixtures ok");
}

function checkScriptPlayerPublishingContracts() {
  const html = read("index.html");
  const scriptStorage = read("js/script-storage.js");
  const scriptPlayer = read("js/script-player.js");
  const scriptRender = read("js/script-render.js");
  const scriptDisplay = read("js/script-display-options.js");
  const presentation = read("js/play-presentation.js");
  const presentationCss = read("css/play-presentation.css");
  const appEvents = read("js/app-events.js");
  const auth = read("js/auth.js");
  const css = read("css/script.css");
  const playerScriptMetaBlock =
    scriptRender.match(
      /function getPlayerScriptMetaItems\([\s\S]*?\nfunction renderPlayerScriptPeriodHeader\(/,
    )?.[0] || "";
  const playerPresentationBlock =
    presentation.match(
      /function getPlayPresentationPlayerMarkup\([\s\S]*?\nfunction getPlayPresentationDetailRows\(/,
    )?.[0] || "";

  if (
    !/playerVisible:\s*false/.test(scriptStorage) ||
    !/function renderPlayerScriptLauncher\(\)/.test(scriptPlayer) ||
    !/function renderPlayerLoadedScriptBar\(\)/.test(scriptPlayer) ||
    !/function tracePlayerScriptAction\(/.test(scriptPlayer) ||
    !/function getDefaultPlayerPublishedScript\(/.test(scriptPlayer) ||
    !/function loadPublishedPlayerScript\(id,\s*opts = \{\}\)/.test(
      scriptPlayer,
    ) ||
    !/function presentPublishedPlayerScript\(id\)/.test(scriptPlayer) ||
    !/function openPlayerCurrentScriptPresentation\(id = ""\)/.test(
      scriptPlayer,
    ) ||
    !/function togglePlayerScriptAccess\(id,\s*event\)/.test(scriptPlayer) ||
    !/data-onchange="togglePlayerScriptAccess"/.test(scriptPlayer) ||
    !/data-action="loadPublishedPlayerScript"/.test(scriptPlayer) ||
    !/data-action="openPlayerCurrentScriptPresentation"/.test(scriptPlayer) ||
    !/data-action="openPlayerCurrentScriptPresentation"/.test(html) ||
    !/case "loadPublishedPlayerScript"/.test(appEvents) ||
    !/case "presentPublishedPlayerScript"/.test(appEvents) ||
    !/case "openPlayerCurrentScriptPresentation"/.test(appEvents)
  ) {
    fail("player script publishing runtime is incomplete");
  }
  if (
    !/const ACTION_TRACE_ACTIONS = new Set/.test(appEvents) ||
    !/function traceAppAction\(phase/.test(appEvents) ||
    !/missing action handler/.test(appEvents) ||
    !/action returned no-op/.test(appEvents) ||
    !/function getAppElementsFromPointDiagnostics\(x, y\)/.test(appEvents) ||
    !/function traceAppInputEvent\(phase, event\)/.test(appEvents) ||
    !/window\.bcDebugHitTest/.test(appEvents) ||
    !/window\.bcDebugScrollAncestry/.test(appEvents) ||
    !/auth blocked interaction/.test(auth) ||
    !/lookup miss/.test(scriptPlayer) ||
    !/load start/.test(scriptPlayer) ||
    !/current presentation fallback/.test(scriptPlayer) ||
    !/openScriptPresentation-returned-false/.test(scriptPlayer)
  ) {
    fail("player action diagnostics are incomplete");
  }
  if (
    !/id="playerScriptLauncherSection"/.test(html) ||
    !/id="playerScriptLauncherList"/.test(html) ||
    !/id="playerScriptNowBar"/.test(html) ||
    !/<div[^>]+class="[^"]*\bplay-list\b[^"]*"[^>]+data-auth-player-hide="true"/.test(html) ||
    !/id="mobileScriptCoachNow"[^>]*data-auth-player-hide="true"/.test(html) ||
    !/id="savedScriptsSection"[^>]*data-auth-player-hide="true"/.test(html) ||
    !/Open Swipe View/.test(html)
  ) {
    fail("player script launcher markup is incomplete");
  }
  if (
    !/currentUser\?\.role !== "player"/.test(scriptDisplay) ||
    !/hidePersonnel:\s*true/.test(scriptDisplay) ||
    !/layoutMode:\s*"detail"/.test(scriptDisplay) ||
    !/function renderPlayerScriptPeriodHeader\(/.test(scriptRender) ||
    !/script-item--player/.test(scriptRender) ||
    !/Open Rules/.test(scriptRender) ||
    !/renderPlayerLoadedScriptBar\(\)/.test(scriptRender) ||
    !/typeof getCurrentAuthUser === "function"[\s\S]*getCurrentAuthUser\(\)\?\.role === "player"[\s\S]*return;/.test(
      appEvents,
    )
  ) {
    fail("player script role rendering is incomplete");
  }
  if (
    !playerScriptMetaBlock ||
    /keyPlayer|keyPlayerName|Key Players|key player|key-player/i.test(
      playerScriptMetaBlock,
    ) ||
    !playerPresentationBlock ||
    /playerName|pp-player-name|keyPlayer|keyPlayerName|Key Players/i.test(
      playerPresentationBlock,
    ) ||
    /\.pp-player-name/.test(presentationCss)
  ) {
    fail("player script views expose key-player or roster-name hints");
  }
  [
    "loadPublishedPlayerScript",
    "presentPublishedPlayerScript",
    "openPlayerCurrentScriptPresentation",
  ].forEach((action) => {
    if (!new RegExp(`["']${action}["']`).test(auth)) {
      fail(`read-only roles cannot use player script action ${action}`);
    }
  });
  if (
    !/\.player-script-launcher/.test(css) ||
    !/\.player-script-now/.test(css) ||
    !/\.player-script-card__loaded-label/.test(css) ||
    !/\.script-item--player/.test(css) ||
    !/\.period-header--player/.test(css) ||
    !/body\[data-auth-role="player"\] \.script-builder/.test(css) ||
    !/\.saved-player-toggle/.test(css)
  ) {
    fail("player script launcher styles are incomplete");
  }

  console.log("player script publishing contracts ok");
}

function checkPlayReadinessContracts() {
  const html = read("index.html");
  const sw = read("sw.js");
  const storage = read("js/storage.js");
  const auth = read("js/auth.js");
  const scriptRender = read("js/script-render.js");
  const playbookNavigation = read("js/playbook-navigation.js");
  const playbookRender = read("js/playbook-render.js");
  const presentation = read("js/play-presentation.js");
  const readiness = read("js/play-readiness.js");
  const css = read("css/script.css");
  const playbookCss = read("css/playbook.css");
  const presentationCss = read("css/play-presentation.css");

  if (
    !/PLAY_READINESS:\s*"playReadiness"/.test(storage) ||
    !/"\.\/js\/play-readiness\.js"/.test(sw) ||
    !/src="js\/play-readiness\.js\?v=/.test(html) ||
    !/id="playbookReadinessPanel"/.test(html)
  ) {
    fail("play readiness storage or asset wiring is incomplete");
  }
  if (
    !/const PLAY_READINESS_REP_TYPES = \[/.test(readiness) ||
    !/weight:\s*0\.25/.test(readiness) ||
    !/weight:\s*0\.5/.test(readiness) ||
    !/weight:\s*0\.75/.test(readiness) ||
    !/weight:\s*1\.5/.test(readiness) ||
    !/const PLAY_READINESS_THRESHOLDS = \{/.test(readiness) ||
    !/const PLAY_READINESS_SHOWN_POINTS = \{/.test(readiness) ||
    !/Identity Play/.test(readiness) ||
    !/function getPlayReadinessSummary\(play\)/.test(readiness) ||
    !/function getPlayReadinessShownStatus\(play\)/.test(readiness) ||
    !/function getPlayReadinessCompactSummary\(summary\)/.test(readiness) ||
    !/repScorePart \+ volumePart \+ recencyPart/.test(readiness) ||
    !/practiceScore \+ shownStatus\.shownPoints/.test(readiness)
  ) {
    fail("play readiness scoring model is incomplete");
  }
  if (
    !/function renderPlayReadinessScriptWidget\(play, index, opts = \{\}\)/.test(
      readiness,
    ) ||
    !/function renderPlayReadinessCompactBadge\(play, opts = \{\}\)/.test(readiness) ||
    !/function renderPlayReadinessCompactBadgeFromSummary\(summary, opts = \{\}\)/.test(readiness) ||
    !/function renderPlayReadinessRollup\(summary, opts = \{\}\)/.test(readiness) ||
    !/function renderPlayReadinessEmptyPlaybookPanel\(\)/.test(readiness) ||
    !/data-auth-player-hide="true"/.test(readiness) ||
    !/function openPlayReadinessRepModal\(index\)/.test(readiness) ||
    !/function openPlayReadinessActionModal\(index\)/.test(readiness) ||
    !/function renderPlayReadinessPresentationCoachCard\(play\)/.test(readiness) ||
    !/function renderPlayReadinessPresentationMinimumDock\(play\)/.test(readiness) ||
    !/function renderPlayReadinessPresentationScoreRail\(play\)/.test(readiness) ||
    !/function renderSelectedPlaybookReadinessPanel\(index = selectedRowIndex\)/.test(readiness) ||
    !/const headerLastResult = summary\.lastLog/.test(readiness) ||
    !/class="pr-last-result"/.test(readiness) ||
    !/function animatePlayReadinessScoreSelection\(element\)/.test(readiness) ||
    !/aria-pressed="\$\{active \? "true" : "false"\}"/.test(readiness) ||
    !/playReadinessHistoryContext\?\.key === keyArg/.test(readiness) ||
    !/function quickPlayReadinessPlaybookScore\(score, element\)/.test(readiness) ||
    !/function quickPlayReadinessScriptScore\(score, element\)/.test(readiness) ||
    !/function quickPlayReadinessPresentationScore\(score, element\)/.test(readiness) ||
    !/function updatePlayReadinessReportScore\(score, element\)/.test(readiness) ||
    !/async function deletePlayReadinessReport\(element\)/.test(readiness) ||
    !/play-readiness-report-score-controls/.test(readiness) ||
    !/function openPlayReadinessPresentationActionModal\(\)/.test(readiness) ||
    !/function showPlayReadinessHistory\(index\)/.test(readiness)
  ) {
    fail("play readiness coach workflow is incomplete");
  }
  if (
    !/renderPlayReadinessScriptWidget\(play, index, \{/.test(scriptRender) ||
    !/renderPlayReadinessCompactBadgeFromSummary\(readinessSummary, \{/.test(scriptRender) ||
    !/readinessBadge/.test(playbookRender) ||
    !/\$\{readinessMarkup\}/.test(scriptRender) ||
    !/quickPlayReadinessScriptScore/.test(readiness) ||
    !/renderSelectedPlaybookReadinessPanel\(index\)/.test(playbookNavigation) ||
    !/renderSelectedPlaybookReadinessPanel\(selectedRowIndex\)/.test(playbookRender) ||
    !/renderPlayReadinessPresentationCoachCard\(play\)/.test(presentation) ||
    !/renderPlayReadinessPresentationScoreRail\(play\)/.test(presentation) ||
    !/"openPlayReadinessRepModal"/.test(auth) ||
    !/"openPlayReadinessActionModal"/.test(auth) ||
    !/"quickPlayReadinessScriptScore"/.test(auth) ||
    !/"quickPlayReadinessPlaybookScore"/.test(auth) ||
    !/"quickPlayReadinessPresentationScore"/.test(auth) ||
    !/"updatePlayReadinessReportScore"/.test(auth) ||
    !/"deletePlayReadinessReport"/.test(auth)
  ) {
    fail("play readiness script integration or coach permissions are incomplete");
  }
  if (
    /type="checkbox"\s+name="(?:explosive|turnover|penalty)"/.test(readiness) ||
    /data-action="seedPlayReadinessSampleData"/.test(readiness) ||
    /seedPlayReadinessSampleData|PLAY_READINESS_SAMPLE_SEEDS|normalizePlayReadinessComplexity|inferPlayReadinessComplexity/.test(readiness) ||
    /\.play-readiness-sweet/.test(css)
  ) {
    fail("play readiness daily UI still exposes event checkboxes or dead legacy paths");
  }
  if (
    !/\.play-readiness-widget/.test(css) ||
    !/\.play-readiness-track/.test(css) ||
    !/\.play-readiness-modal/.test(css) ||
    !/\.script-item--printlike \.play-readiness-widget/.test(css) ||
    !/\.play-readiness-history-hero/.test(css) ||
    !/\.play-readiness-history-summary/.test(css) ||
    !/\.pr-hist-main/.test(css) ||
    !/\.play-readiness-badge/.test(css) ||
    !/\.play-readiness-rollup/.test(css) ||
    !/\.play-readiness-quick-score/.test(css) ||
    !/\.pr-last-result\s*\{[\s\S]*display:\s*grid/.test(css) ||
    !/\.pr-last-result strong\s*\{[\s\S]*text-overflow:\s*ellipsis/.test(css) ||
    !/\.pr-score-row\s*\{[\s\S]*grid-template-columns:\s*minmax\(76px,\s*max-content\)\s*minmax\(220px,\s*1fr\)\s*minmax\(26px,\s*max-content\)/.test(css) ||
    !/\.play-readiness-score-grid/.test(css) ||
    !/\.play-readiness-report-score-controls/.test(css) ||
    !/\.play-readiness-report-delete/.test(css) ||
    !/\.pb-readiness-card/.test(playbookCss) ||
    !/\.pb-readiness-score-stage/.test(playbookCss) ||
    !/\.pb-readiness-driver-grid/.test(playbookCss) ||
    !/\.pb-readiness-last/.test(playbookCss) ||
    !/\.pb-readiness-card--empty/.test(playbookCss) ||
    !/\.pb-readiness-empty-steps/.test(playbookCss) ||
    !/play-readiness-badge--playbook-table/.test(playbookCss) ||
    !/\.play-readiness-score-btn/.test(playbookCss) ||
    !/\.play-readiness-score-btn\.is-score-pulse/.test(playbookCss) ||
    !/@keyframes prScoreSelectPulse/.test(playbookCss) ||
    !/\.pp-coach-section-readiness/.test(presentationCss) ||
    !/\.pp-readiness-driver-grid/.test(presentationCss) ||
    !/\.pp-readiness-log-strip/.test(presentationCss) ||
    !/\.pp-minimum-readiness-dock/.test(presentationCss) ||
    !/\.pp-readiness-score-rail/.test(presentationCss) ||
    !/\.pp-readiness-rail-buttons/.test(presentationCss) ||
    !/\.pp-minimum-score-grid/.test(presentationCss) ||
    !/body\.play-presentation-mobile\.is-landscape-screen\.is-phone-screen[\s\S]*\.pp-minimum-readiness-dock/.test(
      presentationCss,
    ) ||
    !/body\.play-presentation-mobile\.is-landscape-screen\.is-compact-screen[\s\S]*\.pp-minimum-readiness-dock/.test(
      presentationCss,
    ) ||
    !/pp-coach-section-readiness \.play-readiness-rollup/.test(presentationCss)
  ) {
    fail("play readiness script styling is incomplete");
  }

  console.log("play readiness contracts ok");
}

function checkPlayerPortalContracts() {
  const html = read("index.html");
  const auth = read("js/auth.js");
  const appShell = read("js/app-shell.js");
  const serverAuth = read("functions/_lib/auth.js");
  const appBootstrap = read("js/app-bootstrap.js");
  const cloudSync = read("js/cloud-sync.js");
  const appEvents = read("js/app-events.js");
  const appNavigation = read("js/app-navigation.js");
  const dashboard = read("js/dashboard.js");
  const dashboardRender = read("js/dashboard-render.js");
  const componentsCss = read("css/components.css");
  const layoutCss = read("css/layout.css");
  const responsiveCss = read("css/responsive.css");
  const dashboardCss = read("css/dashboard.css");
  const scriptCss = read("css/script.css");
  const presentation = read("js/play-presentation.js");
  const presentationCss = read("css/play-presentation.css");

  if (
    !/player:\s*\["dashboard",\s*"playbook",\s*"signals",\s*"script"\]/.test(auth) ||
    !/player:\s*"dashboard"/.test(auth) ||
    !/function syncPlayerPortalChrome\(\)/.test(auth) ||
    !/function canEditUser\(\)/.test(auth) ||
    !/ADMIN_ONLY_ACTIONS\.has\(action\)\) return isAdminUser\(\)/.test(auth) ||
    /function isActionAllowedForRole\(action\) \{\s*return true;/.test(auth) ||
    /["']toggleScript["']/.test(auth) ||
    !/data-auth-player-hide/.test(auth) ||
    !/document\.body\.dataset\.authCanEdit = canEditUser\(\) \? "true" : "false"/.test(auth) ||
    !/window\.canEditUser = canEditUser/.test(auth) ||
    !/auth-login-shell/.test(auth) ||
    !/function getAuthLoginVariant\(\)/.test(auth) ||
    !/function getDefaultLoginRoleForVariant\(variant\)/.test(auth) ||
    !/overlay\.dataset\.loginVariant = _loginVariant/.test(auth) ||
    !/auth-login-overlay--\$\{_loginVariant\}/.test(auth) ||
    !/const _initialRoleName = _urlRole \|\| getDefaultLoginRoleForVariant\(_loginVariant\)/.test(auth) ||
    !/authPasswordToggle/.test(auth) ||
    !/ensureAuthFocusedControlVisible/.test(auth) ||
    !/is-keyboard-open/.test(auth) ||
    !/scrollIntoView\(\{[\s\S]*block:\s*"center"/.test(auth) ||
	    !/AUTH_LOGIN_ROLE_DETAILS/.test(auth) ||
	    !/data-login-role/.test(auth) ||
	    !/"refreshPlayerTeamApp"/.test(auth) ||
	    !/"installPlayerA2HS"/.test(auth) ||
	    /READ_ONLY_ALLOWED_ACTIONS[\s\S]*"openCloudSyncModal"[\s\S]*\]\)/.test(auth) ||
    /READ_ONLY_ALLOWED_ACTIONS[\s\S]*"pullCloudBackup"[\s\S]*\]\)/.test(auth) ||
    /READ_ONLY_ALLOWED_ACTIONS[\s\S]*"testCloudSyncConnection"[\s\S]*\]\)/.test(auth) ||
	    !/currentAuthUser\.role === "player"[\s\S]*schedulePlayerTeamUpdateCheck\(\{ delay: 700, startup: true \}\)/.test(auth)
  ) {
    fail("player auth shell or tab permissions are incomplete");
  }
  if (
    !/data-player-label="Playbook"/.test(html) ||
    !/data-player-label="Practice"/.test(html) ||
    !/data-player-label="Home"/.test(html) ||
    !/id="playerPlaybookSummary"/.test(html) ||
    !/id="playerDashboardHome"/.test(html) ||
    !/id="commandPaletteBtn"[^>]*data-auth-player-hide="true"/.test(html) ||
    !/class="backup-section"[^>]*data-auth-player-hide="true"/.test(html) ||
    !/id="quickTools"[^>]*data-auth-player-hide="true"/.test(html) ||
    !/class="script-header-panel[^"]*"[^>]*data-auth-player-hide="true"/.test(html) ||
    !/class="period-buttons"[^>]*data-auth-player-hide="true"/.test(html) ||
    !/viewport-fit=cover/.test(html) ||
    !/interactive-widget=resizes-content/.test(html)
  ) {
    fail("player portal markup is incomplete");
  }
  if (
    !/function renderPlayerDashboardHome\(\)/.test(dashboardRender) ||
    !/function getPlayerHomePracticeStatus\(featuredScript, loadedScript, todayValue\)/.test(
      dashboardRender,
    ) ||
    !/Player Portal/.test(dashboardRender) ||
    !/loadPublishedPlayerScript/.test(dashboardRender) ||
    !/openPlayerCurrentScriptPresentation/.test(dashboardRender) ||
    !/Open Playbook/.test(dashboardRender) ||
	    !/player-home-quick-actions/.test(dashboardRender) ||
	    !/getPlayerA2HSActionState/.test(dashboardRender) ||
	    !/data-action="installPlayerA2HS"/.test(dashboardRender) ||
	    /showPlayerA2HSBannerIfNeeded\(\)/.test(dashboardRender) ||
	    !/player-home-today-card/.test(dashboardRender) ||
    !/class="player-home-state player-home-state--\$\{escapeHtml\(practiceStatus\.tone\)\}"/.test(
      dashboardRender,
    ) ||
    !/class="btn btn-primary player-home-action"/.test(dashboardRender) ||
    !/function getAppActionHitDiagnostics\(element\)/.test(appEvents) ||
    !/function isAppActionFullTraceEnabled\(\)/.test(appEvents) ||
    !/document\.elementFromPoint\(centerX, centerY\)/.test(appEvents) ||
    !/function getAppElementsFromPointDiagnostics\(x, y\)/.test(appEvents) ||
    !/function traceAppInputEvent\(phase, event\)/.test(appEvents) ||
	    !/window\.bcDebugHitTest/.test(appEvents) ||
    !/window\.bcDebugScrollAncestry/.test(appEvents) ||
    !/\["pointerdown", "pointerup", "touchstart", "touchend", "click"\]\.forEach/.test(appEvents) ||
    /mobileTapSyntheticClick/.test(appEvents) ||
    /mobileTapNativeSuppression/.test(appEvents) ||
    /MOBILE_TAP_ACTION_SELECTOR/.test(appEvents) ||
    /target\.click\(\)/.test(appEvents) ||
    /function shouldBridgeNativeMobileAction\(el\)/.test(appEvents) ||
    /shouldBridgeNativeMobileAction\(actionEl\)/.test(appEvents) ||
    !/function scrollTabStripToTab\(tab\)/.test(appNavigation) ||
    !/strip\.scrollTo\(\{/.test(appNavigation) ||
    !/const savedScriptId = escapeHtml\(String\(savedScript\.id\)\)/.test(
      dashboardRender,
    ) ||
    !/data-arg="\$\{savedScriptId\}"/.test(dashboardRender) ||
    !/data-arg="\$\{featuredScriptId\}"/.test(dashboardRender)
  ) {
    fail("player dashboard home is incomplete");
  }
  if (
    !/function ensureMobileStartupSurface\(\)[\s\S]*const isPlayer = currentUser\?\.role === "player"[\s\S]*setWorkspaceSurface\("app"/.test(appBootstrap) ||
    !/function refreshPlayerCloudBackup\(opts = \{\}\)/.test(cloudSync) ||
    !/targetTab:\s*"dashboard"/.test(cloudSync) ||
    !/currentUser\?\.role === "player"[\s\S]*refreshPlayerCloudBackup\(\{ navigate: true \}\)[\s\S]*closeCloudSyncModal\(\)/.test(cloudSync) ||
    !/setWorkspaceSurface\("app", \{ initModules: false \}\)/.test(cloudSync)
  ) {
    fail("player cloud refresh does not land safely on Dashboard");
  }
  if (
    !/window\.visualViewport/.test(appShell) ||
    !/shortSide/.test(appShell) ||
    !/is-landscape-screen/.test(appShell) ||
    !/let _mobileShellLastStateKey = ""/.test(appShell) ||
    !/stateKey === _mobileShellLastStateKey/.test(appShell) ||
    !/const shellPhone = isPhone/.test(appShell) ||
    !/const shellCompact = isMobile/.test(appShell) ||
    !/const isTouchTablet =[\s\S]*\(isTouch \|\| isIPadOS\)/.test(appShell) ||
    !/const shellTablet = isMobile/.test(appShell) ||
    !/function getAppDisplayMode\(\)/.test(appShell) ||
    !/function isLikelyIPadOSDevice\(\)/.test(appShell) ||
    !/navigator\.standalone === true/.test(appShell) ||
    !/MacIntel/.test(appShell) ||
    !/APP_DISPLAY_MODE_MEDIA_QUERIES/.test(appShell) ||
    !/document\.addEventListener\("fullscreenchange", queueMobileShellMeasuredSync\)/.test(
      appShell,
    ) ||
    !/document\.addEventListener\("fullscreenerror", queueMobileShellMeasuredSync\)/.test(
      appShell,
    ) ||
    !/el\.dataset\.displayMode = displayMode/.test(appShell) ||
    !/el\.dataset\.device = appDevice/.test(appShell) ||
    !/el\.dataset\.orientation = isLandscape \? "landscape" : "portrait"/.test(
      appShell,
    ) ||
    !/el\.dataset\.presentation = presentationActive \? "true" : "false"/.test(
      appShell,
    ) ||
    !/display-mode-installed/.test(appShell) ||
    !/body\.dataset\.shellSize = shellSize/.test(appShell) ||
    !/shell-phone/.test(appShell) ||
    !/shell-compact/.test(appShell) ||
    !/shell-tablet/.test(appShell) ||
    !/shell-short/.test(appShell) ||
    !/MOBILE_OVERFLOW_APPROVED_SELECTORS/.test(appShell) ||
    !/function collectMobileOverflowDiagnostics/.test(appShell) ||
    !/window\.bcDebugMobileOverflow = bcDebugMobileOverflow/.test(appShell) ||
    !/bcMobileOverflowTrace/.test(appShell) ||
    !/window\.visualViewport\?\.addEventListener\([\s\S]*"resize",[\s\S]*queueMobileShellStateSync,[\s\S]*\{\s*passive:\s*true\s*\}/.test(
      appShell,
    ) ||
    !/function queueMobileShellSettledSync\(\)/.test(appShell) ||
    !/let _mobileShellResizeObserver = null/.test(appShell) ||
    !/function observeMobileShellChrome\(\)/.test(appShell) ||
    !/new ResizeObserver\(queueMobileShellMeasuredSync\)/.test(appShell) ||
    !/headerHeight/.test(appShell) ||
    !/tabsHeight/.test(appShell) ||
    !/coachDockHeight/.test(appShell) ||
    !/window\.visualViewport\?\.addEventListener\("scroll", queueMobileShellSettledSync/.test(
      appShell,
    ) ||
    !/window\.setTimeout\(queueMobileShellStateSync,\s*240\)/.test(
      appShell,
    ) ||
    !/function setMobileShellCssVar\(root, name, value\)/.test(appShell) ||
    !/is-player-mobile-shell/.test(appShell) ||
    !/is-staff-mobile-shell/.test(appShell) ||
    !/queueMobileShellSettledSync\(\);[\s\S]*\} else \{[\s\S]*queueMobileShellStateSync\(\);/.test(appShell) ||
    !/queueMobileShellStateSync/.test(auth)
  ) {
    fail("mobile screen recognition does not account for touch viewports");
  }
  if (
    !/function isMobileCoachLockRole\(\)/.test(appShell) ||
    !/body\.classList\.toggle\("mobile-coach-locked", activeOnMobile\)/.test(
      appShell,
    ) ||
    !/quickPlayReadinessScriptScore/.test(appShell) ||
    !/quickPlayReadinessPresentationScore/.test(appShell) ||
    !/openPlayerCurrentScriptPresentation/.test(appShell)
  ) {
    fail("mobile coach lock does not preserve player taps and scoring actions");
  }
  if (
    !/id="mobileScriptEditToggle"[\s\S]*data-action="toggleMobileScriptEditMode"/.test(html) ||
    !/function toggleMobileScriptEditMode\(\)/.test(appShell) ||
    !/function mobileCoachJumpPeriod\(separatorIndex\)/.test(appShell) ||
    !/function mobileCoachScoreScriptCall\(score\)/.test(appShell) ||
    !/function mobileCoachLogScriptCall\(\)/.test(appShell) ||
    !/function mobileCoachPresentScriptCall\(\)/.test(appShell) ||
    !/body\.dataset\.mobileScriptMode/.test(appShell) ||
    !/body\.is-phone-screen\.is-staff-mobile-shell:not\(\.mobile-script-editing\)[\s\S]*#script[\s\S]*\.script-header-panel/.test(
      responsiveCss,
    ) ||
    !/body\.is-phone-screen\.is-staff-mobile-shell:not\(\.mobile-script-editing\)[\s\S]*#script[\s\S]*\.play-readiness-widget/.test(
      responsiveCss,
    ) ||
    !/body\.is-phone-screen\.is-staff-mobile-shell:not\(\.mobile-script-editing\)[\s\S]*#script[\s\S]*\.script-column-headers/.test(
      responsiveCss,
    )
  ) {
    fail("mobile practice script run mode is incomplete");
  }
  if (
    !/\.auth-login-shell/.test(componentsCss) ||
    !/\.auth-login-hero/.test(componentsCss) ||
    !/body\[data-auth-role="player"\] \.auth-user-badge/.test(componentsCss) ||
    !/body\.is-mobile-screen\[data-auth-role="player"\]\s+#mainApp:not\(\.hidden\)\s+\+\s+\.mobile-coach-dock/.test(
      componentsCss,
    ) ||
    !/body\.is-mobile-screen\[data-auth-role="player"\]\s+#script\.active\s+\.mobile-script-coach-now/.test(
      componentsCss,
    ) ||
    !/body\[data-auth-role="player"\] \.tabs/.test(layoutCss) ||
    !/body\.is-mobile-screen\[data-auth-role="player"\] \.tabs/.test(
      responsiveCss,
    ) ||
    !/body\.is-mobile-screen\[data-auth-role="player"\] #mainApp[\s\S]*overflow:\s*visible/.test(
      responsiveCss,
    ) ||
    !/body\.is-mobile-screen\[data-auth-role="player"\] #dashboard\.panel,[\s\S]*body\.is-mobile-screen\[data-auth-role="player"\] #script\.panel[\s\S]*overflow:\s*visible/.test(
      responsiveCss,
    ) ||
    !/body\.is-mobile-screen\[data-auth-role="player"\] #tab-dashboard::before/.test(
      responsiveCss,
    ) ||
    !/body\.is-mobile-screen\[data-auth-role="player"\]\s+\.auth-user-badge/.test(
      responsiveCss,
    ) ||
    !/overflow-x:\s*clip/.test(responsiveCss) ||
    !/touch-action:\s*pan-y/.test(responsiveCss) ||
    !/body\.is-mobile-screen #script \.script-item,[\s\S]*content-visibility:\s*visible/.test(
      responsiveCss,
    ) ||
    !/body\.shell-phone\.is-staff-mobile-shell #script \.script-builder,[\s\S]*body\.shell-compact\.is-staff-mobile-shell:not\(\.shell-tablet\)[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/.test(
      responsiveCss,
    ) ||
    !/body\.shell-phone\.is-staff-mobile-shell #script \.play-list,[\s\S]*body\.shell-compact\.is-staff-mobile-shell:not\(\.shell-tablet\)[\s\S]*position:\s*static[\s\S]*max-height:\s*none[\s\S]*overflow:\s*visible/.test(
      responsiveCss,
    ) ||
    !/body\.shell-tablet\.is-staff-mobile-shell #script \.script-builder[\s\S]*grid-template-columns:\s*minmax\(250px,\s*0\.72fr\) minmax\(0,\s*1\.28fr\)/.test(
      responsiveCss,
    ) ||
    !/body\.shell-tablet\.is-staff-mobile-shell #script \.script-play-rail\.play-list[\s\S]*position:\s*relative[\s\S]*transform:\s*none[\s\S]*overflow:\s*auto/.test(
      responsiveCss,
    ) ||
    !/body\.is-mobile-screen\.is-staff-mobile-shell #script \.script-player-grid[\s\S]*display:\s*none/.test(
      responsiveCss,
    ) ||
    !/body\.is-phone-screen\.is-staff-mobile-shell #script \.defense-inputs,[\s\S]*body\.is-phone-screen\.is-staff-mobile-shell #script \.play-readiness-actions[\s\S]*display:\s*none/.test(
      responsiveCss,
    ) ||
    !/body\.is-phone-screen\.is-staff-mobile-shell #script \.script-list[\s\S]*order:\s*1/.test(
      responsiveCss,
    ) ||
    !/body\.is-phone-screen\.is-staff-mobile-shell #script \.play-list[\s\S]*order:\s*2/.test(
      responsiveCss,
    ) ||
    !/body\.is-mobile-screen #mainApp/.test(responsiveCss) ||
    !/body\.is-mobile-screen \[data-action\]/.test(responsiveCss) ||
    !/body\.is-mobile-screen \.panel > \*/.test(responsiveCss) ||
    !/body\.is-mobile-screen\s+input:not/.test(responsiveCss) ||
    !/\(pointer: coarse\) and \(max-width: 820px\)/.test(responsiveCss) ||
    !/body\[data-auth-role="player"\] #playbook\.panel/.test(layoutCss) ||
    !/\.auth-login-overlay/.test(componentsCss) ||
    !/\.auth-login-overlay--desktop \.auth-login-shell/.test(componentsCss) ||
    !/\.auth-login-overlay--tablet \.auth-login-shell/.test(componentsCss) ||
    !/\.auth-login-overlay--mobile \.auth-login-shell/.test(componentsCss) ||
    !/\.auth-login-overlay--mobile \.auth-login-hero[\s\S]*display:\s*none/.test(componentsCss) ||
    !/function removeLoginOverlayIfAuthenticated\(\)/.test(auth) ||
    !/removeLoginOverlayIfAuthenticated\(\);[\s\S]*ensureLoginOverlayVisible\(\);/.test(auth) ||
    !/"startClassicWristband"/.test(appEvents) ||
    !/"startPlayerWristband"/.test(appEvents) ||
    !/body\.is-short-screen \.auth-login-overlay--mobile/.test(componentsCss) ||
    !/\.auth-login-overlay\.is-keyboard-open/.test(componentsCss) ||
    !/body\.is-short-screen \.auth-login-overlay--mobile \.auth-login-hero,[\s\S]*\.auth-login-overlay\.is-keyboard-open:not\(\.auth-login-overlay--desktop\) \.auth-login-hero[\s\S]*display:\s*none/.test(
      componentsCss,
    ) ||
    !/class="shell login-shell"/.test(serverAuth) ||
    !/@media \(max-width: 1024px\)/.test(serverAuth) ||
    !/@media \(max-width: 640px\)/.test(serverAuth) ||
    !/\.auth-login-role-picker/.test(componentsCss) ||
    !/\.auth-login-role-option\.is-active/.test(componentsCss) ||
    !/auth-login-submit[\s\S]*touch-action:\s*manipulation/.test(componentsCss) ||
    !/body\.is-phone-screen\[data-auth-role="player"\] \.header-action-btn[\s\S]*width:\s*44px[\s\S]*min-width:\s*44px[\s\S]*height:\s*44px/.test(
      responsiveCss,
    ) ||
    !/body\.is-phone-screen\[data-auth-role="player"\] \.auth-user-badge[\s\S]*min-height:\s*44px/.test(
      responsiveCss,
    ) ||
    !/\.auth-login-card\s*\{\s*order:\s*1;/.test(componentsCss) ||
    !/\.auth-login-hero\s*\{\s*order:\s*2;/.test(componentsCss) ||
    !/\.player-home-hero/.test(dashboardCss) ||
    !/\.player-home-state/.test(dashboardCss) ||
    !/\.player-home-state--offline/.test(dashboardCss) ||
    !/\.player-home-state--new/.test(dashboardCss) ||
    !/\.player-home-state--loaded/.test(dashboardCss) ||
    !/\.player-home-quick-actions/.test(dashboardCss) ||
    !/player-home-card--study/.test(dashboardRender) ||
    !/\.player-home-today-card/.test(dashboardCss) ||
    !/\.player-dashboard-home[\s\S]*overflow:\s*visible/.test(dashboardCss) ||
    !/\.player-home-card[\s\S]*overflow:\s*clip/.test(dashboardCss) ||
    !/body\.is-phone-screen\[data-auth-role="player"\] \.player-home-quick-action/.test(
      dashboardCss,
    ) ||
    !/-webkit-tap-highlight-color:\s*transparent/.test(dashboardCss) ||
    !/touch-action:\s*manipulation/.test(dashboardCss) ||
    !/body\.is-phone-screen\[data-auth-role="player"\] \.player-home-hero/.test(
      dashboardCss,
    ) ||
    !/\.player-home-grid/.test(dashboardCss) ||
    !/body\[data-auth-role="player"\] #script \.script-header-panel,[\s\S]*body\[data-auth-role="player"\] #script \.period-buttons/.test(
      scriptCss,
    ) ||
    !/\.pb-player-summary/.test(read("css/playbook.css")) ||
    !/\.player-script-now__actions \.btn/.test(scriptCss) ||
    !/\.player-script-card__actions \.btn,\s*\.player-script-now__actions \.btn[\s\S]*min-height:\s*44px/.test(
      scriptCss,
    ) ||
    !/\.player-script-card__actions[\s\S]*display:\s*grid/.test(scriptCss)
  ) {
    fail("player portal styling is incomplete");
  }
  if (
    !/Desktop Script workspace: keep page chrome stable/.test(scriptCss) ||
    !/body:not\(\.is-mobile-screen\)\[data-active-tab="script"\][\s\S]*overflow:\s*hidden/.test(
      scriptCss,
    ) ||
    !/body:not\(\.is-mobile-screen\) #script\.panel\.active[\s\S]*display:\s*flex[\s\S]*overflow:\s*hidden/.test(
      scriptCss,
    ) ||
    !/--script-panel-margin-block:\s*20px/.test(scriptCss) ||
    !/var\(--script-panel-margin-block\) \* 2/.test(scriptCss) ||
    !/body:not\(\.is-mobile-screen\) #script \.script-builder[\s\S]*min-height:\s*0[\s\S]*overflow:\s*hidden/.test(
      scriptCss,
    ) ||
    !/body:not\(\.is-mobile-screen\) #script \.play-list[\s\S]*position:\s*static[\s\S]*overflow:\s*hidden/.test(
      scriptCss,
    ) ||
    !/body:not\(\.is-mobile-screen\) #script \.available-plays-container[\s\S]*min-height:\s*0[\s\S]*overflow-y:\s*auto/.test(
      scriptCss,
    ) ||
    !/body:not\(\.is-mobile-screen\) #script \.script-list[\s\S]*overflow-y:\s*hidden/.test(
      scriptCss,
    ) ||
    !/body:not\(\.is-mobile-screen\) #script \.script-container[\s\S]*min-height:\s*0[\s\S]*overflow-y:\s*auto/.test(
      scriptCss,
    ) ||
    !/html:not\(\.is-mobile-screen\)[\s\S]*overflow:\s*hidden/.test(layoutCss) ||
    !/function repairDesktopDocumentScroll\(reason = "scroll"\)/.test(appShell) ||
    !/window\.addEventListener\("scroll", \(\) => queueDesktopDocumentScrollRepair\("window scroll"\)/.test(
      appShell,
    ) ||
    !/window\.bcDebugShellScroll = function bcDebugShellScroll/.test(appShell) ||
    !/\.script-workbench-control-block/.test(scriptCss) ||
    !/\.page-header-surface[\s\S]*display:\s*grid/.test(componentsCss) ||
    !/\.app-workspace-pane[\s\S]*display:\s*flex[\s\S]*flex-direction:\s*column/.test(componentsCss) ||
    !/\.app-scroll-region[\s\S]*overflow:\s*auto[\s\S]*overscroll-behavior:\s*contain/.test(
      componentsCss,
    ) ||
    !/\.control-block[\s\S]*background:\s*var\(--color-surface-muted\)/.test(componentsCss) ||
    !/\.segmented-control__item\.is-active/.test(componentsCss) ||
    !/class="[^"]*script-header-panel[^"]*page-header-surface/.test(html) ||
    !/class="[^"]*script-workbench-control-block[^"]*control-block/.test(html) ||
    !/class="[^"]*script-builder[^"]*app-workspace-grid/.test(html) ||
    !/class="[^"]*script-list[^"]*app-workspace-pane/.test(html) ||
    !/class="[^"]*script-container[^"]*app-scroll-region[^"]*"[^>]*id="scriptPlays"/.test(html)
  ) {
    fail("desktop script workspace scroll ownership is incomplete");
  }
  if (
    !/pp-player-overview/.test(presentation) ||
    !/pp-player-controls-card/.test(presentation) ||
    !/\.pp-player-overview/.test(presentationCss) ||
    !/\.pp-player-controls-card/.test(presentationCss) ||
    !/body\.play-presentation-mobile\.is-landscape-screen\.is-phone-screen \.pp-layout-player/.test(
      presentationCss,
    ) ||
    !/body\.play-presentation-mobile\.is-landscape-screen\.is-phone-screen \.pp-player-controls-head span/.test(
      presentationCss,
    )
  ) {
    fail("player presentation polish is incomplete");
  }
  if (
    !/grid-auto-flow:\s*column/.test(scriptCss) ||
    !/scroll-snap-type:\s*x proximity/.test(scriptCss) ||
    !/\.script-timeline-note[\s\S]*-webkit-line-clamp:\s*2/.test(scriptCss)
  ) {
    fail("mobile script timeline does not preserve dense period context");
  }

  console.log("player portal contracts ok");
}

function checkCallSheetMobileContracts() {
  const appShell = read("js/app-shell.js");
  const callsheetPrint = read("js/callsheet-print.js");
  const callsheetRender = read("js/callsheet-render.js");
  const callsheetCss = read("css/callsheet.css");

  if (
    !/function shouldRenderCallSheetPhoneCards\(\)/.test(callsheetRender) ||
    !/document\.body\?\.classList\.contains\("shell-phone"\)/.test(callsheetRender) ||
    !/container\.classList\.toggle\("callsheet-phone-cards", usePhoneCards\)/.test(
      callsheetRender,
    ) ||
    !/renderCallSheetPhoneCards\(categories, dupeMap, displayOptions\)/.test(
      callsheetRender,
    ) ||
    !/function renderCallSheetPhoneCategory\(/.test(callsheetRender) ||
    !/function renderCallSheetPhoneHashGroup\(/.test(callsheetRender) ||
    !/cs-mobile-situation-card/.test(callsheetRender)
  ) {
    fail("call sheet phone card render contract is incomplete");
  }

  if (
    !/body\.shell-phone #callSheetGrid\.callsheet-phone-cards[\s\S]*overflow-x:\s*clip/.test(
      callsheetCss,
    ) ||
    !/\.cs-mobile-situation-list[\s\S]*display:\s*grid/.test(callsheetCss) ||
    !/\.cs-mobile-card-header[\s\S]*grid-template-columns:\s*44px minmax\(0,\s*1fr\) auto auto/.test(
      callsheetCss,
    ) ||
    !/body\.shell-phone #callsheet \.callsheet-play[\s\S]*min-height:\s*44px/.test(
      callsheetCss,
    ) ||
    !/body\.shell-phone #callsheet \.callsheet-play \.remove-play,[\s\S]*body\.shell-phone #callsheet \.callsheet-play \.cs-hash-swap[\s\S]*opacity:\s*1/.test(
      callsheetCss,
    )
  ) {
    fail("call sheet phone card styling is incomplete");
  }

  if (
    !/function _csDescribePrintSelection\(opts = \{\}\)/.test(callsheetPrint) ||
    !/id="csPrintPreviewSummary"/.test(callsheetPrint) ||
    !/aria-live="polite"/.test(callsheetPrint) ||
    !/updateSummary\(\)/.test(callsheetPrint) ||
    !/\.cs-print-preview-summary/.test(callsheetCss) ||
    !/pages === "current"/.test(callsheetPrint) ||
    !/pages === "both"/.test(callsheetPrint)
  ) {
    fail("call sheet print selection summary is incomplete");
  }

  if (
    !/activeTab === "callsheet"[\s\S]*previousShellSize !== shellSize[\s\S]*scheduleRenderCallSheet\(\)/.test(
      appShell,
    )
  ) {
    fail("call sheet does not rerender when shell size changes");
  }

  console.log("call sheet mobile contracts ok");
}

function checkMobileCapabilityMatrix() {
  // M-020: every critical phone control promised by the mobile capability matrix
  // must exist. Role hiding is device-independent and out of scope here; this
  // guards the phone-only (width / run-mode) replacements so staff phone stays a
  // distinct run product instead of desktop-with-controls-hidden.
  const html = read("index.html");
  const appShell = read("js/app-shell.js");
  const responsiveCss = read("css/responsive.css");

  // Header overflow replacement for hidden secondary actions.
  if (
    !/class="tool-menu-wrap header-overflow"/.test(html) ||
    !/class="header-action-secondary/.test(html) ||
    !/\.header-action-secondary[^{}]*\{[^}]*display:\s*none/.test(responsiveCss) ||
    !/\.header-overflow[^{}]*\{[^}]*display:\s*inline-flex/.test(responsiveCss)
  ) {
    fail("phone header overflow replacement for secondary actions is incomplete");
  }

  // Coach run-mode card: current call + navigation + score + jump + edit toggle.
  if (
    !/id="mobileScriptCoachNow"/.test(html) ||
    !/id="mobileScriptCoachCall"/.test(html) ||
    !/id="mobileScriptCoachPeriodJump"/.test(html) ||
    !/class="mobile-script-coach-now__score"/.test(html) ||
    !/id="mobileScriptEditToggle"[^>]*data-action="toggleMobileScriptEditMode"/.test(
      html,
    )
  ) {
    fail("coach phone run-mode card controls promised by the matrix are missing");
  }

  // Coach run-mode publish/lock status controls (M-030).
  if (
    !/id="mobileScriptCoachPublish"[^>]*data-action="mobileCoachTogglePublish"/.test(
      html,
    ) ||
    !/id="mobileScriptCoachLock"[^>]*data-action="toggleMobileCoachLock"/.test(
      html,
    ) ||
    !/function mobileCoachTogglePublish\(\)/.test(appShell) ||
    !/target\.playerVisible = nowPublished/.test(appShell)
  ) {
    fail("coach phone publish/lock status controls are incomplete");
  }

  // Edit Sheet toggle must restore the full builder (run mode is reversible).
  if (
    !/function toggleMobileScriptEditMode\(\)/.test(appShell) ||
    !/body\.classList\.toggle\("mobile-script-editing"/.test(appShell) ||
    !/:not\(\.mobile-script-editing\)/.test(responsiveCss)
  ) {
    fail("phone run mode is not reversible via the Edit Sheet toggle");
  }

  // Always-on mobile coach dock for staff navigation between run surfaces.
  if (
    !/data-coach-tab="script"/.test(html) ||
    !/data-coach-tab="callsheet"/.test(html) ||
    !/data-coach-tab="wristband"/.test(html) ||
    !/data-coach-tab="gameplan"/.test(html) ||
    !/data-coach-tab="dashboard"/.test(html) ||
    !/id="mobileCoachLockToggle"/.test(html)
  ) {
    fail("mobile coach dock promised by the matrix is incomplete");
  }

  console.log("mobile capability matrix contracts ok");
}

function checkAnchoredMenuContract() {
  // Immediate fix #4: one shared anchored-menu utility, with the header and
  // Call Sheet "More" menus migrated onto it first. Guards that the utility
  // exists, is loaded, and both menus opt in via data-anchored.
  const html = read("index.html");
  const anchored = read("js/anchored-menu.js");
  const appEvents = read("js/app-events.js");
  const layoutCss = read("css/layout.css");
  const sw = read("sw.js");

  if (
    !/function positionAnchoredMenu\(/.test(anchored) ||
    !/function resetAnchoredMenu\(/.test(anchored) ||
    !/window\.positionAnchoredMenu\s*=/.test(anchored) ||
    !/window\.resetAnchoredMenu\s*=/.test(anchored)
  ) {
    fail("anchored-menu utility is missing its public positioning functions");
  }

  if (
    !/src="js\/anchored-menu\.js/.test(html) ||
    !/\.\/js\/anchored-menu\.js/.test(sw)
  ) {
    fail("anchored-menu.js is not registered in index.html and sw.js");
  }

  if (!/positionAnchoredMenu\(/.test(appEvents)) {
    fail("app-events.js does not invoke positionAnchoredMenu on open");
  }

  if (
    !/document\.body\.appendChild\(menu\)/.test(anchored) ||
    !/_anchoredWrap/.test(anchored) ||
    !/_getMenuWrapFromEventTarget/.test(appEvents)
  ) {
    fail("anchored menus are not portaled through body-aware event routing");
  }

  const panelFadeInStart = layoutCss.indexOf("@keyframes panelFadeIn");
  const panelFadeInBlock =
    panelFadeInStart >= 0
      ? layoutCss.slice(panelFadeInStart, layoutCss.indexOf("/* Filters */", panelFadeInStart))
      : "";
  if (!panelFadeInBlock || /transform\s*:/.test(panelFadeInBlock)) {
    fail("panelFadeIn must stay opacity-only so fixed anchored menus are not trapped by panels");
  }

  // Both migrated menus must opt in.
  if (
    !/class="tool-menu-wrap header-overflow"\s+data-anchored/.test(html) ||
    !/class="tool-menu-wrap"\s+data-anchored/.test(html)
  ) {
    fail("header overflow and Call Sheet menus are not both marked data-anchored");
  }

  console.log("anchored menu contract ok");
}

function checkPageHelpContract() {
  // Immediate fix #5: permanent mobile instruction blocks replaced with an
  // expandable "How this works" disclosure. Guards the reusable .page-help
  // component and its adoption on the Call Sheet (the named example), and
  // that the old permanent .cs-hint block is gone.
  const html = read("index.html");
  const components = read("css/components.css");
  const callsheetCss = read("css/callsheet.css");

  if (
    !/\.page-help\s*\{/.test(components) ||
    !/\.page-help__summary\s*\{/.test(components) ||
    !/\.page-help\[open\]\s*\.page-help__chevron/.test(components)
  ) {
    fail("reusable .page-help expandable-help component is missing from components.css");
  }

  if (
    !/<details class="page-help">/.test(html) ||
    !/class="page-help__summary"/.test(html)
  ) {
    fail("Call Sheet does not use the expandable .page-help disclosure");
  }

  if (/class="cs-hint"/.test(html) || /\.cs-hint\s*\{/.test(callsheetCss)) {
    fail("legacy permanent .cs-hint block still present instead of expandable help");
  }

  console.log("page help contract ok");
}

function checkActionGridContract() {
  // Immediate fix #6: one shared responsive action-grid/toolbar contract.
  // Guards the reusable .action-grid primitive (two-column phone grid,
  // single column when very narrow, full-width-primary spanning) and its
  // first adoption on the Opponent Scout export/import group.
  const components = read("css/components.css");
  const tendencies = read("js/tendencies-render.js");

  if (
    !/\.action-grid\s*\{/.test(components) ||
    !/grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/.test(components) ||
    !/\.action-grid\s*>\s*\.full-width-primary/.test(components)
  ) {
    fail("shared .action-grid responsive contract is missing from components.css");
  }

  if (!/repeat\(3,\s*minmax\(0,\s*1fr\)\)/.test(components)) {
    fail(".action-grid--icons three-column variant is missing");
  }

  if (!/class="td-export-buttons action-grid"/.test(tendencies)) {
    fail("Opponent Scout export group does not adopt the .action-grid contract");
  }

  console.log("action grid contract ok");
}

function checkPrimaryNavContract() {
  // Immediate fix #7: reduce main navigation to six core workflow tools plus
  // a single Utilities ("More") menu holding the supporting pages.
  const html = read("index.html");
  const nav = read("js/app-navigation.js");

  const utilBlock = html.match(
    /<div class="tool-menu-wrap tabs-utilities" data-anchored>[\s\S]*?<\/div>\s*<\/div>/,
  );
  if (!utilBlock) {
    fail("Utilities menu (.tabs-utilities[data-anchored]) is missing from the tab strip");
  }
  const util = utilBlock ? utilBlock[0] : "";

  // Supporting pages must live inside the Utilities menu, not as primary tabs.
  for (const id of ["tab-dashboard", "tab-installation", "tab-identity", "tab-offensebuilder"]) {
    if (!new RegExp(`id="${id}"[^>]*role="menuitem"`).test(util)) {
      fail(`${id} is not inside the Utilities menu as a menuitem`);
    }
  }
  // Load New CSV button must be inside the Utilities block with role="menuitem"
  const uploadBtnMatch = (util.match(/<button[^>]*data-action="showUpload"[^>]*>/g) || []).join("");
  if (!uploadBtnMatch || !/role="menuitem"/.test(uploadBtnMatch)) {
    // Try reversed attribute order (role before data-action)
    const uploadBtnMatch2 = (util.match(/<button[^>]*role="menuitem"[^>]*data-action="showUpload"[^>]*>/g) || []).join("");
    if (!uploadBtnMatch2) {
      fail("Load New CSV is not inside the Utilities menu");
    }
  }

  // The core tools must remain primary role="tab" buttons.
  for (const id of [
    "tab-playbook",
    "tab-tendencies",
    "tab-signals",
    "tab-gameplan",
    "tab-script",
    "tab-wristband",
    "tab-callsheet",
  ]) {
    if (!new RegExp(`id="${id}"[^>]*class="tab[^"]*"[^>]*role="tab"`).test(html)) {
      fail(`core tab ${id} is missing from the primary strip`);
    }
  }

  // Active-tab highlighting must be id-based (robust to reorder / menu items).
  if (
    !/getElementById\("tab-" \+ tabName\)/.test(nav) ||
    !/const UTILITY_TABS = new Set\(/.test(nav)
  ) {
    fail("app-navigation.js does not use id-based tab highlighting + UTILITY_TABS");
  }

  console.log("primary nav contract ok");
}

function checkGameWeekBarContract() {
  // Immediate fix #8: shared active-opponent/game-week bar beneath the tab strip.
  const html = read("index.html");
  const utils = read("js/utils.js");
  const moduleInit = read("js/app-module-init.js");

  if (!/id="gameWeekBar"[^>]*class="gw-bar"/.test(html)) {
    fail("#gameWeekBar element is missing from index.html");
  }
  if (!/id="gwBarOpponent"/.test(html)) {
    fail("#gwBarOpponent element is missing from the game-week bar");
  }
  if (!/data-action="focusDashOpponentSelect"/.test(html)) {
    fail("game-week bar edit button must use data-action=focusDashOpponentSelect");
  }
  if (!/function updateGameWeekBar\(\)/.test(utils)) {
    fail("updateGameWeekBar() is missing from utils.js");
  }
  if (!/if \(typeof invalidateScoutCache/.test(utils) || !/updateGameWeekBar\(\)/.test(utils)) {
    fail("setGameWeek() does not call updateGameWeekBar() after persisting");
  }
  if (!/updateGameWeekBar\(\)/.test(moduleInit)) {
    fail("initAllModules does not call updateGameWeekBar() on session restore");
  }

  console.log("game week bar contract ok");
}

function checkTransferReceiptContract() {
  // Immediate fix #9: transfer receipts on every cross-page push/send action.
  // showToast now accepts action as a function (callback) or string delegate.
  const utils = read("js/utils.js");
  const gpInt = read("js/gameplan-integrations.js");
  const scInt = read("js/script-integrations.js");

  if (!/typeof action === "function"/.test(utils)) {
    fail("showToast does not support function callbacks for action");
  }

  // Every major cross-page success toast should carry an actionLabel/action.
  const crossPageToasts = [
    // GP → Call Sheet (two sites)
    { file: gpInt, name: "GP→CallSheet", pattern: /Call Sheet.*actionLabel.*\u2192 Call Sheet/s },
    // GP → Script
    { file: gpInt, name: "GP→Script", pattern: /Practice Script.*actionLabel.*\u2192 Script/s },
    // GP → GamePlan (dashboard send)
    { file: gpInt, name: "Dashboard→GP", pattern: /Game Plan.*actionLabel.*\u2192 Game Plan/s },
    // Script → GamePlan
    { file: scInt, name: "Script→GP", pattern: /Game Plan.*actionLabel.*\u2192 Game Plan/s },
    // Script → Wristband
    { file: scInt, name: "Script→Wristband", pattern: /Wristband.*actionLabel.*\u2192 Wristband/s },
  ];
  for (const { file, name, pattern } of crossPageToasts) {
    if (!pattern.test(file)) {
      fail(`transfer receipt missing for ${name}`);
    }
  }

  console.log("transfer receipt contract ok");
}

function checkScoutOverviewContract() {
  // Immediate fix #10: Scout Overview screen between opponent select and raw table.
  const render = read("js/tendencies-render.js");
  const tendencies = read("js/tendencies.js");
  const css = read("css/tendencies.css");

  if (!/function renderScoutOverview\(\)/.test(render)) {
    fail("renderScoutOverview() is missing from tendencies-render.js");
  }
  if (!/function showTdFilmLog\(\)/.test(render)) {
    fail("showTdFilmLog() is missing (Film Log navigation from Overview)");
  }
  if (!/SAMPLE_MIN/.test(render)) {
    fail("Sample-size warning (SAMPLE_MIN) is missing from renderScoutOverview");
  }
  if (!/td-ov-bar/.test(render)) {
    fail("Horizontal bar rows (td-ov-bar) are missing from overview");
  }
  if (!/tdShowScoutOverview = opp && opp\.plays/.test(tendencies)) {
    fail("selectTendenciesOpponent does not set tdShowScoutOverview based on play count");
  }
  if (!/.td-ov-card/.test(css)) {
    fail(".td-ov-card styles are missing from tendencies.css");
  }

  console.log("scout overview contract ok");
}

function checkWristbandWorkspaceContracts() {
  const html = read("index.html");
  const wristband = read("js/wristband.js");
  const library = read("js/wristband-library.js");
  const render = read("js/wristband-render.js");
  const actions = read("js/wristband-cell-actions.js");
  const runtime = read("js/wristband-runtime.js");
  const storage = read("js/wristband-storage.js");
  const playerRuntime = read("js/wristband-export.js");
  const chrome = read("js/wristband-chrome.js");
  const logo = read("js/wristband-logo.js");
  const css = read("css/wristband.css");
  const printCss = read("css/print.css");
  const responsiveCss = read("css/responsive.css");
  const appStorage = read("js/storage.js");
  const cloudSync = read("js/cloud-sync.js");

  if (
    !/class="wb-page-header page-header-surface"/.test(html) ||
    !/class="wb-page-header-row page-header-row"/.test(html) ||
    !/class="wb-cmd-bar page-header-surface"/.test(html) ||
    !/class="wb-cmd-main page-header-row"/.test(html) ||
    !/class="wb-cmd-identity toolbar-status"/.test(html) ||
    !/class="wb-cmd-actions toolbar-secondary"/.test(html) ||
    !/id="wbLibraryStatus"/.test(html) ||
    !/class="[^"]*\bwb-appearance-panel\b[^"]*"/.test(html) ||
    !/data-action="openWbDisplayPanel"/.test(html) ||
    !/data-action="openWbSortPanel"/.test(html) ||
    !/data-oninput="scheduleWristbandPlayFilter"/.test(html) ||
    !/data-wb-mobile-view="library"/.test(html) ||
    !/id="wbLoadMore"/.test(html) ||
    !/id="wbActiveSaveTitle"/.test(html) ||
    !/id="wbCardViewport"/.test(html) ||
    !/id="wbSavedManagerOverlay"/.test(html) ||
    !/id="wbPrintPreviewOverlay"/.test(html) ||
    !/id="wbLogoCardOverlay"/.test(html) ||
    !/data-action="openWbLogoCardModal"/.test(html)
  ) {
    fail("wristband workspace hierarchy or progressive controls are incomplete");
  }
  if (
    !/const favoriteSet = new Set\(wbFavorites\)/.test(library) ||
    !/\.map\(\(play, index\) => \(\{ play, index \}\)\)/.test(library) ||
    !/data-action="addPlayToNextEmpty"/.test(library) ||
    !/function getWristbandPlayUsageMap\(/.test(library) ||
    !/function loadMoreWristbandPlays\(/.test(library) ||
    !/wbPreventDuplicates && isDuplicate/.test(library) ||
    !/WRISTBAND_RECENT_PLAYS/.test(wristband)
  ) {
    fail("wristband play library pagination, recent plays, or duplicate protection is incomplete");
  }
  if (
    !/function finalizeWristbandGridRender\(/.test(render) ||
    !/finalizeWristbandGridRender\(grid, cardData, CELLS_PER_CARD\)/.test(render) ||
    !/function shouldRenderWristbandPhoneEditor\(\)/.test(render) ||
    !/syncWristbandModeSurface\(wristbandType\)/.test(render) ||
    !/traceWristbandAction\("classic render start"/.test(render) ||
    !/traceWristbandAction\("classic render complete"/.test(render) ||
    !/wb-phone-editor-grid/.test(render) ||
    !/wb-phone-editor-row/.test(render) ||
    !/finalizeWristbandGridRender\(grid, card\.data, WB_ROWS\)/.test(chrome) ||
    !/role="gridcell" tabindex="0"/.test(render) ||
    !/e\.key === "ArrowDown"/.test(runtime) ||
    !/e\.key === "Delete"/.test(runtime)
  ) {
    fail("wristband shared rendering or keyboard navigation is incomplete");
  }
  if (
    !/function isWristbandTraceEnabled\(\)/.test(wristband) ||
    !/function getWristbandTraceSnapshot\(extra = \{\}\)/.test(wristband) ||
    !/function auditWristbandSnapshot\(snapshot = getWristbandTraceSnapshot\(\)\)/.test(wristband) ||
    !/function traceWristbandAction\(phase, payload = \{\}, level = "info"\)/.test(wristband) ||
    !/window\.bcDebugWristband = function bcDebugWristband/.test(wristband) ||
    !/window\.bcAuditWristband = function bcAuditWristband/.test(wristband) ||
    !/window\.bcEnableWristbandTrace = function bcEnableWristbandTrace/.test(wristband) ||
    !/window\.__bcWristbandTrace/.test(wristband) ||
    !/traceWristbandAction\("tab activation start"/.test(read("js/app-navigation.js")) ||
    !/traceWristbandAction\("grid cell click"/.test(runtime) ||
    !/function syncWristbandModeSurface\(mode = wristbandType \|\| ""\)/.test(read("js/wristband-chrome.js")) ||
    !/syncWristbandModeSurface\("classic"\)/.test(read("js/wristband-chrome.js")) ||
    !/syncWristbandModeSurface\("player"\)/.test(read("js/wristband-chrome.js")) ||
    !/traceWristbandAction\("classic start"/.test(read("js/wristband-chrome.js")) ||
    !/traceWristbandAction\("player render complete"/.test(read("js/wristband-chrome.js")) ||
    !/traceWristbandAction\("hydrate start"/.test(storage) ||
    !/function toggleWbSelectionMode\(/.test(actions) ||
    !/function moveSelectedWbCellsToCard\(/.test(actions) ||
    !/function clearSelectedWbCells\(/.test(actions) ||
    !/function setWristbandZoom\(/.test(render) ||
    !/function toggleWristbandFullscreen\(/.test(render)
  ) {
    fail("wristband selection mode, batch movement, or zoom controls are incomplete");
  }
  if (
    !/function updateWristbandSaveChrome\(/.test(storage) ||
    !/function saveWristbandAs\(/.test(storage) ||
    !/function openSavedWristbandManager\(/.test(storage) ||
    !/function duplicateSavedWristband\(/.test(storage) ||
    !/activeSaveId:\s*activeWristbandSaveId/.test(wristband)
  ) {
    fail("wristband active-save workflow or saved manager is incomplete");
  }
  if (
    !/function openWristbandPrintPreview\(/.test(playerRuntime) ||
    !/function executeWristbandPrintPreview\(/.test(playerRuntime) ||
    !/function _getWbDefaultPrintCardIndexes\(/.test(playerRuntime) ||
    !/function _getWbPrintScriptPageMeta\(/.test(playerRuntime) ||
    !/const WRISTBAND_PRINT_PROFILES = Object\.freeze/.test(playerRuntime) ||
    !/flag:\s*Object\.freeze\(\{[\s\S]*?width:\s*"4\.4in"[\s\S]*?height:\s*"2\.1in"[\s\S]*?cardsPerSheet:\s*4/.test(
      playerRuntime,
    ) ||
    !/function _getSelectedWbPrintProfile\(/.test(playerRuntime) ||
    !/function openWbLogoCardModal\(/.test(logo) ||
    !/function handleWbLogoCardUpload\(/.test(playerRuntime) ||
    !/function setWbLogoSmartCenter\(/.test(logo) ||
    !/function _createWbSmartCenteredLogoDataUrl\(/.test(playerRuntime) ||
    !/function printWbLogoCardThree\(/.test(logo) ||
    !/STORAGE_KEYS\.WRISTBAND_LOGO_CARD/.test(playerRuntime) ||
    !/WRISTBAND_LOGO_CARD:\s*"wristbandLogoCard"/.test(appStorage) ||
    !/STORAGE_KEYS\.WRISTBAND_LOGO_CARD/.test(cloudSync) ||
    !/id="wbPrintCardLegend"/.test(html) ||
    !/id="wbPrintSizeMode"/.test(html) ||
    !/data-action="selectCurrentWbPrintCard"/.test(html) ||
    !/_executeClassicWristbandPrint\(cardIndexes, "one-per-page", printProfile\.id\)/.test(
      playerRuntime,
    ) ||
    !/_executePrintAllPlayerCards\(cardIndexes, positionKeys,\s*\{[\s\S]*?blankRules,[\s\S]*?printSize:\s*printProfile\.id/.test(
      playerRuntime,
    )
  ) {
    fail("wristband print preview or one-per-page execution is incomplete");
  }
  if (
    !/#wristband\.wb-mobile-view-builder \.wristband-plays/.test(css) ||
    !/#wristband\.wb-mobile-view-library \.wristband-preview/.test(css) ||
    !/body\.shell-phone #wristband \.wristband-grid\.wb-phone-editor-grid[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/.test(
      css,
    ) ||
    !/body\.shell-phone #wristband \.wb-phone-editor-row[\s\S]*min-height:\s*58px/.test(
      css,
    ) ||
    !/body\.shell-phone #wristband \.wb-phone-editor-num,[\s\S]*body\.shell-phone #wristband \.wb-phone-editor-action[\s\S]*min-height:\s*44px/.test(
      css,
    ) ||
    !/\.wb-print-preview-layout/.test(css) ||
    !/\.wb-print-preview-modal\s*\{[\s\S]*?max-width:\s*min\(1120px/.test(css) ||
    !/\.wb-print-preview-canvas \.pc-print-card-wrap/.test(css) ||
    !/\.wb-print-preview-canvas\[data-wb-print-size="flag"\] \.pc-print-card-wrap/.test(css) ||
    !/body\[data-wb-print-size="flag"\] \.pc-print-card-wrap \.wristband-grid/.test(css) ||
    !/body\[data-wb-print-size="flag"\] \.wristband-print \.wristband-grid/.test(printCss) ||
    !/\.wb-logo-card-modal/.test(css) ||
    !/\.wb-logo-print-card/.test(css) ||
    !/\.wb-logo-print-card\.wb-logo-smart-centered img/.test(css) ||
    !/\.wb-logo-print-page \.wb-logo-print-card/.test(css)
  ) {
    fail("wristband mobile view or print preview styling is incomplete");
  }
  if (
    /\.wristband-(?:container|card|grid|cell)|\.wb-stats-bar/.test(responsiveCss)
  ) {
    fail("wristband responsive layout has leaked back into shared responsive.css");
  }

  console.log("wristband workspace contracts ok");
}

function checkPlayerWristbandRuleOverrides() {
  const wristband = read("js/wristband.js");
  const playerRuntime = read("js/wristband-export.js");
  const chrome = read("js/wristband-chrome.js");
  const popup = read("js/wristband-cell-popup.js");
  const html = read("index.html");
  const css = read("css/wristband.css");

  if (
    !/playerRuleSources:\s*normalizePlayerRuleSources/.test(wristband) ||
    !/playerAssignmentOverrides:\s*normalizePlayerAssignmentOverrides/.test(
      wristband,
    ) ||
    !/getPlayerAssignmentText\(play,\s*custom,\s*posKey\)/.test(playerRuntime)
  ) {
    fail("player wristband rule overrides are not stored and printed through cell customizations");
  }
  if (
    !/class="pc-rule-select/.test(chrome) ||
    !/delete custom\.playerRuleSources\[basePosition\]/.test(chrome) ||
    !/delete custom\.playerAssignmentOverrides\[basePosition\]/.test(
      chrome,
    )
  ) {
    fail("player wristband rule source selection or reset behavior is incomplete");
  }
  if (
    !/pendingPlayerRuleSources/.test(popup) ||
    !/pendingPlayerAssignmentOverrides/.test(popup)
  ) {
    fail("cell popup edits can discard player wristband rule overrides");
  }
  if (
    !/data-action="printOnePlayerCard"/.test(html) ||
    !/data-action="printThreePlayerCardCopies"/.test(html) ||
    !/id="wbBlankPlayerRules"/.test(html) ||
    !/id="pcBlankPlayerRules"/.test(html) ||
    !/id="wbPrintBlankRules"/.test(html) ||
    !/wbBlankPlayerRules/.test(wristband) ||
    !/handlePlayerBlankRulesChange/.test(wristband) ||
    !/blankPlayerRules/.test(read("js/wristband-render.js")) ||
    !/pc-print-page pc-print-single/.test(playerRuntime) ||
    !/_getWbPrintBlankRules/.test(playerRuntime) ||
    !/pc-print-assignment-blank/.test(playerRuntime) ||
    !/pc-print-assignment-blank/.test(playerRuntime) ||
    !/blankRules/.test(playerRuntime) ||
    !/\.pc-assignment-cell\.pc-assignment-blank/.test(css) ||
    !/\.pc-print-assignment-blank/.test(css) ||
    !/\.pc-print-single\s*\{[\s\S]*?justify-content:\s*center/.test(css)
  ) {
    fail("player wristband one-per-page and three-copy print modes are incomplete");
  }

  console.log("player wristband rule override and print contracts ok");
}

function checkSevenOnSevenTemplate() {
  const snapshots = read("js/gameplan-snapshots.js");
  const print = read("js/gameplan-print.js");
  const gameplan = read("js/gameplan.js");
  const smart = read("js/gameplan-smart.js");
  const callsheet = read("js/callsheet.js");
  const callsheetRender = read("js/callsheet-render.js");
  const callsheetFilters = read("js/callsheet-filters.js");
  const callsheetPicker = read("js/callsheet-picker-runtime.js");
  const callsheetTemplates = read("js/callsheet-templates.js");
  const css = read("css/gameplan.css");
  const boxes = snapshots.match(
    /const GP_SEVEN_ON_SEVEN_BOXES\s*=\s*\[([\s\S]*?)\n\];/,
  )?.[1] || "";
  const boxCount = [...boxes.matchAll(/\bid:\s*"7on7-/g)].length;
  if (boxCount !== 19) {
    fail(`7-on-7 template must define 19 tournament buckets; found ${boxCount}`);
  }
  [
    "1st Down",
    "3rd & Long",
    "Marco",
    "Skro Bros",
    "Cov 0/1 Beaters",
    "Man 2 Beaters",
    "Pass Plays on Wristband",
    "Two-Point Conversion",
  ].forEach((label) => {
    if (!boxes.includes(`label: "${label}"`)) {
      fail(`7-on-7 template is missing the ${label} bucket`);
    }
  });
  if (
    !snapshots.includes('wristbandAutoBoxId: "7on7-wristband-passes"') ||
    !/function _gpSyncLoadedWristbandBox\(/.test(gameplan)
  ) {
    fail("7-on-7 wristband passing-play auto-sync is incomplete");
  }
  if (
    !snapshots.includes('printPreset: "sevenOnSeven"') ||
    !snapshots.includes("allowedPlayTypes: [...GP_PASSING_PLAY_TYPES]")
  ) {
    fail("7-on-7 template is missing passing-only or print-preset metadata");
  }
  if (
    !/function _gpApplySevenOnSevenPrintDefaults\(/.test(print) ||
    !/onePage:\s*true/.test(print) ||
    !/columns:\s*4/.test(print) ||
    !/gp-print-one-page/.test(css)
  ) {
    fail("7-on-7 one-page print preset is incomplete");
  }
  if (
    !/const GP_COVERAGE_CHOICES/.test(gameplan) ||
    !/function _gpKeywordMatchesPlay\(/.test(gameplan) ||
    !/_gpPlayMatchesCriteria\(play, meta\.criteria\)/.test(smart)
  ) {
    fail("7-on-7 coverage, keyword, or smart-suggestion matching is incomplete");
  }
  if (
    !/function _gpGetBoardBoxes\(/.test(gameplan) ||
    !/_gpGetBoardBoxes\(board/.test(print)
  ) {
    fail("game plan print does not share screen box visibility/order rules");
  }
  if (!/if \(changed\) _gpSaveBoards\(all\)/.test(gameplan)) {
    fail("game plan reads still rewrite unchanged board storage");
  }

  const callSheetCategories = callsheetRender.match(
    /const CS_SEVEN_ON_SEVEN_CATEGORIES\s*=\s*\[([\s\S]*?)\n\];/,
  )?.[1] || "";
  const callSheetCategoryCount = [
    ...callSheetCategories.matchAll(/\bid:\s*"cs-7on7-/g),
  ].length;
  if (callSheetCategoryCount !== 19) {
    fail(
      `7-on-7 call sheet template must define 19 tournament buckets; found ${callSheetCategoryCount}`,
    );
  }
  [
    "Openers",
    "3rd & Long",
    "Marco",
    "Skro Bros",
    "Cov 0/1 Beaters",
    "Man 2 Beaters",
    "Pass Plays on Wristband",
    "Two-Point Conversion",
  ].forEach((label) => {
    if (!callSheetCategories.includes(`name: "${label}"`)) {
      fail(`7-on-7 call sheet template is missing the ${label} bucket`);
    }
  });
  if (
    !callsheetTemplates.includes(
      'wristbandAutoCategoryId: "cs-7on7-wristband-passes"',
    ) ||
    !/function syncLoadedWristbandToCallSheetCategory\(/.test(callsheetPicker)
  ) {
    fail("7-on-7 call sheet wristband passing-play auto-sync is incomplete");
  }
  if (
    !/hiddenCategoryIds:\s*\[[\s\S]*BASE_CALLSHEET_FRONT[\s\S]*BASE_CALLSHEET_BACK/.test(
      callsheetTemplates,
    ) ||
    !/allowedPlayTypes:\s*\[\.\.\.CS_PASSING_PLAY_TYPES\]/.test(callsheetTemplates)
  ) {
    fail("7-on-7 call sheet template does not isolate its passing-only categories");
  }
  if (
    !/function callSheetPlayMatchesCriteria\(/.test(callsheetFilters) ||
    !/function callSheetCoverageMatches\(/.test(callsheetFilters) ||
    !/function callSheetKeywordMatches\(/.test(callsheetFilters)
  ) {
    fail("7-on-7 call sheet criteria matching is incomplete");
  }
  if (
    !/pages:\s*"front"/.test(callsheetTemplates) ||
    !/columns:\s*4/.test(callsheetTemplates) ||
    !/data-action="loadBuiltInCallSheetTemplate"/.test(callsheetTemplates) ||
    !callsheetTemplates.includes('id: "builtin-standard-callsheet"')
  ) {
    fail("7-on-7 call sheet template is missing print, reset, or template-library integration");
  }
  console.log("7-on-7 game plan and call sheet contracts ok");
}

function checkCacheBusters() {
  const html = read("index.html");
  const refs = [
    ...html.matchAll(/(?:src|href)="((?:js|css)\/[^"]+\.(?:js|css)(?:\?v=(\d+))?)"/g),
  ];
  const unversioned = refs.filter((match) => !match[2]).map((match) => match[1]);
  if (unversioned.length) {
    fail(`index.html has unversioned code assets: ${unversioned.join(", ")}`);
  }

  const stamps = refs.map((match) => match[2]).filter(Boolean);
  const versions = unique(stamps);
  if (versions.length !== 1) {
    fail(`index.html has inconsistent asset cache busters: ${versions.join(", ")}`);
  }

  const sw = read("sw.js");
  const swVersion = sw.match(/const CACHE_NAME = "bcoffense-v(\d+)"/)?.[1];
  if (!swVersion) {
    fail("service worker cache version not found");
  } else if (versions[0] !== swVersion) {
    fail(`asset cache buster v${versions[0] || "unknown"} does not match SW v${swVersion}`);
  }
  console.log(`cache busters ok (v${versions[0] || "unknown"})`);
}

function checkServiceWorkerLifecycle() {
  const html = read("index.html");
  const sw = read("sw.js");
  const registrationBlock = html.match(
    /<!-- Service Worker Registration -->([\s\S]*?)<\/script>/,
  )?.[1] || "";
  const installBlock = sw.match(
    /self\.addEventListener\("install"[\s\S]*?\n\}\);/,
  )?.[0] || "";

  if (/postMessage\(\s*["']skipWaiting["']/.test(registrationBlock)) {
    fail("service worker registration automatically activates waiting updates");
  }
  if (/controllerchange[\s\S]*?if\s*\(\s*!\s*_isDirty\s*\(\s*\)\s*\)[\s\S]*?location\.reload/.test(registrationBlock)) {
    fail("service worker controller changes force a page reload");
  }
  if (/skipWaiting\(\)/.test(installBlock)) {
    fail("service worker install forces takeover of active app tabs");
  }
  if (!/function isCacheableResponse\(/.test(sw)) {
    fail("service worker does not guard cache writes by response status/policy");
  }
  if (/return undefined;/.test(sw)) {
    fail("service worker fetch fallback can resolve without a Response");
  }

  console.log("service worker lifecycle preserves active work");
}

function checkCleanupAudit() {
  const result = spawnSync(process.execPath, ["scripts/cleanup-audit.mjs", "--json"], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    fail(`cleanup audit failed\n${result.stderr || result.stdout}`);
    return;
  }

  let audit;
  try {
    audit = JSON.parse(result.stdout);
  } catch (err) {
    fail(`cleanup audit returned invalid JSON: ${err.message}`);
    return;
  }

  [
    "missingActions",
    "missingInputHandlers",
    "indexAssetsMissing",
    "loadedAssetsNotCached",
    "cachedAssetsMissing",
  ].forEach((key) => {
    if (audit[key]?.length) {
      fail(`cleanup audit ${key}: ${audit[key].join(", ")}`);
    }
  });

  console.log(
    `cleanup audit ok (${audit.counts.jsFiles} JS files, ${audit.counts.dataActions} actions)`,
  );
}

function checkStressAuditHarness() {
  const pkg = JSON.parse(read("package.json"));
  const gitignore = read(".gitignore");
  const harness = read("scripts/stress-seed-audit.mjs");
  const playbookCss = read("css/playbook.css");
  const scriptCss = read("css/script.css");
  const callsheetCss = read("css/callsheet.css");
  const dashboardCss = read("css/dashboard.css");

  if (pkg.scripts?.["stress:audit"] !== "node scripts/stress-seed-audit.mjs") {
    fail("stress audit harness is not exposed through npm run stress:audit");
  }
  if (!/--script-perf/.test(pkg.scripts?.["stress:script-perf"] || "")) {
    fail("script performance stress shortcut is missing");
  }
  if (!/\.stress-audit\//.test(gitignore)) {
    fail("stress audit reports are not ignored by git");
  }
  [
    /function generateStressData\(opts\)/,
    /async function seedApp\(page, data\)/,
    /async function auditRoleViewport\(page, role, viewport, tabs, opts\)/,
    /async function collectScriptPerformance\(page, viewport, opts\)/,
    /function collectIssues\(report, maxIssues\)/,
    /function formatScriptPerfLine\(perf\)/,
    /runScriptRenderProfileBenchmark\(iterations\)/,
    /filterTimings/,
    /scriptPerformance/,
    /stress-audit-report\.json/,
    /stress-audit-report\.md/,
  ].forEach((pattern) => {
    if (!pattern.test(harness)) {
      fail(`stress audit harness is missing ${pattern}`);
    }
  });
  if (
    !/\.pb-shortcuts-hint\s*\{[\s\S]*width:\s*44px[\s\S]*min-height:\s*44px/.test(playbookCss) ||
	    !/#script \.script-toolbar \.toolbar-btn-xs\s*\{[\s\S]*flex:\s*0 0 44px[\s\S]*min-width:\s*44px[\s\S]*min-height:\s*44px/.test(scriptCss) ||
	    !/body\.shell-phone #callsheet \.callsheet-play \.remove-play,[\s\S]*body\.shell-phone #callsheet \.callsheet-play \.cs-hash-swap\s*\{[\s\S]*width:\s*44px[\s\S]*min-height:\s*44px/.test(callsheetCss) ||
	    !/\.player-home-refresh__btn\s*\{[\s\S]*min-height:\s*44px/.test(dashboardCss) ||
	    !/\.player-home-refresh__install\s*\{[\s\S]*min-height:\s*38px/.test(dashboardCss)
	  ) {
    fail("stress audit touch-target fixes are missing");
  }

  console.log("stress audit harness contracts ok");
}

function checkE2eLocalHarness() {
  const pkg = JSON.parse(read("package.json"));
  const testsPkg = JSON.parse(read("tests/package.json"));
  const config = read("tests/playwright.config.js");
  const helpers = read("tests/specs/helpers.js");
  const dataIntegritySpec = read("tests/specs/08-data-integrity.spec.js");
  const hydrationSpec = read("tests/specs/09-first-load-hydration.spec.js");
  const server = read("scripts/e2e-local-server.mjs");

  if (pkg.scripts?.["test:e2e:local"] !== "npm --prefix tests run test:local") {
    fail("root package does not expose npm run test:e2e:local");
  }
  ["phone", "ipad", "all"].forEach((target) => {
    if (pkg.scripts?.[`test:e2e:local:${target}`] !== `npm --prefix tests run test:local:${target}`) {
      fail(`root package does not expose npm run test:e2e:local:${target}`);
    }
  });
  if (pkg.scripts?.["test:e2e:local:hydration"] !== "npm --prefix tests run test:local:hydration") {
    fail("root package does not expose npm run test:e2e:local:hydration");
  }
  if (!/BCOFFENSE_E2E_LOCAL=1 playwright test --project=chromium-desktop/.test(testsPkg.scripts?.["test:local"] || "")) {
    fail("tests package does not expose the local E2E auth harness");
  }
  if (
    !/test:local:phone/.test(JSON.stringify(testsPkg.scripts || {})) ||
    !/--project=ipad-portrait --project=ipad-landscape/.test(testsPkg.scripts?.["test:local:ipad"] || "") ||
    !/--project=chromium-desktop --project=ipad-portrait --project=ipad-landscape --project=iphone --project=phone-narrow/.test(testsPkg.scripts?.["test:local:all"] || "") ||
    !/specs\/09-first-load-hydration\.spec\.js/.test(testsPkg.scripts?.["test:local:hydration"] || "")
  ) {
    fail("tests package does not expose the local viewport E2E matrix");
  }
  if (
    !/BCOFFENSE_E2E_LOCAL/.test(config) ||
    !/webServer: E2E_LOCAL/.test(config) ||
    !/scripts\/e2e-local-server\.mjs/.test(config)
  ) {
    fail("Playwright config is not wired to the local auth server");
  }
  if (
    !/appLogin\.isVisible\(\)/.test(helpers) ||
    !/ensureLocalWorkspaceReady/.test(helpers) ||
    !/installRuntimeErrorGuards/.test(helpers) ||
    !/assertRuntimeClean/.test(helpers) ||
    !/requestfailed/.test(helpers) ||
    !/framenavigated/.test(helpers) ||
    !/Login did not complete/.test(helpers) ||
    !/test:e2e:local/.test(helpers)
  ) {
    fail("Playwright helpers are missing local login or runtime guard coverage");
  }
  if (
    !/backup and restore preserve playbook plus downstream artifacts/.test(dataIntegritySpec) ||
    !/source identity metadata makes edited and deleted source plays detectable/.test(dataIntegritySpec) ||
    !/copyPlayWithSourceIdentity/.test(dataIntegritySpec) ||
    !/storageManager\.restoreAllData/.test(dataIntegritySpec)
  ) {
    fail("local data integrity spec is missing backup/restore or source identity coverage");
  }
  if (
    !/Local first-load hydration/.test(hydrationSpec) ||
    !/installRuntimeErrorGuards/.test(hydrationSpec) ||
    !/assertRuntimeClean/.test(hydrationSpec) ||
    !/LAST_ACTIVE_TAB/.test(hydrationSpec) ||
    !/dashboard/.test(hydrationSpec) ||
    !/gameplan/.test(hydrationSpec) ||
    !/callsheet/.test(hydrationSpec)
  ) {
    fail("local first-load hydration spec is missing runtime or tab hydration coverage");
  }
  if (
    !/handleAuthLogin/.test(server) ||
    !/\/auth\/login/.test(server) ||
    !/handleApiStub/.test(server) ||
    !/\/api\/notifications/.test(server)
  ) {
    fail("local E2E server is missing auth/API stubs");
  }

  const result = spawnSync(process.execPath, ["--check", "scripts/e2e-local-server.mjs"], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    fail(`scripts/e2e-local-server.mjs failed node --check\n${result.stderr || result.stdout}`);
  }

  console.log("local E2E auth harness contracts ok");
}

function checkStartupDiagnosticsAndRenderQueue() {
  const appDiagnosticsSource = read("js/app-diagnostics.js");
  const startupOrchestrator = read("js/startup-orchestrator.js");
  const appInit = read("js/app-init.js");
  const storage = read("js/storage.js");
  const moduleInit = read("js/app-module-init.js");
  const dashboardRender = read("js/dashboard-render.js");
  const appNavigation = read("js/app-navigation.js");
  const dashboard = read("js/dashboard.js");
  const auth = read("js/auth.js");
  const gameplanActions = read("js/gameplan-actions.js");
  const cloudSync = read("js/cloud-sync.js");
  const appShell = read("js/app-shell.js");
  const appNotifications = read("js/app-notifications.js");
  const playClips = read("js/play-clips.js");
  const html = read("index.html");

  if (!/const appDiagnostics\s*=/.test(appDiagnosticsSource) || !/window\.bcDebugStartup/.test(appDiagnosticsSource)) {
    fail("startup diagnostics API is not exposed");
  }
  if (
    !/const appStartup\s*=/.test(startupOrchestrator) ||
    !/function queueTask\(/.test(startupOrchestrator) ||
    !/function shouldSuppressCloudAutoPush\(/.test(startupOrchestrator) ||
    !/window\.appStartup = appStartup/.test(startupOrchestrator)
  ) {
    fail("startup orchestrator API is incomplete");
  }
  if (
    !/window\.appStartup\.markFirstPaintReleased/.test(appShell) ||
    !/window\.appStartup\.shouldSuppressCloudAutoPush/.test(cloudSync) ||
    !/window\.appStartup\.runCritical\("storage-reload"/.test(storage) ||
    !/window\.appStartup\.queueTask\("clip-index-warmup"/.test(playClips) ||
	    !/window\.appStartup\.queueTask\("play-image-key-scan"/.test(moduleInit) ||
	    !/_queueStartupTask\("service-worker-update-check"/.test(html) ||
	    !/queueStartupTask\("cloud-auto-pull"/.test(auth) ||
	    !/queueStartupTask\("player-team-refresh"[\s\S]*delay: 1000[\s\S]*priority: 40/.test(auth)
	  ) {
	    fail("startup post-load sync/update tasks are not routed through the orchestrator");
	  }
  if (
    !/initNotifications\(\{ deferFirstPoll: currentAuthUser\.role === "player" \}\)/.test(auth) ||
    !/currentAuthUser\.role !== "player"[\s\S]*Logged in as/.test(auth) ||
    !/schedulePlayerTeamUpdateCheck\(\{ delay: 700, startup: true \}\)/.test(auth) ||
    !/function refreshPlayerTeamApp\(opts = \{\}\)[\s\S]*const quietStartup = quiet && startup/.test(appShell) ||
    !/let playerTeamRefreshPromise = null/.test(appShell) ||
    !/if \(playerTeamRefreshPromise\)/.test(appShell) ||
    !/showToast\("Checking for coach updates"/.test(appShell) ||
    !/title: "Checking for coach updates"/.test(appShell) ||
    !/state\.title \|\| "Ready"/.test(appShell) ||
    !/title: "Try Again"/.test(appShell) ||
    !/phaseStateOpts = quietStartup \? \{ render: false \}/.test(appShell) ||
    !/refreshPlayerCloudBackup\(\{[\s\S]*navigate: !quietStartup,[\s\S]*skipIfCurrent: true/.test(appShell) ||
    !/refreshNotificationStatus\(\{ render: !quietStartup \}\)/.test(appShell) ||
    !/function initNotifications\(opts = \{\}\)/.test(appNotifications) ||
    !/if \(!opts\.deferFirstPoll\) _pollUnreadCount\(\)/.test(appNotifications) ||
    !/function refreshNotificationStatus\(opts = \{\}\)[\s\S]*_pollUnreadCount\(opts\)/.test(appNotifications) ||
    !/function isCloudRemoteAlreadyKnown\(remote/.test(cloudSync) ||
    !/opts\.skipIfCurrent !== false && isCloudRemoteAlreadyKnown\(remote\)/.test(cloudSync)
  ) {
    fail("player first-impression startup refresh is not ordered and quiet");
  }
  if (
    /No cloud backup has been pushed yet|Getting team app ready|Already checking team updates|Home is ready|Checking team updates|Waiting on coach update|Team app ready|No team workspace has been pushed yet|Team app could not refresh|Refresh needs connection/.test(appShell) ||
    /Team app update status|Update status|Practice version|Team data|Not synced yet|Refresh team app|newest app version/.test(dashboardRender)
  ) {
    fail("player first-impression startup copy still exposes backup/getting-ready language");
  }
  if (/Sync Now|sync so players can view them/.test(moduleInit)) {
    fail("startup should not prompt coaches into diagram recovery sync");
  }
  if (!/appDiagnostics\.mark\("startup:init"\)/.test(appInit)) {
    fail("initApp does not mark startup diagnostics");
  }
  if (!/runReloadStep\("get-playbook"/.test(storage) || !/storage-reload:done/.test(storage)) {
    fail("reloadAppFromStorage is not instrumented by phase");
  }
  if (!/const requestRenderDashboard\s*=/.test(dashboardRender)) {
    fail("dashboard render queue helper is missing");
  }
  if (
    !/let tendenciesNeedsInit = true/.test(moduleInit) ||
    !/let callSheetNeedsInit = true/.test(moduleInit) ||
    !/function ensureTendenciesReady\(force = false\)/.test(moduleInit) ||
    !/function ensureCallSheetReady\(force = false\)/.test(moduleInit) ||
    !/currentActiveTab === "gameplan"[\s\S]*requestRenderGamePlan\(\)/.test(moduleInit) ||
    !/\["playbook", "script", "gameplan"\]\.includes\(currentActiveTab\)[\s\S]*refreshPlayReadinessSurfaces\("play-images"\)/.test(moduleInit)
  ) {
    fail("startup module deferral gates are incomplete");
  }
  if (
    !/tabName === "tendencies"[\s\S]*ensureTendenciesReady\(\)/.test(appNavigation) ||
    !/tabName === "callsheet"[\s\S]*ensureCallSheetReady\(\)/.test(appNavigation)
  ) {
    fail("showTab does not use first-use module gates");
  }

  const directDashboardRenderCall =
    /(renderDashboard\(\)|renderDashboard,\s*\{|\(\)\s*=>\s*renderDashboard\(\)|setTimeout\(renderDashboard)/;
  [
    ["js/app-navigation.js", appNavigation],
    ["js/dashboard.js", dashboard],
    ["js/auth.js", auth],
    ["js/gameplan-actions.js", gameplanActions],
    ["js/storage.js", storage],
  ].forEach(([file, source]) => {
    if (directDashboardRenderCall.test(source)) {
      fail(`${file} calls renderDashboard directly instead of requestRenderDashboard`);
    }
  });

  console.log("startup diagnostics and dashboard render queue ok");
}

function checkStorageRestoreNormalization() {
  const storage = read("js/storage.js");

  [
    "BACKUP_ARRAY_KEYS",
    "BACKUP_OBJECT_KEYS",
    "BACKUP_BOOLEAN_KEYS",
    "BACKUP_STRING_KEYS",
    "normalizeBackupValueForRestore",
  ].forEach((token) => {
    if (!storage.includes(token)) {
      fail(`storage restore normalization missing ${token}`);
    }
  });

  [
    "STORAGE_KEYS.PLAYBOOK",
    "STORAGE_KEYS.SAVED_SCRIPTS",
    "STORAGE_KEYS.CALLSHEET_TEMPLATES",
    "STORAGE_KEYS.DEFENSIVE_TENDENCIES",
    "STORAGE_KEYS.GAME_PLAN_TEMPLATES",
    "STORAGE_KEYS.PLAYER_QUIZ_RESULTS",
  ].forEach((token) => {
    if (!new RegExp(`BACKUP_ARRAY_KEYS[\\s\\S]*?${token.replace(".", "\\.")}`).test(storage)) {
      fail(`storage restore array contract missing ${token}`);
    }
  });

  [
    "STORAGE_KEYS.CALL_SHEET",
    "STORAGE_KEYS.CALL_SHEET_SETTINGS",
    "STORAGE_KEYS.GAME_PLAN_BOARDS",
    "STORAGE_KEYS.AUTH_SESSION",
    "STORAGE_KEYS.PLAYER_QUIZ_SETTINGS",
  ].forEach((token) => {
    if (!new RegExp(`BACKUP_OBJECT_KEYS[\\s\\S]*?${token.replace(".", "\\.")}`).test(storage)) {
      fail(`storage restore object contract missing ${token}`);
    }
  });

  if (
    !/validateBackupPayload[\s\S]*?normalizeBackupValueForRestore\(key, parsedValue, result\.warnings\)/.test(
      storage,
    )
  ) {
    fail("backup validation does not report restore normalization warnings");
  }
  if (
    !/restoreAllData[\s\S]*?normalizeBackupValueForRestore\(key, value, restoreWarnings\)/.test(
      storage,
    ) ||
    !/restoreAllData[\s\S]*?normalizeBackupValueForRestore\(\s*STORAGE_KEYS\.PLAYBOOK/.test(
      storage,
    )
  ) {
    fail("restoreAllData does not persist normalized backup values");
  }
  if (!/storage-restore:normalized/.test(storage)) {
    fail("storage restore normalization is not instrumented");
  }

  console.log("storage restore normalization contracts ok");
}

function checkStartupTabRestoreContracts() {
  const bootstrap = read("js/app-bootstrap.js");
  const auth = read("js/auth.js");

  [
    "pendingRestoredStartupTab",
    "getRestorableStoredTab",
    "refreshHydratedStartupSurfaces",
    "applyPendingRestoredStartupTab",
    "queueRestoredStartupTab",
    "whenAuthReady()",
    "window.applyPendingRestoredStartupTab",
  ].forEach((token) => {
    if (!bootstrap.includes(token)) {
      fail(`startup restored-tab contract missing ${token}`);
    }
  });

  if (
    !/restoreStoredPlaybookSession[\s\S]*?const lastTab = getRestorableStoredTab\(\)/.test(
      bootstrap,
    ) ||
    !/restoreStoredPlaybookSession[\s\S]*?queueRestoredStartupTab\(lastTab\)/.test(
      bootstrap,
    ) ||
    !/restoreStoredPlaybookSession[\s\S]*?refreshHydratedStartupSurfaces\(currentActiveTab\)/.test(
      bootstrap,
    )
  ) {
    fail("stored playbook startup does not defer and refresh restored tabs");
  }

  const authApplyCount = (auth.match(/applyPendingRestoredStartupTab\(\)/g) || []).length;
  if (authApplyCount < 3) {
    fail("auth does not apply pending restored tab after session and login paths");
  }

  console.log("startup restored-tab contracts ok");
}

function checkStartupRestoreHarness() {
  const result = spawnSync(process.execPath, ["scripts/startup-restore-harness.mjs"], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    fail(`startup restore harness failed\n${result.stderr || result.stdout}`);
    return;
  }
  console.log((result.stdout || "startup restore harness passed").trim());
}

function checkGracefulLoadingStates() {
  const html = read("index.html");
  const moduleInit = read("js/app-module-init.js");
  const dashboardRender = read("js/dashboard-render.js");
  const playbookRender = read("js/playbook-render.js");
  const dashboardCss = read("css/dashboard.css");
  const playbookCss = read("css/playbook.css");

  [
    "data-loading-state=\"dashboard-command\"",
    "data-loading-state=\"dashboard-card\"",
    "data-loading-state=\"dashboard-schedule\"",
    "dash-loading-panel",
  ].forEach((token) => {
    if (!html.includes(token)) {
      fail(`dashboard first-paint loading markup missing ${token}`);
    }
  });

  if (
    !/function renderDashboardLoadingState\(/.test(dashboardRender) ||
    !/_dashboardLoadingCard/.test(dashboardRender) ||
    !/Restoring dashboard/.test(dashboardRender)
  ) {
    fail("dashboard loading state renderer is missing");
  }
  if (
    !/function renderPlaybookLoadingState\(/.test(playbookRender) ||
    !/pb-loading-row/.test(playbookRender) ||
    !/pb-card--loading/.test(playbookRender) ||
    !/colspan="11"/.test(playbookRender)
  ) {
    fail("playbook loading state renderer is missing or does not span all columns");
  }
  if (
    !/renderPlaybookLoadingState\("Restoring playbook/.test(moduleInit) ||
    !/currentActiveTab === "dashboard"[\s\S]*renderDashboardLoadingState\("Restoring dashboard/.test(moduleInit)
  ) {
    fail("module init does not seed graceful loading states");
  }
  if (
    !/\.dash-loading-panel/.test(dashboardCss) ||
    !/\.dash-card--loading/.test(dashboardCss) ||
    !/\.dash-loading-dot/.test(dashboardCss)
  ) {
    fail("dashboard loading state styles are missing");
  }
  if (
    !/\.pb-loading-row__content/.test(playbookCss) ||
    !/\.pb-card--loading/.test(playbookCss)
  ) {
    fail("playbook loading state styles are missing");
  }

  console.log("graceful loading states ok");
}

function checkWorkspaceSyncContracts() {
  const roadmap = read("WORKSPACE_SYNC_ROADMAP.md");
  const consolidatedRoadmap = read("CONSOLIDATED_ROADMAP.md");
  const workspaceSync = read("js/workspace-sync.js");
  const shell = read("js/app-shell.js");
  const layout = read("css/layout.css");
  const dashboardRender = read("js/dashboard-render.js");
  const dashboardCss = read("css/dashboard.css");
  const componentsCss = read("css/components.css");
  const playbookCss = read("css/playbook.css");
  const cloudSync = read("js/cloud-sync.js");
  const playImages = read("js/play-images.js");
  const scriptPlayer = read("js/script-player.js");
  const appSession = read("js/app-session.js");
  const html = read("index.html");
  const agentGuide = read("AGENTS.md");

  [
    "# BCOffense Workspace Sync Roadmap",
    "- [x] Add a top coach-facing Workspace Sync chip",
    "- [x] Route existing local dirty/saving/saved state into the chip",
    "- [x] Route existing Cloud autosave pending/running/error state into the chip",
    "- [x] Route play-image/media queue state into the chip",
    "- [x] Warn before exit while local, cloud, or media work is pending",
    "- [x] Replace bottom loading-bar style feedback with compact top `Saving...`,",
    "- [x] Create one queue abstraction for local save, cloud push, media upload, and",
    "- [x] Deduplicate repeated writes so rapid edits become one visible save cycle.",
    "- [x] Expose retry for failed cloud/media work from the chip.",
    "- [x] Keep manual Cloud Sync and Sync Diagrams as advanced fallback actions.",
    "- [x] Replace \"Sync Diagrams\" daily workflow with \"Publish Media\".",
    "- [x] Hide advanced diagram sync from primary Playbook chrome; keep `Publish",
    "- [x] Rewrite player update copy so players only see `Checking for coach",
    "- [x] Show active player-visible script media coverage: ready, missing, stale,",
    "- [x] Upload only stale/unpublished player-visible diagrams; report clip gaps",
    "- [x] Show result summary and failed items with exact next steps.",
    "- [x] Document the single write tree: local save -> cloud data publish -> media",
    "- [x] Remove redundant sync toasts once the chip owns the status surface.",
    "- [x] Remove normal success modals from publish, update, and media completion",
    "- [x] Consolidate module-specific save indicators onto shared primitives where",
    "- [x] Add smoke contracts for the unified status events and before-exit warning.",
  ].forEach((token) => {
    if (!roadmap.includes(token)) {
      fail(`workspace sync roadmap missing ${token}`);
    }
  });

  if (!/js\/workspace-sync\.js[\s\S]*js\/play-images\.js[\s\S]*js\/cloud-sync\.js/.test(html)) {
    fail("workspace-sync.js must load before play image and cloud sync modules");
  }

  [
    "const WORKSPACE_SYNC_CHANNELS = [\"local\", \"cloud\", \"media\", \"player\"]",
    "const WORKSPACE_SYNC_STATES =",
    "const workspaceSyncJobs = new Map()",
    "let workspaceSyncClearTimer = 0",
    "function ensureWorkspaceSyncDock()",
    "dock.id = \"workspaceSyncDock\"",
    "data-action=\"retryWorkspaceSyncWork\"",
    "function getWorkspaceSyncSummary()",
    "function setWorkspaceSyncStatus(channel, state, opts = {})",
    "function hasWorkspaceSyncWork()",
    "function queueWorkspaceSyncJob(channel, id, opts = {})",
    "function startWorkspaceSyncJob(key, opts = {})",
    "function completeWorkspaceSyncJob(key, opts = {})",
    "function failWorkspaceSyncJob(key, error, opts = {})",
    "function retryWorkspaceSyncWork()",
    "function runWorkspaceSyncJob(channel, id, runner, opts = {})",
    "window.workspaceSync =",
    "window.setWorkspaceSyncStatus = setWorkspaceSyncStatus",
    "window.hasWorkspaceSyncWork = hasWorkspaceSyncWork",
  ].forEach((token) => {
    if (!workspaceSync.includes(token)) {
      fail(`workspace sync queue contract missing ${token}`);
    }
  });

  if (
    !/window\.setWorkspaceSyncStatus\("local", "saved"/.test(shell) ||
    !/window\.setWorkspaceSyncStatus\("local", "saving"/.test(shell) ||
    !/window\.setWorkspaceSyncStatus\("local", "dirty"/.test(shell)
  ) {
    fail("app shell does not route local save status through workspace sync");
  }

  [
    ".workspace-sync-dock",
    "top: max(10px, env(safe-area-inset-top, 10px))",
    ".workspace-sync-dock__retry",
    ".workspace-sync-dock--saving",
    ".workspace-sync-dock--syncing",
    ".workspace-sync-dock--saved",
    ".workspace-sync-dock--error",
    "body[data-auth-role=\"player\"] .workspace-sync-dock",
    "@keyframes workspaceSyncSpin",
  ].forEach((token) => {
    if (!layout.includes(token)) {
      fail(`workspace sync dock style missing ${token}`);
    }
  });

  if (/Team Update Published|Team Workspace Updated/.test(cloudSync)) {
    fail("cloud sync should not show normal success completion modals");
  }
  if (/Media Published|Sync Complete/.test(playImages)) {
    fail("media publish should not show normal success completion modals");
  }

  [
    "function _cloudQueueJob(channel, id, opts = {})",
    "window.queueWorkspaceSyncJob(channel, id",
    "window.startWorkspaceSyncJob(key, opts)",
    "window.completeWorkspaceSyncJob(key, opts)",
    "window.failWorkspaceSyncJob(key, err",
    "setWorkspaceSyncStatus(\"cloud\", \"syncing\"",
    "setWorkspaceSyncStatus(\"cloud\", \"queued\"",
    "setWorkspaceSyncStatus(\"cloud\", \"error\"",
    "setWorkspaceSyncStatus(\"cloud\", \"synced\"",
    "_cloudQueueJob(\"media\", \"auto-push\"",
    "_cloudStartJob(mediaJobKey",
    "_cloudCompleteJob(mediaJobKey",
    "_cloudFailJob(mediaJobKey",
  ].forEach((token) => {
    if (!cloudSync.includes(token)) {
      fail(`workspace sync cloud/media contract missing ${token}`);
    }
  });

  if (/Cloud autosaved/.test(cloudSync) || /Play image changed\. Cloud autosave queued\./.test(cloudSync)) {
    fail("cloud autosave still uses noisy success/queued toasts instead of the workspace dock");
  }

  if (
    !/queueWorkspaceSyncJob\("media", opts\.keys \? "diagram-scope" : "diagram-all"/.test(playImages) ||
    !/startWorkspaceSyncJob\(syncJobKey/.test(playImages) ||
    !/failWorkspaceSyncJob\(syncJobKey/.test(playImages) ||
    !/completeWorkspaceSyncJob\(syncJobKey/.test(playImages) ||
    !/const hasUploadIssues = result\.failed > 0 \|\| result\.skipped > 0/.test(playImages) ||
    !/hasUploadIssues \? "error" : "synced"/.test(playImages)
  ) {
    fail("play image sync does not route media upload progress and skipped items into workspace status");
  }

  if (
    !/data-action="openPublishMediaModal"/.test(html) ||
    !/data-action="publishPlayerMedia"/.test(playImages) ||
    !/function buildPlayerMediaPublishReport\(\)/.test(playImages) ||
    !/function renderPlayerMediaPublishReport\(report\)/.test(playImages) ||
    !/window\.openPublishMediaModal = async function/.test(playImages) ||
    !/window\.publishPlayerMedia = async function/.test(playImages) ||
    !/window\.closePublishMedia = function/.test(playImages) ||
    !/getPlayerPublishedScripts\(\)/.test(playImages) ||
    !/window\.playClips\.loadIndex\(\)/.test(playImages) ||
    !/window\.playClips\.hasForPlay\(play\)/.test(playImages) ||
    !/publishableKeys/.test(playImages) ||
    !/syncToRemote\(report\.rows\.map\(\(row\) => row\.play\), \{[\s\S]*keys: report\.publishableKeys/.test(playImages)
  ) {
    fail("publish media workflow is not wired to player-visible script media readiness and targeted diagram upload");
  }
  if (/data-action="syncPlayImagesToCloud"/.test(html)) {
    fail("advanced diagram recovery upload should not appear in primary Playbook chrome");
  }

  [
    ".pb-publish-media-summary",
    ".pb-publish-media-meta",
    ".pb-publish-media-row",
    ".pb-publish-media-row--stale",
    ".pb-publish-media-row--unpublished",
    ".pb-publish-media-chip",
  ].forEach((token) => {
    if (!playbookCss.includes(token)) {
      fail(`publish media styling missing ${token}`);
    }
  });

  if (
    !/queueWorkspaceSyncJob\("player", kind/.test(scriptPlayer) ||
    !/startWorkspaceSyncJob\(publishJobKey/.test(scriptPlayer) ||
    !/completeWorkspaceSyncJob\(publishJobKey/.test(scriptPlayer)
  ) {
    fail("player publish metadata does not route through workspace sync queue");
  }

  if (
    !/const workspaceSyncPending =[\s\S]*window\.hasWorkspaceSyncWork/.test(appSession) ||
    !/scriptDirty \|\| wristbandDirty \|\| workspaceSyncPending/.test(appSession)
  ) {
    fail("beforeunload does not protect pending workspace sync work");
  }

  [
    "- [x] Replace the backup-style modal copy with a clearer \"Team Workspace Sync\"",
    "- [x] Show a post-pull summary on Dashboard with counts for playbook, scripts,",
    "- [x] Add stale/local-conflict warnings before replacing a device that has newer",
  ].forEach((token) => {
    if (!consolidatedRoadmap.includes(token)) {
      fail(`consolidated roadmap missing team workspace sync completion ${token}`);
    }
  });

  if (
    !/const CLOUD_SYNC_PULL_SUMMARY_KEY = "_bcCloudSyncLastPullSummary"/.test(cloudSync) ||
    !/function buildTeamWorkspacePullSummary\(remote, opts = \{\}\)/.test(cloudSync) ||
    !/saveTeamWorkspacePullSummary\(remote, \{ restoredImages, imageWarning \}\)/.test(cloudSync) ||
    !/window\.getTeamWorkspacePullSummary = getTeamWorkspacePullSummary/.test(cloudSync) ||
    !/window\.dismissTeamWorkspacePullSummary = dismissTeamWorkspacePullSummary/.test(cloudSync) ||
    !/Publish Status/.test(cloudSync) ||
    !/Publish Team Update/.test(cloudSync) ||
    !/Update This Device/.test(cloudSync)
  ) {
    fail("team workspace sync modal and pull summary are incomplete");
  }

  if (
    !/function getTeamWorkspacePullRisks\(remote\)/.test(cloudSync) ||
    !/function addLocalPullRisk\(risks, remoteTime, label, records, fields/.test(cloudSync) ||
    !/function addLocalSinglePullRisk\(risks, remoteTime, label, record, fields/.test(cloudSync) ||
    !/typeof scriptDirty !== "undefined" && scriptDirty/.test(cloudSync) ||
    !/typeof wristbandDirty !== "undefined" && wristbandDirty/.test(cloudSync) ||
    !/window\.hasWorkspaceSyncWork\(\)/.test(cloudSync) ||
    !/cloudAutoPushPending \|\| cloudAutoPushSaving \|\| cloudAutoPushDirtyKeys\.size > 0/.test(cloudSync) ||
    !/Saved script newer than cloud/.test(cloudSync) ||
    !/Script draft newer than cloud/.test(cloudSync) ||
    !/Call sheet draft newer than cloud/.test(cloudSync) ||
    !/Game plan snapshot newer than cloud/.test(cloudSync) ||
    !/Player publish status newer than cloud/.test(cloudSync) ||
    !/Review Local Work Before Update/.test(cloudSync) ||
    !/Update Anyway/.test(cloudSync) ||
    !/Publish this device first if those changes should be kept/.test(cloudSync)
  ) {
    fail("team workspace pull does not warn about newer local work before restore");
  }

  if (
    !/id="teamWorkspacePullSummary"/.test(html) ||
    !/function renderTeamWorkspacePullSummary\(\)/.test(dashboardRender) ||
    !/getTeamWorkspacePullSummary\(\)/.test(dashboardRender) ||
    !/data-action="dismissTeamWorkspacePullSummary"/.test(dashboardRender) ||
    !/renderTeamWorkspacePullSummary\(\)/.test(dashboardRender) ||
    !/\.team-workspace-summary-card/.test(dashboardCss) ||
    !/\.team-workspace-summary-grid/.test(dashboardCss) ||
    !/Saved on this device/.test(cloudSync) ||
    !/Published for team/.test(cloudSync) ||
    !/Ready for players/.test(cloudSync) ||
    !/\.cloud-sync-explainer/.test(componentsCss) ||
    !/\.cloud-sync-flow-grid/.test(componentsCss) ||
    !/\.cloud-sync-flow-card/.test(componentsCss)
  ) {
    fail("dashboard team workspace pull summary is incomplete");
  }

  [
    "### Workspace Sync / Player Publish Architecture",
    "local save -> cloud data",
    "publish -> media publish -> player readiness update",
    "queueWorkspaceSyncJob()",
    "setWorkspaceSyncStatus()",
    "hasWorkspaceSyncWork()",
    "Publish Media",
    "/images/manifest?sig=...",
    "Manual Cloud Sync is an advanced fallback",
    "Keep manual `Cloud Sync` and `Sync Diagrams` available as fallback/retry",
  ].forEach((token) => {
    if (!agentGuide.includes(token)) {
      fail(`agent workspace sync guide missing ${token}`);
    }
  });

  if (/`beforeunload` warns if any dirty flag is set/.test(agentGuide)) {
    fail("agent guide still documents beforeunload as dirty-flags-only");
  }

  console.log("workspace sync contracts ok");
}

function checkPlayerDiagramReadinessContracts() {
  const roadmap = read("WORKSPACE_SYNC_ROADMAP.md");
  const manifest = read("functions/images/manifest.js");
  const playImages = read("js/play-images.js");
  const presentation = read("js/play-presentation.js");
  const presentationCss = read("css/play-presentation.css");
  const playbookRender = read("js/playbook-render.js");
  const playbookCss = read("css/playbook.css");

  [
    "- [x] Add a remote diagram manifest/check endpoint so players know published",
    "- [x] Replace premature \"ask coach to sync diagrams\" copy with distinct states:",
    "- [x] Prefer cached local diagram when available, then remote published diagram.",
    "- [x] Make player diagram empty states quiet and professional.",
  ].forEach((token) => {
    if (!roadmap.includes(token)) {
      fail(`player diagram readiness roadmap missing ${token}`);
    }
  });

  if (
    !/bucket\.head\(r2Key\(sig\)\)/.test(manifest) ||
    !/published:\s*false/.test(manifest) ||
    !/published:\s*true/.test(manifest) ||
    !/contentType:\s*object\.httpMetadata\?\.contentType/.test(manifest)
  ) {
    fail("remote image manifest endpoint is incomplete");
  }

  if (
    !/const _remoteManifestCache = new Map\(\)/.test(playImages) ||
    !/function _remoteIdentityKeysForPlay\(play\)/.test(playImages) ||
    !/async function checkRemoteForPlay\(play\)/.test(playImages) ||
    !/\/images\/manifest\?sig=\$\{encodeURIComponent\(identityKey\)\}/.test(playImages) ||
    !/async function ensureDisplayReadinessForPlay\(play\)/.test(playImages) ||
    !/for \(const signature of displaySignaturesForPlay\(play\)\)[\s\S]*const remote = await checkRemoteForPlay\(play\)/.test(playImages) ||
    !/status:\s*"offline"/.test(playImages) ||
    !/status:\s*"unpublished"/.test(playImages) ||
    !/status:\s*"load-error"/.test(playImages) ||
    !/ensureDisplayReadinessForPlay,/.test(playImages) ||
    !/checkRemoteForPlay,/.test(playImages)
  ) {
    fail("play image readiness API is incomplete");
  }

  if (
    /Ask your coach to sync diagrams/.test(presentation) ||
    !/function getPlayPresentationDiagramStatusCopy\(status\)/.test(presentation) ||
    !/Diagram has not been published for players yet/.test(presentation) ||
    !/Offline\. This diagram will appear/.test(presentation) ||
    !/Diagram is published but could not be loaded/.test(presentation) ||
    !/ensureDisplayReadinessForPlay\(play\)/.test(presentation) ||
    !/updatePlayPresentationDiagramStatus\(copy\.pill, copy\.label\)/.test(presentation)
  ) {
    fail("play presentation diagram readiness states are incomplete or stale");
  }

  if (
    !/data-pb-thumb-idx="\$\{item\.idx\}"/.test(playbookRender) ||
    !/ensureDisplayReadinessForPlay\(play\)/.test(playbookRender) ||
    !/Not published/.test(playbookRender) ||
    !/setState\("offline", "Offline"\)/.test(playbookRender) ||
    !/pb-card-media--unpublished/.test(playbookRender) ||
    !/pb-card-media--offline/.test(playbookRender)
  ) {
    fail("player playbook card diagram readiness states are incomplete");
  }

  [
    '[data-status="unpublished"]',
    '[data-status="offline"]',
    ".pb-card-media--unpublished",
    ".pb-card-media--offline",
  ].forEach((token) => {
    const source = token.startsWith("[") ? presentationCss : playbookCss;
    if (!source.includes(token)) {
      fail(`diagram readiness styling missing ${token}`);
    }
  });

  console.log("player diagram readiness contracts ok");
}

function checkPlayerQuizSettingsContracts() {
  const scriptRender = read("js/script-render.js");
  const scriptCss = read("css/script.css");
  const quizSurface = `${scriptRender}\n${scriptCss}`;
  const roadmap = read("CONSOLIDATED_ROADMAP.md");

  [
    "PLAYER_QUIZ_TIER_DEFAULTS",
    "PLAYER_QUIZ_DEFAULT_TIER_NAMES",
    "tierNames: { ...PLAYER_QUIZ_DEFAULT_TIER_NAMES }",
    "function _normalizeQuizTierNames",
    "function _getQuizTierName",
    "function _quizQuestionQuality",
    "function _selectQuizQuestion",
    "function _buildQuizStudyCardQuestion",
    "function openCoachQuizSourceRepair",
    "function openCoachQuizRepairPlayEditor",
    "function _findCoachQuizPlaybookTarget",
    "function _getPlayerQuizModes",
    "function setPlayerQuizMode",
    "function _prepareQuizItemsForMode",
    "function _getCoachQuizModeRecommendation",
    "Recommended mode",
    "function _getQuizStreakMoment",
    "function _getQuizResultRewardMoment",
    "function _renderCoachQuizReadinessSplit",
    "function _coachQuizGeneratorPreview",
    "function startQuizMissRetryFromResult",
    "function _getPlayerQuizWeakAreaCards",
    "Common missed plays",
    "Fun readiness",
    "Learning readiness",
    "Context readiness",
    "Mostly Study Cards",
    "Retry 3 now",
    "sq-result-reward-moment",
    "sq-feedback-streak",
    "sq-feedback-calm",
    "Review this rep",
    "prefers-reduced-motion: reduce",
    "quizModeLabel",
    "diagram_formation",
    "formation_to_play",
    "play_type",
    "signal",
    "Signal ID",
    "coachQuizTypeSignal",
    "function _quizSignalRecordsForPlay",
    "function _quizPickSignalRecord",
    "function _quizSignalRecordForQuestion",
    "study_card",
    "coachQuizTierChampion",
    "coachQuizTierBaller",
    "coachQuizTierStarter",
    "coachQuizTierContributor",
    "coachQuizTierDefense",
    "SIGNAL_GAME_DEFAULT_SETTINGS",
    "function _normalizeSignalGameSettings",
    "function _canUseStaffSignalClips",
    "coachSignalMinClipCount",
    "coachSignalIncludeDraft",
  ].forEach((token) => {
    if (!quizSurface.includes(token)) {
      fail(`player quiz settings contract missing ${token}`);
    }
  });

  if (!/function _getQuizTier\(points, settings = _getPlayerQuizSettings\(\)\)[\s\S]*?_getQuizTierName\("champion", settings\)[\s\S]*?_getQuizTierName\("defense", settings\)/.test(scriptRender)) {
    fail("player quiz tiers do not resolve through editable tier names");
  }

  if (!/function coachSaveQuizSettings\(\)[\s\S]*?tierNames:\s*{[\s\S]*?champion:\s*_readCoachQuizSettingText\("coachQuizTierChampion"\)[\s\S]*?defense:\s*_readCoachQuizSettingText\("coachQuizTierDefense"\)/.test(scriptRender)) {
    fail("coach quiz settings save does not persist tier names");
  }

  if (
    !/function coachSaveQuizSettings\(\)[\s\S]*?eligibleCategories = SIGNAL_GAME_CATEGORY_OPTIONS[\s\S]*?_saveSignalGameSettings\(\{[\s\S]*?minClipCount:\s*_readCoachQuizSettingNumber\("coachSignalMinClipCount"\)[\s\S]*?includeDraftForStaff/.test(scriptRender) ||
    !/function _getSignalQuizStatus\(\)[\s\S]*?getSignalQuizStats\(\{[\s\S]*?categories: settings\.eligibleCategories[\s\S]*?includeDraft/.test(scriptRender) ||
    !/getSignalQuizItems\(\{[\s\S]*?includeDraft: _canUseStaffSignalClips\(signalSettings\)/.test(scriptRender)
  ) {
    fail("coach signal game settings do not drive signal quiz availability and launch");
  }

  if (
    !/candidates\.push\(diagramQuestion, diagramFormationQuestion, formationQuestion, signalQuestion, typeQuestion, callQuestion/.test(scriptRender) ||
    !/candidates\.push\(ruleQuestion, ruleToPlayQuestion, signalQuestion/.test(scriptRender) ||
    !/\["diagram", "diagram_formation", "study_card"\]\.includes\(question\.type\)/.test(scriptRender) ||
    !/function _quizQuestionDistractorItems\(item, question\)[\s\S]*?formation_to_play/.test(scriptRender) ||
    !/function _quizQuestionDistractorItems\(item, question\)[\s\S]*?question\?\.type === "signal"/.test(scriptRender)
  ) {
    fail("player quiz fair fallback ladder is missing diagram, signal, formation, type, or study-card coverage");
  }

  if (
    !/data-action="openCoachQuizSourceRepair"/.test(scriptRender) ||
    !/data-action="openCoachQuizRepairPlayEditor"/.test(scriptRender) ||
    !/Edits save to Playbook/.test(scriptRender)
  ) {
    fail("coach quiz source repair list is not wired to playbook editing");
  }

  if (
    /tier-name controls remain pending|Tier names remain fixed for now/.test(roadmap) ||
    !/\[x\] Add formal coach\/admin quiz settings/.test(roadmap) ||
    !/\[x\] Add editable tier names/.test(roadmap)
  ) {
    fail("player quiz roadmap still marks editable tier names as pending");
  }

  console.log("player quiz settings contracts ok");
}

function checkScrollOwnershipContract() {
  const shell = read("js/app-shell.js");
  const domHelpers = read("js/dom-helpers.js");
  const components = read("css/components.css");

  // Single source of truth: app-shell decides document vs panel ownership and
  // yields to the layer when a blocking overlay is locked.
  if (!/body\.dataset\.scrollOwner\s*=/.test(shell)) {
    fail("app-shell.js does not assign body.dataset.scrollOwner");
  }
  if (
    !/app-layer-locked[\s\S]{0,120}?"layer"/.test(shell) &&
    !/"layer"[\s\S]{0,120}?app-layer-locked/.test(shell)
  ) {
    fail("app-shell.js scroll owner does not defer to an active blocking layer");
  }
  if (!/"document"/.test(shell) || !/"panel"/.test(shell)) {
    fail("app-shell.js scroll owner is missing the document/panel modes");
  }

  // The body lock utility must own the scroll attribute and restore it so the
  // contract has no stale "layer" owner after a modal closes.
  if (!/dataset\.scrollOwner\s*=\s*"layer"/.test(domHelpers)) {
    fail("dom-helpers lockBodyForLayer does not set scrollOwner to layer");
  }
  if (!/scrollOwner/.test(domHelpers) || !/unlockBodyForLayer/.test(domHelpers)) {
    fail("dom-helpers does not restore scrollOwner on layer unlock");
  }

  // Locked body must actually stop document scroll.
  const lockRule = components.match(/body\.app-layer-locked\s*\{[\s\S]*?\}/)?.[0] || "";
  if (!/overflow:\s*hidden/.test(lockRule) || !/position:\s*fixed/.test(lockRule)) {
    fail("body.app-layer-locked does not freeze document scroll");
  }

  console.log("scroll ownership contract ok");
}

function checkServiceWorkerCachePolicy() {
  const source = extractFunctionSource(read("sw.js"), "isCacheableResponse");
  if (!source) {
    fail("isCacheableResponse function not found");
    return;
  }

  const isCacheable = new Function(
    `${source}; return isCacheableResponse;`,
  )();
  const response = (ok, cacheControl = "", type = "basic") => ({
    ok,
    type,
    headers: {
      get: (name) =>
        name.toLowerCase() === "cache-control" ? cacheControl : null,
    },
  });

  if (!isCacheable(response(true))) {
    fail("service worker rejects successful cacheable responses");
  }
  if (isCacheable(response(false))) {
    fail("service worker caches unsuccessful responses");
  }
  if (isCacheable(response(true, "private, no-store"))) {
    fail("service worker caches no-store responses");
  }
  if (!isCacheable(response(false, "", "opaque"), true)) {
    fail("service worker rejects allowed opaque external responses");
  }
  if (isCacheable(response(false, "", "opaque"))) {
    fail("service worker caches opaque responses without explicit permission");
  }

  console.log("service worker cache policy ok");
}

function checkTopLevelSymbolOwnership() {
  const locations = new Map();
  walk("js")
    .filter((file) => file.endsWith(".js") && !file.endsWith(".min.js"))
    .forEach((file) => {
      const source = read(file);
      const declarations = [
        ...source.matchAll(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm),
        ...source.matchAll(/^(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)\b/gm),
      ];
      declarations.forEach((match) => {
        const line = source.slice(0, match.index).split("\n").length;
        const entries = locations.get(match[1]) || [];
        entries.push({ file, location: `${file}:${line}` });
        locations.set(match[1], entries);
      });
    });

  const transitionalSplitGroups = [
    new Set(["js/callsheet-render.js", "js/callsheet.js"]),
    new Set(["js/installation-render.js", "js/installation.js"]),
    new Set(["js/tendencies-render.js", "js/tendencies.js"]),
  ];
  const isAllowedTransitionalSplit = (entries) => {
    const files = unique(entries.map((entry) => entry.file));
    return transitionalSplitGroups.some(
      (group) => files.length > 1 && files.every((file) => group.has(file)),
    );
  };
  const duplicates = [...locations.entries()].filter(
    ([, entries]) =>
      unique(entries.map((entry) => entry.file)).length > 1 &&
      !isAllowedTransitionalSplit(entries),
  );
  if (duplicates.length) {
    fail(
      `duplicate cross-file top-level symbols: ${duplicates
        .map(([name, entries]) =>
          `${name} (${entries.map((entry) => entry.location).join(", ")})`,
        )
        .join(" | ")}`,
    );
  }
  console.log(`top-level symbol ownership ok (${locations.size} symbols)`);
}

function checkSplitFileOwnershipClaims() {
  const files = walk("js").filter((file) => file.endsWith(".js") && !file.endsWith(".min.js"));
  const violations = [];

  files.forEach((file) => {
    const source = read(file);
    if (!/^\/\/\s*Owns:/m.test(source)) return;

    const declared = new Set([
      ...[...source.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm)].map((match) => match[1]),
      ...[...source.matchAll(/^(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)\b/gm)].map((match) => match[1]),
    ]);
    const lines = source.split("\n");
    const claimed = new Set();

    for (let index = 0; index < lines.length; index += 1) {
      if (!/^\/\/\s*Owns:/.test(lines[index])) continue;
      for (let cursor = index; cursor < lines.length; cursor += 1) {
        const line = lines[cursor];
        if (!line.startsWith("//")) break;
        if (cursor > index && /^\/\/\s*(?:Loaded|Depends|=|-)/.test(line)) break;
        [...line.matchAll(/`([A-Za-z_$][\w$]*)`/g)].forEach((match) => claimed.add(match[1]));
      }
    }

    if (!claimed.size) {
      violations.push(`${file}: Owns comment has no backticked symbols`);
      return;
    }

    [...claimed].forEach((name) => {
      if (!declared.has(name)) {
        violations.push(`${file}: claims ${name} but does not declare it`);
      }
    });
  });

  if (violations.length) {
    fail(`split-file ownership claims drifted: ${violations.join(" | ")}`);
  }
  console.log("split-file ownership claims ok");
}

function checkWindowExportManifest() {
  const guide = read("AGENTS.md");
  const manifest = guide.match(/```window-export-manifest\n([\s\S]*?)```/);
  if (!manifest) {
    fail("AGENTS.md is missing the window-export-manifest block");
    return;
  }

  const documented = unique(
    manifest[1]
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.replace(/^window\./, "")),
  ).sort();
  const actual = unique(
    walk("js")
      .filter((file) => file.endsWith(".js") && !file.endsWith(".min.js"))
      .flatMap((file) => {
        const source = read(file);
        return [...source.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=(?!=)/g)].map(
          (match) => match[1],
        );
      }),
  ).sort();
  const missing = actual.filter((name) => !documented.includes(name));
  const stale = documented.filter((name) => !actual.includes(name));

  if (missing.length || stale.length) {
    fail(
      `window export manifest drifted` +
      `${missing.length ? `; missing: ${missing.join(", ")}` : ""}` +
      `${stale.length ? `; stale: ${stale.join(", ")}` : ""}`,
    );
  }
  console.log(`window export manifest ok (${actual.length} exports)`);
}

function checkModulePrefixManifest() {
  const guide = read("AGENTS.md");
  const manifest = guide.match(/```module-prefix-manifest\n([\s\S]*?)```/);
  if (!manifest) {
    fail("AGENTS.md is missing the module-prefix-manifest block");
    return;
  }

  const entries = new Map(
    manifest[1]
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [moduleName, prefixes = ""] = line.split(":");
        return [
          moduleName,
          prefixes
            .split(",")
            .map((prefix) => prefix.trim())
            .filter(Boolean),
        ];
      }),
  );
  const required = new Map([
    ["app-shell", ["_shell"]],
    ["dashboard", ["_dash"]],
    ["page-actions", ["_pa"]],
    ["playbook", ["pb", "_pb"]],
    ["script", ["script", "_script"]],
    ["player-quiz", ["quiz", "playerQuiz", "_quiz", "_playerQuiz"]],
    ["call-sheet", ["cs", "_cs"]],
    ["constraints", ["cr", "_cr"]],
    ["game-plan", ["gp", "_gp"]],
    ["tendencies", ["td", "_td"]],
    ["wristband", ["wb", "_wb"]],
    ["storage", ["storage"]],
  ]);
  const missing = [];

  required.forEach((prefixes, moduleName) => {
    const documented = entries.get(moduleName) || [];
    prefixes.forEach((prefix) => {
      if (!documented.includes(prefix)) missing.push(`${moduleName}:${prefix}`);
    });
  });

  [
    "Module-private helpers use a leading underscore plus the owning module prefix",
    "Avoid new generic helpers such as `renderRow`, `saveTemplate`, `updateState`, or `openModal`",
    "Unprefixed helpers belong only in `utils.js` or `dom-helpers.js`",
  ].forEach((phrase) => {
    if (!guide.includes(phrase)) missing.push(`guidance:${phrase}`);
  });

  if (missing.length) {
    fail(`module prefix manifest drifted: ${missing.join(", ")}`);
  }
  console.log(`module prefix manifest ok (${required.size} modules)`);
}

function checkWristbandConstantUsage() {
  const files = [
    ...walk("js").filter((file) => /^js\/wristband.*\.js$/.test(file)),
    "js/callsheet-picker-runtime.js",
    "js/gameplan.js",
    "js/script-storage.js",
  ];
  const violations = [];

  files.forEach((file) => {
    const source = read(file).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    const patterns = [
      /Array\(\s*40\s*\)/g,
      /\b(?:cardIdx|currentCardIndex)\s*\*\s*40\b/g,
      /\bcellIdx\s*<\s*40\b/g,
      /\bcellIdx\s*\+\s*11\b/g,
    ];
    patterns.forEach((pattern) => {
      [...source.matchAll(pattern)].forEach((match) => {
        const line = source.slice(0, match.index).split("\n").length;
        violations.push(`${file}:${line} (${match[0]})`);
      });
    });
  });

  if (violations.length) {
    fail(`wristband capacity/offset literals found: ${violations.join(", ")}`);
  }
  console.log("wristband constant usage ok");
}

function checkScriptPacketPrintContracts() {
  const scriptExport = read("js/script-export.js");
  const scriptCss = read("css/script.css");
  const printCss = read("css/print.css");

  if (
    !/diagramDensity:\s*"large"/.test(scriptExport) ||
    !/id="scriptPacketDiagramDensity"/.test(scriptExport) ||
    !/function _scriptPacketDiagramLayout\(options\)/.test(scriptExport) ||
    !/density === "full"[\s\S]*perPage:\s*1/.test(scriptExport) ||
    !/density === "compact"[\s\S]*perPage:\s*8/.test(scriptExport) ||
    !/perPage:\s*4/.test(scriptExport) ||
    !/script-packet-diagrams-\$\{options\.diagramDensity \|\| "large"\}/.test(
      scriptExport,
    )
  ) {
    fail("script packet diagram density print options are incomplete");
  }
  if (
    !/\.script-packet-diagrams-large \.script-packet-diagram-image/.test(scriptCss) ||
    !/\.script-packet-diagrams-full \.script-packet-diagram-image/.test(scriptCss) ||
    !/object-position:\s*center center/.test(scriptCss) ||
    !/body\.script-packet-printing \.script-packet-diagrams-large \.script-packet-diagram-image/.test(
      printCss,
    ) ||
    !/body\.script-packet-printing \.script-packet-diagrams-full \.script-packet-diagram-image/.test(
      printCss,
    )
  ) {
    fail("script packet diagram print styling is incomplete");
  }

  console.log("script packet print contracts ok");
}

function checkScriptSelectionRenderContracts() {
  const selection = read("js/script-selection.js");
  const updateBulkSelectUi = extractFunctionSource(selection, "updateBulkSelectUI");
  const clearBulkSelection = extractFunctionSource(selection, "clearBulkSelection");

  if (
    !/classList\.toggle\("bulk-selected",\s*isSelected\)/.test(updateBulkSelectUi) ||
    !/closest\("\.script-item"\)/.test(updateBulkSelectUi)
  ) {
    fail("script bulk selection does not update row styling without a full render");
  }
  if (/requestRenderScript\(\)/.test(clearBulkSelection)) {
    fail("clearing script bulk selection still forces a full script render");
  }
  if (/updateBulkSelectUI\(\);\s*_scheduleRenderScript\(\);/.test(selection)) {
    fail("script select-all shortcuts still schedule a full script render");
  }

  console.log("script selection render contracts ok");
}

function checkGamePlanMediaReadinessContracts() {
  const gameplanRender = read("js/gameplan-render.js");
  const gameplanCss = read("css/gameplan.css");
  const readiness = read("js/play-readiness.js");
  const clips = read("js/play-clips.js");
  const appModuleInit = read("js/app-module-init.js");

  if (
    !/function _gpRenderMediaCompletionScore\(board, draftedPlays\)/.test(gameplanRender) ||
    !/function _gpUniqueDraftedPlays\(drafted\)/.test(gameplanRender) ||
    !/diagramPct \* 85/.test(gameplanRender) ||
    !/videoPct \* 15/.test(gameplanRender) ||
    !/gp-media-scoreboard/.test(gameplanRender)
  ) {
    fail("game plan media completion score is incomplete");
  }

  if (
    !/\.gp-media-scoreboard \.gp-score-grid/.test(gameplanCss) ||
    !/body:not\(\.is-mobile-screen\) \.gp-stats-bar > details\.gp-media-scoreboard\[open\]/.test(gameplanCss)
  ) {
    fail("game plan media completion styling is incomplete");
  }

  if (
    !/const PLAY_READINESS_SHOWN_POINTS = \{/.test(readiness) ||
    !/function getPlayReadinessShownStatus\(play\)/.test(readiness) ||
    !/shownPoints/.test(readiness) ||
    !/play-images-changed/.test(readiness) ||
    !/play-clips-changed/.test(readiness)
  ) {
    fail("play readiness shown bonus is incomplete");
  }

  if (
    !/function _emitClipChange\(sig\)/.test(clips) ||
    !/play-clips-changed/.test(clips) ||
    !/requestRenderGamePlan/.test(clips) ||
    !/refreshPlayReadinessSurfaces/.test(clips) ||
    !/refreshPlayReadinessSurfaces\("play-images"\)/.test(appModuleInit)
  ) {
    fail("media score refresh hooks are incomplete");
  }

  console.log("game plan media readiness contracts ok");
}

function checkSignalPlayIntegrationContracts() {
  const html = read("index.html");
  const signals = read("js/signals.js");
  const clips = read("js/play-clips.js");
  const playbookRender = read("js/playbook-render.js");
  const scriptRender = read("js/script-render.js");
  const presentation = read("js/play-presentation.js");
  const presentationCss = read("css/play-presentation.css");
  const appEvents = read("js/app-events.js");
  const auth = read("js/auth.js");
  const signalsCss = read("css/signals.css");
  const scriptCss = read("css/script.css");
  const roadmap = read("CONSOLIDATED_ROADMAP.md");

  if (
    !/function resolveSignalsForPlay\(play, options = \{\}\)/.test(signals) ||
    !/const includeDraft = opts\.includeDraft === true && _sigCanManage\(\)/.test(signals) ||
    !/categoryFilter\.size && !categoryFilter\.has/.test(signals) ||
    !/const seen = new Set\(\)/.test(signals) ||
    !/function getSignalCountForPlay\(play\)/.test(signals) ||
    !/function getSignalAvailabilityForPlay\(play\)/.test(signals) ||
    !/function renderSignalAvailabilityForPlay\(play, options = \{\}\)/.test(signals) ||
    !/function openSignalSelectorForPlay\(play, options = \{\}\)/.test(signals) ||
    !/function openPlaybookSignalSelector\(idx\)/.test(signals) ||
    !/typeof filteredPlays !== "undefined" && Array\.isArray\(filteredPlays\)/.test(signals) ||
    !/function openScriptSignalSelector\(idx\)/.test(signals) ||
    !/function openSignalClip\(recordId\)/.test(signals) ||
    !/function closeSignalSelector\(\)/.test(signals) ||
    !/function _sigNormalizeClipList\(data\)/.test(signals) ||
    !/componentType: "formation"[\s\S]*requiresVideo: false[\s\S]*cueLabel: "Verbal \/ board cue"/.test(signals) ||
    !/function _sigComponentRequiresVideo\(componentType\)/.test(signals) ||
    !/function _sigSummaryRequiresVideo\(summary\)/.test(signals) ||
    !/async function getSignalQuizItems\(options = \{\}\)/.test(signals) ||
    !/function getSignalQuizStats\(options = \{\}\)/.test(signals) ||
    !/record\.visibility === "published" \|\| \(opts\.includeDraft === true && _sigCanManage\(\)\)/.test(signals) ||
    !/window\.getSignalQuizItems = getSignalQuizItems/.test(signals) ||
    !/window\.getSignalQuizStats = getSignalQuizStats/.test(signals) ||
    !/function _sigBuildCoverageReport\(summariesByComponent\)/.test(signals) ||
    !/function _sigRenderCoverageReport\(summariesByComponent\)/.test(signals)
  ) {
    fail("signal play selector API is incomplete");
  }

  if (
    !/signal-availability/.test(signals) ||
    !/signal-availability-action/.test(signals) ||
    !/renderSignalAvailabilityForPlay\(play, \{[\s\S]*className: "signal-availability--script-player"[\s\S]*action: "openScriptSignalSelector"/.test(scriptRender) ||
    !/renderSignalAvailabilityForPlay\(play, \{[\s\S]*className: "signal-availability--presentation-detail"[\s\S]*action: "openPlayPresentationSignals"/.test(presentation) ||
    !/renderSignalAvailabilityForPlay\(play, \{[\s\S]*className: "signal-availability--presentation-player"[\s\S]*action: "openPlayPresentationSignals"/.test(presentation)
  ) {
    fail("player-facing signal availability surfaces are incomplete");
  }

  if (
    !/if \(!_sigCanManage\(\)\) return "";/.test(signals) ||
    !/if \(component\.requiresVideo === false\) return;/.test(signals) ||
    !/topMissing: missing[\s\S]*\.slice\(0, 8\)/.test(signals) ||
    !/Most-used missing signals/.test(signals) ||
    !/_sigRenderCoverageReport\(summariesByComponent\)/.test(signals)
  ) {
    fail("signal coverage reporting is incomplete");
  }

  if (
    !/signalCount:\s*[\s\S]*getSignalCountForPlay\(play\)/.test(playbookRender) ||
    !/data-action="openPlaybookSignalSelector"/.test(playbookRender) ||
    !/pb-card-action--signals/.test(playbookRender)
  ) {
    fail("playbook signal entry points are incomplete");
  }

  if (
    !/script-signal-btn/.test(scriptRender) ||
    !/script-player-signal-btn/.test(scriptRender) ||
    !/data-action="openScriptSignalSelector"/.test(scriptRender) ||
    !/renderScriptPlayControls\(play, index, playLabel, reps, signalCount\)/.test(scriptRender)
  ) {
    fail("script signal entry points are incomplete");
  }

  if (
    !/id="playPresentationSignalsBtn"[\s\S]*data-action="openPlayPresentationSignals"/.test(html) ||
    !/id="playerQuizStartSignalsBtn"[\s\S]*data-action="startPlayerQuizHubSignals"/.test(html) ||
    !/player-quiz-source-card--signals/.test(html) ||
    !/function updatePlayPresentationSignalsButton\(\)/.test(presentation) ||
    !/getSignalCountForPlay\(item\.play\)/.test(presentation) ||
    !/function openPlayPresentationSignals\(\)/.test(presentation) ||
    !/openSignalSelectorForPlay\(item\.play, \{ sourceLabel: "Swipe View Signals" \}\)/.test(presentation) ||
    !/updatePlayPresentationSignalsButton\(\);/.test(presentation) ||
    !/["']openPlayPresentationSignals["']/.test(auth) ||
    !/["']startPlayerQuizHubSignals["']/.test(auth)
  ) {
    fail("presentation signal selector entry point is incomplete");
  }

  if (
    !/key:\s*"signal-study"[\s\S]*label:\s*"Signal Study"[\s\S]*source:\s*"signal"/.test(scriptRender) ||
    !/key:\s*"signal-sprint"[\s\S]*label:\s*"100 Second Sprint"[\s\S]*source:\s*"signal"/.test(scriptRender) ||
    !/key:\s*"signal-battle"[\s\S]*label:\s*"6 Seconds of Battle"[\s\S]*source:\s*"signal"/.test(scriptRender) ||
    !/key:\s*"signal-heat"[\s\S]*label:\s*"Heat Check"[\s\S]*source:\s*"signal"/.test(scriptRender) ||
    !/key:\s*"signal-full-call"[\s\S]*label:\s*"Full Play Call"[\s\S]*source:\s*"signal"/.test(scriptRender) ||
    !/const SIGNAL_SPRINT_DURATION_MS = 100000/.test(scriptRender) ||
    !/const SIGNAL_SPRINT_TARGET_REPS = 100/.test(scriptRender) ||
    !/const SIGNAL_BATTLE_CLIP_MS = 5000/.test(scriptRender) ||
    !/const SIGNAL_BATTLE_ANSWER_MS = 6000/.test(scriptRender) ||
    !/const SIGNAL_BATTLE_TARGET_REPS = 20/.test(scriptRender) ||
    !/const SIGNAL_HEAT_CHECK_TARGET_REPS = 200/.test(scriptRender) ||
    !/const SIGNAL_GAME_CATEGORY_OPTIONS = \[/.test(scriptRender) ||
    !/function _isSignalSprintMode\(mode = _quizMode\)/.test(scriptRender) ||
    !/function _isSignalBattleMode\(mode = _quizMode\)/.test(scriptRender) ||
    !/function _isSignalHeatCheckMode\(mode = _quizMode\)/.test(scriptRender) ||
    !/function _isSignalFullCallMode\(mode = _quizMode\)/.test(scriptRender) ||
    !/function _isSignalAutoAdvanceMode\(mode = _quizMode\)/.test(scriptRender) ||
    !/function _renderQuizInlineFeedback\(item, answer\)/.test(scriptRender) ||
    !/function _configureQuizSignalVideos\(root = document\)/.test(scriptRender) ||
    !/function _getSignalFullCallSourceItems\(\)/.test(scriptRender) ||
    !/async function _buildSignalFullCallItems\(settings = _getSignalGameSettings\(\)\)/.test(scriptRender) ||
    !/function _signalFullCallDistractorScore\(correctPlay, candidatePlay\)/.test(scriptRender) ||
    !/function _getSignalGameSettings\(status = null\)/.test(scriptRender) ||
    !/function toggleSignalGameCategory\(categoryId\)/.test(scriptRender) ||
    !/function _getSignalCategoryMultiplier\(categories = _quizSignalCategories, eligibleCategories = SIGNAL_GAME_DEFAULT_SETTINGS\.eligibleCategories\)/.test(scriptRender) ||
    !/function _buildSignalSprintItems\(items, targetCount = SIGNAL_SPRINT_TARGET_REPS\)/.test(scriptRender) ||
    !/function _buildSignalBattleItems\(items, targetCount = SIGNAL_BATTLE_TARGET_REPS\)/.test(scriptRender) ||
    !/function _buildSignalHeatCheckItems\(items, targetCount = SIGNAL_HEAT_CHECK_TARGET_REPS\)/.test(scriptRender) ||
    !/function _startSignalBattleRound\(questionKey\)/.test(scriptRender) ||
    !/function _recordSignalBattleTimeout\(questionKey = _quizRoundQuestionKey\)/.test(scriptRender) ||
    !/function _buildSignalSprintLeaderboardRows\(attempts, player, weekKey = ""\)/.test(scriptRender) ||
    !/function _buildSignalBattleLeaderboardRows\(attempts, player, weekKey = ""\)/.test(scriptRender) ||
    !/function _buildSignalHeatCheckLeaderboardRows\(attempts, player, weekKey = ""\)/.test(scriptRender) ||
    !/function _compareSignalSprintRows\(a, b\)/.test(scriptRender) ||
    !/function _compareSignalBattleRows\(a, b\)/.test(scriptRender) ||
    !/function _compareSignalHeatCheckRows\(a, b\)/.test(scriptRender) ||
    !/function _renderSignalSprintLeaderboardRows\(rows, player, variant = "player"\)/.test(scriptRender) ||
    !/function _renderSignalBattleLeaderboardRows\(rows, player, variant = "player"\)/.test(scriptRender) ||
    !/function _renderSignalHeatCheckLeaderboardRows\(rows, player, variant = "player"\)/.test(scriptRender) ||
    !/function _renderSignalLeaderboardTabs\(\)/.test(scriptRender) ||
    !/function setSignalLeaderboardMode\(mode\)/.test(scriptRender) ||
    !/weeklySignalSprintRows/.test(scriptRender) ||
    !/seasonSignalSprintRows/.test(scriptRender) ||
    !/weeklySignalBattleRows/.test(scriptRender) ||
    !/seasonSignalBattleRows/.test(scriptRender) ||
    !/weeklySignalHeatRows/.test(scriptRender) ||
    !/seasonSignalHeatRows/.test(scriptRender) ||
    !/100 Second Signal Sprint/.test(scriptRender) ||
    !/6 Seconds of Battle/.test(scriptRender) ||
    !/Heat Check/.test(scriptRender) ||
    !/Full Play Call/.test(scriptRender) ||
    !/correct, accuracy, speed/.test(scriptRender) ||
    !/correct, reaction time/.test(scriptRender) ||
    !/best streak, total correct/.test(scriptRender) ||
    !/function _startQuizTimerIfNeeded\(\)/.test(scriptRender) ||
    !/timeLimitMs:\s*signalMode === "signal-sprint" \? SIGNAL_SPRINT_DURATION_MS : 0/.test(scriptRender) ||
    !/finishScriptQuiz\(\{ timedOut: true \}\)/.test(scriptRender) ||
    !/averageAnswerMs/.test(scriptRender) ||
    !/timedOut/.test(scriptRender) ||
    !/async function startPlayerQuizHubSignals\(\)/.test(scriptRender) ||
    !/getSignalQuizItems\(\{[\s\S]*?requireClip: true,[\s\S]*?categories: signalCategories,[\s\S]*?includeDraft: _canUseStaffSignalClips\(signalSettings\)/.test(scriptRender) ||
    !/type: "signal_full_call"/.test(scriptRender) ||
    !/question\.type === "signal_full_call"/.test(scriptRender) ||
    !/signalFullCallClips/.test(scriptRender) ||
    !/sq-signal-sequence-prompt/.test(scriptRender) ||
    !/signalCategoryMultiplier/.test(scriptRender) ||
    !/signalGame: _quizSourceType === "signal"/.test(scriptRender) ||
    !/sourceType:\s*"signal"/.test(scriptRender) ||
    !/function _getSignalQuizStatus\(\)/.test(scriptRender) ||
    !/signalClipUrl/.test(scriptRender) ||
    !/Correct/.test(scriptRender) ||
    !/Incorrect/.test(scriptRender) ||
    !/disablepictureinpicture/.test(scriptRender) ||
    !/preload="auto"/.test(scriptRender) ||
    !/function _getQuizSourceLabel\(sourceType = _quizSourceType/.test(scriptRender) ||
    !/["']toggleSignalGameCategory["']/.test(auth) ||
    !/["']setSignalLeaderboardMode["']/.test(auth)
  ) {
    fail("signal quiz study mode is incomplete");
  }
  if (/<video src="\$\{escapeAttr\(question\.signalClipUrl\)\}"[^>]*\scontrols(?:\s|>|=)/.test(scriptRender)) {
    fail("signal quiz video prompt should not show browser controls");
  }

  if (
    !/data-action='openPlaybookSignalSelector'/.test(appEvents) ||
    !/openPlaybookSignalSelector\(signalBtn\.dataset\.arg\)/.test(appEvents)
  ) {
    fail("playbook signal click routing is incomplete");
  }

  if (
    !/\.signals-play-overlay/.test(signalsCss) ||
    !/\.signals-play-dialog/.test(signalsCss) ||
    !/\.signals-play-chip/.test(signalsCss) ||
    !/\.signals-play-video/.test(signalsCss) ||
    !/\.signals-clip-modal-overlay/.test(signalsCss) ||
    !/\.signals-clip-modal-video/.test(signalsCss) ||
    !/\.signals-clip video\s*\{[\s\S]*display:\s*none/.test(signalsCss) ||
    !/\.pb-signal-badge/.test(signalsCss) ||
    !/\.signals-coverage/.test(signalsCss) ||
    !/\.signals-coverage-missing/.test(signalsCss) ||
    !/\.signal-availability/.test(signalsCss) ||
    !/\.signal-availability-groups/.test(signalsCss) ||
    !/\.signal-availability-action/.test(signalsCss) ||
    !/z-index:\s*calc\(var\(--z-skip-link\) \+ 2\)/.test(signalsCss) ||
    !/\.pp-signals-btn/.test(presentationCss) ||
    !/\.player-quiz-source-card--signals/.test(scriptCss) ||
    !/\.sq-signal-prompt/.test(scriptCss) ||
    !/\.sq-answer-flash/.test(scriptCss) ||
    !/\.sq-game-pill--timer/.test(scriptCss) ||
    !/\.sq-result-sprint/.test(scriptCss) ||
    !/\.signal-sprint-leader-row/.test(scriptCss) ||
    !/\.signal-leaderboard-tabs/.test(scriptCss) ||
    !/\.signal-game-category-panel/.test(scriptCss) ||
    !/\.signal-game-category-chip/.test(scriptCss) ||
    !/\.sq-signal-sequence-prompt/.test(scriptCss) ||
    !/\.sq-signal-sequence-grid/.test(scriptCss) ||
    !/\.sq-signal-prompt\.is-hidden/.test(scriptCss) ||
    !/\.script-quiz-choices\.is-battle-locked/.test(scriptCss)
  ) {
    fail("signal selector styling is incomplete");
  }

  if (
    !/function _sigConfigureLoopVideos\(root = document\)/.test(signals) ||
    !/function openSignalClipModal\(cacheKey\)/.test(signals) ||
    !/function _sigOpenClipModalItem\(item\)/.test(signals) ||
    !/async function _sigOpenFirstClipForSummary\(summary\)/.test(signals) ||
    !/function _sigShouldOpenClipDirectly\(\)/.test(signals) ||
    !/window\.matchMedia\("\(max-width: 700px\)"\)\.matches/.test(signals) ||
    !/if \(_sigShouldOpenClipDirectly\(\) && _sigCanOpenSummaryClip\(summary\)\)/.test(signals) ||
    !/function closeSignalClipModal\(\)/.test(signals) ||
    !/window\.openSignalClipModal = openSignalClipModal/.test(signals) ||
    !/window\.closeSignalClipModal = closeSignalClipModal/.test(signals) ||
    !/data-action="openSignalClipModal"/.test(signals) ||
    !/overlay\.dataset\.action = "closeSignalClipModalOverlay"/.test(signals) ||
    !/\.signals-clip-modal-video/.test(signals) ||
    !/const SILENT_UPLOAD_FPS = 30/.test(clips) ||
    !/async function createSilentVideoFile\(file, durationSec = 0\)/.test(clips) ||
    !/canvas\.captureStream\(SILENT_UPLOAD_FPS\)/.test(clips) ||
    !/new MediaRecorder\(stream, \{ mimeType \}\)/.test(clips) ||
    !/Removing audio before video upload/.test(clips) ||
    !/const uploadFile = await createSilentVideoFile\(file, duration\)/.test(clips) ||
    !/body: uploadFile/.test(clips) ||
    !/video\.defaultMuted = true/.test(signals) ||
    !/video\.playsInline = true/.test(signals) ||
    !/SIGNAL_IPHONE_CAPTURE_HINT/.test(signals) ||
    !/accept="video\/mp4,video\/quicktime,video\/\*"/.test(signals) ||
    !/1080p HD at 30 fps/.test(signals) ||
    !/Keep it under \$\{_sigFormatMegabytes\(SIGNAL_MAX_BYTES\)\}/.test(signals) ||
    !/_sigConfigureLoopVideos\(preview\)/.test(signals) ||
    !/_sigConfigureLoopVideos\(listEl\)/.test(signals) ||
    !/<video controls autoplay loop muted preload="metadata" playsinline/.test(signals) ||
    !/<video class="signals-play-video"[\s\S]*controls autoplay loop muted playsinline/.test(signals)
  ) {
    fail("signal clips are not configured as muted autoplay loops");
  }

  if (
    !/- \[x\] Add a Playbook detail surface for "Signals for this play"/.test(roadmap) ||
    !/- \[x\] Mark formation as a non-video cue because formations are yelled/.test(roadmap) ||
    !/- \[x\] Route all remote video clip uploads through a shared silent-upload/.test(roadmap) ||
    !/- \[x\] On mobile, tapping a signal chip with an attached clip opens the video/.test(roadmap) ||
    !/- \[x\] Add a small `Signals` button to Practice Script play rows\/cards/.test(roadmap) ||
    !/- \[x\] Add the same signal selector to Script Swipe View \/ presentation-style/.test(roadmap) ||
    !/- \[x\] The selector should show grouped chips by `CORE`, `TAGS`, `BLOCKING`, and/.test(roadmap) ||
    !/- \[x\] Signal clips autoplay muted and loop like GIF-style previews; player quiz/.test(roadmap) ||
    !/- \[x\] Add signal availability to player-facing play detail and current-practice/.test(roadmap) ||
    !/- \[x\] Add future quiz hooks so players can be asked to identify the signal/.test(roadmap) ||
    !/- \[x\] Add simple coach\/admin coverage reporting: components with signals,/.test(roadmap) ||
    !/Phase 5 - Signal games and leaderboards:/.test(roadmap) ||
    !/- \[x\] Document the coach capture standard at upload time: iPhone 1080p HD,/.test(roadmap) ||
    !/- \[x\] Build a signal-only quiz item source from published signal clips, grouped[\s\S]*excluding non-video formation/.test(roadmap) ||
    !/- \[x\] Add `100 Second Signal Sprint` as a playable Signal mode/.test(roadmap) ||
    !/- \[x\] Add Signal Sprint leaderboard ranking by correct answers/.test(roadmap) ||
    !/- \[x\] Add `6 Seconds of Battle`/.test(roadmap) ||
    !/- \[x\] Add `Heat Check`/.test(roadmap) ||
    !/- \[x\] Add Signal game category selection before launch/.test(roadmap) ||
    !/- \[x\] Add a dedicated Signal Leaderboard with three tabs/.test(roadmap) ||
    !/- \[x\] Sync Signal game attempts through the existing leaderboard pipeline/.test(roadmap) ||
    !/- \[x\] Give coaches controls for eligible categories/.test(roadmap) ||
    !/- \[x\] Tighten Signal quiz playback: remove browser video controls from quiz/.test(roadmap) ||
    !/- \[x\] Add a future `Full Play Call` signal game/.test(roadmap)
  ) {
    fail("signals roadmap checklist is not updated for the play selector slice");
  }

  console.log("signal play integration contracts ok");
}

function checkGuideContracts() {
  const html = read("index.html");
  const guide = read("AGENTS.md");
  const scripts = [...html.matchAll(/<script\b[^>]+src="(js\/[^"]+)"/g)]
    .map((match) => match[1].split("?")[0]);
  const loadOrderBlock = guide.match(
    /All scripts use `defer`[\s\S]*?```\n([\s\S]*?)```/,
  );
  const documentedScripts = loadOrderBlock
    ? [...loadOrderBlock[1].matchAll(/^\d+\.\s+(js\/[^\s]+)/gm)].map((match) => match[1])
    : [];
  if (scripts.join("\n") !== documentedScripts.join("\n")) {
    fail("AGENTS.md script load order does not match index.html");
  }

  const appEvents = read("js/app-events.js");
  const readSetValues = (source, setName) => {
    const block = source.match(
      new RegExp(`const ${setName}\\s*=\\s*new Set\\(\\[([\\s\\S]*?)\\]\\)`),
    );
    return block
      ? [...block[1].matchAll(/["']([^"']+)["']/g)].map((match) => match[1])
      : [];
  };
  ["_ELEMENT_FNS", "_BOOL_FNS"].forEach((setName) => {
    const runtimeValues = readSetValues(appEvents, setName);
    const documentedValues = readSetValues(guide, setName);
    if (runtimeValues.join("\n") !== documentedValues.join("\n")) {
      fail(`AGENTS.md ${setName} does not match js/app-events.js`);
    }
  });

  const storage = read("js/storage.js");
  const storageObject = storage.match(/const STORAGE_KEYS\s*=\s*\{([\s\S]*?)\n\};/);
  const runtimeKeys = storageObject
    ? [...storageObject[1].matchAll(/^\s*([A-Z0-9_]+):/gm)].map((match) => match[1])
    : [];
  const storageGuideBlock = guide.match(
    /### STORAGE_KEYS \(complete list\)[\s\S]*?```js\n([\s\S]*?)```/,
  );
  const documentedKeys = storageGuideBlock
    ? [...storageGuideBlock[1].matchAll(/^([A-Z0-9_]+)\s+/gm)].map((match) => match[1])
    : [];
  if (runtimeKeys.join("\n") !== documentedKeys.join("\n")) {
    fail("AGENTS.md STORAGE_KEYS list does not match js/storage.js");
  }

  const callsheet = read("js/callsheet-render.js");
  const countCategoryIds = (name) => {
    const block = callsheet.match(
      new RegExp(`const ${name}\\s*=\\s*\\[([\\s\\S]*?)\\n\\];`),
    );
    return block ? (block[1].match(/\bid\s*:/g) || []).length : 0;
  };
  const frontCount = countCategoryIds("CALLSHEET_FRONT");
  const backCount = countCategoryIds("CALLSHEET_BACK");
  const documentedFront = Number(
    guide.match(/\*\*CALLSHEET_FRONT\*\*\s+—\s+(\d+)/)?.[1],
  );
  const documentedBack = Number(
    guide.match(/\*\*CALLSHEET_BACK\*\*\s+—\s+(\d+)/)?.[1],
  );
  const documentedTotal = Number(
    guide.match(/CALLSHEET_CATEGORIES = \[\]; \/\/ All (\d+) base category definitions/)?.[1],
  );
  if (
    frontCount !== documentedFront ||
    backCount !== documentedBack ||
    frontCount + backCount !== documentedTotal
  ) {
    fail(
      `AGENTS.md call sheet counts do not match runtime ` +
      `(runtime ${frontCount}/${backCount}/${frontCount + backCount}, ` +
      `guide ${documentedFront}/${documentedBack}/${documentedTotal})`,
    );
  }

  console.log(
    `guide contracts ok (${scripts.length} scripts, ${runtimeKeys.length} storage keys, ` +
    `${frontCount + backCount} call sheet categories)`,
  );
}

function checkFunctionShadows() {
  const fileMap = {};
  walk("js")
    .filter((file) => file.endsWith(".js") && !file.endsWith(".min.js"))
    .forEach((file) => {
      const source = read(file);
      [...source.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm)]
        .forEach((match) => {
          const name = match[1];
          if (!fileMap[name]) fileMap[name] = [];
          fileMap[name].push(file);
        });
    });

  const shadows = Object.entries(fileMap)
    .filter(([, files]) => files.length > 1)
    .map(([name, files]) => `${name} (${files.join(", ")})`);

  if (shadows.length) {
    fail(`duplicate top-level function declarations (shadows): ${shadows.join(" | ")}`);
  }
  console.log("function shadows ok");
}

checkJsSyntax();
checkServiceWorkerAssets();
checkIndexReferences();
checkCssGuardrails();
checkPageStyleContracts();
checkAppChromeStackingContract();
checkAccessibilityBasics();
checkDeclarativeHandlers();
checkStorageKeyUsage();
checkMigrationRetry();
checkSafeUiRendering();
checkHistoryContracts();
checkConflictContracts();
checkPlayCompareKeyContracts();
checkUppercaseCallRenderingContracts();
checkWristbandTypography();
checkPersonnelMarkerContracts();
checkPlayPresentationContracts();
checkPlayIdentityHandoffFixtures();
checkScriptPlayerPublishingContracts();
checkPlayReadinessContracts();
checkPlayerPortalContracts();
checkCallSheetMobileContracts();
checkMobileCapabilityMatrix();
checkAnchoredMenuContract();
checkPageHelpContract();
checkActionGridContract();
checkPrimaryNavContract();
checkGameWeekBarContract();
checkTransferReceiptContract();
checkScoutOverviewContract();
checkWristbandWorkspaceContracts();
checkPlayerWristbandRuleOverrides();
checkSevenOnSevenTemplate();
checkGamePlanMediaReadinessContracts();
checkSignalPlayIntegrationContracts();
checkCacheBusters();
checkServiceWorkerLifecycle();
checkServiceWorkerCachePolicy();
checkCleanupAudit();
checkStressAuditHarness();
checkE2eLocalHarness();
checkStartupDiagnosticsAndRenderQueue();
checkStorageRestoreNormalization();
checkStartupTabRestoreContracts();
checkStartupRestoreHarness();
checkGracefulLoadingStates();
checkWorkspaceSyncContracts();
checkPlayerDiagramReadinessContracts();
checkPlayerQuizSettingsContracts();
checkScrollOwnershipContract();
checkTopLevelSymbolOwnership();
checkSplitFileOwnershipClaims();
checkWindowExportManifest();
checkModulePrefixManifest();
checkWristbandConstantUsage();
checkScriptPacketPrintContracts();
checkScriptSelectionRenderContracts();
checkGuideContracts();
checkFunctionShadows();

if (process.exitCode) process.exit(process.exitCode);
console.log("smoke-check passed");
