import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const authSource = await readFile(new URL("js/auth.js", `file://${root}/`), "utf8");
const cloudSource = await readFile(new URL("js/cloud-sync.js", `file://${root}/`), "utf8");
const componentStyles = await readFile(new URL("css/components.css", `file://${root}/`), "utf8");
const utilsSource = await readFile(new URL("js/utils.js", `file://${root}/`), "utf8");
const serverAuthSource = await readFile(new URL("functions/_lib/auth.js", `file://${root}/`), "utf8");
const loginRouteSource = await readFile(new URL("functions/auth/login.js", `file://${root}/`), "utf8");
const localE2eServerSource = await readFile(new URL("scripts/e2e-local-server.mjs", `file://${root}/`), "utf8");
const appBootstrapSource = await readFile(new URL("js/app-bootstrap.js", `file://${root}/`), "utf8");

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
  /if \(remoteMatchesKnownRevision\) \{[\s\S]*?if \(!hasLocalCoachContent\) \{[\s\S]*?restoreCloudBackup\(remote/,
  "known remote revisions still rehydrate a default-only or empty local shell",
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
  authSource,
  /function handleExpiredServerSession[\s\S]*?capturePlayPresentationResume\(\)[\s\S]*?currentAuthUser = null/,
  "an expired session preserves an open mobile swipe context before locking the app",
);
assert.match(
  authSource,
  /function installAuthFetchBoundary\(\)[\s\S]*?window\.fetch = async function authenticatedFetch[\s\S]*?response\?\.status === 401[\s\S]*?isProtectedSameOriginRequest\(input\)[\s\S]*?bc-auth-session-required/,
  "every same-origin protected API response shares the secure-session recovery boundary",
);
assert.match(
  authSource,
  /\["\/admin\/", "\/api\/", "\/clips\/", "\/images\/", "\/media\/", "\/player\/", "\/sync\/", "\/workspace\/"\]/,
  "the shared 401 boundary covers every authenticated application route family",
);
assert.match(
  authSource,
  /await autoPullLatestCloudBackup[\s\S]*?applyRoleUi\(\)[\s\S]*?restorePlayPresentationResume\(\)/,
  "a successful sign-in restores swipe context only after the authorized workspace is ready",
);
assert.match(
  authSource,
  /async function logoutAuth\(\) \{[\s\S]*?fetch\("\/auth\/logout"[\s\S]*?cache: "no-store"[\s\S]*?fetch\("\/auth\/me"[\s\S]*?verification\.status !== 401[\s\S]*?Could not confirm secure sign-out[\s\S]*?return false;[\s\S]*?currentAuthUser = null/,
  "logout only clears the local identity after the server confirms the session cookie is gone",
);
assert.match(
  localE2eServerSource,
  /const LOCAL_SESSION_COOKIE_NAME = "bc_local_e2e_session";[\s\S]*?const localSessions = new Map\(\);[\s\S]*?function localSessionCookie\(token\)[\s\S]*?"Path=\/"[\s\S]*?"HttpOnly"[\s\S]*?"SameSite=Lax"/,
  "the local E2E server uses a host-only, HttpOnly loopback session cookie",
);
assert.match(
  localE2eServerSource,
  /function handleAuthLogin\(req, res\)[\s\S]*?const token = createLocalSession\(role\);[\s\S]*?"Set-Cookie": localSessionCookie\(token\)/,
  "a successful local sign-in creates a server-side session and returns its cookie",
);
assert.match(
  localE2eServerSource,
  /if \(parsed\.pathname === "\/auth\/me"\) \{[\s\S]*?const session = getLocalSession\(req\);[\s\S]*?if \(!session\)[\s\S]*?authenticated: false[\s\S]*?401[\s\S]*?authenticated: true, user: session\.user/,
  "the local auth probe restores a valid signed-in role and returns 401 only when the cookie is absent or expired",
);
assert.match(
  localE2eServerSource,
  /if \(parsed\.pathname === "\/auth\/logout"\) \{[\s\S]*?localSessions\.delete\(session\.token\);[\s\S]*?"Set-Cookie": clearLocalSessionCookie\(\)/,
  "local sign-out revokes the server-side session and clears its loopback cookie for safe role switching",
);
assert.match(
  appBootstrapSource,
  /function isLocalWorkspacePreviewHost\(\)[\s\S]*?host === "localhost"[\s\S]*?host === "127\.0\.0\.1"/,
  "the empty-workspace preview exception is explicitly limited to loopback hosts",
);
assert.match(
  appBootstrapSource,
  /const isLocalStaffPreview = Boolean\([\s\S]*?currentUser && !isPlayer && isLocalWorkspacePreviewHost\(\)[\s\S]*?const shouldShowEmptyApp = isPlayer \|\| isMobileStartupShell\(\) \|\| isLocalStaffPreview[\s\S]*?const localPreviewTab = isLocalStaffPreview[\s\S]*?getRestorableStoredTab\(\) \|\| "dashboard"/,
  "an authenticated localhost staff preview opens an empty workspace on Dashboard while preserving a saved tab during local reload hydration",
);
assert.match(
  appBootstrapSource,
  /if \(isMobileStartupShell\(\) \|\| isLocalWorkspacePreviewHost\(\)\) return;/,
  "the localhost preview cannot be sent back to import by the delayed first-use walkthrough",
);
assert.match(
  serverAuthSource,
  /<h2>Sign in to BCOffense<\/h2>[\s\S]*?Email or username[\s\S]*?<button type="submit">Sign In<\/button>[\s\S]*?About BCOffense[\s\S]*?Terms of Use/,
  "the server security gate uses the same login language and legal access as the in-app sign-in overlay",
);
assert.match(
  loginRouteSource,
  /if \(!db\) return \{ limited: false, available: false \};/,
  "new logins do not silently bypass rate limiting when its store is unavailable",
);
assert.match(
  loginRouteSource,
  /catch \(_\) \{\s*return \{ limited: false, available: false \};[\s\S]*?if \(!rateLimit\.available\) \{[\s\S]*?temporarily unavailable[\s\S]*?503/,
  "new logins fail closed when the durable rate-limit store is unavailable",
);
assert.doesNotMatch(
  authSource,
  /data-login-role|authPlayerShortcut|AUTH_LOGIN_ROLE_DETAILS/,
  "the app sign-in surface does not ask people to choose their own role",
);
assert.match(
  authSource,
  /function scheduleCloudAutoPull\(\)[\s\S]*?currentAuthUser\.role === "player"[\s\S]*?queueStartupTask\("player-team-refresh"[\s\S]*?const runAutoPull = \(\) =>[\s\S]*?queueStartupTask\("cloud-auto-pull"/,
  "post-paint freshness work stays deferred and cannot replace the blocking workspace bootstrap owner",
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
assert.match(
  authSource,
  /const PLAYER_DATA_MANAGEMENT_ACTIONS = new Set\([\s\S]*?"exportPlaybookCSV"[\s\S]*?"showStorageInfo"[\s\S]*?"openCloudSyncModal"[\s\S]*?"retryWorkspaceSyncWork"[\s\S]*?if \(currentAuthUser\.role === "player" && PLAYER_DATA_MANAGEMENT_ACTIONS\.has\(action\)\) return false;/,
  "players cannot invoke export, storage, recovery, or workspace-sync controls even when a stale menu node exists",
);

console.log("auth login workspace contract passed");
