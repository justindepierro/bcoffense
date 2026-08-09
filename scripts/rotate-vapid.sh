#!/usr/bin/env bash
# Rotate the BCOffense Web Push VAPID keypair.
#
# Generates a fresh P-256 keypair in the EXACT format functions/_lib/web-push.js
# expects:
#   VAPID_PRIVATE_KEY = base64url(PKCS8 DER of the P-256 private key)
#   VAPID_PUBLIC_KEY  = base64url(raw 65-byte uncompressed P-256 public point)
# and installs it as secrets on BOTH surfaces so they stay consistent:
#   - the delivery Worker  (wrangler.notifications.toml)
#   - the Pages project    (bcoffense)
#
# The private key is piped straight into wrangler and is NEVER printed. Run this
# in YOUR OWN terminal so the key never appears in any AI/agent transcript.
#
# When it is safe to rotate: only when there are effectively no real player push
# subscriptions yet (rotating invalidates existing subscriptions; those devices
# simply re-enable notifications on their next visit). Check first:
#   npx --yes wrangler@4.112.0 d1 execute bcoffense-db --remote \
#     --command "SELECT COUNT(*) FROM push_subscriptions;"
#
# After it finishes, redeploy so the new keys go live:
#   ./scripts/deploy-notification-worker.sh          # Worker
#   gh workflow run deploy-production.yml --ref main # Pages (last)
set -euo pipefail
cd "$(dirname "$0")/.."

WRANGLER=(npx --yes wrangler@4.112.0)
WORKER_CONFIG="wrangler.notifications.toml"
PAGES_PROJECT="bcoffense"
SUBJECT="mailto:noreply@bcoffense.com"

if [[ ! -f "$WORKER_CONFIG" ]]; then
  printf 'Missing %s — run from the repo root.\n' "$WORKER_CONFIG" >&2
  exit 1
fi

printf 'Generating a fresh P-256 VAPID keypair…\n'
# Node prints exactly two lines: "PRIV <b64url pkcs8>" then "PUB <b64url raw>".
keys="$(node -e '
(async () => {
  const kp = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", kp.privateKey));
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
  const b64u = (b) => Buffer.from(b).toString("base64url");
  process.stdout.write("PRIV " + b64u(pkcs8) + "\nPUB " + b64u(raw) + "\n");
})().catch((e) => { console.error(e); process.exit(1); });
')"

priv="$(printf '%s\n' "$keys" | awk '/^PRIV /{print $2}')"
pub="$(printf '%s\n' "$keys" | awk '/^PUB /{print $2}')"
if [[ -z "$priv" || -z "$pub" ]]; then
  printf 'Key generation failed.\n' >&2
  exit 1
fi

printf 'New public key (safe to share):\n  %s\n\n' "$pub"

printf 'Setting delivery Worker secrets (%s)…\n' "$WORKER_CONFIG"
printf '%s' "$priv"    | "${WRANGLER[@]}" secret put VAPID_PRIVATE_KEY --config "$WORKER_CONFIG"
printf '%s' "$pub"     | "${WRANGLER[@]}" secret put VAPID_PUBLIC_KEY  --config "$WORKER_CONFIG"
printf '%s' "$SUBJECT" | "${WRANGLER[@]}" secret put VAPID_SUBJECT     --config "$WORKER_CONFIG"

printf 'Updating Pages project secrets (%s)…\n' "$PAGES_PROJECT"
printf '%s' "$priv" | "${WRANGLER[@]}" pages secret put VAPID_PRIVATE_KEY --project-name "$PAGES_PROJECT"
printf '%s' "$pub"  | "${WRANGLER[@]}" pages secret put VAPID_PUBLIC_KEY  --project-name "$PAGES_PROJECT"

printf '\nDone. Worker + Pages now share the new VAPID keypair.\n'
printf 'Next: ./scripts/deploy-notification-worker.sh, then deploy Pages.\n'
