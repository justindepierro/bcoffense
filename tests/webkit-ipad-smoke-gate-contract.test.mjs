import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = (path) => readFile(new URL(path, `file://${root}/`), "utf8");
const [packageJson, testsPackageJson, playwrightConfig, smokeLauncher, helpers, qualityWorkflow, productionWorkflow, notificationWorkflow, releaseGate, pagesDeploy, workerDeploy] = await Promise.all([
  source("package.json"),
  source("tests/package.json"),
  source("tests/playwright.config.js"),
  source("tests/run-local-webkit-ipad-smoke.mjs"),
  source("tests/specs/helpers.js"),
  source(".github/workflows/quality.yml"),
  source(".github/workflows/deploy-production.yml"),
  source(".github/workflows/deploy-notification-worker.yml"),
  source("scripts/release-quality-gate.sh"),
  source("scripts/deploy-cloudflare.sh"),
  source("scripts/deploy-notification-worker.sh"),
]);

const appScripts = JSON.parse(packageJson).scripts || {};
const testScripts = JSON.parse(testsPackageJson).scripts || {};
const smokeCommand = testScripts["test:local:webkit-ipad-smoke"] || "";
const qualityCommand = appScripts["test:quality"] || "";

const requiredSpecs = [
  "04-responsive.spec.js",
  "11-playbook-tablet-drawers.spec.js",
  "12-tablet-blocking-layers.spec.js",
  "13-wristband-tablet-rail.spec.js",
  "15-gameplan-tablet-rail.spec.js",
  "16-tablet-usable-height-layers.spec.js",
  "19-player-presentation-diagram-cache.spec.js",
  "23-reorder-modal-layers.spec.js",
  "24-playbook-deferred-layers.spec.js",
  "25-player-playbook-tablet-touch.spec.js",
  "26-playbook-print-layer.spec.js",
  "28-callsheet-ipad-portrait-controls.spec.js",
  "29-compact-tablet-quick-tools.spec.js",
  "30-player-ipad-header.spec.js",
  "31-player-ipad-study-surface.spec.js",
  "32-staff-ipad-shell.spec.js",
  "32-team-ops-ipad.spec.js",
  "32-staff-workspace-surface.spec.js",
  "33-coach-inbox-ipad-layer.spec.js",
  "34-staff-account-task-surfaces.spec.js",
];

assert.equal(
  appScripts["test:webkit:ipad"],
  "npm --prefix tests run test:local:webkit-ipad-smoke",
  "the root package exposes the required local WebKit iPad smoke command",
);
assert.match(qualityCommand, /npm run test:tablet/, "the existing Chromium tablet matrix remains part of quality");
assert.match(qualityCommand, /npm run test:webkit:ipad/, "quality runs the required WebKit iPad smoke");
assert(
  qualityCommand.indexOf("npm run test:tablet") < qualityCommand.indexOf("npm run test:webkit:ipad"),
  "the WebKit smoke supplements the existing Chromium tablet matrix instead of replacing it",
);
assert.equal(smokeCommand, "node run-local-webkit-ipad-smoke.mjs", "the WebKit smoke uses its isolated local launcher");
assert.match(smokeLauncher, /BCOFFENSE_E2E_LOCAL:\s*"1"/, "the WebKit smoke uses the local authenticated app harness");
assert.match(smokeLauncher, /BCOFFENSE_E2E_LOCAL_DIRECT_LOGIN:\s*"1"/, "the WebKit smoke avoids visual-login setup races through the local authenticated harness");
assert.match(smokeLauncher, /BASE_URL:\s*baseUrl/, "the WebKit smoke pins Playwright to its owned loopback server");
assert.match(smokeLauncher, /findFreeLoopbackPort/, "the WebKit smoke avoids fixed-port stale-server reuse");
assert.match(smokeLauncher, /SMOKE_BATCHES = REQUIRED_SPECS\.map\(\(spec\) => \[spec\]\)/, "the WebKit smoke runs every curated spec in a fresh strict process");
assert.match(
  smokeLauncher,
  /const REQUIRED_SPECS = \[\s*"specs\/19-player-presentation-diagram-cache\.spec\.js"/,
  "the presentation-cache regression runs first in its own fresh WebKit process",
);
assert.match(smokeLauncher, /child\.once\("close"/, "the next WebKit batch waits for Playwright's process streams to close");
assert.match(smokeLauncher, /waitForWebKitProcessSettlement/, "the launcher gives native WebKit a bounded cleanup turn between strict batches");
assert.match(smokeLauncher, /if \(exitCode !== 0\) break/, "a failed strict WebKit batch stops the gate instead of retrying or continuing");
assert.match(smokeLauncher, /"--project=ipad-portrait"/, "the WebKit smoke covers iPad portrait");
assert.match(smokeLauncher, /"--project=ipad-landscape"/, "the WebKit smoke covers iPad landscape");
assert.match(smokeLauncher, /"--workers=1"/, "the WebKit smoke serializes shared local browser startup for stable release evidence");
assert.match(smokeLauncher, /"--retries=0"/, "a WebKit regression fails the first required smoke attempt");
assert.doesNotMatch(smokeLauncher, /--(?:pass-with-no-tests|grep|headed|ui)\b/, "the WebKit smoke has no advisory or interactive bypass");
for (const spec of requiredSpecs) {
  assert.match(smokeLauncher, new RegExp(`specs/${spec.replace(".", "\\.")}`), `the WebKit smoke includes ${spec}`);
}

assert.match(
  helpers,
  /form\.requestSubmit\(\)/,
  "local iPad test setup submits the native auth form without waiting on transient visual-viewport button movement",
);
assert.match(
  helpers,
  /AUTH_LOGIN_COMPLETE_TIMEOUT = 20_000/,
  "the local login wait covers the app's bounded authorized-workspace bootstrap",
);
assert.match(
  helpers,
  /E2E_LOCAL_DIRECT_LOGIN[\s\S]*?page\.context\(\)\.request\.post/,
  "the WebKit local harness creates a real loopback session without visual form actionability",
);
assert.match(
  helpers,
  /app-ready[\s\S]*?!document\.body\.classList\.contains\("app-booting"\)/,
  "the direct local session waits for the visible finished app shell before surface assertions run",
);

assert.match(
  playwrightConfig,
  /name:\s*"ipad-portrait",[\s\S]*?use:\s*\{[^}]*browserName:\s*"webkit"/,
  "the portrait iPad project explicitly launches WebKit",
);
assert.match(
  playwrightConfig,
  /name:\s*"ipad-landscape",[\s\S]*?use:\s*\{[^}]*browserName:\s*"webkit"/,
  "the landscape iPad project explicitly launches WebKit",
);

const requiredBrowserInstall = /npm --prefix tests exec -- playwright install --with-deps chromium webkit/;
for (const [name, workflow] of [
  ["PR/main quality", qualityWorkflow],
  ["guarded Pages deployment", productionWorkflow],
  ["guarded notification Worker deployment", notificationWorkflow],
]) {
  assert.match(workflow, requiredBrowserInstall, `${name} installs both required Playwright browsers`);
  assert.doesNotMatch(
    workflow,
    /playwright install --with-deps chromium webkit[^\n]*\|\|/,
    `${name} cannot ignore a missing WebKit installation`,
  );
}
for (const [name, workflow, jobCount] of [
  ["PR/main quality", qualityWorkflow, 1],
  ["guarded Pages deployment", productionWorkflow, 2],
  ["guarded notification Worker deployment", notificationWorkflow, 2],
]) {
  const timeouts = [...workflow.matchAll(/timeout-minutes:\s*(\d+)/g)].map((match) => Number(match[1]));
  assert.deepEqual(timeouts, Array(jobCount).fill(30), `${name} allows the full fail-closed browser quality budget`);
}
assert.match(qualityWorkflow, /run:\s+npm run release:quality/, "PR/main CI invokes the canonical release gate");
assert.match(productionWorkflow, /run:\s+\.\/scripts\/release-quality-gate\.sh/, "the guarded Pages verification invokes the canonical release gate");
assert.match(notificationWorkflow, /run:\s+\.\/scripts\/release-quality-gate\.sh/, "the guarded Worker verification invokes the canonical release gate");
assert.match(releaseGate, /npm run test:quality/, "the canonical release gate includes quality and the WebKit smoke");
assert.match(pagesDeploy, /\.\/scripts\/release-quality-gate\.sh/, "the Pages deployment re-runs the canonical release gate");
assert.match(workerDeploy, /\.\/scripts\/release-quality-gate\.sh/, "the Worker deployment re-runs the canonical release gate");

console.log("WebKit iPad smoke gate contract passed");
