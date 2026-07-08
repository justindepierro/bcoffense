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

function sendJson(res, body, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function sendEmptyOk(res) {
  sendJson(res, { ok: true });
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
    sendJson(res, { ok: true, user: authUser(role) });
  });
}

function handleApiStub(parsed, res) {
  if (parsed.pathname === "/auth/me") {
    sendJson(res, { user: null });
    return true;
  }
  if (parsed.pathname === "/auth/logout") {
    sendEmptyOk(res);
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
  if (handleApiStub(parsed, res)) return;
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
