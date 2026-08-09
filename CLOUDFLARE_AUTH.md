# Cloudflare Authentication, Media, and Deployment Runbook

## Current release status

This repository contains a Cloudflare canonical release. On July 19, 2026,
production D1 was exported locally, migrations 0011–0017 were applied, and
the remote ledger passed preflight. Pages source commit `a1075e2` was then
deployed, and an authenticated admin published the first canonical workspace
and player-release heads.

The new player-release, team-scoped media, and backup protections are live.
Clean admin, coach, and player-session validation plus legacy-media
reconciliation are still required before treating every historical asset as
canonical.

## What Cloudflare hosts after the containment release

- Static PWA assets and Cloudflare Pages Functions.
- Session login, logout, and current-session endpoints.
- D1 player accounts, team context, session invalidation state, and
  team-scoped diagram manifest pointers.
- R2 immutable diagram/video objects.
- GET /player/release, a small player-only release projection. It is not a
  coach workspace backup.
- Admin-only raw workspace recovery endpoints and admin-only legacy diagram
  migration/repair tooling.
- Team/release-authorized image and clip endpoints.

SYNC_KV remains a recovery/compatibility store for retained workspace snapshots
and clip manifests. Daily workspace and player-release authority is already the
immutable R2 plus D1 revision head; clips remain the outstanding KV transition.

## Required Cloudflare secrets

Set these in the Cloudflare Pages project:

~~~text
AUTH_SESSION_SECRET
AUTH_ADMIN_PASSWORD_SHA256
AUTH_COACH_PASSWORD_SHA256
AUTH_PLAYER_PASSWORD_SHA256
~~~

Generate a long random session secret:

~~~bash
openssl rand -hex 32
~~~

### Authenticator MFA

Authenticator MFA is intentionally deferred and is not part of the named-account
transition. Revisit it only through a separately reviewed rollout.

Player accounts are stored in D1 with PBKDF2 hashes. Rotate the static staff
secrets to PBKDF2 as well; their historic SHA256 names remain only for
configuration compatibility. Each value hashes:

~~~text
username:password
~~~

Generate a value locally. Enter the password only in the terminal:

~~~bash
read -s password
node --input-type=module -e 'import { hashPassword } from "./functions/_lib/d1-auth.js"; const username = process.argv[1]; const password = process.argv[2]; console.log(await hashPassword(username + ":" + password));' admin "$password"
unset password
~~~

Run that once for each static staff username, then save the output in the
matching Cloudflare secret. Do not leave legacy SHA-256 credentials in service
once the season rotation is complete.

Session cookies use the host-only __Host-bc_auth prefix. An auth/session rollout
can sign out existing browsers once; that is expected.

### Personal account password changes

Named D1-backed Admin, Coach, and Player accounts can use the header menu's
**Account security** dialog to change their own password. It requires the
current password and keeps the browser that completed the change signed in;
other named-account sessions are revoked. Shared legacy credentials intentionally
do not receive this self-service path.

Migration `0027_account_session_epochs.sql` adds the exact per-account session
epoch used for that revocation. Apply it before deploying the corresponding
Pages Functions; the guarded deploy script will stop if the D1 ledger has not
been reconciled first.

## Controlled named-staff transition

The shared environment-backed `admin` and `coach` sign-ins are temporary
break-glass accounts. Establish and test a personal D1-backed administrator
account before retiring those shared staff credentials.

This is a future operator runbook, not authorization to deploy or migrate
production as part of the current task. Do not apply a D1 migration or deploy
production code until the named-account release has been independently reviewed
and passed the release-quality gate.

After that approved release is live, make the transition in this order:

1. Sign in using the existing shared **Admin** account and open **Team
   Settings → Admin security**.
2. Choose **Send my admin invitation**, entering your own email address and
   display name. This creates the one initial named D1 administrator and does
   not change the shared Admin sign-in.
3. Open the invitation yourself in a private window or separate browser
   profile, set a personal password, and sign in as that named administrator.
   Treat the invitation URL as a password-reset link: do not forward it. If
   email delivery is unavailable, copy the private link shown only in the
   still-authenticated legacy Admin session and use it yourself.
4. Verify the named account can open Team Settings, use admin and recovery
   controls, and invite a named coach through the normal staff invitation
   workflow. Keep the recovery details in the team password manager.
5. Only after that separate-login test succeeds, retire shared staff access by
   adding this **production** Pages environment variable in **Workers & Pages
   → _project_ → Settings → Variables and Secrets**:

   ~~~text
   AUTH_LEGACY_STATIC_STAFF_ENABLED=false
   ~~~

   Its value must be the literal `false` (case-insensitive). Leaving it unset
   or using another value keeps the legacy staff fallback enabled.

When the value is `false`, the static `admin` and `coach` passwords are no
longer accepted, and existing static Admin/Coach sessions stop being accepted
at their next protected request. Named D1 administrators and coaches remain
valid. The static `player` sign-in is deliberately untouched by this switch.
The setting does not delete the old password secrets or any D1 accounts; retain
the rollback procedure and only remove obsolete secrets after a separate,
verified recovery decision.

## Pages settings

- Framework preset: None
- Build command: leave blank
- Build output directory: /
- Production branch: main

The committed _routes.json routes every request through Pages Functions so
static app assets remain behind the app session boundary.

## Migration-first deployment

Use only the safe deploy script:

~~~bash
./scripts/deploy-cloudflare.sh
~~~

It invokes a read-only D1 migration preflight before staging files. The script
never applies migrations itself. It refuses a deployment when the remote ledger
is behind, ahead of, or otherwise different from the local migration files.

For this canonical release, the approved operator workflow was completed
through the first canonical head; the final clean-session test remains:

1. [x] Back up and inspect production D1.
2. Confirm the current one-team assumption and the intended assignment for all
   currently unassigned users. Migration 0011 only backfills users when
   exactly one team exists.
3. [x] Review migrations 0011–0017 and apply them intentionally:

   ~~~bash
   wrangler d1 migrations apply bcoffense-db --remote
   ~~~

4. [x] Verify the remote ledger and new tables/indexes. In particular, confirm
   app_settings.primary_team_id, user team_id values,
   team_media_manifests, account_session_state, discussion integrity tables,
   workspace revision tables/current head, and the team-scoped play_likes
   uniqueness rule. Confirm the 0017 quarantine removed only unsafe D1
   pointers and did not delete R2 objects.
5. [x] Run ./scripts/deploy-cloudflare.sh again. It must pass preflight before any
   Pages deployment begins.
6. [x] Sign in as an admin and bootstrap the first canonical workspace/release head
   from retained recovery data. GET /player/release is intentionally read-only
   and will not publish a release during a player request.
7. [ ] Test a clean player session and a second coach session before announcing a
   practice or changing archived media.

Do not deploy the repo root directly with the generic Pages command below. The
repository can contain local-only files that must never be uploaded as static
assets.

~~~bash
wrangler pages deploy .
~~~

## Daily media workflow after the containment release

### Diagrams

1. A coach attaches or replaces a diagram.
2. The app saves the local copy and starts the Cloudflare upload automatically.
3. The status dock reports the meaningful state: saving, saving when online,
   saved, conflict, or an actionable failure.
4. The server stores an immutable team/versioned R2 object and conditionally
   advances the team D1 manifest pointer.
5. A released player resolves the same stable media ID from the cloud. There
   is no normal Publish Media action.

If a second coach changed the diagram first, the stale upload receives a
conflict rather than silently replacing the newer diagram. The newer and older
immutable bytes are retained for recovery until an explicit lifecycle policy
exists.

### Player releases and practices

Players use Refresh team app to fetch their scoped release. They must never use
a raw cloud-backup restore. The release includes only approved player scripts,
player-safe play fields, signals, settings, and media IDs.

During this transition, the retained workspace backup is still an admin-only
recovery object and player releases are stored in namespaced KV. The final
automatic workspace-revision system is not complete yet. If an initial or
recovery player release is missing, an admin rebuilds it; a player request does
not implicitly publish one.

### Clips and videos

Clip access is team/release-gated in the containment checkout, but clip
metadata remains a KV transition and the legacy primary-team fallback still
needs retirement. Treat the automatic, durable diagram workflow as the proven
path; do not claim the same offline/retry guarantee for every video clip until
the unified outbox and D1 clip-manifest phase is complete.

## Recovery and support

### A player cannot see a newly released practice or diagram

1. Confirm the player is assigned to the intended team and can load a current
   player release.
2. Confirm the release contains the practice/media ID and the team D1 manifest
   has a current diagram pointer.
3. Check the workspace status dock for a pending upload, conflict, or auth
   error; do not ask the player to restore a coach backup.
4. Use the admin-only recovery/rebuild path only when a release is missing or
   legacy data is being migrated.
5. Test again in a clean player session. If a cached role switch is suspected,
   sign out, close the app, and sign back in after the new service worker has
   activated.

### Archived legacy diagrams

Legacy objects are retained as recovery evidence. An admin may audit, migrate,
or repair one only with the stable media ID and verified current and archived
checksums. Never select an old object based only on a play name, script
position, tag, or broad inventory match.

### Workspace recovery

Raw cloud backup access is admin-only. It is for recovery, not daily player
sync. Before an intentional restore, export local state, validate the source,
and verify the playbook and active practice afterward. The final staged/atomic
restore and rollback system remains roadmap work.

## Storage bindings

The app expects a KV binding named:

~~~text
SYNC_KV
~~~

The repo wrangler.toml holds the production binding. To recreate it on a
different account:

~~~bash
npx wrangler kv namespace create bcoffense_sync
~~~

Place the returned namespace ID in wrangler.toml:

~~~toml
[[kv_namespaces]]
binding = "SYNC_KV"
id = "YOUR_NAMESPACE_ID"
~~~

This document deliberately does not promise current Cloudflare free-tier quotas
or rate limits. Check current Cloudflare documentation before sizing storage,
uploads, or migration work.

## Local Pages Function testing

Create a local .dev.vars from .dev.vars.example and fill in real test secrets.
Do not commit it.

~~~bash
npx wrangler pages dev . --kv=SYNC_KV
~~~

Use a local D1/R2-compatible test setup for routes that depend on team context
or media manifests. A local test is not proof that production migrations or
production player authorization are complete.
