#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const bootstrapSource = fs.readFileSync(path.join(root, "js/app-bootstrap.js"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makeClassList() {
  const classes = new Set();
  return {
    add: (name) => classes.add(name),
    remove: (name) => classes.delete(name),
    contains: (name) => classes.has(name),
    toggle: (name, force) => {
      const shouldAdd = force === undefined ? !classes.has(name) : Boolean(force);
      if (shouldAdd) classes.add(name);
      else classes.delete(name);
      return shouldAdd;
    },
  };
}

function makeElement() {
  return {
    classList: makeClassList(),
    dataset: {},
  };
}

function buildScenarioSource(body) {
  return `
  (async () => {
    const STORAGE_KEYS = {
      PLAYBOOK: "playbook",
      DEFENSIVE_TENDENCIES: "defensiveTendencies",
      LAST_ACTIVE_TAB: "lastActiveTab",
    };
    const TAB_INDEX_MAP = {
      playbook: 0,
      script: 1,
      wristband: 2,
      tendencies: 3,
      gameplan: 4,
      callsheet: 5,
      installation: 6,
      identity: 7,
      offensebuilder: 8,
      dashboard: 9,
    };

    let plays = [];
    let filteredPlays = [];
    let currentActiveTab = "playbook";
    let authReady = false;
    let resolveAuthReady;
    const authReadyPromise = new Promise((resolve) => { resolveAuthReady = resolve; });
    const calls = [];
    const storage = {};
    const elements = {
      uploadSection: ${JSON.stringify({})},
      mainApp: ${JSON.stringify({})},
      backToAppBtn: ${JSON.stringify({})},
    };
    Object.keys(elements).forEach((key) => { elements[key] = __makeElement(); });

    const document = {
      body: __makeElement(),
      getElementById(id) {
        return elements[id] || null;
      },
      querySelector() {
        return null;
      },
    };
    document.body.dataset = {};
    const window = {
      innerWidth: 1200,
      visualViewport: { width: 1200 },
    };

    const storageManager = {
      get(key, fallback = null) {
        return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : fallback;
      },
      set(key, value) {
        storage[key] = value;
        calls.push(["storage:set", key]);
      },
    };

    function ensurePlaybookPlayIds(playbook) {
      playbook.forEach((play, index) => {
        if (!play.id) play.id = "play-" + index;
      });
      return 0;
    }
    function ensureOpponentIds() { return 0; }
    function invalidatePlaybookRuntimeIndex() { calls.push(["invalidatePlaybookRuntimeIndex"]); }
    function initAllModules() { calls.push(["initAllModules"]); }
    function _syncSortUI() { calls.push(["syncSortUI"]); }
    function runDraftRestoreCheckForTab(tab) { calls.push(["runDraftRestoreCheckForTab", tab]); }
    function requestRenderPlaybook() { calls.push(["requestRenderPlaybook"]); }
    function requestRenderDashboard() { calls.push(["requestRenderDashboard"]); }
    function requestRenderGamePlan() { calls.push(["requestRenderGamePlan"]); }
    function queueMobileShellMeasuredSync() { calls.push(["queueMobileShellMeasuredSync"]); }
    function showTab(tab) {
      calls.push(["showTab", tab]);
      currentActiveTab = tab;
      document.body.dataset.activeTab = tab;
      refreshHydratedStartupSurfaces(tab);
    }
    function whenAuthReady() {
      return authReady ? Promise.resolve({ role: "admin" }) : authReadyPromise;
    }
    function canAccessTab(tab) {
      return authReady && __allowedTabs.has(tab);
    }
    function getDefaultAuthTab() {
      return __defaultTab;
    }

    ${bootstrapSource}

    async function flushStartup() {
      await Promise.resolve();
      await Promise.resolve();
    }

    async function markAuthReady() {
      authReady = true;
      resolveAuthReady({ role: "admin" });
      await flushStartup();
    }

    globalThis.__startupHarnessApi = {
      calls,
      storage,
      get plays() { return plays; },
      get filteredPlays() { return filteredPlays; },
      get currentActiveTab() { return currentActiveTab; },
      restoreStoredPlaybookSession,
      refreshHydratedStartupSurfaces,
      applyPendingRestoredStartupTab,
      flushStartup,
      markAuthReady,
    };

    await (async () => {
      ${body}
    })();
  })();
  `;
}

async function runScenario(name, options, body) {
  const context = {
    console,
    setTimeout,
    clearTimeout,
    Promise,
    assert,
    __makeElement: makeElement,
    __allowedTabs: new Set(options.allowedTabs || ["playbook", "dashboard", "script", "gameplan"]),
    __defaultTab: options.defaultTab || "playbook",
  };
  context.globalThis = context;
  vm.createContext(context);
  try {
    const script = new vm.Script(buildScenarioSource(body), {
      filename: `startup-restore-harness:${name}`,
    });
    await script.runInContext(context);
  } catch (err) {
    throw new Error(`${name}: ${err.message}`);
  }
}

await runScenario(
  "saved dashboard tab waits for auth and refreshes immediately",
  { allowedTabs: ["playbook", "dashboard"], defaultTab: "playbook" },
  `
    const api = globalThis.__startupHarnessApi;
    api.storage[STORAGE_KEYS.LAST_ACTIVE_TAB] = "dashboard";
    api.restoreStoredPlaybookSession([{ play: "Power" }, { play: "Counter" }]);

    assert(api.plays.length === 2, "playbook was not restored");
    assert(api.filteredPlays.length === 2, "filtered plays were not hydrated");
    assert(api.currentActiveTab === "playbook", "dashboard restored before auth readiness");
    assert(api.calls.some((call) => call[0] === "initAllModules"), "modules were not initialized");
    assert(api.calls.some((call) => call[0] === "requestRenderPlaybook"), "playbook render was not queued during startup wait");
    assert(!api.calls.some((call) => call[0] === "showTab" && call[1] === "dashboard"), "dashboard tab was shown before auth");

    await api.markAuthReady();

    assert(api.currentActiveTab === "dashboard", "dashboard tab was not restored after auth");
    assert(api.calls.some((call) => call[0] === "showTab" && call[1] === "dashboard"), "dashboard showTab was not called after auth");
    assert(api.calls.some((call) => call[0] === "requestRenderDashboard"), "dashboard render was not queued after restore");
  `,
);

await runScenario(
  "saved game plan tab restores after auth and queues game plan render",
  { allowedTabs: ["playbook", "gameplan"], defaultTab: "playbook" },
  `
    const api = globalThis.__startupHarnessApi;
    api.storage[STORAGE_KEYS.LAST_ACTIVE_TAB] = "gameplan";
    api.restoreStoredPlaybookSession([{ play: "Mesh" }]);
    await api.markAuthReady();

    assert(api.currentActiveTab === "gameplan", "game plan tab was not restored after auth");
    assert(api.calls.some((call) => call[0] === "requestRenderPlaybook"), "playbook render was not queued");
    assert(api.calls.some((call) => call[0] === "requestRenderGamePlan"), "game plan render was not queued");
  `,
);

await runScenario(
  "inaccessible saved tab falls back after auth",
  { allowedTabs: ["dashboard"], defaultTab: "dashboard" },
  `
    const api = globalThis.__startupHarnessApi;
    api.storage[STORAGE_KEYS.LAST_ACTIVE_TAB] = "script";
    api.restoreStoredPlaybookSession([{ play: "Stick" }]);
    await api.markAuthReady();

    assert(api.currentActiveTab === "dashboard", "inaccessible saved tab did not fall back to default auth tab");
    assert(!api.calls.some((call) => call[0] === "showTab" && call[1] === "script"), "inaccessible script tab was shown");
    assert(api.calls.some((call) => call[0] === "requestRenderDashboard"), "fallback dashboard render was not queued");
  `,
);

await runScenario(
  "no saved tab still refreshes hydrated playbook surface",
  { allowedTabs: ["playbook"], defaultTab: "playbook" },
  `
    const api = globalThis.__startupHarnessApi;
    api.restoreStoredPlaybookSession([{ play: "Duo" }]);
    await api.flushStartup();

    assert(api.currentActiveTab === "playbook", "active tab changed unexpectedly");
    assert(api.calls.some((call) => call[0] === "requestRenderPlaybook"), "playbook render was not queued without saved tab");
    assert(api.calls.some((call) => call[0] === "runDraftRestoreCheckForTab" && call[1] === "playbook"), "draft restore check was not run for default tab");
  `,
);

console.log("startup restore harness passed");
