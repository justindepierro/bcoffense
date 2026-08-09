import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = (path) => readFile(new URL(path, `file://${root}/`), "utf8");
const [workflow, deployScript, authRunbook, packageJson] = await Promise.all([
  source(".github/workflows/deploy-notification-worker.yml"),
  source("scripts/deploy-notification-worker.sh"),
  source("CLOUDFLARE_AUTH.md"),
  source("package.json"),
]);
const testUnit = JSON.parse(packageJson).scripts?.["test:unit"] || "";

const verifyStart = workflow.indexOf("  verify:");
const deployStart = workflow.indexOf("  deploy:");
assert(verifyStart >= 0 && deployStart > verifyStart, "the Worker workflow has a credential-free verification job before deployment");
const verifyJob = workflow.slice(verifyStart, deployStart);
const deployJob = workflow.slice(deployStart);

assert.match(workflow, /^name:\s+Deploy Notification Worker\s*$/m, "the Worker workflow has an unambiguous manual Actions label");
assert.match(workflow, /^on:\s*\n\s+workflow_dispatch:\s*$/m, "the Worker deploy is manually dispatched");
assert.doesNotMatch(workflow, /^\s+(?:push|pull_request|schedule|workflow_call):/m, "the Worker deploy has no automatic trigger");
assert.match(workflow, /^permissions:\s*\n\s+contents:\s+read\s*$/m, "the Worker workflow has read-only repository permissions");
assert.match(workflow, /concurrency:\s*\n\s+group:\s+bcoffense-notification-worker-deploy\s*\n\s+cancel-in-progress:\s+false/, "Worker deployments are serialized without cancelling a live deployment");
assert.match(deployJob, /needs:\s+verify/, "the protected Worker deployment waits for credential-free verification");
assert.match(deployJob, /environment:\s*\n\s+name:\s+production/, "the Worker deployment is protected by the production Environment");
assert.doesNotMatch(verifyJob, /environment:|CLOUDFLARE_(?:ACCOUNT_ID|API_TOKEN|NOTIFICATION_WORKER_API_TOKEN)/, "the verification job cannot receive Cloudflare credentials");
assert.match(workflow, /uses:\s+actions\/checkout@[a-f0-9]{40}\s+#\s+v\d+\.\d+\.\d+[\s\S]*?fetch-depth:\s+0/, "checkout is pinned to an immutable revision and preserves history");
assert.match(workflow, /uses:\s+actions\/setup-node@[a-f0-9]{40}\s+#\s+v\d+\.\d+\.\d+[\s\S]*?node-version:\s+22/, "Node setup is pinned to an immutable revision");
assert.doesNotMatch(workflow, /uses:\s+actions\/(?:checkout|setup-node)@v/, "the Worker workflow avoids mutable action tags");
assert.match(verifyJob, /npm --prefix tests ci/, "the credential-free verification job installs locked test dependencies");
assert.match(verifyJob, /\.\/scripts\/release-quality-gate\.sh/, "the credential-free verification job runs the canonical quality gate");
assert.match(deployJob, /CLOUDFLARE_NOTIFICATION_WORKER_API_TOKEN:\s*\$\{\{\s*secrets\.CLOUDFLARE_NOTIFICATION_WORKER_API_TOKEN\s*\}\}/, "the Worker uses its own protected deployment token");
assert.doesNotMatch(workflow, /secrets\.CLOUDFLARE_API_TOKEN/, "the Worker workflow never reuses the Pages deployment token");
assert.doesNotMatch(workflow, /(?:echo|printf)\b[^\n]*(?:\$\{CLOUDFLARE_NOTIFICATION_WORKER_API_TOKEN|\$CLOUDFLARE_NOTIFICATION_WORKER_API_TOKEN|\$\{\{\s*secrets\.CLOUDFLARE_NOTIFICATION_WORKER_API_TOKEN)/, "the Worker token is never written to logs");
assert.match(deployJob, /run:\s+\.\/scripts\/deploy-notification-worker\.sh/, "the workflow delegates to the guarded Worker deployment script");

assert.match(deployScript, /unset CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_API_TOKEN CLOUDFLARE_NOTIFICATION_WORKER_API_TOKEN/, "the guarded script strips Cloudflare credentials before quality checks");
assert.match(deployScript, /export -n cloudflare_account_id notification_worker_api_token/, "captured credentials are explicitly shell-local before quality checks");
assert.match(deployScript, /git fetch --quiet origin main/, "the guarded script refreshes origin\/main before deployment");
assert.match(deployScript, /git status --porcelain/, "the guarded script rejects a dirty worktree");
assert.match(deployScript, /head_commit="\$\(git rev-parse HEAD\)"[\s\S]*?main_commit="\$\(git rev-parse origin\/main\)"[\s\S]*?\[\[ "\$head_commit" != "\$main_commit" \]\]/, "the guarded script requires HEAD to equal the exact origin\/main tip");
assert.match(deployScript, /\.\/scripts\/release-quality-gate\.sh/, "the guarded script executes the canonical quality suite");
const qualityGateIndex = deployScript.indexOf("./scripts/release-quality-gate.sh");
const credentialsUnsetIndex = deployScript.indexOf("unset CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_API_TOKEN CLOUDFLARE_NOTIFICATION_WORKER_API_TOKEN");
const credentialsRestoreIndex = deployScript.indexOf("export CLOUDFLARE_API_TOKEN=\"$notification_worker_api_token\"");
const preflightIndex = deployScript.indexOf("./scripts/cloudflare-preflight.sh");
const secretsListIndex = deployScript.indexOf("secret list --config");
const workerDeployIndex = deployScript.indexOf("deploy --config");
assert(credentialsUnsetIndex >= 0 && credentialsUnsetIndex < qualityGateIndex, "credentials are removed before release-quality child processes run");
assert(credentialsRestoreIndex > qualityGateIndex && credentialsRestoreIndex < preflightIndex, "only the dedicated token is restored after quality and before read-only preflight");
assert.match(deployScript, /\.\/scripts\/cloudflare-preflight\.sh/, "the Worker script runs the read-only D1 preflight");
assert(preflightIndex < secretsListIndex && secretsListIndex < workerDeployIndex, "the script checks D1 before required Worker secret names and deploys only afterward");
assert.match(deployScript, /WRANGLER=\(npx --yes wrangler@4\.112\.0\)/, "Worker secret verification and deployment use a pinned Wrangler release");
assert.match(deployScript, /required_worker_secrets=\(VAPID_PRIVATE_KEY VAPID_PUBLIC_KEY VAPID_SUBJECT\)/, "the exact Worker VAPID secret names are verified");
assert.match(deployScript, /secret list --config "\$WORKER_CONFIG" --format json/, "the script reads metadata-only Worker secret names from its dedicated config");
assert.match(deployScript, /"\$\{WRANGLER\[@\]\}" deploy --config "\$WORKER_CONFIG"/, "the script deploys only through the dedicated Worker configuration");
assert.doesNotMatch(deployScript, /d1 migrations apply|queues create|wrangler secret put/, "the guarded Worker deployment cannot mutate migrations, queues, or secret values");

assert.match(testUnit, /node tests\/notification-worker-deploy-contract\.test\.mjs/, "the guarded Worker deployment contract is part of test:unit");
const migrationIndex = authRunbook.indexOf("1. **Apply migration 0030**");
const queuesIndex = authRunbook.indexOf("2. **Create the production queue and DLQ**");
const workerIndex = authRunbook.indexOf("3. **Bootstrap the Worker and preserve its VAPID secrets**");
const pagesIndex = authRunbook.indexOf("4. **Deploy Pages last**");
assert(migrationIndex >= 0 && queuesIndex > migrationIndex && workerIndex > queuesIndex && pagesIndex > workerIndex, "the runbook fixes the rollout order: migration, queues/DLQ, Worker/secrets, then Pages");
assert.match(authRunbook, /Never generate, rotate, or overwrite the VAPID key pair during this rollout/i, "the runbook explicitly prevents an accidental VAPID rotation");
assert.match(authRunbook, /CLOUDFLARE_NOTIFICATION_WORKER_API_TOKEN/, "the runbook names the separate Worker deployment credential");

console.log("notification Worker deployment contract: 37 assertions passed");
