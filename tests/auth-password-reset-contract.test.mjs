import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const authHelpers = await readFile(new URL("functions/_lib/d1-auth.js", `file://${root}/`), "utf8");
const resetRoute = await readFile(new URL("functions/auth/reset-confirm.js", `file://${root}/`), "utf8");

assert.match(
  authHelpers,
  /SET password_hash = \?, password_changed_at = \?,\s*failed_login_count = 0, lockout_until = NULL, updated_at = \?/,
  "a password reset clears the failed-login counter and temporary lockout",
);
assert.match(
  authHelpers,
  /await setD1SessionInvalidBefore\(db, userId, now\)/,
  "a password reset invalidates existing sessions",
);
assert.match(
  resetRoute,
  /await updateD1Password\(env\.DB, tokenRecord\.user_id, password\)/,
  "the reset-confirm route uses the shared safe password-update path",
);

console.log("auth password reset contract: 3 assertions passed");
