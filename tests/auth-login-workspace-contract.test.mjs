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
  cloudSource,
  /async function hasLocalCoachWorkspaceContent\(\)[\s\S]*?STORAGE_KEYS\.SAVED_SCRIPTS[\s\S]*?STORAGE_KEYS\.GAME_PLAN_BOARDS[\s\S]*?countBackupCallSheetPlays/,
  "only actual authored coach work, not setup residue, qualifies for the first-run overwrite safeguard",
);
assert.match(
  cloudSource,
  /shouldProtectUntrackedLocalWorkspace\(settings, hasLocalWorkspace\) && hasLocalCoachContent/,
  "an empty upload shell applies the canonical workspace instead of being mistaken for competing work",
);
assert.match(
  authSource,
  /const completeAuthenticatedLogin = async \(user, source\) => \{[\s\S]*?await autoPullLatestCloudBackup\(\{ timeoutMs: 14 \* 1000, bootstrap: true \}\);[\s\S]*?overlay\.remove\(\);[\s\S]*?applyRoleUi\(\);/,
  "sign-in waits for the account-authorized workspace before opening the app",
);
assert.doesNotMatch(
  authSource,
  /data-login-role|authPlayerShortcut|AUTH_LOGIN_ROLE_DETAILS/,
  "the app sign-in surface does not ask people to choose their own role",
);
assert.match(
  authSource,
  /function openAboutBCOffense\(\)[\s\S]*?BCOffense is a private football operations workspace built for Burke Catholic Football\.[\s\S]*?jdepierro@burkecatholic\.org[\s\S]*?© 2026 Justin DePierro\. All rights reserved\./,
  "About BCOffense keeps the private-use notice, copyright, and contact information together",
);
assert.match(
  authSource,
  /data-action="openAboutBCOffense"/,
  "the sign-in surface links to About BCOffense",
);
assert.match(
  authSource,
  /function openBCOffenseTerms\(\)[\s\S]*?Authorized use[\s\S]*?Accounts and security[\s\S]*?Team data and media[\s\S]*?Ownership and restrictions[\s\S]*?Availability and changes[\s\S]*?not a substitute for legal advice/,
  "Terms of Use state the private-use rules and remain clear about their non-legal-advice scope",
);

console.log("auth login workspace contract passed");
