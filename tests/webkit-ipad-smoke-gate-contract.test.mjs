import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = (path) => readFile(new URL(path, `file://${root}/`), "utf8");
const [packageJson, testsPackageJson, playwrightConfig, qualityWorkflow, productionWorkflow, notificationWorkflow, releaseGate, pagesDeploy, workerDeploy] = await Promise.all([
  source("package.json"),
  source("tests/package.json"),
  source("tests/playwright.config.js"),
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
  "15-gameplan-tablet-rail.spec.js",
  "16-tablet-usable-height-layers.spec.js",
  "19-player-presentation-diagram-cache.spec.js",
  "23-reorder-modal-layers.spec.js",
  "24-playbook-deferred-layers.spec.js",
  "25-player-playbook-tablet-touch.spec.js",
  "26-playbook-print-layer.spec.js",
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
assert.match(smokeCommand, /^BCOFFENSE_E2E_LOCAL=1 playwright test\b/, "the WebKit smoke uses the local authenticated app harness");
assert.match(smokeCommand, /--project=ipad-portrait/, "the WebKit smoke covers iPad portrait");
assert.match(smokeCommand, /--project=ipad-landscape/, "the WebKit smoke covers iPad landscape");
assert.match(smokeCommand, /--workers=1/, "the WebKit smoke serializes shared local browser startup for stable release evidence");
assert.match(smokeCommand, /--retries=0/, "a WebKit regression fails the first required smoke attempt");
assert.doesNotMatch(smokeCommand, /--(?:pass-with-no-tests|grep|headed|ui)\b/, "the WebKit smoke has no advisory or interactive bypass");
for (const spec of requiredSpecs) {
  assert.match(smokeCommand, new RegExp(`specs/${spec.replace(".", "\\.")}`), `the WebKit smoke includes ${spec}`);
}

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
