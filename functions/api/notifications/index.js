/**
 * GET  /api/notifications         — list notifications (paginated)
 * POST /api/notifications/mark-all-read — mark all read
 */

import { getSessionFromRequest, authJson, withSecurityHeaders } from "../../_lib/auth.js";
import { getNotifications, countUnread, markAllRead } from "../../_lib/d1-notifications.js";

async function resolveUserId(db, session) {
  if (session.d1UserId) return session.d1UserId;
  const email = `${session.username}@bcoffense.internal`;
  const row = await db.prepare("SELECT id FROM users WHERE email = ? LIMIT 1").bind(email).first();
  return row?.id || null;
}

export async function onRequestGet(context) {
  const { request, env } = context;

  const session = await getSessionFromRequest(request, env);
  if (!session) return authJson({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!env.DB) return authJson({ ok: false, error: "Database not configured." }, { status: 503 });

  const userId = await resolveUserId(env.DB, session);
  if (!userId) return withSecurityHeaders(authJson({ ok: true, notifications: [], hasMore: false, unread: 0 }));

  const url = new URL(request.url);
  const offset = parseInt(url.searchParams.get("offset") || "0", 10);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "25", 10), 50);

  const [{ notifications, hasMore }, unread] = await Promise.all([
    getNotifications(env.DB, userId, { limit, offset }),
    countUnread(env.DB, userId),
  ]);

  return withSecurityHeaders(
    authJson({
      ok: true,
      notifications: notifications.map(formatNotif),
      hasMore,
      unread,
    }),
  );
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const session = await getSessionFromRequest(request, env);
  if (!session) return authJson({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!env.DB) return authJson({ ok: false, error: "Database not configured." }, { status: 503 });

  const userId = await resolveUserId(env.DB, session);
  if (!userId) return withSecurityHeaders(authJson({ ok: true }));

  await markAllRead(env.DB, userId);
  return withSecurityHeaders(authJson({ ok: true }));
}

function formatNotif(n) {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body || null,
    deepLink: n.deep_link || null,
    read: !!n.read_at,
    createdAt: n.created_at,
  };
}
