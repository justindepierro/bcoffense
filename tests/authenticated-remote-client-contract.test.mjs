/**
 * Protected client requests must wait for the verified server session. A
 * rejected cookie should lock the app once, never fan out into one request per
 * diagram or let staff accounts submit player leaderboard payloads.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = (relativePath) => readFile(new URL(relativePath, `file://${root}/`), "utf8");

const [auth, images, leaderboard] = await Promise.all([
  source("js/auth.js"),
  source("js/play-images.js"),
  source("js/player-quiz-sync.js"),
]);

assert.match(
  auth,
  /window\.addEventListener\("bc-auth-session-required"[\s\S]*handleExpiredServerSession/,
  "a confirmed protected-route 401 restores one centralized sign-in gate",
);
assert.match(
  auth,
  /function handleExpiredServerSession[\s\S]*currentAuthUser = null;[\s\S]*clearStoredAuthUser\(\)[\s\S]*showLoginOverlay/,
  "expired sessions clear stale local identity before showing the sign-in state",
);
assert.match(
  images,
  /async function _hasRemoteMediaSession\(\)[\s\S]*window\.whenAuthReady[\s\S]*window\.getCurrentAuthUser/,
  "diagram reads wait for the verified server session",
);
assert.match(
  images,
  /response\.status === 401[\s\S]*_notifyRemoteAuthRequired\(\)[\s\S]*BC_MEDIA_AUTH_REQUIRED/,
  "a media 401 is classified as an expired session rather than a missing diagram",
);
assert.match(
  images,
  /if \(!\(await _hasRemoteMediaSession\(\)\)\)[\s\S]*method: "auth-blocked"/,
  "batch media checks stop before issuing requests without a session",
);
assert.match(
  images,
  /if \(_remoteAuthBlocked\)[\s\S]*method: "auth-expired"/,
  "a rejected batch never falls back to dozens of individual manifest requests",
);
assert.match(
  images,
  /remote\.status === "unauthorized"[\s\S]*status: "auth-required"/,
  "diagram UI distinguishes authentication from unpublished media",
);
assert.match(
  leaderboard,
  /async function _getVerifiedLeaderboardUser\(\)[\s\S]*window\.whenAuthReady[\s\S]*window\.getCurrentAuthUser/,
  "leaderboard work waits for the same verified session boundary",
);
assert.match(
  leaderboard,
  /response\.status === 401[\s\S]*_notifyLeaderboardAuthRequired\(\)/,
  "leaderboard 401 responses restore the shared sign-in gate",
);
assert.match(
  leaderboard,
  /const user = await _getVerifiedLeaderboardUser\(\);\s*if \(user\?\.role !== "player"\) return null;/,
  "only player accounts can initiate a player leaderboard summary refresh",
);
assert.match(
  leaderboard,
  /async function refreshPlayerLeaderboardSummary[\s\S]*requestJson\(`\/api\/leaderboard\/summary\?weekKey=\$\{weekKey\}`\)/,
  "leaderboard refreshes use the authenticated GET summary endpoint",
);
assert.match(
  leaderboard,
  /function buildPlayerLeaderboardSyncPayload\(\)[\s\S]*attempts: \[\]/,
  "the compatibility sync payload is explicitly empty and cannot upload local practice attempts",
);
assert.doesNotMatch(
  leaderboard,
  /requestJson\(["']\/api\/leaderboard\/sync/,
  "the player client never POSTs mutable local attempts to the leaderboard endpoint",
);
assert.match(
  leaderboard,
  /document\.addEventListener\("DOMContentLoaded"[\s\S]*if \(!user\) return;[\s\S]*refreshPlayerLeaderboardSummary\(\{ quiet: true \}\)/,
  "initial authenticated leaderboard work is a quiet read-only summary refresh",
);

console.log("authenticated remote client contract: session gating and 401 containment passed");
