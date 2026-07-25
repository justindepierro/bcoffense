import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const authSource = await readFile(new URL("js/auth.js", `file://${root}/`), "utf8");
const cloudSource = await readFile(new URL("js/cloud-sync.js", `file://${root}/`), "utf8");
const componentStyles = await readFile(new URL("css/components.css", `file://${root}/`), "utf8");
const utilsSource = await readFile(new URL("js/utils.js", `file://${root}/`), "utf8");
const serverAuthSource = await readFile(new URL("functions/_lib/auth.js", `file://${root}/`), "utf8");

assert.match(
  cloudSource,
  /async function autoPullLatestCloudBackup\(opts = \{\}\) \{[\s\S]*?const currentUser =[\s\S]*?if \(!currentUser\) return false;[\s\S]*?if \(opts\.bootstrap === true\) \{[\s\S]*?sessionStorage\.removeItem\(CLOUD_SYNC_AUTO_PULL_SESSION_KEY\);[\s\S]*?if \(sessionStorage\.getItem\(CLOUD_SYNC_AUTO_PULL_SESSION_KEY\) === "1"\) return false;[\s\S]*?sessionStorage\.setItem\(CLOUD_SYNC_AUTO_PULL_SESSION_KEY, "1"\);/,
  "a completed sign-in always receives a fresh workspace bootstrap decision",
);
assert.match(
  cloudSource,
  /async function hasLocalCoachWorkspaceContent\(\)[\s\S]*?STORAGE_KEYS\.SAVED_SCRIPTS[\s\S]*?hasAuthoredCoachValue\(key, storageManager\.get\(key, null\)\)/,
  "only actual authored coach work, not empty drafts or default game-plan boards, qualifies for the first-run overwrite safeguard",
);
assert.match(
  cloudSource,
  /function hasAuthoredCoachValue\(key, value\)[\s\S]*?STORAGE_KEYS\.SCRIPT_DRAFT[\s\S]*?STORAGE_KEYS\.GAME_PLAN_BOARDS[\s\S]*?board\?\.assignments/,
  "drafts and boards are inspected for plays before they can block a canonical restore",
);
assert.match(
  cloudSource,
  /shouldProtectUntrackedLocalWorkspace\(settings, hasLocalWorkspace\) && hasLocalCoachContent/,
  "an empty upload shell applies the canonical workspace instead of being mistaken for competing work",
);
assert.match(
  cloudSource,
  /Newer team workspace found\.[\s\S]*?persistent: true,[\s\S]*?actionLabel: canReviewWorkspace \? "Review options"/,
  "a protected local workspace explains the safety decision and stays available for review",
);
assert.match(
  utilsSource,
  /persistent = durationOrOpts\.persistent === true;[\s\S]*?existing\?\.dataset\.persistent === "true" && !persistent[\s\S]*?if \(!persistent\) \{/,
  "a persistent safety notice cannot expire or be replaced by routine toast noise",
);
assert.match(
  authSource,
  /const completeAuthenticatedLogin = async \(user, source\) => \{[\s\S]*?overlay\.classList\.add\("is-bootstrap-loading"\);[\s\S]*?usernameEl\.disabled = true;[\s\S]*?await autoPullLatestCloudBackup\(\{ timeoutMs: 14 \* 1000, bootstrap: true \}\);[\s\S]*?overlay\.remove\(\);[\s\S]*?applyRoleUi\(\);/,
  "sign-in locks into a loading state until the account-authorized workspace has been checked",
);
assert.match(
  serverAuthSource,
  /<h2>Sign in to BCOffense<\/h2>[\s\S]*?Email or username[\s\S]*?<button type="submit">Sign In<\/button>[\s\S]*?About BCOffense[\s\S]*?Terms of Use/,
  "the server security gate uses the same login language and legal access as the in-app sign-in overlay",
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
  componentStyles,
  /\.about-bcoffense-overlay\s*\{[\s\S]*?z-index:\s*calc\(var\(--z-skip-link\) \+ 1\);/,
  "About and Terms dialogs open above the signed-out login overlay",
);
assert.match(
  componentStyles,
  /\.auth-login-overlay\.is-bootstrap-loading \.auth-login-bootstrap\s*\{\s*display: grid;/,
  "the authenticated workspace bootstrap has a dedicated loading view",
);
assert.match(
  authSource,
  /function openBCOffenseTerms\(\)[\s\S]*?Authorized use[\s\S]*?Accounts and security[\s\S]*?Team data and media[\s\S]*?Ownership and restrictions[\s\S]*?Availability and changes[\s\S]*?not a substitute for legal advice/,
  "Terms of Use state the private-use rules and remain clear about their non-legal-advice scope",
);

console.log("auth login workspace contract passed");
