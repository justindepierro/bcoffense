/**
 * Discussion → staff notification contract.
 *
 * Pages Functions run in the Cloudflare runtime, so these source-level checks
 * protect the durable notification path without requiring a D1 emulator.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = (relativePath) => readFile(new URL(relativePath, `file://${root}/`), "utf8");

const [notifications, threadRoute, countRoute, indexRoute, itemRoute, client] = await Promise.all([
  source("functions/_lib/d1-notifications.js"),
  source("functions/api/threads/[playId].js"),
  source("functions/api/notifications/count.js"),
  source("functions/api/notifications/index.js"),
  source("functions/api/notifications/[id].js"),
  source("js/app-notifications.js"),
]);

assert.match(
  notifications,
  /export async function notifyTeamStaffOfPlayerPost[\s\S]*status = 'active'[\s\S]*role IN \('admin', 'coach', 'assistant_coach'\)/,
  "player discussion alerts target every active team staff account",
);
assert.match(
  notifications,
  /postType === "question"[\s\S]*player_\$\{kind\}/,
  "questions and ordinary comments receive distinct staff notification types",
);
assert.match(
  notifications,
  /export async function ensureNotificationUser[\s\S]*INSERT INTO users/,
  "static staff accounts get a durable notification identity automatically",
);
assert.match(
  threadRoute,
  /if \(!isStaff && modInfo\.outcome !== "block"\)[\s\S]*await notifyTeamStaffOfPlayerPost/,
  "every deliverable player post invokes staff notification delivery",
);
assert.match(threadRoute, /playId,[\s\S]*playLabel: playSig,[\s\S]*body: postBody/, "staff alerts include a play deep link and post context");
for (const route of [countRoute, indexRoute, itemRoute]) {
  assert.match(route, /ensureNotificationUser\(env\.DB, session\)/, "all notification endpoints resolve static staff consistently");
}
assert.match(client, /player_comment: "💬"/, "the bell has an icon for player comments");
assert.match(client, /player_question: "❓"/, "the bell has an icon for player questions");
assert.match(client, /player_reply: "↩️"/, "the bell has an icon for player replies");

console.log("discussion notification contract: 11 assertions passed");
