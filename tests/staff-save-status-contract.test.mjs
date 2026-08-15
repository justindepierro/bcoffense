import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = (relativePath) => readFile(new URL(relativePath, `file://${root}/`), "utf8");
const [workspaceSync, layout, responsive] = await Promise.all([
  source("js/workspace-sync.js"),
  source("css/layout.css"),
  source("css/responsive.css"),
]);

assert.match(
  workspaceSync,
  /function getWorkspaceSyncHeaderSummary\(\)[\s\S]*?function renderWorkspaceSyncHeader\(\)[\s\S]*?getElementById\("saveStatus"\)/,
  "the existing header status is projected from the shared workspace coordinator",
);
[
  ["Saved here", "local saved work"],
  ["Syncing team", "team sync in progress"],
  ["Queued · saved here", "queued work that is already safe locally"],
  ["Unsaved changes", "dirty work that has not received a local write receipt"],
  ["Team synced", "team confirmation"],
  ["Player ready", "player-ready confirmation"],
  ["Offline · saved here", "offline local safety"],
  ["Needs attention", "actionable errors"],
].forEach(([label, description]) => {
  assert.ok(workspaceSync.includes(label), `the staff header includes ${description}`);
});
assert.match(
  workspaceSync,
  /workspaceSyncLastSettled[\s\S]*?\["saved", "synced"\]/,
  "settled header state persists after the non-floating dock clears its transient success",
);
assert.match(
  workspaceSync,
  /const dirty = _wsHeaderEntryFor\("dirty"\);[\s\S]*?label: "Unsaved changes"/,
  "dirty editor state is not mislabeled as a durable queued write",
);
assert.match(
  workspaceSync,
  /channel === "local" && item\.state === "saving"[\s\S]*?label: "Saving here"/,
  "an in-progress local write is not mislabeled as already safe while offline",
);
assert.match(
  workspaceSync,
  /normalizedChannel !== "cloud" \|\| next\.confirmed/,
  "an idle cloud status cannot replace a confirmed cloud-job receipt",
);
assert.match(
  workspaceSync,
  /normalizedKey === "team-workspace-refresh"[\s\S]*?_wsSetConnectivity\(\{ service: "unavailable"/,
  "an unrelated notification retry cannot falsely label the team workspace unavailable",
);
assert.match(
  workspaceSync,
  /const playerReady = channel === "player" && item\.confirmed === true;/,
  "Player ready requires a confirmed player-channel release receipt",
);
assert.match(
  workspaceSync,
  /role !== "locked" && role !== "player"/,
  "the coach header status never becomes a player portal surface",
);
assert.match(layout, /\.workspace-save-status\s*\{[\s\S]*?display: inline-flex/, "the shared header status has a compact readout treatment");
assert.match(layout, /\.workspace-save-status--dirty\s*\{[\s\S]*?color: var\(--color-warning-light\)/, "unsaved work uses a distinct warning treatment");
assert.match(responsive, /shell-tablet\.is-mobile-screen\.is-staff-mobile-shell[\s\S]*?\.workspace-save-status/, "staff tablets override the generic mobile hide rule");
assert.match(layout, /Routine staff save work has a calm, persistent home in the header[\s\S]*?workspace-sync-dock--queued[\s\S]*?display: none;/, "staff iPads do not duplicate ordinary saving work in a floating dock");

// Exercise the coordinator directly so the truthfulness rules are not merely
// source-text promises: an idle cloud heartbeat cannot say Player ready, and
// local dirty/saving states retain their distinct language under offline use.
const runtimeElements = {};
const runtimeWindowListeners = {};
const runtimeNode = () => ({
  className: "",
  dataset: {},
  hidden: false,
  textContent: "",
  innerHTML: "",
  setAttribute() {},
  removeAttribute() {},
  querySelector() { return { hidden: false, textContent: "" }; },
});
runtimeElements.saveStatus = runtimeNode();
const runtimeContext = {
  console,
  Date,
  Object,
  Array,
  Map,
  Set,
  String,
  Number,
  Boolean,
  Math,
  navigator: { onLine: true },
  document: {
    body: {
      dataset: { authRole: "coach" },
      appendChild(element) { runtimeElements.workspaceSyncDock = element; },
    },
    addEventListener() {},
    dispatchEvent() {},
    getElementById(id) { return runtimeElements[id] || null; },
    createElement: runtimeNode,
  },
  window: {
    addEventListener(type, listener) { runtimeWindowListeners[type] = listener; },
  },
  setTimeout() { return 1; },
  clearTimeout() {},
  CustomEvent: function CustomEvent() {},
  fetch: async () => ({ ok: true }),
};
runtimeContext.window.window = runtimeContext.window;
vm.runInNewContext(workspaceSync, runtimeContext);
const runtimeSync = runtimeContext.window.workspaceSync;

runtimeContext.window.setWorkspaceSyncStatus("cloud", "synced", { label: "Ready for players" });
assert.equal(runtimeSync.getHeaderSummary().label, "Ready", "an idle cloud heartbeat is not a player release receipt");
runtimeContext.window.setWorkspaceSyncStatus("local", "dirty", { label: "Unsaved local changes" });
assert.equal(runtimeSync.getHeaderSummary().label, "Unsaved changes", "dirty work is never described as saved here");
runtimeContext.window.setWorkspaceSyncStatus("local", "saving", { label: "Saving workspace..." });
runtimeContext.navigator.onLine = false;
runtimeWindowListeners.offline();
assert.equal(runtimeSync.getHeaderSummary().label, "Saving here", "an in-progress local write stays honest while offline");
runtimeContext.navigator.onLine = true;
runtimeContext.window.setWorkspaceSyncStatus("local", "idle");
const cloudJob = runtimeSync.queue("cloud", "commit", { doneLabel: "Team update published" });
runtimeSync.start(cloudJob);
runtimeSync.complete(cloudJob);
assert.equal(runtimeSync.getHeaderSummary().label, "Team synced", "a completed cloud job produces the team confirmation");
const playerJob = runtimeSync.queue("player", "release", { doneLabel: "Player update published" });
runtimeSync.start(playerJob);
runtimeSync.complete(playerJob);
assert.equal(runtimeSync.getHeaderSummary().label, "Player ready", "a completed player job produces the player confirmation");

console.log("staff save-status contract: 25 assertions passed");
