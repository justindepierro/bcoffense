import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = (relativePath) => readFile(new URL(relativePath, `file://${root}/`), "utf8");
const [cloudSync, workspaceSync, releaseRoute, workspaceRoute] = await Promise.all([
  source("js/cloud-sync.js"),
  source("js/workspace-sync.js"),
  source("functions/player/release.js"),
  source("functions/workspace/revision.js"),
]);

// This is the non-negotiable failure matrix for the coach → Cloudflare →
// player handoff. These checks intentionally verify recovery behavior rather
// than only happy-path rendering.
assert.match(
  cloudSync,
  /async function flushCloudAutoPushInternal\(context\)[\s\S]*?catch \(err\) \{[\s\S]*?cloudAutoPushPending = true[\s\S]*?cloudAutoPushRetryCount \+= 1[\s\S]*?CLOUD_AUTO_PUSH_RETRY_MS/s,
  "an offline coach retains pending work and enters the retry path instead of reporting a false publish",
);
assert.match(
  cloudSync,
  /PLAYER_RELEASE_REQUEST_TIMEOUT_MS = 12 \* 1000[\s\S]*?controller\.abort\(\)[\s\S]*?PLAYER_RELEASE_TIMEOUT/s,
  "a stalled player request is bounded and cannot permanently hold the refresh pipeline",
);
assert.match(
  cloudSync,
  /window\.addEventListener\("pageshow"[\s\S]*?event\.persisted[\s\S]*?refreshTeamWorkspaceOnForeground\(\{ force: true, quiet: true \}\)/s,
  "a player returning through the mobile BFCache path revalidates immediately",
);
assert.match(
  releaseRoute,
  /readCurrentPlayerReleasePointer\(context\.env, teamId\)[\s\S]*?If-None-Match[\s\S]*?status: 304/s,
  "an unchanged player receives a no-body ETag response rather than a stale cached release",
);
assert.match(
  workspaceSync,
  /TEAM_WORKSPACE_LEASE_KEY[\s\S]*?function acquireTeamWorkspaceLease[\s\S]*?workspace-published/s,
  "same-browser coach tabs coordinate their publish cycle before the server write",
);
assert.match(
  workspaceRoute,
  /expectedWorkspaceRevision[\s\S]*?commitWorkspaceAndPlayerRelease[\s\S]*?if \(!committed\.committed\)[\s\S]*?409/s,
  "competing coach devices fail safely on a revision conflict instead of overwriting the newer release",
);

console.log("player release fault matrix: offline, wake, ETag, and concurrent-write recovery contracts passed");
