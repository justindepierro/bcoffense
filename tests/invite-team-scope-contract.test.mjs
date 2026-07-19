/**
 * Team-boundary contract for the legacy /auth/invite endpoint.
 *
 * Pages Functions run in the Cloudflare runtime, so this static check protects
 * the essential invariant in Node: an invited player is always created inside
 * the authenticated staff member's team, never as a globally unassigned user.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const inviteRoute = await readFile(new URL("functions/auth/invite.js", `file://${root}/`), "utf8");

assert.match(
  inviteRoute,
  /const teamId = String\(session\.teamId \|\| ""\)\.trim\(\);[\s\S]*if \(!teamId\)/,
  "invite creation fails closed when the staff session has no team",
);
assert.match(
  inviteRoute,
  /createD1User\(env\.DB, \{[\s\S]*role: "player",[\s\S]*teamId,/,
  "invited player is created with the staff session team ID",
);

console.log("invite team-scope contract: 2 assertions passed");
