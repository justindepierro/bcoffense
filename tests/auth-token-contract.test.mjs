import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const authHelpers = await readFile(new URL("functions/_lib/d1-auth.js", `file://${root}/`), "utf8");
const inviteRoute = await readFile(new URL("functions/auth/accept-invite.js", `file://${root}/`), "utf8");

assert.match(
  authHelpers,
  /UPDATE verification_tokens SET used_at = \? WHERE user_id = \? AND type = \? AND used_at IS NULL/,
  "issuing an invite or reset revokes prior unused links of the same type",
);
assert.match(
  authHelpers,
  /db\.batch\(\[revokeOutstanding, insert\]\)/,
  "link revocation and replacement are one D1 transaction",
);
assert.match(
  authHelpers,
  /WHERE id = \? AND status = 'invited'/,
  "invitation activation cannot overwrite an already active account",
);
assert.match(
  inviteRoute,
  /const activated = await activateD1User/, 
  "invite route checks the guarded activation result",
);
assert.match(
  inviteRoute,
  /if \(!activated\)/,
  "invite route fails closed after a stale or duplicate activation",
);

console.log("auth token contract: 5 assertions passed");
