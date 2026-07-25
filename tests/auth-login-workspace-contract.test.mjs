import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const authSource = await readFile(new URL("js/auth.js", `file://${root}/`), "utf8");
const cloudSource = await readFile(new URL("js/cloud-sync.js", `file://${root}/`), "utf8");

assert.match(
  cloudSource,
  /async function autoPullLatestCloudBackup\(opts = \{\}\) \{[\s\S]*?const currentUser =[\s\S]*?if \(!currentUser\) return false;[\s\S]*?if \(sessionStorage\.getItem\(CLOUD_SYNC_AUTO_PULL_SESSION_KEY\) === "1"\) return false;[\s\S]*?sessionStorage\.setItem\(CLOUD_SYNC_AUTO_PULL_SESSION_KEY, "1"\);/,
  "a signed-out shell cannot consume the staff workspace pull guard",
);
assert.match(
  authSource,
  /const completeAuthenticatedLogin = async \(user, source\) => \{[\s\S]*?await autoPullLatestCloudBackup\(\{ timeoutMs: 14 \* 1000 \}\);[\s\S]*?overlay\.remove\(\);[\s\S]*?applyRoleUi\(\);/,
  "sign-in waits for the account-authorized workspace before opening the app",
);
assert.doesNotMatch(
  authSource,
  /data-login-role|authPlayerShortcut|AUTH_LOGIN_ROLE_DETAILS/,
  "the app sign-in surface does not ask people to choose their own role",
);

console.log("auth login workspace contract passed");
