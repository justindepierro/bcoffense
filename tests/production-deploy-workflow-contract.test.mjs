import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = (path) => readFile(new URL(path, `file://${root}/`), "utf8");
const [workflow, deployScript, qualityGate, preflight, authRunbook, packageJson, qualityWorkflow] = await Promise.all([
  source(".github/workflows/deploy-production.yml"),
  source("scripts/deploy-cloudflare.sh"),
  source("scripts/release-quality-gate.sh"),
  source("scripts/cloudflare-preflight.sh"),
  source("CLOUDFLARE_AUTH.md"),
  source("package.json"),
  source(".github/workflows/quality.yml"),
]);
const packageScripts = JSON.parse(packageJson).scripts || {};

const verifyStart = workflow.indexOf("  verify:");
const deployStart = workflow.indexOf("  deploy:");
assert(verifyStart >= 0 && deployStart > verifyStart, "the production workflow has a distinct verification job before deployment");
const verifyJob = workflow.slice(verifyStart, deployStart);
const deployJob = workflow.slice(deployStart);

assert.match(workflow, /^name:\s+Deploy Production\s*$/m, "the production workflow has a clear manual Actions label");
assert.match(workflow, /^on:\s*\n\s+workflow_dispatch:\s*$/m, "production deployment is manually dispatched");
assert.doesNotMatch(workflow, /^\s+(?:push|pull_request|schedule|workflow_call):/m, "production deployment has no automatic trigger");
assert.match(workflow, /^permissions:\s*\n\s+contents:\s+read\s*$/m, "the workflow requests only read access to repository contents");
assert.match(workflow, /concurrency:\s*\n\s+group:\s+bcoffense-production-deploy\s*\n\s+cancel-in-progress:\s+false/, "production uploads are serialized without cancelling a live deployment");
assert.match(deployJob, /needs:\s+verify/, "the protected deployment waits for the credential-free verification job");
assert.match(deployJob, /environment:\s*\n\s+name:\s+production/, "the deployment job is protected by the GitHub production Environment");
assert.doesNotMatch(verifyJob, /environment:|CLOUDFLARE_(?:ACCOUNT_ID|API_TOKEN)/, "the verification job cannot receive production environment credentials");
assert.match(workflow, /uses:\s+actions\/checkout@[a-f0-9]{40}\s+#\s+v\d+\.\d+\.\d+[\s\S]*?fetch-depth:\s+0/, "checkout is pinned to an immutable release and preserves history for the exact-main guard");
assert.match(workflow, /uses:\s+actions\/setup-node@[a-f0-9]{40}\s+#\s+v\d+\.\d+\.\d+[\s\S]*?node-version:\s+22/, "Node setup is pinned to an immutable release and uses the supported runtime");
assert.doesNotMatch(workflow, /uses:\s+actions\/(?:checkout|setup-node)@v/, "the production workflow does not rely on mutable action tags");
assert.match(verifyJob, /npm --prefix tests ci/, "the credential-free verification job installs the locked browser-test dependencies");
assert.match(verifyJob, /npm --prefix tests exec -- playwright install --with-deps chromium/, "the credential-free verification job installs Chromium required by the canonical release-quality gate");
assert.match(verifyJob, /run:\s+\.\/scripts\/release-quality-gate\.sh/, "the credential-free verification job runs the canonical quality gate");
assert.match(deployJob, /CLOUDFLARE_ACCOUNT_ID:\s*\$\{\{\s*secrets\.CLOUDFLARE_ACCOUNT_ID\s*\}\}/, "the Cloudflare account selection is scoped to the protected deployment job");
assert.match(deployJob, /CLOUDFLARE_API_TOKEN:\s*\$\{\{\s*secrets\.CLOUDFLARE_API_TOKEN\s*\}\}/, "the Cloudflare token is scoped to the protected deployment job");
assert.match(deployJob, /if \[\[ -z "\$\{CLOUDFLARE_ACCOUNT_ID:-\}" \]\]; then/, "a missing production account ID fails before deployment");
assert.match(deployJob, /if \[\[ -z "\$\{CLOUDFLARE_API_TOKEN:-\}" \]\]; then/, "a missing production token fails before deployment");
assert.doesNotMatch(workflow, /(?:echo|printf)\b[^\n]*(?:\$\{CLOUDFLARE_API_TOKEN|\$CLOUDFLARE_API_TOKEN|\$\{\{\s*secrets\.CLOUDFLARE_API_TOKEN)/, "the workflow never writes the Cloudflare token to logs");
assert.match(deployJob, /run:\s+\.\/scripts\/deploy-cloudflare\.sh/, "the workflow delegates deployment to the canonical guarded script");
assert.doesNotMatch(workflow, /wrangler\s+pages\s+deploy/, "the workflow does not bypass the guarded deployment script");

assert.match(deployScript, /git fetch --quiet origin main/, "the guarded deployment script refreshes origin/main before release");
assert.match(deployScript, /head_commit="\$\(git rev-parse HEAD\)"[\s\S]*?main_commit="\$\(git rev-parse origin\/main\)"[\s\S]*?\[\[ "\$head_commit" != "\$main_commit" \]\]/, "the guarded script refuses a stale or non-main source revision");
assert.match(deployScript, /\.\/scripts\/release-quality-gate\.sh/, "the guarded deployment script executes the canonical quality suite");
const qualityGateIndex = deployScript.indexOf("./scripts/release-quality-gate.sh");
const credentialUnsetIndex = deployScript.indexOf("unset CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_API_TOKEN");
const credentialRestoreIndex = deployScript.indexOf("export CLOUDFLARE_API_TOKEN=\"$cloudflare_api_token\"");
const preflightIndex = deployScript.indexOf("./scripts/cloudflare-preflight.sh");
assert(credentialUnsetIndex >= 0 && credentialUnsetIndex < qualityGateIndex, "Cloudflare credentials are removed from the environment before the mandatory quality gate");
assert(credentialRestoreIndex > qualityGateIndex && credentialRestoreIndex < preflightIndex, "Cloudflare credentials are restored only after quality succeeds and before Cloudflare preflight");
assert.match(deployScript, /\.\/scripts\/cloudflare-preflight\.sh/, "the guarded deployment script executes the read-only D1 migration preflight");
assert.match(deployScript, /Verified Cloudflare production source:/, "the guarded deployment script verifies the Pages source after upload");
assert.match(qualityGate, /npm run test:quality/, "the shared release-quality gate retains its full quality command");

// Tablet geometry is a release requirement, not an advisory local command.
// Keep the command shape explicit so CI, the guarded Pages deploy, and the
// independent notification Worker deploy all retain the same tablet gate via
// release-quality-gate.sh -> test:quality -> test:tablet.
const tabletCommand = packageScripts["test:tablet"] || "";
const qualityCommand = packageScripts["test:quality"] || "";
assert.match(tabletCommand, /scripts\/mobile-viewport-check\.mjs/, "the tablet command runs the maintained viewport harness");
assert.match(tabletCommand, /--roles=admin,coach,player/, "the required tablet matrix includes every supported role");
assert.match(tabletCommand, /--ipad-viewports/, "the required tablet matrix uses the named iPad viewport set");
assert.doesNotMatch(tabletCommand, /--warn-only/, "tablet failures remain release-blocking instead of advisory");
assert.match(qualityCommand, /npm run test:tablet/, "the full quality command includes the required tablet matrix");
assert.match(qualityWorkflow, /npm --prefix tests exec -- playwright install --with-deps chromium/, "the PR/main quality workflow installs Chromium for the required tablet matrix");
assert.match(qualityWorkflow, /run:\s+npm run release:quality/, "the PR/main quality workflow reaches the canonical tablet release gate");
assert.match(preflight, /--command "SELECT name FROM \$\{MIGRATIONS_TABLE\} ORDER BY id;"/, "the D1 preflight reads the migration ledger without applying migrations");
assert.match(authRunbook, /AUTH_SESSION_SECRET\nAUTH_PRIMARY_TEAM_ID/, "the runbook lists every Pages secret the guarded deploy script requires");

console.log("production deployment workflow contract: 39 assertions passed");
