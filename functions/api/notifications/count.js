/**
 * GET /api/notifications/count — unread count only (lightweight poll)
 */

import { getSessionFromRequest, authJson, withSecurityHeaders } from "../../../_lib/auth.js";
import { countUnread } from "../../../_lib/d1-notifications.js";

async function resolveUserId(db, session) {
  if (session.d1UserId) return session.d1UserId;
  const email = `${session.username}@bcoffense.internal`;
  const row = await db.prepare("SELECT id FROM users WHERE email = ? LIMIT 1").bind(email).first();
  return row?.id || null;
}

export async function onRequestGet(context) {
  const { env } = context;

  const session = await getSessionFromRequest(context.request, env);
  if (!session) return authJson({ ok: false, unread: 0 }, { status: 401 });
  if (!env.DB) return authJson({ ok: true, unread: 0 });

  const userId = await resolveUserId(env.DB, session);
  const unread = userId ? await countUnread(env.DB, userId) : 0;

  return withSecurityHeaders(authJson({ ok: true, unread }));
}
