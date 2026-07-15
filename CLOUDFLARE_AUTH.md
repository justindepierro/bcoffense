# Cloudflare Auth Setup

BCOffense uses Cloudflare Pages Functions for real username/password login without email accounts.

## What Cloudflare Hosts

- Static app files are still served as a normal site.
- `functions/_middleware.js` protects every route before static files load.
- `functions/auth/login.js` verifies username/password on Cloudflare.
- `functions/auth/me.js` returns the current session role to the app.
- `functions/auth/logout.js` clears the session cookie.
- `functions/sync/backup.js` stores and retrieves the shared app backup.
- Cloud Sync uses the `SYNC_KV` Workers KV namespace, so browsers do not store a GitHub token.

## Free Tier

This setup should fit Cloudflare's free tier for normal team use. It uses Pages Functions, which are billed as Workers. Cloudflare currently includes limited Workers/Pages Functions usage on the free plan.

Cloud Sync currently uses Workers KV. KV is available on the Workers free plan with limited daily usage, and each stored backup value can be up to 25 MiB. If play-image backups grow beyond that, switch the sync binding from KV to R2 after R2 is enabled on the Cloudflare account.

## Required Cloudflare Secrets

Set these in the Cloudflare Pages project:

```text
AUTH_SESSION_SECRET
AUTH_ADMIN_PASSWORD_SHA256
AUTH_COACH_PASSWORD_SHA256
AUTH_PLAYER_PASSWORD_SHA256
```

`AUTH_SESSION_SECRET` should be a long random value:

```bash
openssl rand -hex 32
```

Player accounts are stored in D1 with PBKDF2 hashes. Before inviting the team,
rotate the three static staff secrets to PBKDF2 as well. The secret names stay
the same for compatibility, although the old `_SHA256` suffix is now legacy.
Each value should be a PBKDF2 hash of:

```text
username:password
```

Generate each PBKDF2 value locally (enter the password only in your terminal):

```bash
read -s password
node --input-type=module -e 'import { hashPassword } from "./functions/_lib/d1-auth.js"; console.log(await hashPassword(`${process.argv[1]}:${process.argv[2]}`));' admin "$password"
unset password
```

Run that command once per staff username (`admin`, `coach`, and any legacy
`player` account), then save the printed value in the matching
`AUTH_*_PASSWORD_SHA256` Cloudflare secret. The login code accepts the previous
SHA-256 value temporarily so the rotation can be completed without a lockout;
do not leave it that way for the season.

Session cookies use the `__Host-bc_auth` browser-enforced host-only prefix.
The first deployment after this change signs existing browser sessions out once;
that is expected.

## Cloudflare Pages Settings

When creating the Pages project:

- Framework preset: `None`
- Build command: leave blank
- Build output directory: `/`
- Production branch: `main`

The committed `_routes.json` makes Pages Functions run on every route so static assets stay protected.

## Deploying

Use the safe deploy script:

```bash
./scripts/deploy-cloudflare.sh
```

Do not deploy the repo root with `wrangler pages deploy .`. The repo root includes local-only files that should never be uploaded as public static assets.

## Season Operations Runbook

### Publish a player-ready practice

1. Save the coach workspace and open **Publish Status**.
2. Resolve every player-visible diagram or clip marked missing, stale, or
   unpublished; use **Publish Media** for the normal media path.
3. Publish the team workspace and wait for the status dock to say **Ready for
   players**.
4. Open a player account on a phone and confirm the practice, diagrams, clips,
   and quiz source are visible before announcing the assignment.

### Help a player who cannot get in

1. Confirm the player accepted their invitation and is using the invited email.
2. Use the password-reset flow; do not share a staff account or staff password.
3. Have the player use **Refresh team app** after login if a recently published
   practice has not appeared.
4. If the issue persists, check Cloudflare Pages deployment status and the D1,
   KV, and media bindings before changing player data.

### Recover safely

Use the admin-only Recovery Tools for exports/imports or a cloud recovery. They
are not the normal daily publish workflow. Make a complete backup before
replacing a local workspace, then verify the resulting playbook and active
practice before republishing.

## Cloud Sync Storage

The app expects a KV binding named:

```text
SYNC_KV
```

This repo includes `wrangler.toml` with the production namespace binding. To recreate it on another Cloudflare account:

```bash
npx wrangler kv namespace create bcoffense_sync
```

Then place the returned namespace id in `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "SYNC_KV"
id = "YOUR_NAMESPACE_ID"
```

Admins can push the complete backup. Coaches and players can pull the latest backup but cannot push.

## Local Function Testing

Create a local `.dev.vars` file from `.dev.vars.example` and fill in real secret values. Do not commit `.dev.vars`.

Then run:

```bash
npx wrangler pages dev . --kv=SYNC_KV
```
