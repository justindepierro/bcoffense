import {
  authJson,
  createSessionCookie,
  loginFailure,
  parseLoginBody,
  renderLoginPage,
  verifyCredentials,
  withSecurityHeaders,
} from "../_lib/auth.js";
import { getPrimaryTeamId } from "../_lib/team-context.js";

// ── Rate limit config ─────────────────────────────────────────────────────────
const RATE_WINDOW_SECONDS = 15 * 60; // 15-minute window
const RATE_MAX_IP = 20;              // max attempts per IP per window
const RATE_MAX_USER = 10;            // max attempts per username per window

function wantsJson(request) {
  return (
    request.headers.get("X-BC-Auth-Mode") === "json" ||
    (request.headers.get("Accept") || "").includes("application/json")
  );
}

function safeRedirectTarget(value) {
  const target = String(value || "/");
  if (!target.startsWith("/") || target.startsWith("//")) return "/";
  return target;
}

function getClientIp(request) {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

async function checkRateLimit(db, ip, username) {
  if (!db) return false;
  const since = Math.floor(Date.now() / 1000) - RATE_WINDOW_SECONDS;
  try {
    const [ipRow, userRow] = await Promise.all([
      db.prepare("SELECT COUNT(*) AS n FROM login_attempts WHERE ip_addr = ? AND attempted_at > ?")
        .bind(ip, since).first(),
      db.prepare("SELECT COUNT(*) AS n FROM login_attempts WHERE username = ? AND attempted_at > ?")
        .bind(username.toLowerCase(), since).first(),
    ]);
    if ((ipRow?.n || 0) >= RATE_MAX_IP) return true;
    if ((userRow?.n || 0) >= RATE_MAX_USER) return true;
  } catch (_) {
    // If D1 check fails, allow the request (fail-open for availability)
  }
  return false;
}

async function recordAttempt(db, ip, username, success) {
  if (!db) return;
  try {
    await db.prepare(
      "INSERT INTO login_attempts (id, ip_addr, username, success, attempted_at) VALUES (?, ?, ?, ?, ?)"
    ).bind(
      crypto.randomUUID(),
      ip,
      username.toLowerCase(),
      success ? 1 : 0,
      Math.floor(Date.now() / 1000),
    ).run();
    // Prune records older than 24h — fire-and-forget
    db.prepare("DELETE FROM login_attempts WHERE attempted_at < ?")
      .bind(Math.floor(Date.now() / 1000) - 86400)
      .run().catch(() => {});
  } catch (_) { /* non-fatal */ }
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  return renderLoginPage({ next: safeRedirectTarget(url.searchParams.get("next")) });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const ip = getClientIp(request);

  let body;
  try {
    body = await parseLoginBody(request);
  } catch (_err) {
    return loginFailure(request, "Could not read login form.", 400);
  }

  // ── IP + username rate limit ──────────────────────────────────────────────
  const isRateLimited = await checkRateLimit(env.DB, ip, body.username || "");
  if (isRateLimited) {
    await recordAttempt(env.DB, ip, body.username || "", false);
    if (wantsJson(request)) {
      return withSecurityHeaders(
        authJson({ ok: false, error: "Too many login attempts. Please wait and try again." }, { status: 429 })
      );
    }
    return loginFailure(request, "Too many login attempts. Please wait 15 minutes and try again.", 429);
  }

  let user;
  try {
    user = await verifyCredentials(body.username, body.password, env);
  } catch (err) {
    return loginFailure(request, err.message || "Authentication error.", 500);
  }

  // ── Account lockout ───────────────────────────────────────────────────────
  if (user && typeof user === "object" && user.locked) {
    await recordAttempt(env.DB, ip, body.username || "", false);
    const waitMin = Math.ceil((user.until - Math.floor(Date.now() / 1000)) / 60);
    const msg = `Account temporarily locked. Try again in ${waitMin} minute${waitMin === 1 ? "" : "s"}.`;
    if (wantsJson(request)) {
      return withSecurityHeaders(authJson({ ok: false, error: msg, locked: true }, { status: 429 }));
    }
    return loginFailure(request, msg, 429);
  }

  if (!user) {
    await recordAttempt(env.DB, ip, body.username || "", false);
    return loginFailure(request, "Invalid username or password.", 401);
  }

  // ── Success ───────────────────────────────────────────────────────────────
  await recordAttempt(env.DB, ip, body.username || "", true);

  const cookie = await createSessionCookie(user, env);
  if (wantsJson(request)) {
    // The client starts its player-release bootstrap immediately after this
    // response. Return the same resolved team context it would receive from
    // /auth/me, including for the legacy static `player` account.
    const responseUser = {
      ...user,
      teamId: user.teamId || await getPrimaryTeamId(env),
      d1UserId: user.d1UserId || user.d1_user_id || "",
    };
    return withSecurityHeaders(
      authJson({ ok: true, user: responseUser }, { headers: { "Set-Cookie": cookie } })
    );
  }

  const url = new URL(request.url);
  return new Response(null, {
    status: 302,
    headers: {
      "Location": safeRedirectTarget(url.searchParams.get("next")),
      "Set-Cookie": cookie,
      "Cache-Control": "no-store",
    },
  });
}
