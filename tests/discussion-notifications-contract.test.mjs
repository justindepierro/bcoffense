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

const [notifications, threadRoute, countRoute, indexRoute, itemRoute, client, indexHtml, cloudSync, playerPublish] = await Promise.all([
  source("functions/_lib/d1-notifications.js"),
  source("functions/api/threads/[playId].js"),
  source("functions/api/notifications/count.js"),
  source("functions/api/notifications/index.js"),
  source("functions/api/notifications/[id].js"),
  source("js/app-notifications.js"),
  source("index.html"),
  source("js/cloud-sync.js"),
  source("js/script-player.js"),
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
assert.match(client, /const _NOTIF_CONVERSATION_TYPES = new Set/, "discussion alerts are explicitly classified as conversation work");
assert.match(client, /function _notifGroupItems\(items\)/, "repeated practice publish receipts are grouped in the feed");
assert.match(client, /function setNotifFilter\(filter = "all"\)/, "the mobile drawer can focus on messages or practice work");
assert.match(client, /Promise\.all\(notifIds\.map/, "opening a grouped update acknowledges every collapsed receipt");
assert.match(notifications, /script_published: 24 \* 60 \* 60/, "script publish alerts coalesce for a full day");
assert.match(notifications, /media_update: 24 \* 60 \* 60/, "media alerts coalesce for a full day");
assert.match(indexHtml, /class="notif-filter-bar"/, "notification filters are present in the shell");
assert.match(cloudSync, /function requestImmediateTeamPublish\(reason = "substantial-update"\)/, "substantial player-facing changes bypass the routine autosave delay");
assert.match(playerPublish, /window\.requestImmediateTeamPublish\(kind\)/, "media, script, and quiz publish receipts request an immediate team update");

console.log("discussion notification contract: notification delivery and mobile feed contracts passed");
