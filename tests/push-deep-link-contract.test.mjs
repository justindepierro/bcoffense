/**
 * Web Push deep-link contract.
 *
 * Keeps the encrypted push payload, service worker click handoff, and
 * authenticated in-app router aligned without requiring a browser push vendor.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = (relativePath) => readFile(new URL(relativePath, `file://${root}/`), "utf8");

const [webPush, notifications, worker, client, threadRoute] = await Promise.all([
  source("functions/_lib/web-push.js"),
  source("functions/_lib/d1-notifications.js"),
  source("sw.js"),
  source("js/app-notifications.js"),
  source("functions/api/threads/[playId].js"),
]);

assert.match(webPush, /deepLink: notification\.deepLink \|\| ""/, "the encrypted push payload retains its in-app destination");
assert.match(notifications, /function pushUrlForDeepLink\(deepLink\)/, "server notifications create one safe cold-launch URL shape");
assert.match(notifications, /url: pushUrlForDeepLink\(deepLink\),[\s\S]*deepLink,/, "team publish pushes retain their released destination");
assert.match(notifications, /url: pushUrlForDeepLink\(notification\.deepLink\),[\s\S]*deepLink: notification\.deepLink/, "staff comment pushes retain the exact comment destination");
assert.match(threadRoute, /postId: result\.id,[\s\S]*\}, env\)/, "a new player comment authorizes its staff push at the durable-post boundary");
assert.match(worker, /function safePushTarget\(rawUrl\)/, "the service worker refuses external click targets");
assert.match(worker, /data: \{ url: safePushTarget\(payload\.url\), deepLink: String\(payload\.deepLink \|\| ""\) \}/, "the service worker preserves the encrypted deep link in notification data");
assert.match(worker, /client\.postMessage\(\{ type: "PUSH_NOTIFICATION_CLICK", deepLink \}\)/, "an already-open app receives the exact push destination before focus");
assert.match(worker, /clients\.openWindow\(url\)/, "a closed app opens the encoded same-origin destination");
assert.match(client, /function initPushDeepLinkRouting\(\)/, "the app initializes a push click router after authentication begins");
assert.match(client, /url\.searchParams\.get\("push"\)/, "cold launches consume the push destination from the URL");
assert.match(client, /PUSH_NOTIFICATION_CLICK/, "open-app push clicks are consumed from the service worker message");
assert.match(client, /await openNotifDeepLink\(`::\$\{deepLink\}`\)/, "push taps reuse the same role-restricted notification destination router");

console.log("push deep-link contract: encrypted payload, service-worker handoff, and authenticated routing passed");
