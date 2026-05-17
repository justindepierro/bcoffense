# Cloudflare Auth Setup

BCOffense uses Cloudflare Pages Functions for real username/password login without email accounts.

## What Cloudflare Hosts

- Static app files are still served as a normal site.
- `functions/_middleware.js` protects every route before static files load.
- `functions/auth/login.js` verifies username/password on Cloudflare.
- `functions/auth/me.js` returns the current session role to the app.
- `functions/auth/logout.js` clears the session cookie.

## Free Tier

This setup should fit Cloudflare's free tier for normal team use. It uses Pages Functions, which are billed as Workers. Cloudflare currently includes limited Workers/Pages Functions usage on the free plan.

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

Each password hash is the SHA-256 hash of:

```text
username:password
```

Generate each hash locally:

```bash
printf 'admin:YOUR_ADMIN_PASSWORD' | shasum -a 256 | awk '{print $1}'
printf 'coach:YOUR_COACH_PASSWORD' | shasum -a 256 | awk '{print $1}'
printf 'player:YOUR_PLAYER_PASSWORD' | shasum -a 256 | awk '{print $1}'
```

## Cloudflare Pages Settings

When creating the Pages project:

- Framework preset: `None`
- Build command: leave blank
- Build output directory: `/`
- Production branch: `main`

The committed `_routes.json` makes Pages Functions run on every route so static assets stay protected.

## Local Function Testing

Create a local `.dev.vars` file from `.dev.vars.example` and fill in real secret values. Do not commit `.dev.vars`.

Then run:

```bash
npx wrangler pages dev . --compatibility-date=2026-05-17
```
