#!/usr/bin/env node

import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const MIME_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".ico", "image/x-icon"],
]);

const ROLES = new Set(["admin", "coach", "player"]);
// This server only listens on 127.0.0.1. Keep its mock session host-only as
// well (no Domain attribute) so it can never represent a deployable session.
const LOCAL_SESSION_COOKIE_NAME = "bc_local_e2e_session";
const LOCAL_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
const localSessions = new Map();

function parsePort(argv) {
  const raw = argv.find((arg) => arg.startsWith("--port="));
  const value = Number(raw ? raw.slice(raw.indexOf("=") + 1) : process.env.PORT || 4177);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 4177;
}

function safeJson(text) {
  try {
    return JSON.parse(text || "{}");
  } catch (_err) {
    return {};
  }
}

function authUser(role) {
  return {
    username: role,
    role,
    label: role.charAt(0).toUpperCase() + role.slice(1),
  };
}

function sendJson(res, body, status = 200, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(JSON.stringify(body));
}

function sendEmptyOk(res) {
  sendJson(res, { ok: true });
}

function getCookieValue(req, name) {
  const cookies = String(req.headers.cookie || "").split(";");
  for (const entry of cookies) {
    const separator = entry.indexOf("=");
    if (separator < 0) continue;
    const key = entry.slice(0, separator).trim();
    if (key !== name) continue;
    try {
      return decodeURIComponent(entry.slice(separator + 1).trim());
    } catch (_err) {
      return "";
    }
  }
  return "";
}

function createLocalSession(role) {
  let token = "";
  do {
    token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  } while (localSessions.has(token));
  localSessions.set(token, {
    user: authUser(role),
    expiresAt: Date.now() + LOCAL_SESSION_MAX_AGE_SECONDS * 1000,
  });
  return token;
}

function getLocalSession(req) {
  const token = getCookieValue(req, LOCAL_SESSION_COOKIE_NAME);
  if (!token) return null;
  const session = localSessions.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    localSessions.delete(token);
    return null;
  }
  return { token, user: session.user };
}

function localSessionCookie(token) {
  return [
    `${LOCAL_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    `Max-Age=${LOCAL_SESSION_MAX_AGE_SECONDS}`,
    "HttpOnly",
    "SameSite=Lax",
  ].join("; ");
}

function clearLocalSessionCookie() {
  return [
    `${LOCAL_SESSION_COOKIE_NAME}=`,
    "Path=/",
    "Max-Age=0",
    "HttpOnly",
    "SameSite=Lax",
  ].join("; ");
}

function safePathFromUrl(requestUrl) {
  const parsed = new URL(requestUrl, "http://localhost");
  let pathname = decodeURIComponent(parsed.pathname);
  if (pathname === "/") pathname = "/index.html";
  const resolved = path.resolve(root, `.${pathname}`);
  if (!resolved.startsWith(root)) return "";
  return resolved;
}

function handleAuthLogin(req, res) {
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });
  req.on("end", () => {
    const parsed = safeJson(body);
    const role = String(parsed.username || "").toLowerCase();
    if (!ROLES.has(role) || !parsed.password) {
      sendJson(res, { ok: false, error: "Invalid username or password." }, 401);
      return;
    }
    const token = createLocalSession(role);
    sendJson(
      res,
      { ok: true, user: authUser(role) },
      200,
      { "Set-Cookie": localSessionCookie(token) },
    );
  });
}

function handleApiStub(req, parsed, res) {
  if (parsed.pathname === "/api/telemetry") {
    // Mirror production: telemetry beacon accepts and returns 204 No Content.
    res.writeHead(204);
    res.end();
    return true;
  }
  if (parsed.pathname === "/auth/me") {
    const session = getLocalSession(req);
    if (!session) {
      // Mirror a real signed-out Pages session. The app deliberately clears a
      // local identity only after logout is confirmed by a 401; returning 200
      // here made the local preview impossible to sign out of or role-switch.
      sendJson(res, { authenticated: false }, 401, { "Set-Cookie": clearLocalSessionCookie() });
      return true;
    }
    sendJson(res, { authenticated: true, user: session.user });
    return true;
  }
  if (parsed.pathname === "/auth/logout") {
    const session = getLocalSession(req);
    if (session) localSessions.delete(session.token);
    sendJson(res, { ok: true }, 200, { "Set-Cookie": clearLocalSessionCookie() });
    return true;
  }
  if (parsed.pathname === "/auth/players") {
    sendJson(res, { ok: true, players: [] });
    return true;
  }
  if (parsed.pathname.startsWith("/api/leaderboard")) {
    sendJson(res, { ok: true, summary: { week: { rows: [] }, season: { rows: [] } } });
    return true;
  }
  if (parsed.pathname.startsWith("/api/questions")) {
    sendJson(res, {
      ok: true,
      summary: { open: 0, today: 0, resolved: 0, needsAnswer: 0 },
      questions: [],
      hasMore: false,
    });
    return true;
  }
  if (parsed.pathname.startsWith("/api/notifications")) {
    sendJson(res, { ok: true, notifications: [], hasMore: false, unread: 0 });
    return true;
  }
  if (parsed.pathname.startsWith("/api/plays/") && parsed.pathname.endsWith("/like")) {
    sendJson(res, { ok: true, liked: false, count: 0 });
    return true;
  }
  if (parsed.pathname.startsWith("/api/threads/batch-counts")) {
    sendJson(res, { ok: true, counts: {} });
    return true;
  }
  if (parsed.pathname.startsWith("/api/threads/")) {
    sendJson(res, { ok: true, thread: null, posts: [], replies: [], hasMore: false });
    return true;
  }
  if (parsed.pathname.startsWith("/api/moderation/terms")) {
    sendJson(res, { ok: true, terms: [] });
    return true;
  }
  if (parsed.pathname.startsWith("/api/moderation/stats")) {
    sendJson(res, { ok: true, stats: {} });
    return true;
  }
  if (parsed.pathname.startsWith("/api/moderation/queue")) {
    sendJson(res, { ok: true, posts: [], hasMore: false });
    return true;
  }
  if (parsed.pathname.startsWith("/api/push/vapid-key")) {
    sendJson(res, { ok: true, publicKey: "" });
    return true;
  }
  if (parsed.pathname.startsWith("/api/")) {
    sendEmptyOk(res);
    return true;
  }
  if (parsed.pathname === "/clips/batch-manifest") {
    sendJson(res, { ok: true, count: 0, manifests: {} });
    return true;
  }
  if (parsed.pathname === "/images/batch-manifest") {
    sendJson(res, { ok: true, count: 0, manifests: {} });
    return true;
  }
  if (
    parsed.pathname.startsWith("/sync/") ||
    parsed.pathname.startsWith("/clips/") ||
    parsed.pathname.startsWith("/images/")
  ) {
    sendJson(res, { ok: true, clips: [], sigs: [] });
    return true;
  }
  return false;
}

const port = parsePort(process.argv.slice(2));
const server = createServer((req, res) => {
  const parsed = new URL(req.url || "/", "http://localhost");

  if (parsed.pathname === "/auth/login") {
    handleAuthLogin(req, res);
    return;
  }
  if (handleApiStub(req, parsed, res)) return;
  if (parsed.pathname === "/favicon.ico") {
    res.writeHead(204);
    res.end();
    return;
  }

  const filePath = safePathFromUrl(req.url || "/");
  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  res.writeHead(200, {
    "Content-Type": MIME_TYPES.get(path.extname(filePath)) || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  createReadStream(filePath).pipe(res);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`BCOffense local E2E server: http://127.0.0.1:${port}`);
});

process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT", () => server.close(() => process.exit(0)));
