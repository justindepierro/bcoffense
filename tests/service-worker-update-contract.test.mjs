import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../index.html", import.meta.url), "utf8");

assert.match(source, /function _canApplyUpdateNow\(\)[\s\S]*?_isDirty\(\)[\s\S]*?hasWorkspaceSyncWork/,
  "a waiting app update checks both draft state and durable publish work");
assert.match(source, /if \(_canApplyUpdateNow\(\)\) \{[\s\S]*?_applyWaitingWorker\(worker\)/,
  "clean coach and player sessions activate a waiting app update automatically");
assert.match(source, /if \(_bcUpdateReloadRequested && _canApplyUpdateNow\(\)\)/,
  "controller activation still reloads only after draft and publish work are clear");

console.log("service worker update contract: clean sessions activate current app shell without interrupting publishes");
