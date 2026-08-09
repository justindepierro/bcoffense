import { verifyD1Credentials, verifyPassword } from "./d1-auth.js";
import { getPrimaryTeamId } from "./team-context.js";
import { parseCoachPermissions } from "./staff-access.js";

// The __Host- prefix is enforced by browsers: Secure, Path=/, and no Domain
// attribute are mandatory. That prevents a subdomain from setting a competing
// session cookie for this app.
const SESSION_COOKIE = "__Host-bc_auth";
const SESSION_TTL_SECONDS = 12 * 60 * 60;       // staff: 12h
const PLAYER_SESSION_TTL_SECONDS = 72 * 60 * 60;  // players: 72h

const USERS = {
  admin: {
    role: "admin",
    label: "Admin",
    hashEnv: "AUTH_ADMIN_PASSWORD_SHA256",
  },
  coach: {
    role: "coach",
    label: "Coach",
    hashEnv: "AUTH_COACH_PASSWORD_SHA256",
  },
  player: {
    role: "player",
    label: "Player",
    hashEnv: "AUTH_PLAYER_PASSWORD_SHA256",
  },
};

// Named D1 staff accounts are the long-term identity model. The legacy
// environment-variable admin/coach accounts remain available during the
// transition unless this explicit runtime switch is set to "false". Keep the
// default permissive so an existing deployment is never changed merely by
// shipping this code. The static player account intentionally does not use
// this switch and remains available for its separate transition path.
export function isLegacyStaticStaffEnabled(env) {
  return String(env?.AUTH_LEGACY_STATIC_STAFF_ENABLED ?? "true").trim().toLowerCase() !== "false";
}

function isLegacyStaticStaffUser(user) {
  return user?.role === "admin" || user?.role === "coach";
}

function isEnabledStaticUser(username, env) {
  const user = USERS[username];
  if (!user) return false;
  return !isLegacyStaticStaffUser(user) || isLegacyStaticStaffEnabled(env);
}

// Content-Security-Policy backstop for the innerHTML-heavy app.
// - script-src keeps 'unsafe-inline' because index.html ships a pre-paint theme
//   bootstrap inline <script> and there is no build step to inject nonces.
//   'unsafe-eval' is intentionally OMITTED: the client integrity check uses
//   the explicit window export contract and never evaluates source strings.
// - style-src allows 'unsafe-inline' for inline style="" attrs + Google Fonts CSS.
// - img/media allow data: and blob: for the favicon + IndexedDB object URLs.
// - Cloudflare Web Analytics injects its integrity-protected beacon from its
//   own static host. Allow only that exact host; automatic beacon delivery
//   posts back through our existing same-origin connect-src.
// - object-src 'none', base-uri 'self', frame-ancestors 'none' close the common
//   injection bypasses. All app traffic is same-origin (connect-src 'self').
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self'",
].join("; ");

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Robots-Tag": "noindex, nofollow",
  "Content-Security-Policy": CONTENT_SECURITY_POLICY,
};

function textEncoder() {
  return new TextEncoder();
}

function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function bytesToBase64Url(bytes) {
  let binary = "";
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < view.length; i += 1) {
    binary += String.fromCharCode(view[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const padded = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (padded.length % 4)) % 4;
  const binary = atob(padded + "=".repeat(padLength));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function base64UrlEncodeJson(value) {
  return bytesToBase64Url(textEncoder().encode(JSON.stringify(value)));
}

function base64UrlDecodeJson(value) {
  const bytes = base64UrlToBytes(value);
  return JSON.parse(new TextDecoder().decode(bytes));
}

function timingSafeEqual(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  if (!left || !right) return false;
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    diff |= left.charCodeAt(i % left.length) ^ right.charCodeAt(i % right.length);
  }
  return diff === 0;
}

function getRequiredEnv(env, key) {
  const value = env && env[key];
  if (!value) throw new Error(`Missing Cloudflare secret: ${key}`);
  return String(value);
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder().encode(value));
  return bytesToHex(digest);
}

async function verifyStaticPasswordHash(username, password, storedHash) {
  const expected = String(storedHash || "").trim();
  if (!expected) return false;

  // Keep existing installations working while allowing the current
  // AUTH_*_PASSWORD_SHA256 secrets to be rotated to PBKDF2 values before
  // rollout. The value being hashed remains username:password in either case.
  if (expected.startsWith("pbkdf2:")) {
    return verifyPassword(`${username}:${String(password || "")}`, expected);
  }

  const actualHash = await sha256Hex(`${username}:${String(password || "")}`);
  return timingSafeEqual(actualHash, expected.toLowerCase());
}

async function getSigningKey(env) {
  const secret = getRequiredEnv(env, "AUTH_SESSION_SECRET");
  return crypto.subtle.importKey(
    "raw",
    textEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function signPayload(payload, env) {
  const key = await getSigningKey(env);
  const signature = await crypto.subtle.sign("HMAC", key, textEncoder().encode(payload));
  return bytesToBase64Url(signature);
}

function readCookie(request, name) {
  const cookieHeader = request.headers.get("Cookie") || "";
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1) || "";
}

function wantsJson(request) {
  return (
    request.headers.get("X-BC-Auth-Mode") === "json" ||
    (request.headers.get("Accept") || "").includes("application/json")
  );
}

// Cloudflare Pages redirects `/offline` to `/offline.html`; both names must
// remain public or the redirect turns an offline recovery route into a 401.
const PUBLIC_PATHS = new Set(["/manifest.json", "/sw.js", "/offline", "/offline.html"]);

export function isAuthRoute(pathname) {
  if (pathname === "/auth/login" || pathname === "/auth/logout" || pathname === "/auth/me") return true;
  // Public player auth routes — token-protected, no session required
  if (
    pathname === "/auth/accept-invite" ||
    pathname === "/auth/reset-password" ||
    pathname === "/auth/reset-confirm"
  ) return true;
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/icons/")) return true;
  return false;
}

export function authJson(data, init = {}) {
  return withSecurityHeaders(
    new Response(JSON.stringify(data), {
      ...init,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        ...(init.headers || {}),
      },
    }),
  );
}

export function withSecurityHeaders(response, extraHeaders = {}) {
  const next = new Response(response.body, response);
  Object.entries({ ...SECURITY_HEADERS, ...extraHeaders }).forEach(([key, value]) => {
    if (!next.headers.has(key)) next.headers.set(key, value);
  });
  return next;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

export async function verifyCredentials(username, password, env) {
  const cleanUsername = String(username || "").trim().toLowerCase();

  // 1. Hardcoded staff accounts (admin / coach) — env-var hash, no D1 needed
  const user = USERS[cleanUsername];
  if (user) {
    // The retirement switch applies only to legacy staff. Do this before
    // reading the password secret so deployments can remove those secrets
    // after retirement without breaking named D1 administrators or players.
    if (!isEnabledStaticUser(cleanUsername, env)) return null;
    const expectedHash = getRequiredEnv(env, user.hashEnv);
    if (!(await verifyStaticPasswordHash(cleanUsername, password, expectedHash))) return null;
    return { username: cleanUsername, role: user.role, label: user.label };
  }

  // 2. D1 player accounts — fall through when username not in USERS map
  if (!env.DB) return null;
  try {
    return verifyD1Credentials(cleanUsername, password, env.DB);
  } catch (_) {
    return null;
  }
}

export async function createSessionCookie(user, env) {
  const now = Math.floor(Date.now() / 1000);
  // All D1 users carry an immutable account pointer. Only actual players get
  // the longer player session; managed coaches remain staff-session length.
  const isD1User = !!user.d1;
  const isPlayer = isD1User && user.role === "player";
  const ttl = isPlayer ? PLAYER_SESSION_TTL_SECONDS : SESSION_TTL_SECONDS;
  // The opaque epoch is changed whenever an account's sessions are revoked.
  // Empty is the backwards-compatible epoch for D1 cookies and users created
  // before the epoch table existed; a first invalidation replaces it with a
  // random value, immediately rejecting every older signed cookie.
  const extra = isD1User
    ? {
      d1: true,
      d1_user_id: user.d1_user_id,
      se: String(user.session_epoch || ""),
    }
    : {};
  const payload = base64UrlEncodeJson({
    username: user.username,
    role: user.role,
    label: user.label,
    iat: now,
    exp: now + ttl,
    ...extra,
  });
  const signature = await signPayload(payload, env);
  return `${SESSION_COOKIE}=${payload}.${signature}; Path=/; Max-Age=${ttl}; HttpOnly; Secure; SameSite=Lax`;
}

export async function getSessionFromRequest(request, env) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token || !token.includes(".")) return null;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  try {
    // Verify the HMAC directly instead of re-signing and string-comparing.
    // crypto.subtle.verify is constant-time by construction (M1 hardening).
    const key = await getSigningKey(env);
    const signatureBytes = base64UrlToBytes(signature);
    const validSignature = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes,
      textEncoder().encode(payload),
    );
    if (!validSignature) return null;

    const session = base64UrlDecodeJson(payload);
    if (!session) return null;
    if (!session.exp || session.exp < Math.floor(Date.now() / 1000)) return null;

    // D1 player sessions have d1: true and d1_user_id
    const isD1Session = session.d1 === true && !!session.d1_user_id;
    // Static staff sessions must match the USERS map and are invalidated
    // immediately when the controlled legacy-staff retirement switch is off.
    // Static player sessions deliberately remain valid through that change.
    const isStaticSession = !isD1Session
      && USERS[session.username]
      && USERS[session.username].role === session.role
      && isEnabledStaticUser(session.username, env);
    if (!isD1Session && !isStaticSession) return null;

    let teamId = "";
    let managedCoach = false;
    let permissions = [];
    // D1 sessions are checked against the current principal, not merely the
    // signed cookie. A disable, role change, or team reassignment therefore
    // takes effect at every protected endpoint. Fail closed if D1 is down.
    if (isD1Session) {
      if (!env?.DB || !session.iat) return null;
      try {
        const row = await env.DB
          .prepare(`SELECT users.role, users.status, users.team_id,
              staff_access.permissions_json,
              COALESCE(account_session_state.invalid_before, 0) AS sessions_invalid_before,
              COALESCE(account_session_epochs.session_epoch, '') AS session_epoch
            FROM users
            LEFT JOIN account_session_state ON account_session_state.user_id = users.id
            LEFT JOIN account_session_epochs ON account_session_epochs.user_id = users.id
            LEFT JOIN staff_access ON staff_access.user_id = users.id AND staff_access.team_id = users.team_id
            WHERE users.id = ?
            LIMIT 1`)
          .bind(session.d1_user_id)
          .first();
        if (!row || row.status !== "active" || row.role !== session.role) return null;
        teamId = String(row.team_id || "").trim();
        if (!teamId) return null;
        managedCoach = row.role === "coach";
        permissions = managedCoach ? parseCoachPermissions(row.permissions_json) : [];
        if (row.sessions_invalid_before && session.iat < row.sessions_invalid_before) {
          return null; // session was invalidated by logout-all
        }
        // A timestamp-only boundary cannot distinguish two sessions issued in
        // the same second. The signed epoch is therefore the authority after
        // a revocation, while `invalid_before` remains for legacy cookies and
        // historic revocations created before the epoch rollout.
        if (String(session.se || "") !== String(row.session_epoch || "")) {
          return null;
        }
      } catch (_) {
        return null;
      }
    } else {
      // Static accounts are transitional, but they still receive an explicit
      // team pointer instead of inheriting an arbitrary D1 row.
      teamId = await getPrimaryTeamId(env);
    }

    return {
      username: session.username,
      role: session.role,
      label: session.label || (isStaticSession ? USERS[session.username].label : ""),
      d1UserId: session.d1_user_id || null,
      teamId,
      managedCoach,
      permissions,
      loginAt: session.iat ? new Date(session.iat * 1000).toISOString() : "",
      expiresAt: new Date(session.exp * 1000).toISOString(),
    };
  } catch (_err) {
    return null;
  }
}

function safeLoginNext(value) {
  const target = String(value || "/");
  if (!target.startsWith("/") || target.startsWith("//")) return "/";
  return target;
}

export function renderLoginPage(opts = {}) {
  const message = opts.message || "";
  const nextPath = safeLoginNext(opts.next);
  const escapedMessage = escapeHtml(message);
  const encodedNext = encodeURIComponent(nextPath);

  return withSecurityHeaders(
    new Response(
      `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>BCOffense Login</title>
  <style>
    :root {
      color-scheme: light;
      --navy: #0a122a;
      --navy-2: #132452;
      --gold: #c7a44c;
      --ink: #101828;
      --muted: #64748b;
      --border: #d8dde7;
      --surface: #ffffff;
      --soft: #f4f6f9;
      --danger: #b42318;
    }
    * { box-sizing: border-box; }
    body {
      min-height: 100vh;
      margin: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: max(18px, env(safe-area-inset-top)) max(14px, env(safe-area-inset-right)) max(18px, env(safe-area-inset-bottom)) max(14px, env(safe-area-inset-left));
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background:
        linear-gradient(90deg, rgb(255 255 255 / 0.04) 1px, transparent 1px),
        linear-gradient(rgb(255 255 255 / 0.04) 1px, transparent 1px),
        linear-gradient(135deg, rgb(5 14 38), rgb(17 39 85));
      background-size: 26px 26px, 26px 26px, auto;
      color: var(--ink);
    }
    .shell {
      width: min(980px, 100%);
      display: grid;
      grid-template-columns: minmax(0, 1.1fr) minmax(320px, .9fr);
      overflow: hidden;
      border: 1px solid rgb(255 255 255 / 0.14);
      border-radius: 28px;
      background: rgb(255 255 255 / 0.08);
      box-shadow: 0 24px 80px rgb(4 10 28 / 0.42);
    }
    .login-shell {
      isolation: isolate;
    }
    .hero {
      display: grid;
      align-content: start;
      gap: 16px;
      padding: 34px;
      color: #fff;
      background:
        linear-gradient(180deg, rgb(255 255 255 / 0.08), transparent),
        linear-gradient(160deg, rgb(8 22 56 / 0.96), rgb(13 34 74 / 0.88));
    }
    .brand, .kicker {
      color: var(--gold);
      font-size: 12px;
      font-weight: 900;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    h1 {
      margin: 0;
      font-size: 48px;
      line-height: 1.02;
      letter-spacing: 0;
    }
    .hero p {
      max-width: 36ch;
      margin: 0;
      color: rgb(255 255 255 / 0.78);
      font-size: 16px;
      line-height: 1.6;
    }
    .chips, .highlights {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .chip {
      padding: 6px 12px;
      border: 1px solid rgb(255 255 255 / 0.16);
      border-radius: 999px;
      background: rgb(255 255 255 / 0.08);
      color: rgb(255 255 255 / 0.9);
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
    }
    .highlight {
      flex: 1 1 180px;
      display: grid;
      gap: 4px;
      padding: 14px 16px;
      border: 1px solid rgb(255 255 255 / 0.1);
      border-radius: 14px;
      background: rgb(255 255 255 / 0.07);
    }
    .highlight strong { font-size: 14px; }
    .highlight span {
      color: rgb(255 255 255 / 0.74);
      font-size: 13px;
      line-height: 1.45;
    }
    form {
      display: grid;
      align-content: center;
      gap: 16px;
      padding: 34px;
      background: var(--surface);
    }
    form h2 {
      margin: 0;
      color: var(--ink);
      font-size: 28px;
      line-height: 1.15;
    }
    form p {
      margin: 0;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.5;
    }
    label {
      display: grid;
      gap: 6px;
      color: #334155;
      font-size: 13px;
      font-weight: 800;
    }
    input {
      width: 100%;
      padding: 12px 14px;
      border: 2px solid var(--border);
      border-radius: 10px;
      font: inherit;
      color: var(--ink);
      background: #fff;
    }
    input:focus {
      outline: none;
      border-color: var(--navy-2);
      box-shadow: 0 0 0 3px rgb(25 42 81 / .18);
    }
    button {
      min-height: 48px;
      border: 0;
      border-radius: 10px;
      background: var(--navy-2);
      color: #fff;
      font: inherit;
      font-weight: 800;
      cursor: pointer;
    }
    .error {
      min-height: 20px;
      color: var(--danger);
      font-size: 13px;
      font-weight: 800;
    }
    .help {
      color: #98a2b3;
      font-size: 12px;
      text-align: center;
    }
    .legal-links {
      display: flex;
      justify-content: center;
      gap: 10px;
      color: #64748b;
      font-size: 12px;
    }
    .legal-links button {
      min-height: auto;
      padding: 0;
      border: 0;
      border-radius: 0;
      background: transparent;
      color: #64748b;
      font: inherit;
      font-weight: 700;
      text-decoration: underline;
    }
    dialog {
      width: min(620px, calc(100vw - 32px));
      max-height: min(720px, calc(100vh - 32px));
      overflow: auto;
      border: 0;
      border-radius: 18px;
      padding: 0;
      color: var(--ink);
      box-shadow: 0 24px 80px rgb(4 10 28 / .42);
    }
    dialog::backdrop { background: rgb(4 10 28 / .64); }
    .legal-dialog__body { padding: 24px; line-height: 1.55; }
    .legal-dialog__body h2, .legal-dialog__body h3 { margin: 0 0 12px; }
    .legal-dialog__body h3 { margin-top: 20px; font-size: 16px; }
    .legal-dialog__body p, .legal-dialog__body ul { margin: 0 0 12px; }
    .legal-dialog__close { width: 100%; border-radius: 0; }
    @media (max-width: 1024px) {
      body { align-items: center; }
      .shell {
        grid-template-columns: 1fr;
        align-self: center;
        width: min(720px, 100%);
        border-radius: 26px;
      }
      .hero {
        gap: 12px;
        padding: 24px 28px;
      }
      .hero p { max-width: 54ch; }
      h1 { font-size: 36px; }
      .highlights {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      form {
        align-content: start;
        padding: 30px;
      }
    }
    @media (max-width: 640px) {
      body { align-items: stretch; }
      .shell {
        width: min(100%, 540px);
        border-radius: 22px;
      }
      .hero { display: none; }
      form { padding: 24px; }
      h1 { font-size: 34px; }
    }
  </style>
</head>
<body>
  <main class="shell login-shell">
    <form method="post" action="/auth/login?next=${encodedNext}" autocomplete="on">
      <div class="brand">BCOffense</div>
      <div>
        <div class="kicker">Secure team access</div>
        <h2>Sign in to BCOffense</h2>
        <p>Your account determines the workspace and access available to you.</p>
      </div>
      <label>Email or username <input name="username" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" required autofocus /></label>
      <label>Password <input name="password" type="password" autocomplete="current-password" required /></label>
      <div class="error" role="alert">${escapedMessage}</div>
      <button type="submit">Sign In</button>
      <div class="help">Need help? Ask a coach or staff member for your login.</div>
      <div class="legal-links"><button type="button" data-legal-dialog="about">About BCOffense</button><span aria-hidden="true">•</span><button type="button" data-legal-dialog="terms">Terms of Use</button></div>
    </form>
    <section class="hero" aria-label="Portal overview">
      <div class="brand">BCOffense</div>
      <div class="kicker">Secure staff and player access</div>
      <h1>Team workspace</h1>
      <p>One secure sign-in for staff tools, player practice views, scripts, wristbands, and game-day planning.</p>
      <div class="chips" aria-label="Portal roles">
        <span class="chip">Admin</span>
        <span class="chip">Coach</span>
        <span class="chip">Player</span>
      </div>
      <div class="highlights">
        <div class="highlight">
          <strong>Admin control</strong>
          <span>Import data, push backups, and manage staff-only tools.</span>
        </div>
        <div class="highlight">
          <strong>Practice operations</strong>
          <span>Jump into scripts, wristbands, game plans, and call sheets after login.</span>
        </div>
        <div class="highlight">
          <strong>Player-safe mode</strong>
          <span>Players see the published plan and swipe view without edit controls.</span>
        </div>
      </div>
    </section>
  </main>
  <dialog id="aboutDialog"><div class="legal-dialog__body"><h2>About BCOffense</h2><p>BCOffense is a private football operations workspace built for Burke Catholic Football.</p><p>It brings the team playbook, practice preparation, game planning, player study, and secure publishing workflow into one protected system.</p><h3>Private use notice</h3><p>This software is maintained for Burke Catholic Football. It is not offered for public sale, redistribution, copying, or reuse without written permission from the copyright holder.</p><p>Questions or permissions: <a href="mailto:jdepierro@burkecatholic.org">jdepierro@burkecatholic.org</a></p><p>© 2026 Justin DePierro. All rights reserved.</p></div><button class="legal-dialog__close" type="button" data-close-legal>Close</button></dialog>
  <dialog id="termsDialog"><div class="legal-dialog__body"><h2>Terms of Use</h2><p><strong>Effective: 2026.</strong> By accessing or using BCOffense, you agree to these Terms of Use.</p><h3>Authorized use</h3><p>Access is limited to people authorized by Burke Catholic Football or the copyright owner, and only for legitimate team operations, coaching, player study, and related football activities.</p><h3>Accounts and security</h3><p>Keep sign-in credentials private. Do not share accounts, access another user’s information, or bypass access controls.</p><h3>Team data and media</h3><p>Team information, playbook material, diagrams, video, and player data are confidential and may be used only for authorized team purposes.</p><h3>Ownership and restrictions</h3><p>BCOffense and its original software, design, documentation, and content are protected by copyright and other applicable law. You may not copy, modify, reverse engineer, sell, sublicense, redistribute, or create a competing product from any part of BCOffense without prior written permission from Justin DePierro.</p><h3>Availability and changes</h3><p>Features, access, and availability may change, be suspended, or be removed as needed for security, maintenance, or team operations.</p><p>Questions: <a href="mailto:jdepierro@burkecatholic.org">jdepierro@burkecatholic.org</a></p><p>© 2026 Justin DePierro. All rights reserved.</p></div><button class="legal-dialog__close" type="button" data-close-legal>Close</button></dialog>
  <script>
    document.querySelectorAll("[data-legal-dialog]").forEach((button) => button.addEventListener("click", () => document.getElementById(button.dataset.legalDialog + "Dialog")?.showModal()));
    document.querySelectorAll("[data-close-legal]").forEach((button) => button.addEventListener("click", () => button.closest("dialog")?.close()));
  </script>
</body>
</html>`,
      {
        status: opts.status || 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
      },
    ),
  );
}

export async function parseLoginBody(request) {
  const contentType = request.headers.get("Content-Type") || "";
  if (contentType.includes("application/json")) {
    return request.json();
  }
  const form = await request.formData();
  return {
    username: form.get("username"),
    password: form.get("password"),
  };
}

export function loginFailure(request, message, status = 401) {
  if (wantsJson(request)) {
    return authJson({ ok: false, error: message }, { status });
  }
  let next = "/";
  try {
    next = new URL(request.url).searchParams.get("next") || "/";
  } catch (_err) {
    next = "/";
  }
  return renderLoginPage({ message, status, next });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
